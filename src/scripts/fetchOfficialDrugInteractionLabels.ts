import fs from 'fs';
import path from 'path';
import {
  extractOfficialContraindicatedConditionRowsFromLabelHtml,
  extractOfficialInteractionRowsFromLabelHtml,
  fetchPmdaDrugLabelHtmlByGeneralListUrl,
  findSuspiciousContraindicatedConditionRows,
  findSuspiciousInteractionRows,
  sha256HexOfText
} from '../lib/drug_official_interaction_label.ts';
import type { DrugInfo } from '../db/types.ts';

/**
 * drug_infos.jsonのcontraindicationsを、PMDA公式添付文書「10.相互作用」章の実データで
 * 埋めていくための、再開可能・監査可能なバッチ処理スクリプト。
 *
 * 設計方針（捏造を防ぐための制約）:
 * - 処理対象はofficialDrugInteractionIngredientQueue.json（このリポジトリにコミットされた
 *   作業キュー）の先頭からpending分だけを順番に処理する。実行者が対象を自由に選べない。
 * - 抽出結果に少しでも異常（findSuspiciousInteractionRows）があれば、その成分は
 *   drug_infos.jsonへ一切書き込まず、キュー上は needs_review のまま残す。
 * - 相互作用の章が実在しない場合は no_interactions_found とし、空データを捏造しない。
 * - 実行するたびに officialDrugInteractionRunLog.jsonl に追記する（上書きしない）。
 *   自己申告の「完了しました」だけでなく、このログとverifyOfficialDrugInteractionLabels.ts
 *   の実行結果を必ず一緒に提示すること。
 * - 配合剤（一般名に「・」を含む）・廃止薬は対象外。
 * - PMDAサーバーへの配慮として、成分間に待機時間を入れる。
 *
 * 実行例: npx tsx src/scripts/fetchOfficialDrugInteractionLabels.ts --limit=40
 * 実行後は必ず: npx tsx src/scripts/verifyOfficialDrugInteractionLabels.ts
 */

interface QueueEntry {
  ingredient: string;
  productCount: number;
  representativeDrugName: string;
  representativeDocumentUrl: string | null;
  status:
    | 'pending'
    | 'done'
    | 'no_interactions_found'
    | 'needs_review'
    | 'fetch_error'
    | 'no_representative_product';
  sourceUrl?: string;
  fetchedAt?: string;
  contentSha256?: string;
  rowCount?: number;
  dangerCount?: number;
  warningCount?: number;
  conditionCount?: number;
  updatedDrugCount?: number;
  insertedDrugCount?: number;
  flags?: string[];
  error?: string;
  lastAttemptAt?: string;
}

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 200;
const REQUEST_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLimitArg(): number {
  const equalsArg = process.argv.find((a) => a.startsWith('--limit='));
  const separatedArgIndex = process.argv.indexOf('--limit');
  const rawLimit = equalsArg
    ? equalsArg.split('=')[1]
    : separatedArgIndex !== -1
      ? process.argv[separatedArgIndex + 1]
      : undefined;
  const limit = rawLimit ? Number(rawLimit) : DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`--limitは正の整数で指定してください: ${rawLimit || '(未指定)'}`);
  }
  if (limit > MAX_LIMIT) {
    throw new Error(
      `--limitは${MAX_LIMIT}以下にしてください（PMDAサーバーへ配慮した1回あたりの上限。続きは次回の実行で処理する）。`
    );
  }
  return limit;
}

async function main() {
  const limit = parseLimitArg();

  const queuePath = path.resolve(process.cwd(), 'src/scripts/officialDrugInteractionIngredientQueue.json');
  const drugsPath = path.resolve(process.cwd(), 'src/lib/data/drugs.json');
  const drugInfosPath = path.resolve(process.cwd(), 'src/lib/data/drug_infos.json');
  const runLogPath = path.resolve(process.cwd(), 'src/scripts/officialDrugInteractionRunLog.jsonl');

  const queue: QueueEntry[] = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
  const saveQueue = () => {
    fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf-8');
  };
  const drugs: { name: string; yjCode?: string; genericName?: string; isAbolished?: boolean }[] = JSON.parse(
    fs.readFileSync(drugsPath, 'utf-8')
  );
  const drugInfos: DrugInfo[] = JSON.parse(fs.readFileSync(drugInfosPath, 'utf-8'));
  const drugInfoByName = new Map(drugInfos.map((info) => [info.drugName, info]));

  const pendingEntries = queue.filter((entry) => entry.status === 'pending').slice(0, limit);
  if (pendingEntries.length === 0) {
    console.log('処理対象（pending）がキューにありません。officialDrugInteractionIngredientQueue.jsonを確認してください。');
    return;
  }

  console.log(`今回処理する成分数: ${pendingEntries.length}（キュー内pending総数: ${queue.filter((e) => e.status === 'pending').length}）`);

  let drugInfosChanged = false;
  const runSummary = { attempted: 0, done: 0, noInteractions: 0, needsReview: 0, fetchError: 0 };

  for (const entry of pendingEntries) {
    runSummary.attempted += 1;
    entry.lastAttemptAt = new Date().toISOString();
    console.log(`\n=== ${entry.ingredient}（品目数: ${entry.productCount}） ===`);

    if (!entry.representativeDocumentUrl) {
      entry.status = 'no_representative_product';
      runSummary.needsReview += 1;
      console.log(`  代表文書なし。drug_infos.jsonへは書き込まず要確認にします。`);
      saveQueue();
      continue;
    }

    try {
      const { fname, url, html, fetchedAt } = await fetchPmdaDrugLabelHtmlByGeneralListUrl(entry.representativeDocumentUrl);
      await sleep(REQUEST_DELAY_MS);

      const contentSha256 = await sha256HexOfText(html);
      const interactionRows = extractOfficialInteractionRowsFromLabelHtml(html);
      const conditionRows = extractOfficialContraindicatedConditionRowsFromLabelHtml(html);
      const interactionFlags = findSuspiciousInteractionRows(interactionRows);
      const conditionFlags = findSuspiciousContraindicatedConditionRows(conditionRows);
      const flags = [...interactionFlags, ...conditionFlags];

      console.log(`  fname: ${fname}`);
      console.log(`  10.相互作用: ${interactionRows.length}行（併用禁忌 ${interactionRows.filter((r) => r.severity === 'danger').length} / 併用注意 ${interactionRows.filter((r) => r.severity === 'warning').length}）`);
      console.log(`  2.禁忌（患者状態）: ${conditionRows.length}行`);

      entry.sourceUrl = url;
      entry.fetchedAt = fetchedAt;
      entry.contentSha256 = contentSha256;
      entry.rowCount = interactionRows.length;
      entry.dangerCount = interactionRows.filter((r) => r.severity === 'danger').length;
      entry.warningCount = interactionRows.filter((r) => r.severity === 'warning').length;
      entry.conditionCount = conditionRows.length;

      if (flags.length > 0) {
        entry.status = 'needs_review';
        entry.flags = flags;
        runSummary.needsReview += 1;
        console.log(`  異常検知: ${flags.length}件。drug_infos.jsonへは書き込まず要確認のままにします。`);
        for (const flag of flags) console.log(`    - ${flag}`);
        saveQueue();
        continue;
      }

      if (interactionRows.length === 0 && conditionRows.length === 0) {
        entry.status = 'no_interactions_found';
        runSummary.noInteractions += 1;
        console.log('  この添付文書には相互作用・禁忌のいずれの章もありませんでした（実データとして正常。捏造はしません）。');
        saveQueue();
        continue;
      }

      const contraindications = interactionRows.map((row) => ({
        targetDrugs: row.drugNames,
        severity: row.severity,
        clinicalEffect: row.clinicalEffect,
        mechanism: row.mechanism,
        sourceUrl: url,
        fetchedAt,
        contentSha256
      }));
      const contraindicatedConditions = conditionRows.map((row) => ({
        conditionText: row.conditionText,
        reason: row.reason,
        sourceUrl: url,
        fetchedAt,
        contentSha256
      }));

      // PMDAは同一成分でも剤形（内用・外用・注射）ごとに添付文書が別文書になっていることが多い。
      // 剤形区分を誤ってまたいでマッチさせると、他剤形向けの相互作用/禁忌データを取り違えて
      // 上書きしてしまう（実例: ニコランジル錠の文書がニコランジル注の品目を上書きした）。
      // そのため「外用」「注射」「内用」の3区分で一致するものだけを同じ文書の対象とする。
      const topicalKeywords = ['点眼', '貼付', '外用', '軟膏', 'クリーム', 'ゲル', 'テープ', 'パップ', '耳', '鼻', '点鼻', '点耳', '吸入'];
      const injectionKeywords = ['注射', '注', '点滴', '静注', '筋注', 'シリンジ', 'バッグ'];
      const getDosageFormCategory = (name: string, generic: string): 'topical' | 'injection' | 'oral' => {
        if (topicalKeywords.some((k) => generic.includes(k) || name.includes(k))) return 'topical';
        if (injectionKeywords.some((k) => generic.includes(k) || name.includes(k))) return 'injection';
        return 'oral';
      };
      const repName = entry.representativeDrugName || '';
      const repDrugForCategory = drugs.find((d) => d.name === entry.representativeDrugName);
      const repCategory = getDosageFormCategory(repName, repDrugForCategory?.genericName || '');

      const matchByKey = (key: string) =>
        drugs.filter((drug) => {
          if (drug.isAbolished) return false;
          const generic = drug.genericName || '';
          if (generic.includes('・')) return false;
          if (!generic.includes(key)) return false;

          const drugName = drug.name || '';
          return getDosageFormCategory(drugName, generic) === repCategory;
        });

      let matchingDrugs = matchByKey(entry.ingredient);
      if (matchingDrugs.length === 0) {
        // キュー生成時に成分名の切り出しが崩れている場合（例: 濃度％表記が"シリンジ"等の
        // 剤形語の前に来る注射剤で、機械的な切り出しが実際のgenericNameと一致しない）、
        // 代表品目自身の実際のgenericNameで再照合する（患者情報を伴わない機械的なフォールバック）
        const repDrug = drugs.find((d) => d.name === entry.representativeDrugName);
        const repGeneric = repDrug?.genericName;
        if (repGeneric && repGeneric !== entry.ingredient) {
          const fallbackMatches = matchByKey(repGeneric);
          if (fallbackMatches.length > 0) {
            console.log(`  成分キー「${entry.ingredient}」では0件だったため、代表品目の実際のgenericName「${repGeneric}」で再照合しました。`);
            matchingDrugs = fallbackMatches;
          }
        }
      }

      let updated = 0;
      let inserted = 0;
      for (const drug of matchingDrugs) {
        const existing = drugInfoByName.get(drug.name);
        if (existing) {
          // 空件数でも必ず上書きする（if(length>0)にすると、過去の誤マッチで付いた
          // 別剤形のデータが「今回は0件だから」という理由で永久に残ってしまう）。
          existing.contraindications = interactionRows.length > 0 ? contraindications : undefined;
          existing.contraindicatedConditions = conditionRows.length > 0 ? contraindicatedConditions : undefined;
          updated += 1;
        } else {
          const created: DrugInfo = {
            id: `drug_info_${drug.yjCode || drug.name}`,
            drugName: drug.name,
            genericName: drug.genericName,
            contraindications: interactionRows.length > 0 ? contraindications : undefined,
            contraindicatedConditions: conditionRows.length > 0 ? contraindicatedConditions : undefined,
            usageWarnings: []
          };
          drugInfos.push(created);
          drugInfoByName.set(drug.name, created);
          inserted += 1;
        }
      }

      entry.status = 'done';
      entry.updatedDrugCount = updated;
      entry.insertedDrugCount = inserted;
      drugInfosChanged = true;
      runSummary.done += 1;
      console.log(`  drug_infos.json: ${updated}件更新 / ${inserted}件新規追加`);
    } catch (error) {
      entry.status = 'fetch_error';
      entry.error = error instanceof Error ? error.message : String(error);
      runSummary.fetchError += 1;
      console.log(`  取得エラー: ${entry.error}`);
      console.error(error);
      if (error instanceof Error && (error as any).cause) {
        console.error('Error cause:', (error as any).cause);
      }
      await sleep(REQUEST_DELAY_MS);
    }

    // 毎回の処理完了後にディスクへ途中経過を書き込みます（名寄せ同期も都度実施）
    saveQueue();
    if (drugInfosChanged) {
      const bySourceUrl = new Map<string, DrugInfo[]>();
      for (const info of drugInfos) {
        const urls = new Set<string>([
          ...(info.contraindications || []).map((c) => c.sourceUrl),
          ...(info.contraindicatedConditions || []).map((c) => c.sourceUrl)
        ]);
        for (const url of urls) {
          if (!url) continue;
          if (!bySourceUrl.has(url)) {
            bySourceUrl.set(url, []);
          }
          bySourceUrl.get(url)!.push(info);
        }
      }

      for (const [url, infos] of bySourceUrl.entries()) {
        let bestContraindications = null;
        let bestContraindicatedConditions = null;
        for (const info of infos) {
          const contras = (info.contraindications || []).filter((c) => c.sourceUrl === url);
          const conds = (info.contraindicatedConditions || []).filter((c) => c.sourceUrl === url);
          if (contras.length > 0) {
            if (!bestContraindications || contras.length > bestContraindications.length) {
              bestContraindications = contras;
            }
          }
          if (conds.length > 0) {
            if (!bestContraindicatedConditions || conds.length > bestContraindicatedConditions.length) {
              bestContraindicatedConditions = conds;
            }
          }
        }

        for (const info of infos) {
          if (bestContraindications) {
            const currentContras = (info.contraindications || []).filter((c) => c.sourceUrl === url);
            if (currentContras.length === 0 || JSON.stringify(currentContras) !== JSON.stringify(bestContraindications)) {
              const otherContras = (info.contraindications || []).filter((c) => c.sourceUrl !== url);
              info.contraindications = [...otherContras, ...bestContraindications];
            }
          }
          if (bestContraindicatedConditions) {
            const currentConds = (info.contraindicatedConditions || []).filter((c) => c.sourceUrl === url);
            if (currentConds.length === 0 || JSON.stringify(currentConds) !== JSON.stringify(bestContraindicatedConditions)) {
              const otherConds = (info.contraindicatedConditions || []).filter((c) => c.sourceUrl !== url);
              info.contraindicatedConditions = [...otherConds, ...bestContraindicatedConditions];
            }
          }
        }
      }
      fs.writeFileSync(drugInfosPath, `${JSON.stringify(drugInfos, null, 2)}\n`, 'utf-8');
    }
  }

  console.log(`\nキューとdrug_infos.jsonの同期書き込みがすべて完了しました。`);

  const remainingPending = queue.filter((e) => e.status === 'pending').length;
  const runLogEntry = {
    runAt: new Date().toISOString(),
    limit,
    ...runSummary,
    remainingPending
  };
  fs.appendFileSync(runLogPath, `${JSON.stringify(runLogEntry)}\n`, 'utf-8');

  console.log('\n=== 今回の実行サマリー ===');
  console.log(JSON.stringify(runLogEntry, null, 2));
  console.log(
    '\n次のステップ: 必ず `npx tsx src/scripts/verifyOfficialDrugInteractionLabels.ts` を実行し、' +
      'その出力（PASS/FAILとサンプル再検証結果）を一緒に報告してください。このスクリプト自身の' +
      'サマリーだけを「完了」の根拠にしないでください。'
  );
}

main().catch((error) => {
  console.error('公式添付文書の相互作用データ取得に失敗しました:', error);
  process.exit(1);
});
