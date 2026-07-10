import { test } from 'node:test';
import assert from 'node:assert';
import {
  extractDrugNameLines,
  extractOfficialContraindicatedConditionRowsFromLabelHtml,
  extractOfficialInteractionRowsFromLabelHtml,
  extractPmdaDetailFnamesFromGeneralListHtml,
  findSuspiciousContraindicatedConditionRows,
  findSuspiciousInteractionRows,
  sha256HexOfText
} from './drug_official_interaction_label.ts';

// 以下のHTML断片はすべて、2026年に取得したPMDA添付文書詳細ページ（実在の公式文書）から
// そのまま抜き出したもの。捏造・要約はしていない。
// - ガスターD錠10mg/20mg（171911_2325003F3035_2_04）10.2併用注意
// - イトラコナゾールカプセル50mg（800155_6290004M1029_1_46）10.1併用禁忌・10.2併用注意の一部

const FAMOTIDINE_SECTION_HTML = `<div class="section" id="HDR_PrecautionsForCombinations" data-level="2"><h3 class="section_header">10.2 併用注意(併用に注意すること)</h3><div class="level-2" data-index="10.2"><div class="RepeatingElements"><table border="1" class="PrecautionsForCombi_table" style="width:"><thead><tr><th style="width:">薬剤名等</th><th style="width:">臨床症状・措置方法</th><th style="width:">機序・危険因子</th></tr></thead><tbody><tr><td><div class="VariousForm"><ul class="SimpleList"><a name=""></a><li id="">アゾール系抗真菌薬<ul class="SimpleList"><a name=""></a><li id="">イトラコナゾール</li></ul></li></ul></div></td><td><div class="VariousForm"><p>左記の薬剤の血中濃度が低下する。</p></div></td><td><div class="VariousForm"><p>本剤の胃酸分泌抑制作用が左記薬剤の経口吸収を低下させる<sup class="ReferenceBookRef"><a href="#DOC_02">2)</a></sup><sup>,</sup><sup class="ReferenceBookRef"><a href="#DOC_03">3)</a></sup>。</p></div></td></tr></tbody></table></div></div></div>`;

const ITRACONAZOLE_CONTRAINDICATION_ROW_HTML = `<table border="1" class="ContraIndication_table" style="width:100%"><thead><tr><th>薬剤名等</th><th>臨床症状・措置方法</th><th>機序・危険因子</th></tr></thead><tbody><tr><td><div class="VariousForm"><p>ピモジド</p><p>キニジン<sup class="ReferenceBookRef"><a href="#DOC_04">4)</a></sup><sup>,</sup><sup class="ReferenceBookRef"><a href="#DOC_05">5)</a></sup></p><p>ベプリジル<sup class="ReferenceBookRef"><a href="#DOC_06">6)</a></sup></p><ul class="SimpleList"><a name=""></a><li id="">ベプリコール</li></ul><p>                  <a class="HeaderRef" href="#HDR_PMDA_ContraIndications_20211026170339_1"></a>                </p></div></td><td><div class="VariousForm"><p>これらの薬剤の血中濃度上昇により、QT延長が発現する可能性がある。</p></div></td><td><div class="VariousForm"><p>本剤のCYP3A4に対する阻害作用により、これらの薬剤の代謝が阻害される。</p></div></td></tr></tbody></table>`;

const ITRACONAZOLE_PRECAUTION_ROWS_HTML = `<table border="1" class="PrecautionsForCombi_table" style="width:100%"><thead><tr><th>薬剤名等</th><th>臨床症状・措置方法</th><th>機序・危険因子</th></tr></thead><tbody><tr><td><div class="VariousForm"><p>ビンカアルカロイド系抗悪性腫瘍剤</p><ul class="SimpleList"><a name=""></a><li id="">ビンクリスチン<sup class="ReferenceBookRef"><a href="#DOC_14">14)</a></sup><br>ビンブラスチン等</li></ul></div></td><td><div class="VariousForm"><p>これらの薬剤の血中濃度を上昇させることがあり、ビンカアルカロイド系抗悪性腫瘍剤の副作用が増強されることがある。必要に応じてこれらの薬剤の投与量を減量するなど用量に注意すること。</p></div></td><td><div class="VariousForm"><p>本剤のCYP3A4に対する阻害作用により、これらの薬剤の代謝が阻害される。</p></div></td></tr><tr><td><div class="VariousForm"><p><span contenteditable="false" class="revisionPrev-editor">*</span>タラゾパリブ</p></div></td><td><div class="VariousForm"><p>タラゾパリブの副作用が増強されるおそれがあるので、本剤との併用は可能な限り避けること。やむを得ず併用する場合には、患者の状態を慎重に観察し、副作用の発現に十分注意すること。</p></div></td><td><div class="VariousForm"><p>本剤のP糖蛋白阻害作用により、タラゾパリブの血中濃度が上昇する可能性がある。</p></div></td></tr></tbody></table>`;

test('extractOfficialInteractionRowsFromLabelHtml reads famotidine 10.2 (real ガスターD錠 label) as a single warning-severity row', () => {
  const rows = extractOfficialInteractionRowsFromLabelHtml(FAMOTIDINE_SECTION_HTML);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].severity, 'warning');
  assert.deepStrictEqual(rows[0].drugNames, ['アゾール系抗真菌薬', 'イトラコナゾール']);
  assert.match(rows[0].clinicalEffect, /血中濃度が低下する/);
  assert.match(rows[0].mechanism, /経口吸収を低下させる/);
  // footnote reference markers must not leak into the mechanism text
  assert.doesNotMatch(rows[0].mechanism, /DOC_02|ReferenceBookRef/);
});

test('extractOfficialInteractionRowsFromLabelHtml reads a real 10.1 contraindication row (danger) and keeps both the generic and brand name', () => {
  const rows = extractOfficialInteractionRowsFromLabelHtml(ITRACONAZOLE_CONTRAINDICATION_ROW_HTML);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].severity, 'danger');
  assert.deepStrictEqual(rows[0].drugNames, ['ピモジド', 'キニジン', 'ベプリジル', 'ベプリコール']);
  assert.match(rows[0].clinicalEffect, /QT延長/);
});

test('extractOfficialInteractionRowsFromLabelHtml splits <br>-joined names inside one <li> and strips the trailing 等', () => {
  const rows = extractOfficialInteractionRowsFromLabelHtml(ITRACONAZOLE_PRECAUTION_ROWS_HTML);
  const vincaRow = rows.find((row) => row.drugNames.includes('ビンカアルカロイド系抗悪性腫瘍剤'));
  assert.ok(vincaRow);
  assert.deepStrictEqual(vincaRow!.drugNames, ['ビンカアルカロイド系抗悪性腫瘍剤', 'ビンクリスチン', 'ビンブラスチン']);
});

test('extractOfficialInteractionRowsFromLabelHtml strips the revision marker span and keeps the real drug name', () => {
  const rows = extractOfficialInteractionRowsFromLabelHtml(ITRACONAZOLE_PRECAUTION_ROWS_HTML);
  const tarazoRow = rows.find((row) => row.drugNames.includes('タラゾパリブ'));
  assert.ok(tarazoRow);
  assert.strictEqual(tarazoRow!.drugNames.length, 1);
});

test('extractOfficialInteractionRowsFromLabelHtml returns an empty array when neither section is present (no guessing)', () => {
  assert.deepStrictEqual(extractOfficialInteractionRowsFromLabelHtml('<div>10. 相互作用は特にありません</div>'), []);
});

test('extractDrugNameLines dedupes and trims structural whitespace from a <p>-only cell', () => {
  assert.deepStrictEqual(
    extractDrugNameLines('<p>ジソピラミド</p>'),
    ['ジソピラミド']
  );
});

test('extractDrugNameLines drops leftover punctuation from removed cross-reference links (real コルヒチン row)', () => {
  const cellHtml = '<p>コルヒチン<br><a class="HeaderRef" href="#HDR_ContraIndications_2"></a>,<a class="HeaderRef" href="#HDR_PMDA_PatientsWithRenalImpairment_20211026170339_18"></a>,<a class="HeaderRef" href="#HDR_PMDA_PatientsWithHepaticImpairment_20211026170339_21"></a></p>';
  assert.deepStrictEqual(extractDrugNameLines(cellHtml), ['コルヒチン']);
});

test('extractDrugNameLines strips a revisionPrevThis-editor marker and 〔〕-bracketed brand names (real クラリスロマイシン ベネトクラクス row)', () => {
  const cellHtml = '<p><span contenteditable="false" class="revisionPrevThis-editor">**,*</span>ベネトクラクス（慢性リンパ性白血病（小リンパ球性リンパ腫を含む）、再発又は難治性のマントル細胞リンパ腫の用量漸増期）<br>〔ベネクレクスタ〕<br><a class="HeaderRef" href="#HDR_ContraIndications_2"></a>,<a class="HeaderRef" href="#HDR_DrugAndDrugInteractions_1"></a></p>';
  assert.deepStrictEqual(extractDrugNameLines(cellHtml), [
    'ベネトクラクス（慢性リンパ性白血病（小リンパ球性リンパ腫を含む）、再発又は難治性のマントル細胞リンパ腫の用量漸増期）',
    'ベネクレクスタ'
  ]);
});

test('findSuspiciousInteractionRows flags empty clinicalEffect and mechanism', () => {
  const flags = findSuspiciousInteractionRows([
    { severity: 'warning', drugNames: ['サンプル薬'], clinicalEffect: '', mechanism: '' }
  ]);
  assert.strictEqual(flags.length, 1);
  assert.match(flags[0], /臨床症状・機序の両方が空/);
});

test('findSuspiciousInteractionRows flags leftover bracket/markup characters', () => {
  const flags = findSuspiciousInteractionRows([
    { severity: 'warning', drugNames: ['〔ベネクレクスタ〕'], clinicalEffect: 'x', mechanism: 'y' }
  ]);
  assert.strictEqual(flags.length, 1);
  assert.match(flags[0], /未処理のマークアップ/);
});

test('findSuspiciousInteractionRows returns no flags for clean rows', () => {
  const flags = findSuspiciousInteractionRows([
    { severity: 'danger', drugNames: ['ピモジド', 'キニジン'], clinicalEffect: 'QT延長', mechanism: 'CYP3A4阻害' }
  ]);
  assert.deepStrictEqual(flags, []);
});

test('extractPmdaDetailFnamesFromGeneralListHtml pulls fnames in document order (real ガスターD錠 GeneralList excerpt)', () => {
  const html = `<td><a onclick='javascript:detailDisp("PmdaSearch", "171911_2325003F1024_2_04"); return false;'>HTML</a></td>` +
    `<td><a onclick='javascript:detailDisp("PmdaSearch", "171911_2325003F3035_2_04"); return false;'>HTML</a></td>`;
  assert.deepStrictEqual(extractPmdaDetailFnamesFromGeneralListHtml(html), [
    '171911_2325003F1024_2_04',
    '171911_2325003F3035_2_04'
  ]);
});

test('sha256HexOfText is deterministic and matches a known SHA-256 vector', async () => {
  assert.strictEqual(
    await sha256HexOfText('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('extractDrugNameLines splits a 、-separated enumeration with no <br>/<li> structure (real デュロキセチン row)', () => {
  const cellHtml = '<li id="">炭酸リチウム、セロトニン・ノルアドレナリン再取り込み阻害剤（SNRI）及び選択的セロトニン再取り込み阻害剤（SSRI）、トラマドール塩酸塩、トリプタン系薬剤、L-トリプトファン含有製剤、リネゾリド等</li>';
  assert.deepStrictEqual(extractDrugNameLines(cellHtml), [
    '炭酸リチウム',
    'セロトニン・ノルアドレナリン再取り込み阻害剤（SNRI）及び選択的セロトニン再取り込み阻害剤（SSRI）',
    'トラマドール塩酸塩',
    'トリプタン系薬剤',
    'L-トリプトファン含有製剤',
    'リネゾリド'
  ]);
});

// 以下は禁忌章（PMDA添付文書「2. 禁忌（次の患者には投与しないこと）」）の実データ。
// - ベシケア錠（ソリフェナシン、800126_2590011F1028_1_12）
// - イトラコナゾールカプセル50mg（800155_6290004M1029_1_46）

const SOLIFENACIN_CONTRAINDICATIONS_SECTION_HTML = `<a name="HDR_ContraIndications"></a><div class="section" id="HDR_ContraIndications" data-level="1" data-thisCount="0" data-lastCount="0"><h3 class="section_header">2. 禁忌（次の患者には投与しないこと）</h3><div class="level-1" data-index="2"><div class="VariousForm"><ol><a name="HDR_PMDA_ContraIndications_20190722141338_1"></a><li id="HDR_PMDA_ContraIndications_20190722141338_1" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.1 </span>本剤の成分に対し過敏症の既往歴のある患者</li><a name="HDR_ContraIndications_2"></a><li id="HDR_ContraIndications_2" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.2 </span>尿閉を有する患者［排尿時の膀胱収縮が抑制され、症状が悪化するおそれがある。］<a class="HeaderRef" href="#HDR_PMDA_SeriousAdverseEvents_20190722141338_31"></a></li><a name="HDR_ContraIndications_3"></a><li id="HDR_ContraIndications_3" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.3 </span>閉塞隅角緑内障の患者［抗コリン作用により眼圧が上昇し、症状が悪化するおそれがある。］<a class="HeaderRef" href="#HDR_PMDA_SeriousAdverseEvents_20190722141338_35"></a></li><a name="HDR_ContraIndications_4"></a><li id="HDR_ContraIndications_4" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.4 </span>幽門部、十二指腸又は腸管が閉塞している患者及び麻痺性イレウスのある患者［胃腸の平滑筋の収縮及び運動が抑制され、症状が悪化するおそれがある。］<a class="HeaderRef" href="#HDR_PMDA_SeriousAdverseEvents_20190722141338_33"></a></li><a name="HDR_PMDA_ContraIndications_20190722141338_5"></a><li id="HDR_PMDA_ContraIndications_20190722141338_5" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.5 </span>胃アトニー又は腸アトニーのある患者［抗コリン作用により消化管運動が低下するため症状が悪化するおそれがある。］</li><a name="HDR_PMDA_ContraIndications_20190722141338_6"></a><li id="HDR_PMDA_ContraIndications_20190722141338_6" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.6 </span>重症筋無力症の患者［抗コリン作用により筋緊張の低下がみられ症状が悪化するおそれがある。］</li><a name="HDR_ContraIndications_7"></a><li id="HDR_ContraIndications_7" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.7 </span>重篤な心疾患の患者［期外収縮等の心電図異常が報告されており、症状が悪化するおそれがある。］<a class="HeaderRef" href="#HDR_SeriousAdverse_4"></a>,<a class="HeaderRef" href="#HDR_ResultsOfClinicalTrialsEtc_1"></a></li><a name="HDR_ContraIndications_8"></a><li id="HDR_ContraIndications_8" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.8 </span>重度の肝機能障害患者（Child-Pugh分類C）<a class="HeaderRef" href="#HDR_PatientsWithHepaticImpairment_1"></a></li></ol></div></div></div>`;

const ITRACONAZOLE_CONTRAINDICATIONS_SECTION_HTML = `<a name="HDR_ContraIndications"></a><div class="section" id="HDR_ContraIndications" data-level="1" data-thisCount="0" data-lastCount="1"><h3 class="section_header">2. 禁忌（次の患者には投与しないこと）</h3><div class="level-1" data-index="2"><div class="VariousForm"><ol><a name="HDR_PMDA_ContraIndications_20211026170339_1"></a><li id="HDR_PMDA_ContraIndications_20211026170339_1" data-level="2" data-thisCount="0" data-lastCount="1"><span class="section_header">2.1 </span><span contenteditable="false" class="revisionPrev-editor">*</span>ピモジド、キニジン、ベプリジルを投与中の患者<a class="HeaderRef" href="#HDR_ContraIndicatedCombinations"></a></li><a name="HDR_ContraIndications_2"></a><li id="HDR_ContraIndications_2" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.2 </span>肝臓又は腎臓に障害のある患者で、コルヒチンを投与中の患者<a class="HeaderRef" href="#HDR_PMDA_PatientsWithRenalImpairment_20211026170339_18"></a>,<a class="HeaderRef" href="#HDR_PMDA_PatientsWithHepaticImpairment_20211026170339_21"></a>,<a class="HeaderRef" href="#HDR_PrecautionsForCombinations"></a></li><a name="HDR_ContraIndications_3"></a><li id="HDR_ContraIndications_3" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.3 </span>本剤の成分に対して過敏症の既往歴のある患者<a class="HeaderRef" href="#HDR_ImportantPrecautions_1"></a>,<a class="HeaderRef" href="#HDR_PMDA_UseInPatientsWithComplicationsOrHistoryOfDiseasesEtc_20211026170339_16"></a></li><a name="HDR_ContraIndications_4"></a><li id="HDR_ContraIndications_4" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.4 </span>重篤な肝疾患の現症、既往歴のある患者<br><a class="HeaderRef" href="#HDR_ImportantPrecautions_1"></a>,<a class="HeaderRef" href="#HDR_PMDA_PatientsWithHepaticImpairment_20211026170339_20"></a></li><a name="HDR_ContraIndications_5"></a><li id="HDR_ContraIndications_5" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">2.5 </span>妊婦又は妊娠している可能性のある女性<a class="HeaderRef" href="#HDR_UseInPregnant"></a></li></ol></div></div></div>`;

test('extractOfficialContraindicatedConditionRowsFromLabelHtml extracts real disease-based absolute contraindications (real ベシケア錠 label, including glaucoma)', () => {
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(SOLIFENACIN_CONTRAINDICATIONS_SECTION_HTML);
  assert.strictEqual(rows.length, 7);
  const glaucomaRow = rows.find((r) => r.conditionText.includes('緑内障'));
  assert.ok(glaucomaRow);
  assert.strictEqual(glaucomaRow!.conditionText, '閉塞隅角緑内障の患者');
  assert.match(glaucomaRow!.reason || '', /眼圧が上昇/);
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml excludes the self-hypersensitivity boilerplate (redundant with allergy alerts)', () => {
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(SOLIFENACIN_CONTRAINDICATIONS_SECTION_HTML);
  assert.ok(!rows.some((r) => r.conditionText.includes('過敏症の既往歴')));
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml excludes a pure drug list (redundant with section 10.1) but keeps a compound organ-impairment + drug condition', () => {
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(ITRACONAZOLE_CONTRAINDICATIONS_SECTION_HTML);
  // 2.1 (pure drug list "ピモジド、キニジン、ベプリジルを投与中の患者") must be excluded
  assert.ok(!rows.some((r) => r.conditionText.includes('ピモジド')));
  // 2.3 (self-hypersensitivity) must be excluded
  assert.ok(!rows.some((r) => r.conditionText.includes('過敏症の既往歴')));
  // 2.2 (compound: organ impairment + specific drug) must be kept verbatim, not silently dropped
  assert.ok(rows.some((r) => r.conditionText === '肝臓又は腎臓に障害のある患者で、コルヒチンを投与中の患者'));
  // 2.4 and 2.5 (plain disease / pregnancy conditions) must be kept
  assert.ok(rows.some((r) => r.conditionText === '重篤な肝疾患の現症、既往歴のある患者'));
  assert.ok(rows.some((r) => r.conditionText === '妊婦又は妊娠している可能性のある女性'));
  assert.strictEqual(rows.length, 3);
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml returns an empty array when the section is absent (no guessing)', () => {
  assert.deepStrictEqual(extractOfficialContraindicatedConditionRowsFromLabelHtml('<div>禁忌なし</div>'), []);
});

test('findSuspiciousContraindicatedConditionRows returns no flags for clean real condition rows', () => {
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(SOLIFENACIN_CONTRAINDICATIONS_SECTION_HTML);
  assert.deepStrictEqual(findSuspiciousContraindicatedConditionRows(rows), []);
});

test('findSuspiciousContraindicatedConditionRows flags a leftover unmatched bracket', () => {
  const flags = findSuspiciousContraindicatedConditionRows([{ conditionText: '重篤な［患者' }]);
  assert.strictEqual(flags.length, 1);
  assert.match(flags[0], /未処理のマークアップ/);
});


const LATANOPROST_SINGLE_ITEM_CONTRAINDICATIONS_HTML = `ons"></a><div class="section" id="HDR_ContraIndications" data-level="1" data-thisCount="0" data-lastCount="0"><h3 class="section_header">2. 禁忌（次の患者には投与しないこと）</h3><div class="level-1" data-index="2"><div class="VariousForm"><p>本剤の成分に対し過敏症の既往歴のある患者</p></div></div></div></div><a name="HDR_CompositionAndProperty"></a><div class="section" id="HDR_CompositionAndProperty" data-level="1" data-thisCount="0" data-lastCount="0"><h3 class="section_header">3. 組成・性状</h3><div class="level-1" data-index="3"><a name="HDR_Composition"></a><div class="section" id="HDR_Composition" data-level="2" data-thisCount="0" data-lastCount="0"><h3 class="section_header">3.1 組成</h3><div class="level-2" data-index="3.1"><div class="section" data-level="3" data-thisCount="0" data-lastCount="0"><h3 class="section_header">キサラタン点眼液0.005％</h3><div class="level-3" data-index=""><div class="section"><h3 class="section_header"></h3><div class="level-4" data-index=""><table class="CompositionAndProperty_table" border="1"><colgroup><col width="200px"><col width="300px"></colgroup><tr><th rowspan="1">有効成分</th><td>1mL中<br>ラタノプロスト　50μg&nbsp;&nbsp;</td></tr><tr><th>添加剤</th><td>ベンザルコニウム塩化物、無水リン酸一水素ナトリウム、リン酸二水素ナトリウム一水和物、等張化剤</td></tr></table></div></div></div></div></div></div><a name="HDR_Property"></a><div class="section" id="HDR_Property" data-level="2" data-thisCount="0" data-lastCount="0"><h3 class="section_header">3.2 製剤の性状</h3><div class="level-2" data-index="3.2"><div class="section" data-level="3" data-thisCount="0" data-lastCount="0"><h3 class="section_header">キサラタン点眼液0.005％</h3><div class="level-3" data-index=""><div class="section" data-level="4" data-thisCount="0" data-lastCount="0"><h3 class="section_header"></h3><div class="level-4" data-index=""><table class="CompositionAndProperty_table" border="1"><colgroup><col width="100px"><col width="100px"><col width="200px"></colgroup><tr><th colspan="2">pH</th><td>6.5～6.9</td></tr><tr><th colspan="2">浸透圧比</th><td>約1（生理食塩液対比）</td></tr><tr><th colspan="2" rowspan="1">性状</th><td>無色澄明、無菌水性点眼液</td></tr></table></div></div></div></div></div></div></div></div><a name="HDR_IndicationsOrEfficacy"></a><div class="section" id="HDR_IndicationsOrEfficacy" data-level="1" data-thisCount="0" data-lastCount="0"><h3 class="section_header">4. 効能又は効果</h3><div class="level-1" data-index="4"><div class="VariousForm"><p>緑内障、高眼圧症</p></div></div></div><a name="HDR_InfoDoseAdmin"></a><div class="section" id="HDR_InfoDoseAdmin" data-level="1" data-thisCount="0" data-lastCount="0"><h3 class="section_header">6. 用法及び用量</h3><div class="level-1" data-index="6"><div class="VariousForm"><p>1回1滴、1日1回点眼する。</p></div></div></div><a name="HDR_InfoPrecautionsDosage"></a><div class="section" id="HDR_InfoPrecautionsDosage" data-level="1" data-thisCount="0" data-lastCount="0"><h3 class="section_header">7. 用法及び用量に関連する注意</h3><div class="level-1" data-index="7"><div class="VariousForm"><p>頻回投与により眼圧下降作用が減弱する可能性があるので、1日1回を超えて投与しないこと。</p></div></div></div><a name="HDR_ImportantPrecautions"></a><div class="section" id="HDR_ImportantPrecautions" data-level="1" data-thisCount="0" data-lastCount="0"><h3 class="section_header">8. 重要な基本的注意</h3><div class="level-1" data-index="8"><div class="VariousForm"><ol><a name="HDR_ImportantPrecautions_1"></a><li id="HDR_ImportantPrecautions_1" data-level="2" data-thisCount="0" data-lastCount="0"><span class="section_header">8.1 </span>本剤の投与により、虹彩色素沈着（メラニンの増加）があらわれることがある。投与に際しては虹彩色素沈着及び色調変化について患`;

test('extractOfficialContraindicatedConditionRowsFromLabelHtml does not read into a later <ol> section when 禁忌 has only one <p>-only item (real キサラタン点眼液 label)', () => {
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(LATANOPROST_SINGLE_ITEM_CONTRAINDICATIONS_HTML);
  // The only real item is the self-hypersensitivity boilerplate, which is filtered out.
  // Before the section-boundary fix, this leaked into section 8's unrelated <ol> content.
  assert.deepStrictEqual(rows, []);
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml excludes a pure drug list starting with "次の薬剤を投与中の患者：" (real トリアゾラム label)', () => {
  const html = `<div class="section" id="HDR_ContraIndications" data-level="1"><div class="VariousForm"><ol><li id="HDR_PMDA_ContraIndications_1"><span class="section_header">2.1 </span>本剤に対し過敏症の既往歴のある患者</li><li id="HDR_PMDA_ContraIndications_2"><span class="section_header">2.2 </span>次の薬剤を投与中の患者：イトラコナゾール、ポサコナゾール、フルコナゾール、ホスフルコナゾール、ボリコナゾール、ミコナゾール</li></ol></div></div>`;
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(html);
  assert.deepStrictEqual(rows, []);
});

test('extractDrugNameLines splits a "等）" enumeration parenthetical into a class-label line plus individual drug names (real ポプスカイン注 row)', () => {
  const cellHtml = '<p>CYP3A4阻害剤（ケトコナゾール、エリスロマイシン、リトナビル、サキナビル、ベラパミル塩酸塩等）及びCYP1A2阻害剤（シメチジン、フルボキサミン、キノロン系抗菌剤等）</p>';
  const names = extractDrugNameLines(cellHtml);
  assert.ok(names.every((n) => n.length <= 20), `expected no over-long unsplit tokens, got: ${JSON.stringify(names)}`);
  assert.ok(names.includes('ケトコナゾール'));
  assert.ok(names.includes('シメチジン'));
});

test('extractDrugNameLines does not split a disease-context parenthetical just because it contains 、 (real ベネトクラクス row, regression guard)', () => {
  const cellHtml = '<p>ベネトクラクス（慢性リンパ性白血病（小リンパ球性リンパ腫を含む）、再発又は難治性のマントル細胞リンパ腫の用量漸増期）</p>';
  assert.deepStrictEqual(extractDrugNameLines(cellHtml), [
    'ベネトクラクス（慢性リンパ性白血病（小リンパ球性リンパ腫を含む）、再発又は難治性のマントル細胞リンパ腫の用量漸増期）'
  ]);
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml accepts 〔〕 lenticular brackets as the reason delimiter (real ヘルベッサーR label)', () => {
  const html = '<div class="section" id="HDR_ContraIndications" data-level="1"><h3 class="section_header">2. 禁忌（次の患者には投与しないこと）</h3><div class="level-1" data-index="2"><div class="VariousForm"><ol><a name="HDR_ContraIndications_1"></a><li id="HDR_ContraIndications_1" data-level="2"><span class="section_header">2.1 </span>重篤なうっ血性心不全の患者〔心不全症状を悪化させるおそれがある。〕</li></ol></div></div></div>';
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(html);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].conditionText, '重篤なうっ血性心不全の患者');
  assert.match(rows[0].reason || '', /心不全症状を悪化させるおそれがある/);
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml flattens a nested <ol> under a category-header <li> into its leaf conditions (real ザルティア label)', () => {
  const html = '<div class="section" id="HDR_ContraIndications" data-level="1"><h3 class="section_header">2. 禁忌（次の患者には投与しないこと）</h3><div class="level-1" data-index="2"><div class="VariousForm"><ol><a name="x"></a><li id="HDR_PMDA_ContraIndications_20200221152102_6" data-level="2"><span class="section_header">2.4 </span>次に掲げる心血管系障害を有する患者［これらの患者は臨床試験では除外されている。］<ol><a name="HDR_ContraIndications_5"></a><li id="HDR_ContraIndications_5" data-level="3"><span class="section_header">2.4.1 </span>不安定狭心症のある患者<a class="HeaderRef" href="#HDR_Warnings_2"></a></li><a name="HDR_ContraIndications_6"></a><li id="HDR_ContraIndications_6" data-level="3"><span class="section_header">2.4.2 </span>心不全（NYHA分類Ⅲ度以上）のある患者<a class="HeaderRef" href="#HDR_Warnings_2"></a></li></ol></li></ol></div></div></div>';
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(html);
  // The category-header text ("次に掲げる心血管系障害を有する患者") is a label, not a matchable condition;
  // only the specific leaf diagnoses should be extracted.
  assert.deepStrictEqual(
    rows.map((r) => r.conditionText),
    ['不安定狭心症のある患者', '心不全（NYHA分類Ⅲ度以上）のある患者']
  );
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml handles <ul class="SimpleList"> + Header-preview wrapping a single condition (real ホルマリン label)', () => {
  const html = '<div class="section" id="HDR_ContraIndications" data-level="1"><h3 class="section_header">2. 禁忌（次の患者には投与しないこと）</h3><div class="level-1" data-index="2"><div class="VariousForm"><ul class="SimpleList"><a name=""></a><li id=""><span class="Header-preview">&lt;歯科領域&gt;</span></li><a name=""></a><li id="">本剤の成分に対し過敏症の既往歴のある患者</li></ul></div></div></div>';
  // The only real item is self-hypersensitivity boilerplate, filtered out; the Header-preview-only
  // sibling <li> must not leak through as an empty or garbled row.
  assert.deepStrictEqual(extractOfficialContraindicatedConditionRowsFromLabelHtml(html), []);
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml handles <ul class="SimpleList"> grouping with nested <ol> per indication (real ポプスカイン注 label)', () => {
  const html = '<div class="section" id="HDR_ContraIndications" data-level="1"><h3 class="section_header">2. 禁忌（次の患者には投与しないこと）</h3><div class="level-1" data-index="2"><div class="VariousForm"><ul class="SimpleList"><a name=""></a><li id=""><span class="Header-preview">〈効能共通〉</span><ol><a name="HDR_ContraIndications_1"></a><li id="HDR_ContraIndications_1" data-level="2"><span class="section_header">2.1 </span>本剤の成分又はアミド型局所麻酔剤に対し過敏症の既往歴のある患者</li></ol></li><a name=""></a><li id=""><span class="Header-preview">〈術後鎮痛〉</span><ol><a name="HDR_ContraIndications_2"></a><li id="HDR_ContraIndications_2" data-level="2"><span class="section_header">2.2 </span>大量出血やショック状態の患者［過度の血圧低下が起こることがある。］</li><a name="HDR_ContraIndications_3"></a><li id="HDR_ContraIndications_3" data-level="2"><span class="section_header">2.3 </span>注射部位又はその周辺に炎症のある患者［化膿性髄膜炎症状を起こすことがある。］</li></ol></li></ul></div></div></div>';
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(html);
  assert.deepStrictEqual(
    rows.map((r) => r.conditionText),
    ['本剤の成分又はアミド型局所麻酔剤に対し過敏症の既往歴のある患者', '大量出血やショック状態の患者', '注射部位又はその周辺に炎症のある患者']
  );
});

test('findSuspiciousContraindicatedConditionRows does not flag a legitimately long exhaustive drug enumeration (real エンレスト ACE阻害薬 condition, 160 chars)', () => {
  const longCondition = 'アンジオテンシン変換酵素阻害薬（アラセプリル、イミダプリル塩酸塩、エナラプリルマレイン酸塩、カプトプリル、キナプリル塩酸塩、シラザプリル水和物、テモカプリル塩酸塩、デラプリル塩酸塩、トランドラプリル、ベナゼプリル塩酸塩、ペリンドプリルエルブミン、リシノプリル水和物）を投与中の患者、あるいは投与中止から36時間以内の患者';
  assert.strictEqual(longCondition.length, 160);
  assert.deepStrictEqual(findSuspiciousContraindicatedConditionRows([{ conditionText: longCondition }]), []);
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml strips multiple comma/whitespace remnants left by several adjacent HeaderRef links (real オキシトシン label)', () => {
  const html = '<div class="section" id="HDR_ContraIndications" data-level="1"><h3 class="section_header">2. 禁忌（次の患者には投与しないこと）</h3><div class="level-1" data-index="2"><div class="VariousForm"><ol><a name="x"></a><li id="x" data-level="2"><span class="section_header">2.4 </span>ジノプロストン（PGE<sub>2</sub>）製剤の投与終了後1時間以上経過していない患者［過強陣痛を起こすおそれがある。］<a class="HeaderRef" href="#a"></a><a class="HeaderRef" href="#b"></a>,<a class="HeaderRef" href="#c"></a><a class="HeaderRef" href="#d"></a> ,<a class="HeaderRef" href="#e"></a></li></ol></div></div></div>';
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(html);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].conditionText, 'ジノプロストン（PGE2）製剤の投与終了後1時間以上経過していない患者');
  assert.strictEqual(rows[0].reason, '過強陣痛を起こすおそれがある。');
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml treats a plain (non-bracketed) Header-preview span as the real condition text, not a decorative label (real アンテベートクリーム label)', () => {
  const html = '<div class="section" id="HDR_ContraIndications" data-level="1"><h3 class="section_header">2. 禁忌（次の患者には投与しないこと）</h3><div class="level-1" data-index="2"><div class="VariousForm"><ol><a name="x1"></a><li id="x1" data-level="2"><span class="section_header">2.1 </span><span class="Header-preview">細菌・真菌・スピロヘータ・ウイルス皮膚感染症、及び動物性皮膚疾患（疥癬、けじらみ等）</span><p>［感染症及び動物性皮膚疾患症状を悪化させることがある。］</p></li><a name="x2"></a><li id="x2" data-level="2"><span class="section_header">2.2 </span><span class="Header-preview">本剤の成分に対して過敏症の既往歴のある患者</span></li></ol></div></div></div>';
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(html);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].conditionText, '細菌・真菌・スピロヘータ・ウイルス皮膚感染症、及び動物性皮膚疾患（疥癬、けじらみ等）');
  assert.strictEqual(rows[0].reason, '感染症及び動物性皮膚疾患症状を悪化させることがある。');
});

test('extractOfficialContraindicatedConditionRowsFromLabelHtml handles nested SimpleList containing reasons (real Spiolto label)', () => {
  const html = `
    <div class="section" id="HDR_ContraIndications" data-level="1">
      <h3 class="section_header">2. 禁忌（次の患者には投与しないこと）</h3>
      <div class="level-1" data-index="2">
        <div class="VariousForm">
          <ol>
            <a name="HDR_ContraIndications_1"></a>
            <li id="HDR_ContraIndications_1" data-level="2">
              <span class="section_header">2.1 </span>閉塞隅角緑内障の患者
              <ul class="SimpleList">
                <a name=""></a>
                <li id="">［眼内圧を高め、症状を悪化させるおそれがある。］<a class="HeaderRef" href="#HDR_ImportantPrecautions_5"></a></li>
              </ul>
            </li>
            <a name="HDR_ContraIndications_2"></a>
            <li id="HDR_ContraIndications_2" data-level="2">
              <span class="section_header">2.2 </span>前立腺肥大等による排尿障害のある患者
              <ul class="SimpleList">
                <a name=""></a>
                <li id="">［更に尿を出にくくすることがある。］<a class="HeaderRef" href="#HDR_UseInPatientsWithComplications"></a></li>
              </ul>
            </li>
            <a name="HDR_PMDA_ContraIndications_20210830120245_3"></a>
            <li id="HDR_PMDA_ContraIndications_20210830120245_3" data-level="2">
              <span class="section_header">2.3 </span>アトロピン及びその類縁物質あるいは本剤の成分に対して過敏症の既往歴のある患者
            </li>
          </ol>
        </div>
      </div>
    </div>
  `;
  const rows = extractOfficialContraindicatedConditionRowsFromLabelHtml(html);
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0].conditionText, '閉塞隅角緑内障の患者');
  assert.strictEqual(rows[0].reason, '眼内圧を高め、症状を悪化させるおそれがある。');
  assert.strictEqual(rows[1].conditionText, '前立腺肥大等による排尿障害のある患者');
  assert.strictEqual(rows[1].reason, '更に尿を出にくくすることがある。');
  assert.strictEqual(rows[2].conditionText, 'アトロピン及びその類縁物質あるいは本剤の成分に対して過敏症の既往歴のある患者');
  assert.strictEqual(rows[2].reason, undefined);
});

