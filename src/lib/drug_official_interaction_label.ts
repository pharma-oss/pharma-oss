export async function sha256HexOfText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type OfficialInteractionSeverity = 'danger' | 'warning';

export interface OfficialInteractionRow {
  severity: OfficialInteractionSeverity;
  drugNames: string[];
  clinicalEffect: string;
  mechanism: string;
}

const CONTRAINDICATION_TABLE_CLASS = 'ContraIndication_table';
const PRECAUTION_TABLE_CLASS = 'PrecautionsForCombi_table';

function extractTablesByClass(html: string, className: string): string[] {
  const tables: string[] = [];
  const tableStart = new RegExp(`<table\\b[^>]*class="${className}"[^>]*>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = tableStart.exec(html))) {
    const bodyStart = html.indexOf('<tbody', match.index);
    const bodyEnd = html.indexOf('</tbody>', bodyStart);
    if (bodyStart === -1 || bodyEnd === -1) continue;
    tables.push(html.slice(bodyStart, bodyEnd));
  }
  return tables;
}

function extractRowsFromTableBody(tbodyHtml: string): string[] {
  const rows: string[] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(tbodyHtml))) {
    rows.push(match[1]);
  }
  return rows;
}

function extractCellsFromRow(rowHtml: string): string[] {
  const cells: string[] = [];
  const cellPattern = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let match: RegExpExecArray | null;
  while ((match = cellPattern.exec(rowHtml))) {
    cells.push(match[1]);
  }
  return cells;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** 添付文書本文セル用: タグを取り除きつつテキストは残す（C<sub>max</sub>のような表記も読める形にする） */
function cleanCellText(cellHtml: string): string {
  const withoutTags = cellHtml.replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

/** 開き括弧の位置(index)をキーに、対応する閉じ括弧の直前が「等」で終わっているかを引けるようにする */
function findEnumerationParenStarts(text: string): Set<number> {
  const stack: number[] = [];
  const enumerationStarts = new Set<number>();
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '（' || char === '(') {
      stack.push(i);
    } else if (char === '）' || char === ')') {
      const start = stack.pop();
      if (start !== undefined && text.slice(0, i).trimEnd().endsWith('等')) {
        enumerationStarts.add(start);
      }
    }
  }
  return enumerationStarts;
}

/**
 * 括弧の外側（深さ0）にある全角読点「、」を改行に変える。括弧内の読点は原則、薬剤名や病名の
 * 一部として保護するが、「ＸＸ阻害剤（Ａ、Ｂ、Ｃ等）」のように「等）」で終わる括弧＝列挙リストの場合は、
 * その括弧自体（開き括弧・閉じ括弧・末尾の「等」）も区切りとして扱い、見出し語（ＸＸ阻害剤）と
 * 個々の薬剤名（Ａ、Ｂ、Ｃ）に分解する。「及び」は分割しない
 * （「ＳＮＲＩ及びＳＳＲＩ」のように、括弧の外で1つの複合的な薬効分類を表す既存データが多く、
 * ここで安易に分割すると既存の実データ多数と再パース結果が食い違ってしまうため）。
 */
function splitTopLevelIdeographicCommas(text: string): string {
  const enumerationStarts = findEnumerationParenStarts(text);
  const stack: boolean[] = []; // 各要素はその括弧が「等）」列挙括弧かどうか
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '（' || char === '(') {
      const isEnumerationParen = enumerationStarts.has(i);
      stack.push(isEnumerationParen);
      result += isEnumerationParen ? '\n' : char;
      continue;
    }
    if (char === '）' || char === ')') {
      const wasEnumerationParen = stack.pop();
      if (wasEnumerationParen) {
        result = result.replace(/等\s*$/, '');
        result += '\n';
      } else {
        result += char;
      }
      continue;
    }
    const depth = stack.length;
    const innermostIsEnumerationParen = depth > 0 && stack[depth - 1];
    const splittable = depth === 0 || innermostIsEnumerationParen;
    result += splittable && char === '、' ? '\n' : char;
  }
  return result;
}

/**
 * 「薬剤名等」セル専用の抽出。脚注番号(<sup class="ReferenceBookRef">)や本文内相互参照リンクは
 * 薬剤名の一部ではないため中身ごと除去し、<p>/<li>/<br>の構造的な区切りだけを改行として残す。
 * 末尾の「等」は「ほか」を意味する接尾語であり薬剤名の一部ではないため取り除く。
 */
export function extractDrugNameLines(cellHtml: string): string[] {
  let text = cellHtml;
  text = text.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '');
  text = text.replace(/<a\b[^>]*class="HeaderRef"[^>]*>[\s\S]*?<\/a>/gi, '');
  // 改版マーカーは revisionPrev-editor / revisionPrevThis-editor など複数のクラス名がある
  text = text.replace(/<span\b[^>]*class="revision[A-Za-z]*-editor"[^>]*>[\s\S]*?<\/span>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|li)>/gi, '\n');
  text = text.replace(/<(p|li)\b[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeHtmlEntities(text);
  // 〔商品名〕のような装飾的な括弧は薬剤名の一部ではないため取り除く（中身は残す）
  text = text.replace(/[〔〕【】]/g, '');
  // 構造タグ(<br>/<p>/<li>)を使わず「、」区切りだけで複数の薬剤名を並べているセルがある一方、
  // 「ベネトクラクス（...、...）」のように括弧内の読点は1つの薬剤名の一部として残したいケースもあるため、
  // 括弧の外側（深さ0）にある読点だけを区切りとして扱う
  text = splitTopLevelIdeographicCommas(text);

  const lines = text
    .split('\n')
    .map((line) => line.trim().replace(/等$/, '').trim())
    // 相互参照リンク除去後に区切り記号（、や,）だけが残った行は薬剤名ではないため除外する
    .filter((line) => /[\p{L}\p{N}]/u.test(line));

  return Array.from(new Set(lines));
}

function parseRow(cells: string[], severity: OfficialInteractionSeverity): OfficialInteractionRow | null {
  if (cells.length < 3) return null;
  const drugNames = extractDrugNameLines(cells[0]);
  if (drugNames.length === 0) return null;
  return {
    severity,
    drugNames,
    clinicalEffect: cleanCellText(cells[1]),
    mechanism: cleanCellText(cells[2])
  };
}

/**
 * PMDA添付文書詳細HTMLの「10. 相互作用」章から
 * 10.1 併用禁忌(ContraIndication_table) と 10.2 併用注意(PrecautionsForCombi_table) を抽出する。
 * どちらの章も存在しない添付文書では空配列を返す（推測で埋めない）。
 */
export function extractOfficialInteractionRowsFromLabelHtml(html: string): OfficialInteractionRow[] {
  const rows: OfficialInteractionRow[] = [];

  for (const tbody of extractTablesByClass(html, CONTRAINDICATION_TABLE_CLASS)) {
    for (const rowHtml of extractRowsFromTableBody(tbody)) {
      const row = parseRow(extractCellsFromRow(rowHtml), 'danger');
      if (row) rows.push(row);
    }
  }

  for (const tbody of extractTablesByClass(html, PRECAUTION_TABLE_CLASS)) {
    for (const rowHtml of extractRowsFromTableBody(tbody)) {
      const row = parseRow(extractCellsFromRow(rowHtml), 'warning');
      if (row) rows.push(row);
    }
  }

  return rows;
}

/**
 * 抽出結果の機械的な異常検知。ここで何か1件でも引っかかった場合、
 * その添付文書の抽出結果はdrug_infos.jsonへ書き込まず要確認扱いにする
 * （抽出ロジックの想定漏れを、書き込み前に必ず人間が確認できるようにするための安全弁）。
 */
export function findSuspiciousInteractionRows(rows: OfficialInteractionRow[]): string[] {
  const flags: string[] = [];
  for (const row of rows) {
    for (const name of row.drugNames) {
      if (/^[*,、・:：\s]/.test(name)) {
        flags.push(`薬剤名の先頭に不審な記号が残っています: ${JSON.stringify(name)}`);
      }
      if (/[〔〕【】<>]/.test(name)) {
        flags.push(`薬剤名に未処理のマークアップ・装飾記号が残っています: ${JSON.stringify(name)}`);
      }
      if (name.length > 80) {
        flags.push(`薬剤名が異常に長く、構造区切りの見落としの疑いがあります: ${JSON.stringify(name.slice(0, 40))}...`);
      }
    }
    if (!row.clinicalEffect && !row.mechanism) {
      flags.push(`臨床症状・機序の両方が空です: ${JSON.stringify(row.drugNames)}`);
    }
  }
  return flags;
}

export interface OfficialContraindicatedConditionRow {
  conditionText: string;
  reason?: string;
}

const CONTRAINDICATIONS_SECTION_ID = 'HDR_ContraIndications';
const SELF_HYPERSENSITIVITY_PATTERN = /^本剤(の成分)?に対し(て)?過敏症の既往(歴)?のある患者$/;
// 「薬剤名、薬剤名、...を投与中の患者」や「次の薬剤を投与中の患者：薬剤名、...」のような、
// 条件節を伴わない薬剤名だけの禁忌は10.1併用禁忌のtargetDrugsと重複するため、患者状態アラートとしては保持しない
const PURE_DRUG_LIST_PATTERN = /^([^、で]+(、[^、で]+)*を投与中の患者|次の薬(剤|物)を投与中の患者(：|:)[\s\S]*)$/;

/**
 * 「薬剤名等」セルの構造抽出とは別に、禁忌章の<li>1件分のテキストから
 * ［...］または〔...〕の理由部分を切り出し、本文と理由をそれぞれ整形する。
 * 添付文書によって全角角括弧［］と亀甲括弧〔〕のどちらも使われるため両方を受け付ける。
 */
function splitConditionTextAndReason(rawText: string): { conditionText: string; reason?: string } {
  const match = rawText.match(/^(.*?)[［\[〔](.+)[］\]〕]\s*$/);
  if (!match) {
    return { conditionText: rawText.trim() };
  }
  return { conditionText: match[1].trim(), reason: match[2].trim() };
}

/**
 * class="Header-preview"は2通りの役割で使われる。〈効能共通〉や&lt;歯科領域&gt;のように
 * 中身全体が装飾的な括弧（〈〉または&lt;&gt;）で囲まれている場合は分類ラベルなので中身ごと削除する。
 * 一方、「細菌・真菌・スピロヘータ・ウイルス皮膚感染症、及び動物性皮膚疾患」のように括弧で囲まれて
 * いない場合は、それ自体が禁忌条件の本文（続く<p>［理由］</p>の主語）なので、タグだけ外して残す。
 */
function stripOrUnwrapHeaderPreviewSpans(html: string): string {
  return html.replace(/<span\b[^>]*class="Header-preview"[^>]*>([\s\S]*?)<\/span>/gi, (_match, inner: string) => {
    const decoded = decodeHtmlEntities(inner).trim();
    const isDecorativeLabel = /^[〈<].*[〉>]$/.test(decoded);
    return isDecorativeLabel ? '' : inner;
  });
}

/** section_header/Header-previewの番号・見出し・改版マーカー・相互参照リンクを取り除き、末尾の孤立したカンマも整形する */
function cleanContraindicationItemText(itemHtml: string): string {
  let cleaned = itemHtml;
  cleaned = cleaned.replace(/<span\b[^>]*class="section_header"[^>]*>[\s\S]*?<\/span>/gi, '');
  cleaned = stripOrUnwrapHeaderPreviewSpans(cleaned);
  cleaned = cleaned.replace(/<span\b[^>]*class="revision[A-Za-z]*-editor"[^>]*>[\s\S]*?<\/span>/gi, '');
  cleaned = cleaned.replace(/<a\b[^>]*class="HeaderRef"[^>]*>[\s\S]*?<\/a>/gi, '');
  cleaned = cleaned.replace(/<br\s*\/?>/gi, ' ');
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  let text = decodeHtmlEntities(cleaned).replace(/\s+/g, ' ').trim();
  // 相互参照リンク(HeaderRef)除去後に区切りのカンマだけが行末に残ることがあるため取り除く
  // 複数のHeaderRefリンクが空白を挟んで連続していた場合、カンマと空白が交互に残ることがあるため
  // （例:「］<a…></a>,<a…></a> ,<a…></a>」→「］, ,」）、カンマ・読点・空白が混在した末尾を丸ごと取り除く
  text = text.replace(/[,、\s]+$/, '').trim();
  return text;
}

function buildContraindicatedConditionRow(text: string): OfficialContraindicatedConditionRow | null {
  if (!text) return null;
  const { conditionText, reason } = splitConditionTextAndReason(text);
  if (SELF_HYPERSENSITIVITY_PATTERN.test(conditionText)) return null;
  if (PURE_DRUG_LIST_PATTERN.test(conditionText)) return null;
  return { conditionText, reason };
}

interface ContraindicationListItem {
  ownHtml: string;
  children: ContraindicationListItem[];
}

/**
 * <ol>や<ul class="SimpleList">の直下の<li>を、入れ子（<li>の中にさらに<ol>/<ul>がある場合）を
 * 正しく認識しながら木構造として取り出す。禁忌章では「次に掲げる心血管系障害を有する患者」のような
 * 見出し的な<li>の中に、具体的な病名を列挙する入れ子<ol>が入ることがあるため、
 * 正規表現の非貪欲マッチだけでは入れ子の内側で</li>を誤検出してしまう。
 */
function parseContraindicationListItems(listHtml: string): ContraindicationListItem[] {
  const items: ContraindicationListItem[] = [];
  let cursor = 0;
  while (true) {
    const liStart = listHtml.indexOf('<li', cursor);
    if (liStart === -1) break;
    const openTagEnd = listHtml.indexOf('>', liStart);
    if (openTagEnd === -1) break;

    let depth = 1;
    let scan = openTagEnd + 1;
    while (depth > 0) {
      const nextOpen = listHtml.indexOf('<li', scan);
      const nextClose = listHtml.indexOf('</li>', scan);
      if (nextClose === -1) {
        scan = listHtml.length;
        depth = 0;
        break;
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        scan = listHtml.indexOf('>', nextOpen) + 1;
      } else {
        depth -= 1;
        scan = nextClose + '</li>'.length;
      }
    }
    const liCloseStart = scan - '</li>'.length;
    const inner = listHtml.slice(openTagEnd + 1, Math.max(openTagEnd + 1, liCloseStart));

    const nestedListMatch = inner.match(/<(ol|ul)\b[^>]*>/);
    if (nestedListMatch && nestedListMatch.index !== undefined) {
      const tag = nestedListMatch[1];
      const nestedContentStart = nestedListMatch.index + nestedListMatch[0].length;
      const nestedContentEnd = inner.lastIndexOf(`</${tag}>`);
      const ownHtml = inner.slice(0, nestedListMatch.index);
      const childrenHtml = inner.slice(nestedContentStart, nestedContentEnd === -1 ? undefined : nestedContentEnd);
      items.push({ ownHtml, children: parseContraindicationListItems(childrenHtml) });
    } else {
      items.push({ ownHtml: inner, children: [] });
    }

    cursor = scan;
  }
  return items;
}

/**
 * リスト項目の木を平坦化する。入れ子（子を持つ）項目は見出し的な文言（例:「次に掲げる
 * 心血管系障害を有する患者」）でしかないため、その項目自体は使わず、より具体的な子項目だけを
 * 実際の禁忌条件として採用する。
 */
function flattenContraindicationListItems(items: ContraindicationListItem[]): OfficialContraindicatedConditionRow[] {
  const rows: OfficialContraindicatedConditionRow[] = [];
  for (const item of items) {
    if (item.children.length > 0) {
      // 子項目がすべて「理由（括弧で始まるテキスト）」であるかチェックする
      const areAllChildrenReasons = item.children.every(child => {
        const text = cleanContraindicationItemText(child.ownHtml);
        return /^[［\[〔]/.test(text);
      });

      if (areAllChildrenReasons) {
        // 親のテキストと子のテキストをマージする
        // 例: 親「閉塞隅角緑内障の患者」、子「［眼内圧を高め…］」
        // これらを結合して "閉塞隅角緑内障の患者［眼内圧を高め…］" とする
        const parentText = cleanContraindicationItemText(item.ownHtml);
        for (const child of item.children) {
          const childText = cleanContraindicationItemText(child.ownHtml);
          const combinedText = parentText + childText;
          const row = buildContraindicatedConditionRow(combinedText);
          if (row) rows.push(row);
        }
      } else {
        // 通常のネスト（親が見出し、子が具体的な条件）なので、子項目だけをフラットに展開する
        rows.push(...flattenContraindicationListItems(item.children));
      }
      continue;
    }
    const row = buildContraindicatedConditionRow(cleanContraindicationItemText(item.ownHtml));
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * PMDA添付文書詳細HTMLの「2. 禁忌（次の患者には投与しないこと）」章を抽出する。
 * 薬剤名だけの禁忌（併用禁忌テーブルと重複する）と、本剤自体への過敏症既往（アレルギー確認と重複する）は
 * 患者状態アラートとして冗長なため除外し、疾患・妊娠・肝腎機能など患者の状態に紐づく禁忌だけを返す。
 * 章が存在しない場合は空配列を返す（推測で埋めない）。
 */
export function extractOfficialContraindicatedConditionRowsFromLabelHtml(html: string): OfficialContraindicatedConditionRow[] {
  const sectionStart = html.indexOf(`id="${CONTRAINDICATIONS_SECTION_ID}"`);
  if (sectionStart === -1) return [];

  // 次の章（data-level="1"の次の出現）より先を読まない。禁忌が1件だけの添付文書では
  // <ol><li>を使わず<p>直書きになることがあり、境界を区切らないと後続の別章まで読んでしまう。
  // 自分自身の開始タグにもdata-level="1"が含まれるため、そのタグを抜けた位置から探す
  const ownOpenTagEnd = html.indexOf('>', sectionStart);
  const nextTopLevelSectionIndex = html.indexOf('data-level="1"', ownOpenTagEnd + 1);
  const sectionHtml = html.slice(sectionStart, nextTopLevelSectionIndex === -1 ? undefined : nextTopLevelSectionIndex);

  // 「<ol>」（通常）または「<ul class="SimpleList">」（効能・領域ごとに項目をグルーピングする書式）の
  // どちらか先に出現する方を、この章のトップレベルのリストとして扱う
  const olIndex = sectionHtml.indexOf('<ol>');
  const ulIndex = sectionHtml.indexOf('<ul class="SimpleList">');
  const useUl = ulIndex !== -1 && (olIndex === -1 || ulIndex < olIndex);
  const listTag = useUl ? 'ul' : 'ol';
  const listStart = useUl ? ulIndex : olIndex;

  if (listStart !== -1) {
    const listOpenEnd = sectionHtml.indexOf('>', listStart) + 1;
    const listEnd = sectionHtml.lastIndexOf(`</${listTag}>`);
    const listHtml = sectionHtml.slice(listOpenEnd, listEnd === -1 ? undefined : listEnd);
    const items = parseContraindicationListItems(listHtml);
    return flattenContraindicationListItems(items);
  }

  // <ol>/<ul>が無い場合は、禁忌が1件だけで<p>直書きになっているケース（例: 過敏症既往のみ）
  const rows: OfficialContraindicatedConditionRow[] = [];
  const variousFormMatch = sectionHtml.match(/<div\b[^>]*class="VariousForm"[^>]*>([\s\S]*?)<\/div>/);
  if (variousFormMatch) {
    const row = buildContraindicatedConditionRow(cleanContraindicationItemText(variousFormMatch[1]));
    if (row) rows.push(row);
  }

  return rows;
}

/**
 * findSuspiciousInteractionRowsと同じ考え方で、禁忌章の抽出結果を書き込み前に自己点検する。
 * ここで何か引っかかった場合はdrug_infos.jsonへ書き込まず要確認扱いにする。
 */
export function findSuspiciousContraindicatedConditionRows(rows: OfficialContraindicatedConditionRow[]): string[] {
  const flags: string[] = [];
  for (const row of rows) {
    if (/^[*,、・:：\s]/.test(row.conditionText)) {
      flags.push(`禁忌条件の先頭に不審な記号が残っています: ${JSON.stringify(row.conditionText)}`);
    }
    if (/[〔〕【】<>［\[\]］]/.test(row.conditionText)) {
      flags.push(`禁忌条件に未処理のマークアップ・括弧が残っています: ${JSON.stringify(row.conditionText)}`);
    }
    // 実データでは「アンジオテンシン変換酵素阻害薬（薬剤名を12件列挙）を投与中の患者」のように
    // 正当な理由で160文字を超える条件文が存在するため、閾値は構造崩れ（数百文字級）を狙う
    if (row.conditionText.length > 260) {
      flags.push(`禁忌条件が異常に長く、構造区切りの見落としの疑いがあります: ${JSON.stringify(row.conditionText.slice(0, 40))}...`);
    }
  }
  return flags;
}

export type FetchPmdaGeneralListErrorCode =
  | 'pmda_general_list_url_not_allowed'
  | 'pmda_general_list_http_error'
  | 'pmda_general_list_fetch_failed'
  | 'pmda_general_list_no_fname_found';

export class FetchPmdaGeneralListError extends Error {
  constructor(
    public readonly code: FetchPmdaGeneralListErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'FetchPmdaGeneralListError';
  }
}

const PMDA_GENERAL_LIST_URL_PATTERN = /^https:\/\/www\.pmda\.go\.jp\/PmdaSearch\/iyakuDetail\/GeneralList\/[A-Za-z0-9]+$/;

/** GeneralListページのHTMLから、添付文書詳細HTMLへのfname候補を出現順にすべて返す */
export function extractPmdaDetailFnamesFromGeneralListHtml(html: string): string[] {
  const fnames: string[] = [];
  const pattern = /detailDisp\("PmdaSearch",\s*"([^"]+)"\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    fnames.push(match[1]);
  }
  return fnames;
}

/**
 * documentUrl（drugs.jsonのGeneralListページURL）から添付文書詳細HTMLを1件取得する。
 * 同一YJコードに複数メーカーの添付文書がぶら下がる場合は先頭（一覧の最初）を代表として使う。
 */
export async function fetchPmdaDrugLabelHtmlByGeneralListUrl(
  generalListUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ fname: string; url: string; html: string; fetchedAt: string }> {
  if (!PMDA_GENERAL_LIST_URL_PATTERN.test(generalListUrl)) {
    throw new FetchPmdaGeneralListError(
      'pmda_general_list_url_not_allowed',
      `PMDA GeneralListページ以外のURLは許可していません: ${generalListUrl}`
    );
  }

  let listResponse: Response;
  try {
    listResponse = await fetchImpl(generalListUrl);
  } catch (error) {
    console.error('Original fetch error:', error);
    if (error instanceof Error && (error as any).cause) {
      console.error('Original fetch error cause:', (error as any).cause);
    }
    throw new FetchPmdaGeneralListError(
      'pmda_general_list_fetch_failed',
      `GeneralListページの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!listResponse.ok) {
    throw new FetchPmdaGeneralListError('pmda_general_list_http_error', `GeneralListページの取得でHTTPエラー: ${listResponse.status}`);
  }
  const listHtml = await listResponse.text();
  const fnames = extractPmdaDetailFnamesFromGeneralListHtml(listHtml);
  const fname = fnames[0];
  if (!fname) {
    throw new FetchPmdaGeneralListError('pmda_general_list_no_fname_found', `GeneralListページに添付文書候補が見つかりません: ${generalListUrl}`);
  }

  const detail = await fetchPmdaDrugLabelHtml(fname, fetchImpl);
  return { fname, ...detail };
}

export type FetchPmdaDrugLabelHtmlErrorCode =
  | 'pmda_label_url_not_allowed'
  | 'pmda_label_fetch_unavailable'
  | 'pmda_label_http_error'
  | 'pmda_label_fetch_failed';

export class FetchPmdaDrugLabelHtmlError extends Error {
  constructor(
    public readonly code: FetchPmdaDrugLabelHtmlErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'FetchPmdaDrugLabelHtmlError';
  }
}

const PMDA_DETAIL_HTML_BASE = 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/';

export function buildPmdaDrugLabelHtmlUrl(fname: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(fname)) {
    throw new FetchPmdaDrugLabelHtmlError('pmda_label_url_not_allowed', `不正な添付文書ファイル識別子です: ${fname}`);
  }
  return `${PMDA_DETAIL_HTML_BASE}${fname}`;
}

export async function fetchPmdaDrugLabelHtml(
  fname: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ url: string; html: string; fetchedAt: string }> {
  const url = buildPmdaDrugLabelHtmlUrl(fname);
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new FetchPmdaDrugLabelHtmlError(
      'pmda_label_fetch_failed',
      `添付文書HTMLの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) {
    throw new FetchPmdaDrugLabelHtmlError('pmda_label_http_error', `添付文書HTMLの取得でHTTPエラー: ${response.status}`);
  }
  const html = await response.text();
  return { url, html, fetchedAt: new Date().toISOString() };
}
