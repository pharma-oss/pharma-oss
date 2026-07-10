import fs from 'fs';
import path from 'path';
import {
  extractOfficialContraindicatedConditionRowsFromLabelHtml,
  extractOfficialInteractionRowsFromLabelHtml,
  fetchPmdaDrugLabelHtml,
  findSuspiciousContraindicatedConditionRows,
  findSuspiciousInteractionRows,
  sha256HexOfText,
  type OfficialInteractionRow
} from '../lib/drug_official_interaction_label.ts';
import type { DrugInfo } from '../db/types.ts';

/**
 * drug_infos.jsonの公式添付文書由来contraindications / contraindicatedConditionsを独立に監査するスクリプト。
 *
 * fetchOfficialDrugInteractionLabels.tsの実行ログや自己申告は一切信用せず、
 * (1) drug_infos.json自体の構造的な健全性チェックと、
 * (2) ランダムサンプルしたsourceUrlを実際にPMDAへ再取得し、同じパーサーで再計算した結果と
 *     保存データを突き合わせるライブ検証、の2段階で行う。
 *
 * ライブ検証で「本文ハッシュが一致するのに中身が食い違う」場合のみハード失敗とする
 * （本文ハッシュが違う場合はPMDA側の改訂の可能性があるため注記のみでハード失敗にはしない）。
 *
 * 実行例: npx tsx src/scripts/verifyOfficialDrugInteractionLabels.ts --sample=15
 * 終了コード0=PASS、1=FAIL。
 */

interface Finding {
  severity: 'fail' | 'note';
  message: string;
}

function parseSampleArg(): number {
  const arg = process.argv.find((a) => a.startsWith('--sample='));
  const value = arg ? Number(arg.split('=')[1]) : 15;
  return Number.isFinite(value) && value > 0 ? value : 15;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canonicalizeInteractionRows(rows: { severity: string; targetDrugs?: string[]; drugNames?: string[]; clinicalEffect: string; mechanism?: string }[]): string {
  const normalized = rows.map((row) => ({
    severity: row.severity,
    targetDrugs: [...(row.targetDrugs || row.drugNames || [])].sort(),
    clinicalEffect: row.clinicalEffect,
    mechanism: row.mechanism || ''
  }));
  normalized.sort((a, b) => (a.targetDrugs[0] || '').localeCompare(b.targetDrugs[0] || '') || a.severity.localeCompare(b.severity));
  return JSON.stringify(normalized);
}

function canonicalizeConditionRows(rows: { conditionText: string; reason?: string }[]): string {
  const normalized = rows.map((row) => ({ conditionText: row.conditionText, reason: row.reason || '' }));
  normalized.sort((a, b) => a.conditionText.localeCompare(b.conditionText));
  return JSON.stringify(normalized);
}

async function main() {
  const sampleSize = parseSampleArg();
  const findings: Finding[] = [];

  const drugsPath = path.resolve(process.cwd(), 'src/lib/data/drugs.json');
  const drugInfosPath = path.resolve(process.cwd(), 'src/lib/data/drug_infos.json');
  const queuePath = path.resolve(process.cwd(), 'src/scripts/officialDrugInteractionIngredientQueue.json');

  const drugs: { name: string; yjCode?: string; genericName?: string; isAbolished?: boolean }[] = JSON.parse(
    fs.readFileSync(drugsPath, 'utf-8')
  );
  const drugInfos: DrugInfo[] = JSON.parse(fs.readFileSync(drugInfosPath, 'utf-8'));
  const genericNameByDrugName = new Map(drugs.map((d) => [d.name, d.genericName || '']));
  const isAbolishedByDrugName = new Map(drugs.map((d) => [d.name, d.isAbolished === true]));

  const sourceUrlPattern = /^https:\/\/www\.pmda\.go\.jp\//;

  console.log('=== 1. 構造チェック（10.相互作用） ===');
  let checkedContraindications = 0;
  for (const info of drugInfos) {
    const contraindications = info.contraindications || [];
    if (contraindications.length === 0) continue;

    const liveGenericName = genericNameByDrugName.get(info.drugName);
    if (liveGenericName !== undefined && liveGenericName.includes('・')) {
      findings.push({ severity: 'fail', message: `配合剤に相互作用データが入っています: ${info.drugName}（genericName: ${liveGenericName}）` });
    }

    for (const c of contraindications as unknown as Record<string, unknown>[]) {
      checkedContraindications += 1;
      if ('targetDrug' in c) {
        findings.push({ severity: 'fail', message: `旧スキーマ(targetDrug単数)が残っています: ${info.drugName}` });
      }
      if (JSON.stringify(c).includes('KEGG')) {
        findings.push({ severity: 'fail', message: `KEGG由来データが残っています: ${info.drugName}` });
      }
      const sourceUrl = c.sourceUrl as string | undefined;
      if (!sourceUrl || !sourceUrlPattern.test(sourceUrl)) {
        findings.push({ severity: 'fail', message: `sourceUrlがPMDA公式ドメインではありません: ${info.drugName} -> ${sourceUrl}` });
      }
      const fetchedAt = c.fetchedAt as string | undefined;
      const fetchedAtDate = fetchedAt ? new Date(fetchedAt) : null;
      if (!fetchedAtDate || Number.isNaN(fetchedAtDate.getTime()) || fetchedAtDate.getTime() > Date.now()) {
        findings.push({ severity: 'fail', message: `fetchedAtが不正な日時です: ${info.drugName} -> ${fetchedAt}` });
      }
      const targetDrugs = (c.targetDrugs as string[] | undefined) || [];
      if (targetDrugs.length === 0) {
        findings.push({ severity: 'fail', message: `targetDrugsが空です: ${info.drugName}` });
      }
      const suspicious = findSuspiciousInteractionRows([
        {
          severity: c.severity as OfficialInteractionRow['severity'],
          drugNames: targetDrugs,
          clinicalEffect: (c.clinicalEffect as string) || '',
          mechanism: (c.mechanism as string) || ''
        }
      ]);
      for (const s of suspicious) {
        findings.push({ severity: 'fail', message: `${info.drugName}: ${s}` });
      }
    }
  }
  console.log(`チェック対象: ${checkedContraindications}件のcontraindications`);

  console.log('\n=== 1b. 構造チェック（2.禁忌の患者状態条件） ===');
  let checkedConditions = 0;
  for (const info of drugInfos) {
    const conditions = info.contraindicatedConditions || [];
    if (conditions.length === 0) continue;

    const liveGenericName = genericNameByDrugName.get(info.drugName);
    if (liveGenericName !== undefined && liveGenericName.includes('・')) {
      findings.push({ severity: 'fail', message: `配合剤に禁忌条件データが入っています: ${info.drugName}（genericName: ${liveGenericName}）` });
    }

    for (const c of conditions) {
      checkedConditions += 1;
      const sourceUrl = c.sourceUrl;
      if (!sourceUrl || !sourceUrlPattern.test(sourceUrl)) {
        findings.push({ severity: 'fail', message: `sourceUrlがPMDA公式ドメインではありません: ${info.drugName} -> ${sourceUrl}` });
      }
      const fetchedAtDate = c.fetchedAt ? new Date(c.fetchedAt) : null;
      if (!fetchedAtDate || Number.isNaN(fetchedAtDate.getTime()) || fetchedAtDate.getTime() > Date.now()) {
        findings.push({ severity: 'fail', message: `fetchedAtが不正な日時です: ${info.drugName} -> ${c.fetchedAt}` });
      }
      if (!c.conditionText) {
        findings.push({ severity: 'fail', message: `conditionTextが空です: ${info.drugName}` });
      }
      const suspicious = findSuspiciousContraindicatedConditionRows([{ conditionText: c.conditionText, reason: c.reason }]);
      for (const s of suspicious) {
        findings.push({ severity: 'fail', message: `${info.drugName}: ${s}` });
      }
    }
  }
  console.log(`チェック対象: ${checkedConditions}件のcontraindicatedConditions`);

  console.log('\n=== 2. ライブ再検証（実際にPMDAへ再取得して同一パーサーで突き合わせ） ===');
  // 同じsourceUrlを引用する品目は、生成スクリプトの仕様上すべて同一内容のコピーになるはず。
  // まずその前提自体が崩れていないか（品目間で内容が食い違っていないか）を確認したうえで、
  // 代表1件だけをライブ再取得の突き合わせ対象にする（全品目を平坦化して比較すると、
  // 同じ内容がN品目分重複するだけで再取得結果と絶対に一致しなくなるため）。
  const bySourceUrl = new Map<
    string,
    {
      drugName: string;
      contraindications: NonNullable<DrugInfo['contraindications']>;
      contraindicatedConditions: NonNullable<DrugInfo['contraindicatedConditions']>;
    }[]
  >();
  for (const info of drugInfos) {
    const urls = new Set<string>([
      ...(info.contraindications || []).map((c) => c.sourceUrl),
      ...(info.contraindicatedConditions || []).map((c) => c.sourceUrl)
    ]);
    for (const sourceUrl of urls) {
      if (!sourceUrl) continue;
      const list = bySourceUrl.get(sourceUrl) || [];
      list.push({
        drugName: info.drugName,
        contraindications: (info.contraindications || []).filter((c) => c.sourceUrl === sourceUrl),
        contraindicatedConditions: (info.contraindicatedConditions || []).filter((c) => c.sourceUrl === sourceUrl)
      });
      bySourceUrl.set(sourceUrl, list);
    }
  }

  for (const [sourceUrl, allEntries] of bySourceUrl) {
    // 廃止薬（isAbolished）は取得パイプラインの対象外で意図的にデータを持たない/古いままのことがあるため、
    // 現行品同士の一致だけを見る（廃止薬が現行品と食い違っていること自体は異常ではない）
    const entries = allEntries.filter((e) => !isAbolishedByDrugName.get(e.drugName));
    if (entries.length === 0) continue;
    const canonicalPerDrug = entries.map(
      (e) => canonicalizeInteractionRows(e.contraindications) + '|' + canonicalizeConditionRows(e.contraindicatedConditions)
    );
    const distinct = new Set(canonicalPerDrug);
    if (distinct.size > 1) {
      findings.push({
        severity: 'fail',
        message: `${sourceUrl}: 同じ出典を引用する現行品目間で保存データが食い違っています（${entries.length}品目中${distinct.size}パターン）。`
      });
    }
  }

  const allSourceUrls = Array.from(bySourceUrl.keys());
  const shuffled = [...allSourceUrls].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, Math.min(sampleSize, shuffled.length));

  console.log(`母集団: ${allSourceUrls.length}件のユニークsourceUrl / サンプル: ${sample.length}件`);

  for (const sourceUrl of sample) {
    const fname = sourceUrl.replace('https://www.pmda.go.jp/PmdaSearch/iyakuDetail/', '');
    try {
      const { html } = await fetchPmdaDrugLabelHtml(fname);
      await sleep(150);
      const freshHash = await sha256HexOfText(html);
      const freshInteractionRows = extractOfficialInteractionRowsFromLabelHtml(html);
      const freshConditionRows = extractOfficialContraindicatedConditionRowsFromLabelHtml(html);

      const candidates = bySourceUrl.get(sourceUrl) || [];
      const representative =
        candidates.find((e) => !isAbolishedByDrugName.get(e.drugName)) || candidates[0];
      const claimedContentSha256 =
        representative?.contraindications[0]?.contentSha256 || representative?.contraindicatedConditions[0]?.contentSha256;

      const claimedCanonical =
        canonicalizeInteractionRows(representative?.contraindications || []) +
        '|' +
        canonicalizeConditionRows(representative?.contraindicatedConditions || []);
      const freshCanonical =
        canonicalizeInteractionRows(freshInteractionRows) + '|' + canonicalizeConditionRows(freshConditionRows);

      if (claimedCanonical !== freshCanonical) {
        if (!claimedContentSha256) {
          findings.push({
            severity: 'note',
            message: `${sourceUrl}: 本文ハッシュが記録されていない古いデータのため、改訂による差分か破損かを区別できません。再取得を推奨します（対象例: ${representative?.drugName}）。`
          });
        } else if (claimedContentSha256 !== freshHash) {
          findings.push({
            severity: 'note',
            message: `${sourceUrl}: 本文ハッシュが記録時と異なります（PMDA側の改訂の可能性）。差分は許容し、再取得を推奨します。`
          });
        } else {
          findings.push({
            severity: 'fail',
            message: `${sourceUrl}: 本文は変わっていないのに保存データが再計算結果と一致しません（捏造または破損の疑い）。対象例: ${representative?.drugName}`
          });
        }
      } else {
        console.log(`  OK: ${sourceUrl}`);
      }
    } catch (error) {
      findings.push({
        severity: 'fail',
        message: `${sourceUrl}: 再取得に失敗しました（${error instanceof Error ? error.message : String(error)}）。sourceUrlが実在しない可能性があります。`
      });
    }
  }

  console.log('\n=== 3. キューとの突合 ===');
  if (fs.existsSync(queuePath)) {
    const queue: { ingredient: string; status: string; sourceUrl?: string }[] = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
    // キュー生成時に品目名の部分一致だけで一括done判定した成分がある（sourceUrlは未記録で正常）。
    // ここでは「本当にdrug_infos.jsonに実データがあるか」だけを問う（キュー自身の付帯情報の有無は問わない）。
    const infoDrugNamesWithData = new Set(
      drugInfos
        .filter((i) => (i.contraindications || []).length > 0 || (i.contraindicatedConditions || []).length > 0)
        .map((i) => i.drugName)
    );
    const doneWithoutAnyRealData = queue.filter((e) => {
      if (e.status !== 'done') return false;
      const matchingDrugNames = drugs
        .filter((d) => !d.isAbolished && (d.genericName || '').includes(e.ingredient))
        .map((d) => d.name);
      return matchingDrugNames.length > 0 && !matchingDrugNames.some((name) => infoDrugNamesWithData.has(name));
    });
    for (const e of doneWithoutAnyRealData) {
      findings.push({
        severity: 'fail',
        message: `キューでdone扱いですがdrug_infos.jsonに対応する実データが1件もありません: ${e.ingredient}`
      });
    }
    console.log(`キューのdone件数: ${queue.filter((e) => e.status === 'done').length} / pending残: ${queue.filter((e) => e.status === 'pending').length}`);
  } else {
    findings.push({ severity: 'note', message: 'officialDrugInteractionIngredientQueue.jsonが見つかりません。' });
  }

  console.log('\n=== 結果 ===');
  const fails = findings.filter((f) => f.severity === 'fail');
  const notes = findings.filter((f) => f.severity === 'note');
  for (const n of notes) console.log(`NOTE: ${n.message}`);
  for (const f of fails) console.log(`FAIL: ${f.message}`);

  if (fails.length > 0) {
    console.log(`\n>>> FAIL: ${fails.length}件の致命的な問題があります。drug_infos.jsonをこのまま信用しないでください。`);
    process.exit(1);
  } else {
    console.log(
      `\n>>> PASS: 構造チェック(相互作用${checkedContraindications}件・禁忌条件${checkedConditions}件)とライブ再検証(${sample.length}件サンプル)で致命的な問題は見つかりませんでした。`
    );
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('検証スクリプトの実行に失敗しました:', error);
  process.exit(1);
});
