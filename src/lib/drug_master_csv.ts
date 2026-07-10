export type DrugMasterCsvLayoutSource = 'header' | 'ssk-standard';
export type DrugMasterCsvIssueSeverity = 'error' | 'warning';

export interface DrugMasterCsvColumnLayout {
  source: DrugMasterCsvLayoutSource;
  changeType: number;
  masterType?: number;
  code: number;
  name: number;
  price: number;
  yjCode?: number;
  abolishDate?: number;
  headerRowNumber?: number;
}

export interface DrugMasterCsvRow {
  rowNumber: number;
  changeType: string;
  code: string;
  name: string;
  price: number;
  yjCode: string;
  abolishDate: string;
  isAbolished: boolean;
}

export interface DrugMasterCsvIssue {
  severity: DrugMasterCsvIssueSeverity;
  code: string;
  message: string;
  rowNumber?: number;
}

export interface DrugMasterCsvParseResult {
  rows: DrugMasterCsvRow[];
  issues: DrugMasterCsvIssue[];
  layout: DrugMasterCsvColumnLayout;
  maxColumnCount: number;
  skippedRowCount: number;
}

export interface DrugMasterSpecificationColumn {
  itemNumber: number;
  index: number;
  label: string;
  mode: '数字' | '英数' | '英数カナ' | '漢字';
  digits: number;
  bytes: number;
  note?: string;
}

export interface DrugMasterSpecificationSource {
  label: string;
  url: string;
  sourcePageUrl: string;
  fileName: string;
  publishedAt: string;
  expectedItemCount: number;
  revisionKey: string;
}

export interface DrugMasterSpecificationRevisionReview {
  ok: boolean;
  source: DrugMasterSpecificationSource;
  expectedItemCount: number;
  actualItemCount: number;
  firstItemLabel?: string;
  lastItemLabel?: string;
  issues: string[];
}

export interface DrugMasterColumnDefinitionReview {
  ok: boolean;
  source: DrugMasterCsvLayoutSource;
  specificationLabel: string;
  specificationColumnCount: number;
  observedColumnCount?: number;
  matchedColumns: string[];
  missingRequiredColumns: string[];
  missingOptionalColumns: string[];
  matchedSpecificationColumns: string[];
  missingSpecificationColumns: string[];
}

const SSK_STANDARD_LAYOUT: DrugMasterCsvColumnLayout = {
  source: 'ssk-standard',
  changeType: 0,
  masterType: 1,
  code: 2,
  name: 4,
  price: 11,
  yjCode: 31,
  abolishDate: 33
};

export const DRUG_MASTER_SPECIFICATION_SOURCE: DrugMasterSpecificationSource = {
  label: '支払基金 令和8年基本マスターファイルレイアウト 医薬品マスター',
  url: 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.files/master_3_20260601.pdf',
  sourcePageUrl: 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.html',
  fileName: 'master_3_20260601.pdf',
  publishedAt: '2026-06-01',
  expectedItemCount: 42,
  revisionKey: 'master_3_20260601:drug-master:42'
};

export const DRUG_MASTER_SPECIFICATION_COLUMNS: DrugMasterSpecificationColumn[] = [
  { itemNumber: 1, index: 0, label: '変更区分', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 2, index: 1, label: 'マスター種別', mode: '英数', digits: 1, bytes: 1, note: 'Y固定' },
  { itemNumber: 3, index: 2, label: '医薬品コード', mode: '数字', digits: 9, bytes: 9 },
  { itemNumber: 4, index: 3, label: '漢字有効桁数', mode: '数字', digits: 2, bytes: 2 },
  { itemNumber: 5, index: 4, label: '漢字名称', mode: '漢字', digits: 32, bytes: 64 },
  { itemNumber: 6, index: 5, label: 'カナ有効桁数', mode: '数字', digits: 2, bytes: 2 },
  { itemNumber: 7, index: 6, label: 'カナ名称', mode: '英数カナ', digits: 20, bytes: 20 },
  { itemNumber: 8, index: 7, label: '単位コード', mode: '数字', digits: 3, bytes: 3 },
  { itemNumber: 9, index: 8, label: '単位漢字有効桁数', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 10, index: 9, label: '単位漢字名称', mode: '漢字', digits: 6, bytes: 12 },
  { itemNumber: 11, index: 10, label: '金額種別', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 12, index: 11, label: '新又は現金額', mode: '数字', digits: 13, bytes: 13, note: '整数部10桁、小数点1桁、小数部2桁' },
  { itemNumber: 13, index: 12, label: '予備', mode: '数字', digits: 2, bytes: 2, note: '未使用' },
  { itemNumber: 14, index: 13, label: '麻薬・毒薬・覚醒剤原料・向精神薬', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 15, index: 14, label: '神経破壊剤', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 16, index: 15, label: '生物学的製剤', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 17, index: 16, label: '後発品', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 18, index: 17, label: '予備', mode: '数字', digits: 1, bytes: 1, note: '未使用' },
  { itemNumber: 19, index: 18, label: '歯科特定薬剤', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 20, index: 19, label: '造影（補助）剤', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 21, index: 20, label: '注射容量', mode: '数字', digits: 5, bytes: 5 },
  { itemNumber: 22, index: 21, label: '収載方式等識別', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 23, index: 22, label: '商品名等関連', mode: '数字', digits: 9, bytes: 9 },
  { itemNumber: 24, index: 23, label: '予備', mode: '数字', digits: 1, bytes: 1, note: '未使用' },
  { itemNumber: 25, index: 24, label: '予備', mode: '数字', digits: 13, bytes: 13, note: '未使用' },
  { itemNumber: 26, index: 25, label: '漢字名称変更区分', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 27, index: 26, label: 'カナ名称変更区分', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 28, index: 27, label: '剤形', mode: '数字', digits: 1, bytes: 1 },
  { itemNumber: 29, index: 28, label: '予備', mode: '英数', digits: 49, bytes: 49, note: '未使用' },
  { itemNumber: 30, index: 29, label: '変更年月日', mode: '数字', digits: 8, bytes: 8 },
  { itemNumber: 31, index: 30, label: '廃止年月日', mode: '数字', digits: 8, bytes: 8 },
  { itemNumber: 32, index: 31, label: '薬価基準収載医薬品コード', mode: '英数', digits: 12, bytes: 12 },
  { itemNumber: 33, index: 32, label: '公表順序番号', mode: '数字', digits: 9, bytes: 9 },
  { itemNumber: 34, index: 33, label: '経過措置年月日又は商品名医薬品コード使用期限', mode: '数字', digits: 8, bytes: 8 },
  { itemNumber: 35, index: 34, label: '基本漢字名称', mode: '漢字', digits: 100, bytes: 200 },
  { itemNumber: 36, index: 35, label: '薬価基準収載年月日', mode: '数字', digits: 8, bytes: 8 },
  { itemNumber: 37, index: 36, label: '一般名コード', mode: '英数', digits: 12, bytes: 12 },
  { itemNumber: 38, index: 37, label: '一般名処方の標準的な記載', mode: '漢字', digits: 100, bytes: 200 },
  { itemNumber: 39, index: 38, label: '一般名処方加算対象区分', mode: '英数', digits: 1, bytes: 1 },
  { itemNumber: 40, index: 39, label: '抗HIV薬区分', mode: '英数', digits: 1, bytes: 1 },
  { itemNumber: 41, index: 40, label: '長期収載品関連', mode: '数字', digits: 9, bytes: 9 },
  { itemNumber: 42, index: 41, label: '選定療養区分', mode: '数字', digits: 1, bytes: 1 }
];

const HEADER_ALIASES = {
  changeType: ['変更区分', '変更種別', '区分'],
  code: ['医薬品コード', 'レセプト電算処理システムコード', 'レセ電コード', '薬品コード'],
  name: ['医薬品名', '医薬品名漢字', '品名', '名称'],
  price: ['薬価', '単位薬価', '薬価基準'],
  yjCode: ['YJコード', 'ＹＪコード'],
  abolishDate: ['廃止年月日', '廃止日', '経過措置年月日', '経過措置期限']
} as const;

type HeaderField = keyof typeof HEADER_ALIASES;

const REQUIRED_COLUMN_LABELS: Record<'changeType' | 'code' | 'name' | 'price', string> = {
  changeType: '変更区分',
  code: '医薬品コード',
  name: '医薬品名',
  price: '薬価'
};

const OPTIONAL_COLUMN_LABELS: Record<'yjCode' | 'abolishDate', string> = {
  yjCode: '薬価基準収載医薬品コード',
  abolishDate: '経過措置年月日又は商品名医薬品コード使用期限'
};

const SSK_STANDARD_SPEC_COLUMNS = {
  changeType: { label: '変更区分', index: 0 },
  masterType: { label: 'マスター種別', index: 1 },
  code: { label: '医薬品コード', index: 2 },
  name: { label: '漢字名称', index: 4 },
  price: { label: '新又は現金額', index: 11 },
  yjCode: { label: '薬価基準収載医薬品コード', index: 31 },
  abolishDate: { label: '経過措置年月日又は商品名医薬品コード使用期限', index: 33 }
} as const;

export function parseDrugMasterCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (char === ',' && !inQuote) {
      cols.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cols.push(current.trim());

  return cols;
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\s_＿・･()（）［\]\[\-‐‑‒–—―]/g, '')
    .toLowerCase();
}

function findHeaderIndex(cols: string[], field: HeaderField): number | undefined {
  const aliases = HEADER_ALIASES[field].map(normalizeHeader);
  for (let i = 0; i < cols.length; i++) {
    const normalized = normalizeHeader(cols[i]);
    if (aliases.includes(normalized)) return i;
  }
  return undefined;
}

function buildHeaderLayout(cols: string[]): DrugMasterCsvColumnLayout | null {
  const layout = {
    source: 'header' as const,
    changeType: findHeaderIndex(cols, 'changeType'),
    code: findHeaderIndex(cols, 'code'),
    name: findHeaderIndex(cols, 'name'),
    price: findHeaderIndex(cols, 'price'),
    yjCode: findHeaderIndex(cols, 'yjCode'),
    abolishDate: findHeaderIndex(cols, 'abolishDate'),
    headerRowNumber: 1
  };

  const matchedCount = [
    layout.changeType,
    layout.code,
    layout.name,
    layout.price,
    layout.yjCode,
    layout.abolishDate
  ].filter((index) => index !== undefined).length;
  if (matchedCount < 2) return null;

  return {
    source: 'header',
    changeType: layout.changeType ?? -1,
    code: layout.code ?? -1,
    name: layout.name ?? -1,
    price: layout.price ?? -1,
    yjCode: layout.yjCode,
    abolishDate: layout.abolishDate,
    headerRowNumber: 1
  };
}

function requiredHeaderErrors(layout: DrugMasterCsvColumnLayout): DrugMasterCsvIssue[] {
  if (layout.source !== 'header') return [];

  const missing: string[] = [];
  if (layout.changeType < 0) missing.push('変更区分');
  if (layout.code < 0) missing.push('医薬品コード');
  if (layout.name < 0) missing.push('医薬品名');
  if (layout.price < 0) missing.push('薬価');

  return missing.map((label) => ({
    severity: 'error' as const,
    code: 'drug_master_csv_required_column_missing',
    message: `医薬品マスターCSVの必須列「${label}」を確認できません。列名または支払基金標準レイアウトを確認してください。`,
    rowNumber: layout.headerRowNumber
  }));
}

function normalizeDateDigits(value: string): string {
  return value.normalize('NFKC').replace(/[^\d]/g, '');
}

function dateToDigits(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function parsePrice(value: string): number {
  const text = value.normalize('NFKC').replace(/[,\s円]/g, '');
  const price = Number.parseFloat(text);
  return Number.isFinite(price) ? price : 0;
}

function isAbolishedRow(changeType: string, abolishDate: string, todayDigits: string): boolean {
  const normalizedChangeType = changeType.normalize('NFKC').trim();
  if (normalizedChangeType === '9' || /廃止|削除/.test(normalizedChangeType)) return true;

  const digits = normalizeDateDigits(abolishDate);
  return digits.length === 8
    && digits !== '00000000'
    && digits !== '99999999'
    && digits <= todayDigits;
}

function getOptionalColumn(cols: string[], index: number | undefined): string {
  return index === undefined || index < 0 ? '' : String(cols[index] ?? '').trim();
}

function getStandardMasterType(cols: string[], layout: DrugMasterCsvColumnLayout): string {
  if (layout.source !== 'ssk-standard') return 'Y';
  return getOptionalColumn(cols, layout.masterType).normalize('NFKC').toUpperCase();
}

export function formatDrugMasterCsvLayoutLabel(layout: DrugMasterCsvColumnLayout): string {
  return layout.source === 'header' ? 'ヘッダー列名' : '支払基金標準列';
}

export function buildDrugMasterSpecificationRevisionReview(
  columns: DrugMasterSpecificationColumn[] = DRUG_MASTER_SPECIFICATION_COLUMNS,
  source: DrugMasterSpecificationSource = DRUG_MASTER_SPECIFICATION_SOURCE
): DrugMasterSpecificationRevisionReview {
  const issues: string[] = [];
  const firstItemLabel = columns[0]?.label;
  const lastItemLabel = columns.at(-1)?.label;

  if (columns.length !== source.expectedItemCount) {
    issues.push(`仕様PDFの想定項目数${source.expectedItemCount}件に対し、コード定義は${columns.length}件です。`);
  }
  if (firstItemLabel !== '変更区分') {
    issues.push('先頭項目が「変更区分」ではありません。');
  }
  if (lastItemLabel !== '選定療養区分') {
    issues.push('末尾項目が「選定療養区分」ではありません。');
  }

  columns.forEach((column, arrayIndex) => {
    const expectedItemNumber = arrayIndex + 1;
    if (column.itemNumber !== expectedItemNumber) {
      issues.push(`${column.label}の項番が${expectedItemNumber}ではなく${column.itemNumber}です。`);
    }
    if (column.index !== arrayIndex) {
      issues.push(`${column.label}の列位置が${arrayIndex + 1}列目ではなく${column.index + 1}列目です。`);
    }
    if (!Number.isInteger(column.digits) || column.digits <= 0) {
      issues.push(`${column.label}の桁数が正の整数ではありません。`);
    }
    if (!Number.isInteger(column.bytes) || column.bytes <= 0) {
      issues.push(`${column.label}のバイト数が正の整数ではありません。`);
    }
  });

  return {
    ok: issues.length === 0,
    source,
    expectedItemCount: source.expectedItemCount,
    actualItemCount: columns.length,
    firstItemLabel,
    lastItemLabel,
    issues
  };
}

export function formatDrugMasterSpecificationRevisionReview(
  review: DrugMasterSpecificationRevisionReview
): string {
  const first = review.firstItemLabel || '未確認';
  const last = review.lastItemLabel || '未確認';
  const issues = review.issues.length > 0
    ? ` / 確認事項 ${review.issues.slice(0, 4).join('・')}${review.issues.length > 4 ? `ほか${review.issues.length - 4}件` : ''}`
    : '';

  return `${review.source.label}: ${review.ok ? 'OK' : '要確認'} / 仕様PDF ${review.source.fileName} / 項目 ${review.actualItemCount}/${review.expectedItemCount} / 先頭 ${first} / 末尾 ${last}${issues}`;
}

export function buildDrugMasterColumnDefinitionReview(
  layout: DrugMasterCsvColumnLayout,
  observedColumnCount?: number
): DrugMasterColumnDefinitionReview {
  const matchedColumns: string[] = [];
  const missingRequiredColumns: string[] = [];
  const missingOptionalColumns: string[] = [];
  const matchedSpecificationColumns: string[] = [];
  const missingSpecificationColumns: string[] = [];

  if (layout.source === 'ssk-standard') {
    (Object.keys(REQUIRED_COLUMN_LABELS) as Array<keyof typeof REQUIRED_COLUMN_LABELS>).forEach((field) => {
      const expected = SSK_STANDARD_SPEC_COLUMNS[field];
      if (layout[field] === expected.index) {
        matchedColumns.push(`${expected.label}:${expected.index + 1}列目`);
      } else {
        missingRequiredColumns.push(`${expected.label}:${expected.index + 1}列目`);
      }
    });
    (Object.keys(OPTIONAL_COLUMN_LABELS) as Array<keyof typeof OPTIONAL_COLUMN_LABELS>).forEach((field) => {
      const expected = SSK_STANDARD_SPEC_COLUMNS[field];
      if (layout[field] === expected.index) {
        matchedColumns.push(`${expected.label}:${expected.index + 1}列目`);
      } else {
        missingOptionalColumns.push(`${expected.label}:${expected.index + 1}列目`);
      }
    });
    DRUG_MASTER_SPECIFICATION_COLUMNS.forEach((column) => {
      const label = `${column.itemNumber}.${column.label}:${column.index + 1}列目/${column.mode}/${column.digits}桁`;
      if (observedColumnCount === undefined || observedColumnCount > column.index) {
        matchedSpecificationColumns.push(label);
      } else {
        missingSpecificationColumns.push(label);
      }
    });
  } else {
    (Object.keys(REQUIRED_COLUMN_LABELS) as Array<keyof typeof REQUIRED_COLUMN_LABELS>).forEach((field) => {
      if (layout[field] >= 0) {
        matchedColumns.push(`${REQUIRED_COLUMN_LABELS[field]}:${layout[field] + 1}列目`);
      } else {
        missingRequiredColumns.push(REQUIRED_COLUMN_LABELS[field]);
      }
    });
    (Object.keys(OPTIONAL_COLUMN_LABELS) as Array<keyof typeof OPTIONAL_COLUMN_LABELS>).forEach((field) => {
      const index = layout[field];
      if (index !== undefined && index >= 0) {
        matchedColumns.push(`${OPTIONAL_COLUMN_LABELS[field]}:${index + 1}列目`);
      } else {
        missingOptionalColumns.push(OPTIONAL_COLUMN_LABELS[field]);
      }
    });
  }

  return {
    ok: missingRequiredColumns.length === 0 && missingSpecificationColumns.length === 0,
    source: layout.source,
    specificationLabel: layout.source === 'ssk-standard'
      ? DRUG_MASTER_SPECIFICATION_SOURCE.label
      : 'ヘッダー列名照合',
    specificationColumnCount: DRUG_MASTER_SPECIFICATION_COLUMNS.length,
    observedColumnCount,
    matchedColumns,
    missingRequiredColumns,
    missingOptionalColumns,
    matchedSpecificationColumns,
    missingSpecificationColumns
  };
}

export function formatDrugMasterColumnDefinitionReview(
  review: DrugMasterColumnDefinitionReview
): string {
  const matched = review.matchedColumns.length > 0 ? review.matchedColumns.join('・') : 'なし';
  const missingRequired = review.missingRequiredColumns.length > 0
    ? ` / 必須未確認 ${review.missingRequiredColumns.join('・')}`
    : '';
  const missingOptional = review.missingOptionalColumns.length > 0
    ? ` / 任意未確認 ${review.missingOptionalColumns.join('・')}`
    : '';
  const specificationCoverage = review.source === 'ssk-standard'
    ? ` / 仕様項目 ${review.matchedSpecificationColumns.length}/${review.specificationColumnCount}`
    : '';
  const missingSpecification = review.missingSpecificationColumns.length > 0
    ? ` / 仕様未確認 ${review.missingSpecificationColumns.slice(0, 6).join('・')}${review.missingSpecificationColumns.length > 6 ? `ほか${review.missingSpecificationColumns.length - 6}項目` : ''}`
    : '';
  return `${review.specificationLabel}: ${review.ok ? 'OK' : '要確認'} / 確認列 ${matched}${specificationCoverage}${missingRequired}${missingOptional}${missingSpecification}`;
}

export function parseDrugMasterUpdateCsv(csvText: string, options: { today?: Date } = {}): DrugMasterCsvParseResult {
  const issues: DrugMasterCsvIssue[] = [];
  const rows: DrugMasterCsvRow[] = [];
  const parsedLines: Array<{ cols: string[]; rowNumber: number }> = [];
  const todayDigits = dateToDigits(options.today || new Date());

  const lines = csvText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    parsedLines.push({
      cols: parseDrugMasterCsvLine(lines[i]),
      rowNumber: i + 1
    });
  }

  if (parsedLines.length === 0) {
    return {
      rows,
      issues: [{
        severity: 'error',
        code: 'drug_master_csv_empty',
        message: '医薬品マスターCSVに取り込める行がありません。'
      }],
      layout: SSK_STANDARD_LAYOUT,
      maxColumnCount: 0,
      skippedRowCount: 0
    };
  }

  const maxColumnCount = Math.max(...parsedLines.map((line) => line.cols.length));
  const headerLayout = buildHeaderLayout(parsedLines[0].cols);
  const layout = headerLayout || SSK_STANDARD_LAYOUT;
  const headerErrors = requiredHeaderErrors(layout);
  if (headerErrors.length > 0) {
    return {
      rows,
      issues: headerErrors,
      layout,
      maxColumnCount,
      skippedRowCount: parsedLines.length - 1
    };
  }

  let skippedRowCount = 0;
  const firstDataIndex = layout.source === 'header' ? 1 : 0;
  const requiredIndexes = [layout.changeType, layout.code, layout.name, layout.price];
  const maxRequiredIndex = Math.max(...requiredIndexes);

  for (let i = firstDataIndex; i < parsedLines.length; i++) {
    const { cols, rowNumber } = parsedLines[i];
    if (cols.length <= maxRequiredIndex) {
      skippedRowCount++;
      issues.push({
        severity: 'warning',
        code: 'drug_master_csv_short_row',
        message: `医薬品マスターCSVの${rowNumber}行目は必須列数に足りないためスキップしました。`,
        rowNumber
      });
      continue;
    }

    const changeType = String(cols[layout.changeType] ?? '').trim();
    const code = String(cols[layout.code] ?? '').trim();
    const name = String(cols[layout.name] ?? '').trim();
    const priceText = String(cols[layout.price] ?? '').trim();
    const yjCode = getOptionalColumn(cols, layout.yjCode);
    const abolishDate = getOptionalColumn(cols, layout.abolishDate);
    const masterType = getStandardMasterType(cols, layout);

    if (layout.source === 'ssk-standard' && masterType !== 'Y') {
      skippedRowCount++;
      issues.push({
        severity: 'error',
        code: 'drug_master_csv_master_type_mismatch',
        message: `医薬品マスターCSVの${rowNumber}行目はマスター種別がYではありません。支払基金の医薬品マスターCSVを選択してください。`,
        rowNumber
      });
      continue;
    }

    if (!code || !name) {
      skippedRowCount++;
      issues.push({
        severity: 'warning',
        code: 'drug_master_csv_row_missing_key',
        message: `医薬品マスターCSVの${rowNumber}行目は医薬品コードまたは医薬品名が空のためスキップしました。`,
        rowNumber
      });
      continue;
    }

    rows.push({
      rowNumber,
      changeType,
      code,
      name,
      price: parsePrice(priceText),
      yjCode,
      abolishDate,
      isAbolished: isAbolishedRow(changeType, abolishDate, todayDigits)
    });
  }

  if (rows.length === 0) {
    issues.push({
      severity: 'error',
      code: 'drug_master_csv_no_valid_rows',
      message: '医薬品マスターCSVに取り込める有効な薬品行がありません。'
    });
  }

  return {
    rows,
    issues,
    layout,
    maxColumnCount,
    skippedRowCount
  };
}
