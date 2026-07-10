import encoding from 'encoding-japanese';
import type { UkeRecord } from './uke_generator';

export type DispensingUkeValidationSeverity = 'error' | 'warning';
export type DispensingUkeValidationContext = 'generated' | 'official_sample' | 'official_submission';

export interface DispensingUkeValidationIssue {
  severity: DispensingUkeValidationSeverity;
  code: string;
  title: string;
  message: string;
  recordIndex?: number;
  recordType?: string;
}

export interface ValidateDispensingUkeRecordsOptions {
  context?: DispensingUkeValidationContext;
  recordSpecs?: DispensingUkeRecordSpec[];
  officialSubmission?: boolean;
}

interface RecordRule {
  minFields: number;
  label: string;
}

export interface DispensingUkeRecordFieldSpec {
  index: number;
  label: string;
  required: boolean;
  format: 'text' | 'digits' | 'number' | 'month' | 'date' | 'timestamp' | 'percent' | 'flag';
  lengths?: number[];
}

export interface DispensingUkeRecordSpec {
  type: string;
  label: string;
  minFields: number;
  required: boolean;
  singleton: boolean;
  orderStage: number;
  implementationScope: 'always' | 'conditional' | 'official_sample_validation';
  keyFields: DispensingUkeRecordFieldSpec[];
  allFields?: DispensingUkeRecordFieldSpec[];
}

export interface DispensingUkeRecordSpecSource {
  label: string;
  url: string;
  sampleDataUrl: string;
  codeInfoSpecUrl?: string;
  revision?: string;
  fileName?: string;
}

export interface DispensingUkeOfficialSubmissionGateIssue {
  code: string;
  message: string;
  recordTypes: string[];
}

export interface DispensingUkeOfficialSubmissionGate {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  standardRecordTypes: string[];
  observedRecordTypes: string[];
  missingRequiredRecordTypes: string[];
  nonStandardRecordTypes: string[];
  firstRecordType?: string;
  lastRecordType?: string;
  issues: DispensingUkeOfficialSubmissionGateIssue[];
  statusLabel: string;
  requiredActions: string[];
}

export interface DispensingUkeSpecCoverageReport {
  knownRecordTypes: string[];
  generatedRecordTypes: string[];
  requiredRecordTypes: string[];
  missingKnownRecordTypes: string[];
  missingRequiredRecordTypes: string[];
  unknownRecordTypes: string[];
}

export interface DispensingUkeRecordSpecReview {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  expectedRecordTypes: string[];
  implementedRecordTypes: string[];
  missingRuleRecordTypes: string[];
  extraRuleRecordTypes: string[];
  missingRequiredRecordTypes: string[];
  extraRequiredRecordTypes: string[];
  missingSingletonRecordTypes: string[];
  extraSingletonRecordTypes: string[];
  missingOrderRecordTypes: string[];
  mismatchedOrderRecordTypes: Array<{ type: string; expected: number; actual: number }>;
  mismatchedMinFieldRecordTypes: Array<{ type: string; expected: number; actual: number }>;
  keyFieldIssues: string[];
  generatedRecordTypes: string[];
  missingGeneratedRecordTypes: string[];
  unknownGeneratedRecordTypes: string[];
  issues: string[];
}

export type DispensingUkeAllFieldValidationItemStatus =
  | 'ok'
  | 'missing'
  | 'format_invalid';

export interface DispensingUkeAllFieldValidationItem {
  recordIndex: number;
  recordType: string;
  itemNumber: number;
  label: string;
  required: boolean;
  format: DispensingUkeRecordFieldSpec['format'];
  valuePresent: boolean;
  status: DispensingUkeAllFieldValidationItemStatus;
  statusLabel: string;
  issueCodes: string[];
  issueMessages: string[];
}

export interface DispensingUkeAllFieldValidationReport {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  definedAllFieldCount: number;
  definedAllFieldRecordTypes: string[];
  checkedFieldCount: number;
  okFieldCount: number;
  issueFieldCount: number;
  missingFieldCount: number;
  formatIssueFieldCount: number;
  recordTypes: string[];
  recordTypesWithIssues: string[];
  issues: DispensingUkeValidationIssue[];
  items: DispensingUkeAllFieldValidationItem[];
}

export interface DispensingUkeOfficialAllFieldDefinitionGateIssue {
  code: string;
  recordType: string;
  message: string;
}

export interface DispensingUkeOfficialAllFieldDefinitionGateItem {
  recordType: string;
  label: string;
  expectedFieldCount: number;
  definedFieldCount: number;
  missingItemNumbers: number[];
  duplicateItemNumbers: number[];
  outOfRangeItemNumbers: number[];
  statusLabel: string;
}

export interface DispensingUkeOfficialAllFieldDefinitionGate {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  expectedRecordTypes: string[];
  implementedRecordTypes: string[];
  completedRecordTypeCount: number;
  missingRecordTypes: string[];
  recordTypesWithoutAllFields: string[];
  expectedFieldCount: number;
  definedFieldCount: number;
  issueCount: number;
  issues: DispensingUkeOfficialAllFieldDefinitionGateIssue[];
  items: DispensingUkeOfficialAllFieldDefinitionGateItem[];
  statusLabel: string;
  nextActions: string[];
}

export const DISPENSING_UKE_RECORD_SPEC_SOURCE: DispensingUkeRecordSpecSource = {
  label: '支払基金 令和8年6月版 レセプト電算処理システム記録条件仕様 調剤',
  url: 'https://www.ssk.or.jp/seikyushiharai/iryokikan/download/index.files/iryokikan_in_07.pdf',
  sampleDataUrl: 'https://www.ssk.or.jp/seikyushiharai/rezept/hokenja/download/index.files/phasample.zip',
  codeInfoSpecUrl: 'https://www.ssk.or.jp/seikyushiharai/rezept/hokenja/download/index.files/rezept12.pdf',
  revision: '2026-05-25',
  fileName: 'iryokikan_in_07.pdf'
};

export const DISPENSING_UKE_OFFICIAL_SUBMISSION_RECORD_TYPES = [
  'YK',
  'RE',
  'HO',
  'KO',
  'SN',
  'JD',
  'MF',
  'SH',
  'CZ',
  'IY',
  'TO',
  'CO',
  'TK',
  'KI',
  'ST',
  'GO'
] as const;

const DISPENSING_UKE_OFFICIAL_REQUIRED_FILE_RECORD_TYPES = ['YK', 'RE', 'GO'] as const;

function countDefinedAllFields(recordSpecs: DispensingUkeRecordSpec[]): number {
  return recordSpecs.reduce((sum, spec) => sum + (spec.allFields?.length ?? 0), 0);
}

function getDefinedAllFieldRecordTypes(recordSpecs: DispensingUkeRecordSpec[]): string[] {
  return sortedUnique(recordSpecs
    .filter((spec) => (spec.allFields?.length ?? 0) > 0)
    .map((spec) => spec.type));
}

const RECORD_RULES: Record<string, RecordRule> = {
  YK: { minFields: 7, label: '薬局情報' },
  RE: { minFields: 9, label: '患者・請求情報' },
  HO: { minFields: 3, label: '保険者情報' },
  KO: { minFields: 3, label: '公費情報' },
  JD: { minFields: 1, label: '調剤年月日' },
  SH: { minFields: 3, label: '処方箋情報' },
  CZ: { minFields: 5, label: '調製料情報' },
  KI: { minFields: 5, label: '加算・管理料情報' },
  TO: { minFields: 5, label: '薬剤料・摘要情報' },
  IY: { minFields: 11, label: '医薬品情報' },
  CO: { minFields: 3, label: 'コメント情報' },
  TK: { minFields: 3, label: '合計情報' },
  ST: { minFields: 2, label: '出力情報' },
  MN: { minFields: 6, label: '公式サンプルMN情報' },
  SN: { minFields: 8, label: '公式サンプルSN情報' },
  JY: { minFields: 8, label: '公式サンプルJY情報' },
  ON: { minFields: 14, label: '公式サンプルON情報' },
  EX: { minFields: 12, label: '公式サンプルEX情報' },
  RC: { minFields: 1, label: '公式サンプルRC情報' },
  MF: { minFields: 32, label: '公式サンプルMF情報' }
};

const OFFICIAL_SAMPLE_MIN_FIELDS: Record<string, number> = {
  YK: 8,
  RE: 41,
  HO: 13,
  KO: 9,
  JD: 32,
  SH: 9,
  CZ: 70,
  KI: 113,
  IY: 9,
  CO: 2,
  TK: 2,
  MN: 6,
  SN: 8,
  JY: 8,
  ON: 14,
  EX: 12,
  RC: 1,
  MF: 32
};

const REQUIRED_RECORD_TYPES = ['YK', 'RE', 'JD', 'SH', 'TK', 'ST'];
const SINGLETON_RECORD_TYPES = ['YK', 'RE', 'JD', 'SH', 'TK', 'ST'];
const FEE_RECORD_TYPES = new Set(['CZ', 'KI', 'TO']);
const RECORD_ORDER_STAGE: Record<string, number> = {
  MN: -1,
  YK: 0,
  RE: 1,
  HO: 2,
  KO: 2,
  SN: 2,
  JD: 3,
  SH: 4,
  CZ: 5,
  KI: 5,
  TO: 5,
  IY: 5,
  CO: 5,
  JY: 5,
  MF: 5,
  ON: 6,
  TK: 6,
  ST: 7,
  EX: 8,
  RC: 9
};

export const DISPENSING_UKE_IMPLEMENTED_RECORD_SPEC: DispensingUkeRecordSpec[] = [
  {
    type: 'YK',
    label: '薬局情報',
    minFields: 7,
    required: true,
    singleton: true,
    orderStage: 0,
    implementationScope: 'always',
    keyFields: [
      { index: 0, label: '保険薬局コード', required: true, format: 'digits', lengths: [7] },
      { index: 1, label: '薬局名', required: true, format: 'text' },
      { index: 4, label: '薬局所在地', required: false, format: 'text' },
      { index: 5, label: '薬局電話番号', required: false, format: 'text' }
    ]
  },
  {
    type: 'RE',
    label: '患者・請求情報',
    minFields: 9,
    required: true,
    singleton: true,
    orderStage: 1,
    implementationScope: 'always',
    keyFields: [
      { index: 1, label: '請求年月', required: true, format: 'month', lengths: [6] },
      { index: 2, label: '受付ID', required: true, format: 'text' },
      { index: 3, label: '患者ID', required: true, format: 'text' },
      { index: 4, label: '患者氏名', required: true, format: 'text' },
      { index: 6, label: '患者性別コード', required: false, format: 'flag' },
      { index: 7, label: '患者生年月日', required: true, format: 'date', lengths: [8] },
      { index: 8, label: '合計点数', required: true, format: 'digits' }
    ]
  },
  {
    type: 'HO',
    label: '保険者情報',
    minFields: 3,
    required: false,
    singleton: false,
    orderStage: 2,
    implementationScope: 'conditional',
    keyFields: [
      { index: 0, label: '保険者番号', required: true, format: 'digits', lengths: [6, 8] },
      { index: 1, label: '記号番号', required: true, format: 'text' },
      { index: 2, label: '負担割合', required: false, format: 'percent' }
    ]
  },
  {
    type: 'KO',
    label: '公費情報',
    minFields: 3,
    required: false,
    singleton: false,
    orderStage: 2,
    implementationScope: 'conditional',
    keyFields: [
      { index: 0, label: '公費負担者番号', required: true, format: 'digits', lengths: [8] },
      { index: 1, label: '公費受給者番号', required: true, format: 'digits', lengths: [7] },
      { index: 2, label: '公費負担割合', required: false, format: 'percent' }
    ]
  },
  {
    type: 'SN',
    label: '公式サンプルSN情報',
    minFields: 8,
    required: false,
    singleton: false,
    orderStage: 2,
    implementationScope: 'conditional',
    keyFields: [
      { index: 0, label: 'SN区分', required: true, format: 'digits' },
      { index: 1, label: 'SN枝番', required: true, format: 'digits' }
    ]
  },
  {
    type: 'JD',
    label: '調剤年月日',
    minFields: 1,
    required: true,
    singleton: true,
    orderStage: 3,
    implementationScope: 'always',
    keyFields: [
      { index: 0, label: '調剤年月日', required: true, format: 'date', lengths: [8] }
    ]
  },
  {
    type: 'MF',
    label: '窓口負担額情報',
    minFields: 32,
    required: false,
    singleton: false,
    orderStage: 5,
    implementationScope: 'conditional',
    keyFields: [
      { index: 0, label: '窓口負担額区分', required: true, format: 'digits' }
    ]
  },
  {
    type: 'SH',
    label: '処方箋情報',
    minFields: 3,
    required: true,
    singleton: true,
    orderStage: 4,
    implementationScope: 'always',
    keyFields: [
      { index: 0, label: '処方箋交付年月日', required: true, format: 'date', lengths: [8] },
      { index: 1, label: '医療機関ID', required: false, format: 'text' },
      { index: 2, label: '医師ID', required: false, format: 'text' }
    ]
  },
  {
    type: 'CZ',
    label: '調製料情報',
    minFields: 5,
    required: false,
    singleton: false,
    orderStage: 5,
    implementationScope: 'conditional',
    keyFields: [
      { index: 0, label: '算定順番号', required: true, format: 'digits' },
      { index: 1, label: '算定キー', required: true, format: 'text' },
      { index: 2, label: '算定名', required: true, format: 'text' },
      { index: 3, label: '点数', required: true, format: 'digits' }
    ]
  },
  {
    type: 'KI',
    label: '加算・管理料情報',
    minFields: 5,
    required: false,
    singleton: false,
    orderStage: 5,
    implementationScope: 'conditional',
    keyFields: [
      { index: 0, label: '算定順番号', required: true, format: 'digits' },
      { index: 1, label: '算定キー', required: true, format: 'text' },
      { index: 2, label: '算定名', required: true, format: 'text' },
      { index: 3, label: '点数', required: true, format: 'digits' }
    ]
  },
  {
    type: 'TO',
    label: '薬剤料・摘要情報',
    minFields: 5,
    required: false,
    singleton: false,
    orderStage: 5,
    implementationScope: 'conditional',
    keyFields: [
      { index: 0, label: '算定順番号', required: false, format: 'digits' },
      { index: 1, label: '摘要キー', required: true, format: 'text' },
      { index: 2, label: '摘要', required: true, format: 'text' },
      { index: 3, label: '点数', required: true, format: 'digits' }
    ]
  },
  {
    type: 'IY',
    label: '医薬品情報',
    minFields: 11,
    required: false,
    singleton: false,
    orderStage: 5,
    implementationScope: 'conditional',
    keyFields: [
      { index: 1, label: 'RP番号', required: true, format: 'digits' },
      { index: 2, label: 'YJコードまたは薬品コード', required: true, format: 'text' },
      { index: 3, label: 'レセ電医薬品コード', required: true, format: 'digits' },
      { index: 4, label: '薬品名', required: true, format: 'text' },
      { index: 5, label: '分量', required: true, format: 'number' },
      { index: 8, label: '薬価', required: false, format: 'number' },
      { index: 9, label: '薬剤料算定フラグ', required: true, format: 'flag' },
      { index: 10, label: '検査薬フラグ', required: true, format: 'flag' }
    ]
  },
  {
    type: 'CO',
    label: 'コメント情報',
    minFields: 3,
    required: false,
    singleton: false,
    orderStage: 5,
    implementationScope: 'conditional',
    keyFields: [
      { index: 0, label: 'コメントコード', required: true, format: 'digits', lengths: [9] },
      { index: 2, label: 'コメント文', required: true, format: 'text' }
    ]
  },
  {
    type: 'TK',
    label: '合計情報',
    minFields: 3,
    required: true,
    singleton: true,
    orderStage: 6,
    implementationScope: 'always',
    keyFields: [
      { index: 0, label: '合計点数', required: true, format: 'digits' },
      { index: 1, label: '算定レコード件数', required: true, format: 'digits' },
      { index: 2, label: '医薬品レコード件数', required: true, format: 'digits' }
    ]
  },
  {
    type: 'ST',
    label: '出力情報',
    minFields: 2,
    required: true,
    singleton: true,
    orderStage: 7,
    implementationScope: 'always',
    keyFields: [
      { index: 0, label: '出力日時', required: true, format: 'timestamp', lengths: [14] },
      { index: 1, label: '出力元', required: true, format: 'text' }
    ]
  }
];

export const DISPENSING_UKE_OFFICIAL_SAMPLE_RECORD_SPEC: DispensingUkeRecordSpec[] = [
  {
    type: 'MN',
    label: '公式サンプルMN情報',
    minFields: 6,
    required: false,
    singleton: false,
    orderStage: -1,
    implementationScope: 'official_sample_validation',
    keyFields: [
      { index: 0, label: '公式サンプル管理番号', required: true, format: 'digits' },
      { index: 2, label: '公式サンプル画像番号', required: true, format: 'digits' }
    ]
  },
  {
    type: 'JY',
    label: '公式サンプルJY情報',
    minFields: 8,
    required: false,
    singleton: false,
    orderStage: 5,
    implementationScope: 'official_sample_validation',
    keyFields: [
      { index: 0, label: 'JY区分', required: true, format: 'digits' },
      { index: 1, label: 'JY種別', required: true, format: 'digits' }
    ]
  },
  {
    type: 'ON',
    label: '公式サンプルON情報',
    minFields: 14,
    required: false,
    singleton: false,
    orderStage: 6,
    implementationScope: 'official_sample_validation',
    keyFields: [
      { index: 0, label: 'ON区分', required: true, format: 'digits' },
      { index: 3, label: 'ON有効日時', required: false, format: 'digits', lengths: [12] }
    ]
  },
  {
    type: 'EX',
    label: '公式サンプルEX情報',
    minFields: 12,
    required: false,
    singleton: false,
    orderStage: 8,
    implementationScope: 'official_sample_validation',
    keyFields: [
      { index: 11, label: 'EXペイロード', required: true, format: 'text' }
    ]
  },
  {
    type: 'RC',
    label: '公式サンプルRC情報',
    minFields: 1,
    required: false,
    singleton: false,
    orderStage: 9,
    implementationScope: 'official_sample_validation',
    keyFields: [
      { index: 0, label: 'RC検証文字列', required: true, format: 'text' }
    ]
  }
];

export const DISPENSING_UKE_KNOWN_RECORD_SPEC: DispensingUkeRecordSpec[] = [
  ...DISPENSING_UKE_IMPLEMENTED_RECORD_SPEC,
  ...DISPENSING_UKE_OFFICIAL_SAMPLE_RECORD_SPEC
];

const DISPENSING_UKE_OFFICIAL_RE_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: 'レセプト番号', required: true, format: 'digits' },
  { index: 1, label: 'レセプト種別', required: true, format: 'digits', lengths: [4] },
  { index: 2, label: '調剤年月', required: true, format: 'month', lengths: [6] },
  { index: 3, label: '氏名', required: true, format: 'text' },
  { index: 4, label: '男女区分', required: true, format: 'digits', lengths: [1] },
  { index: 5, label: '生年月日', required: true, format: 'date', lengths: [8] },
  { index: 6, label: '給付割合', required: false, format: 'percent' },
  { index: 7, label: 'レセプト特記事項', required: false, format: 'text' },
  { index: 8, label: '医療機関都道府県', required: false, format: 'digits', lengths: [2] },
  { index: 9, label: '医療機関点数表', required: false, format: 'digits', lengths: [1] },
  { index: 10, label: '医療機関コード', required: false, format: 'digits', lengths: [7] },
  { index: 11, label: '医療機関名称', required: false, format: 'text' },
  { index: 12, label: '医療機関所在地', required: false, format: 'text' },
  ...Array.from({ length: 20 }, (_, index): DispensingUkeRecordFieldSpec => ({
    index: 13 + index,
    label: `保険医氏名${index + 1}`,
    required: false,
    format: 'text'
  })),
  { index: 33, label: '麻薬免許番号', required: false, format: 'text' },
  { index: 34, label: '調剤録番号等', required: false, format: 'text' },
  { index: 35, label: '予備', required: false, format: 'digits', lengths: [1] },
  {
    index: 36,
    label: '検索番号',
    required: false,
    format: 'digits',
    lengths: Array.from({ length: 14 }, (_, index) => 17 + index)
  },
  { index: 37, label: '予備', required: false, format: 'digits', lengths: [5] },
  { index: 38, label: '請求情報', required: false, format: 'text' },
  { index: 39, label: '一部負担金区分', required: false, format: 'digits', lengths: [1] },
  { index: 40, label: 'カタカナ氏名', required: false, format: 'text' }
];

const DISPENSING_UKE_OFFICIAL_HO_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '保険者番号', required: true, format: 'digits', lengths: [6, 8] },
  { index: 1, label: '被保険者記号', required: false, format: 'text' },
  { index: 2, label: '被保険者番号', required: true, format: 'text' },
  { index: 3, label: '処方箋受付回数', required: true, format: 'digits' },
  { index: 4, label: '合計点数', required: true, format: 'digits' },
  { index: 5, label: '予備', required: false, format: 'digits', lengths: [5] },
  { index: 6, label: '職務上の事由', required: false, format: 'digits', lengths: [1] },
  { index: 7, label: '証明書番号', required: false, format: 'digits', lengths: [3] },
  { index: 8, label: '一部負担金', required: false, format: 'digits' },
  { index: 9, label: '予備', required: false, format: 'digits', lengths: [1] },
  { index: 10, label: '減免区分', required: false, format: 'digits', lengths: [1] },
  { index: 11, label: '減額割合', required: false, format: 'percent' },
  { index: 12, label: '減額金額', required: false, format: 'digits' }
];

const DISPENSING_UKE_OFFICIAL_KO_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '負担者番号', required: true, format: 'digits', lengths: [8] },
  { index: 1, label: '受給者番号', required: true, format: 'digits', lengths: [7] },
  { index: 2, label: '任意給付区分', required: false, format: 'digits', lengths: [1] },
  { index: 3, label: '処方箋受付回数', required: true, format: 'digits' },
  { index: 4, label: '合計点数', required: true, format: 'digits' },
  { index: 5, label: '予備', required: false, format: 'digits', lengths: [5] },
  { index: 6, label: '一部負担金額', required: false, format: 'digits' },
  { index: 7, label: '予備', required: false, format: 'digits', lengths: [6] },
  { index: 8, label: '公費給付対象一部負担金', required: false, format: 'digits' }
];

function buildCodePointAllFields(
  startIndex: number,
  label: string,
  slotCount: number
): DispensingUkeRecordFieldSpec[] {
  return Array.from({ length: slotCount }, (_, slot) => {
    const prefix = `${label}${slot + 1}`;
    const index = startIndex + (slot * 3);
    return [
      { index, label: `${prefix}負担区分`, required: false, format: 'text' as const },
      { index: index + 1, label: `${prefix}コード`, required: false, format: 'digits' as const, lengths: [9] },
      { index: index + 2, label: `${prefix}点数`, required: false, format: 'digits' as const }
    ];
  }).flat();
}

function buildCodeCountPointAllFields(
  startIndex: number,
  label: string,
  slotCount: number
): DispensingUkeRecordFieldSpec[] {
  return Array.from({ length: slotCount }, (_, slot) => {
    const prefix = `${label}${slot + 1}`;
    const index = startIndex + (slot * 4);
    return [
      { index, label: `${prefix}負担区分`, required: false, format: 'text' as const },
      { index: index + 1, label: `${prefix}コード`, required: false, format: 'digits' as const, lengths: [9] },
      { index: index + 2, label: `${prefix}回数`, required: false, format: 'digits' as const },
      { index: index + 3, label: `${prefix}点数`, required: false, format: 'digits' as const }
    ];
  }).flat();
}

const DISPENSING_UKE_OFFICIAL_SH_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '処方No', required: true, format: 'digits', lengths: [2] },
  { index: 1, label: '剤形', required: true, format: 'digits', lengths: [1] },
  { index: 2, label: '用法', required: false, format: 'digits', lengths: [1, 2, 3] },
  { index: 3, label: '特別指示', required: false, format: 'text' },
  { index: 4, label: '単位薬剤料', required: true, format: 'digits' },
  { index: 5, label: '第一公費単位薬剤料', required: false, format: 'digits' },
  { index: 6, label: '第二公費単位薬剤料', required: false, format: 'digits' },
  { index: 7, label: '第三公費単位薬剤料', required: false, format: 'digits' },
  { index: 8, label: '第四公費単位薬剤料', required: false, format: 'digits' }
];

const DISPENSING_UKE_OFFICIAL_CZ_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '医師No', required: false, format: 'digits', lengths: [1, 2] },
  { index: 1, label: '処方箋交付年月日', required: true, format: 'date', lengths: [8] },
  { index: 2, label: '調剤年月日', required: true, format: 'date', lengths: [8] },
  { index: 3, label: '処方箋受付回', required: true, format: 'digits' },
  { index: 4, label: '調剤数量', required: true, format: 'digits' },
  { index: 5, label: '薬剤調製料負担区分', required: true, format: 'text' },
  { index: 6, label: '薬剤調製料算定区分', required: true, format: 'digits', lengths: [1] },
  { index: 7, label: '薬剤調製料算定先No', required: true, format: 'digits', lengths: [2] },
  { index: 8, label: '薬剤調製料コード', required: true, format: 'digits', lengths: [9] },
  { index: 9, label: '薬剤調製料点数', required: true, format: 'digits' },
  { index: 10, label: '分割区分', required: false, format: 'digits' },
  { index: 11, label: '前回までの数量', required: false, format: 'digits' },
  { index: 12, label: '薬剤料点数', required: true, format: 'digits' },
  { index: 13, label: '予備', required: false, format: 'digits' },
  ...buildCodePointAllFields(14, '加算料', 10),
  { index: 44, label: '一包化日数', required: false, format: 'digits' },
  { index: 45, label: '分割調剤種類', required: false, format: 'digits', lengths: [1] },
  { index: 46, label: '前回までの一包化日数', required: false, format: 'digits' },
  { index: 47, label: '医師指示分割調剤コード', required: false, format: 'digits', lengths: [9] },
  { index: 48, label: '医師指示分割区分', required: false, format: 'digits' },
  { index: 49, label: '医師指示分割対象調剤数量', required: false, format: 'digits' },
  { index: 50, label: '医師指示分割対象一包化日数', required: false, format: 'digits' },
  { index: 51, label: '包括管理料等', required: false, format: 'digits' },
  { index: 52, label: '他医療機関受診に係る処方箋受付', required: false, format: 'digits' },
  ...buildCodePointAllFields(53, '外来服薬支援料2', 1),
  { index: 56, label: '調剤管理料負担区分', required: false, format: 'text' },
  { index: 57, label: '調剤管理料算定区分', required: false, format: 'digits', lengths: [1] },
  { index: 58, label: '調剤管理料算定先No', required: false, format: 'digits', lengths: [2] },
  { index: 59, label: '調剤管理料コード', required: false, format: 'digits', lengths: [9] },
  { index: 60, label: '調剤管理料点数', required: false, format: 'digits' },
  ...buildCodePointAllFields(61, '調剤管理料時間外等加算', 1),
  { index: 64, label: '薬剤料減算区分', required: false, format: 'digits' },
  { index: 65, label: '薬剤料減算合計点数', required: false, format: 'digits' },
  { index: 66, label: '薬剤料減算第一公費点数', required: false, format: 'digits' },
  { index: 67, label: '薬剤料減算第二公費点数', required: false, format: 'digits' },
  { index: 68, label: '薬剤料減算第三公費点数', required: false, format: 'digits' },
  { index: 69, label: '薬剤料減算第四公費点数', required: false, format: 'digits' }
];

const DISPENSING_UKE_OFFICIAL_IY_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '医薬品負担区分', required: true, format: 'text' },
  { index: 1, label: '医薬品コード', required: true, format: 'digits', lengths: [9] },
  { index: 2, label: '使用量', required: false, format: 'number' },
  { index: 3, label: '予備', required: false, format: 'text' },
  { index: 4, label: '予備', required: false, format: 'text' },
  { index: 5, label: '混合区分', required: false, format: 'digits', lengths: [1] },
  { index: 6, label: '混合区分枝番', required: false, format: 'digits', lengths: [1] },
  { index: 7, label: '配合不適区分', required: false, format: 'digits', lengths: [1] },
  { index: 8, label: '1回用量', required: false, format: 'number' }
];

const DISPENSING_UKE_OFFICIAL_TO_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '特定器材負担区分', required: true, format: 'text' },
  { index: 1, label: '特定器材コード', required: true, format: 'digits', lengths: [9] },
  { index: 2, label: '使用量', required: true, format: 'number' },
  { index: 3, label: '単位コード', required: false, format: 'digits', lengths: [1, 2, 3] },
  { index: 4, label: '単価', required: false, format: 'number' },
  { index: 5, label: '特定器材名称', required: false, format: 'text' }
];

const DISPENSING_UKE_OFFICIAL_COMMENT_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: 'コメントコード', required: true, format: 'digits', lengths: [9] },
  { index: 1, label: '文字データ', required: false, format: 'text' }
];

const DISPENSING_UKE_OFFICIAL_KI_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '算定日', required: true, format: 'date', lengths: [8] },
  { index: 1, label: '処方箋受付回', required: true, format: 'digits' },
  { index: 2, label: '調剤基本料負担区分', required: false, format: 'text' },
  { index: 3, label: '調剤基本料コード', required: false, format: 'digits', lengths: [9] },
  { index: 4, label: '調剤基本料点数', required: false, format: 'digits' },
  { index: 5, label: '予備', required: false, format: 'digits' },
  ...buildCodeCountPointAllFields(6, '薬学管理料', 12),
  ...buildCodeCountPointAllFields(54, '摘要薬学管理料', 3),
  { index: 66, label: '前回調剤年月日', required: false, format: 'date', lengths: [8] },
  { index: 67, label: '前回調剤数量', required: false, format: 'digits' },
  ...buildCodeCountPointAllFields(68, '調剤基本料加算', 10),
  { index: 108, label: '包括管理料等', required: false, format: 'digits' },
  { index: 109, label: '他医療機関受診', required: false, format: 'digits' },
  { index: 110, label: '医師指示分割調剤基本料コード', required: false, format: 'digits', lengths: [9] },
  { index: 111, label: '医師指示分割薬学管理料コード', required: false, format: 'digits', lengths: [9] },
  { index: 112, label: '医師指示分割摘要薬学管理料コード', required: false, format: 'digits', lengths: [9] }
];

const DISPENSING_UKE_OFFICIAL_SN_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '負担者種別', required: true, format: 'digits', lengths: [1] },
  { index: 1, label: '確認区分', required: true, format: 'digits', lengths: [2] },
  { index: 2, label: '保険者番号等', required: false, format: 'text' },
  { index: 3, label: '被保険者資格に係る記号', required: false, format: 'text' },
  { index: 4, label: '被保険者資格に係る番号', required: false, format: 'text' },
  { index: 5, label: '枝番', required: false, format: 'text' },
  { index: 6, label: '受給者番号', required: false, format: 'digits', lengths: [7] },
  { index: 7, label: '予備', required: false, format: 'digits', lengths: [1] }
];

const DISPENSING_UKE_OFFICIAL_JD_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '負担者種別', required: true, format: 'digits', lengths: [1] },
  ...Array.from({ length: 31 }, (_, index): DispensingUkeRecordFieldSpec => ({
    index: index + 1,
    label: `${index + 1}日の情報`,
    required: false,
    format: 'digits',
    lengths: [1]
  }))
];

const DISPENSING_UKE_OFFICIAL_MF_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '窓口負担額区分', required: true, format: 'digits', lengths: [2] },
  ...Array.from({ length: 31 }, (_, index): DispensingUkeRecordFieldSpec => ({
    index: index + 1,
    label: `予備${index + 1}`,
    required: false,
    format: 'digits',
    lengths: [9]
  }))
];

const DISPENSING_UKE_OFFICIAL_ST_ALL_FIELDS: DispensingUkeRecordFieldSpec[] = [
  { index: 0, label: '医師番号', required: true, format: 'text' },
  { index: 1, label: '処方月日', required: true, format: 'date', lengths: [8] },
  { index: 2, label: '調剤月日', required: true, format: 'date', lengths: [8] },
  { index: 3, label: '処方箋受付回', required: true, format: 'digits' },
  { index: 4, label: '分割指示回数', required: true, format: 'digits' },
  { index: 5, label: '保険分割対象点数', required: false, format: 'digits' },
  { index: 6, label: '保険分割後点数', required: false, format: 'digits' },
  { index: 7, label: '第一公費分割対象点数', required: false, format: 'digits' },
  { index: 8, label: '第一公費分割後点数', required: false, format: 'digits' },
  { index: 9, label: '第二公費分割対象点数', required: false, format: 'digits' },
  { index: 10, label: '第二公費分割後点数', required: false, format: 'digits' },
  { index: 11, label: '第三公費分割対象点数', required: false, format: 'digits' },
  { index: 12, label: '第三公費分割後点数', required: false, format: 'digits' },
  { index: 13, label: '第四公費分割対象点数', required: false, format: 'digits' },
  { index: 14, label: '第四公費分割後点数', required: false, format: 'digits' }
];

const DISPENSING_UKE_OFFICIAL_GO_RECORD_SPEC: DispensingUkeRecordSpec = {
  type: 'GO',
  label: '総括情報',
  minFields: 3,
  required: true,
  singleton: true,
  orderStage: 8,
  implementationScope: 'always',
  keyFields: [],
  allFields: [
    { index: 0, label: '総件数', required: true, format: 'digits' },
    { index: 1, label: '総合計点数', required: true, format: 'digits' },
    { index: 2, label: 'マルチボリューム識別情報', required: true, format: 'digits', lengths: [2] }
  ]
};

export const DISPENSING_UKE_OFFICIAL_RECORD_SPEC: DispensingUkeRecordSpec[] = [
  ...DISPENSING_UKE_IMPLEMENTED_RECORD_SPEC.map((spec) => (
  ({
    YK: {
      ...spec,
      minFields: 8,
      keyFields: [],
      allFields: [
        { index: 0, label: '審査支払機関', required: true, format: 'digits', lengths: [1] },
        { index: 1, label: '都道府県', required: true, format: 'digits', lengths: [2] },
        { index: 2, label: '点数表', required: true, format: 'digits', lengths: [1] },
        { index: 3, label: '薬局コード', required: true, format: 'digits', lengths: [7] },
        { index: 4, label: '薬局連絡先名称', required: true, format: 'text' },
        { index: 5, label: '請求年月', required: true, format: 'month', lengths: [6] },
        { index: 6, label: 'マルチボリューム識別情報', required: true, format: 'digits', lengths: [2] },
        { index: 7, label: '電話番号', required: true, format: 'text' }
      ]
    },
    RE: {
      ...spec,
      minFields: 41,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_RE_ALL_FIELDS
    },
    HO: {
      ...spec,
      minFields: 13,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_HO_ALL_FIELDS
    },
    KO: {
      ...spec,
      minFields: 9,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_KO_ALL_FIELDS
    },
    SH: {
      ...spec,
      minFields: 9,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_SH_ALL_FIELDS
    },
    CZ: {
      ...spec,
      minFields: 70,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_CZ_ALL_FIELDS
    },
    IY: {
      ...spec,
      minFields: 9,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_IY_ALL_FIELDS
    },
    TO: {
      ...spec,
      minFields: 6,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_TO_ALL_FIELDS
    },
    CO: {
      ...spec,
      minFields: 2,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_COMMENT_ALL_FIELDS
    },
    TK: {
      ...spec,
      minFields: 2,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_COMMENT_ALL_FIELDS
    },
    KI: {
      ...spec,
      minFields: 113,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_KI_ALL_FIELDS
    },
    SN: {
      ...spec,
      minFields: 8,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_SN_ALL_FIELDS
    },
    JD: {
      ...spec,
      minFields: 32,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_JD_ALL_FIELDS
    },
    MF: {
      ...spec,
      minFields: 32,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_MF_ALL_FIELDS
    },
    ST: {
      ...spec,
      minFields: 15,
      keyFields: [],
      allFields: DISPENSING_UKE_OFFICIAL_ST_ALL_FIELDS
    }
  } satisfies Partial<Record<string, DispensingUkeRecordSpec>>)[spec.type] ?? spec
  )),
  DISPENSING_UKE_OFFICIAL_GO_RECORD_SPEC
];

function arrayDiff(left: string[], right: Set<string>): string[] {
  return left.filter((value) => !right.has(value));
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export function buildDispensingUkeOfficialSubmissionGate(
  records: UkeRecord[]
): DispensingUkeOfficialSubmissionGate {
  const standardRecordTypes = [...DISPENSING_UKE_OFFICIAL_SUBMISSION_RECORD_TYPES];
  const standardRecordTypeSet = new Set<string>(standardRecordTypes);
  const observedRecordTypes = sortedUnique(records.map((record) => record.type));
  const observedRecordTypeSet = new Set(observedRecordTypes);
  const missingRequiredRecordTypes = DISPENSING_UKE_OFFICIAL_REQUIRED_FILE_RECORD_TYPES
    .filter((recordType) => !observedRecordTypeSet.has(recordType));
  const nonStandardRecordTypes = observedRecordTypes
    .filter((recordType) => !standardRecordTypeSet.has(recordType));
  const firstRecordType = records[0]?.type;
  const lastRecordType = records.at(-1)?.type;
  const issues: DispensingUkeOfficialSubmissionGateIssue[] = [];

  if (missingRequiredRecordTypes.length > 0) {
    issues.push({
      code: 'official_submission_required_record_missing',
      message: `公式提出形式で必須の ${missingRequiredRecordTypes.join('・')} レコードが不足しています。`,
      recordTypes: [...missingRequiredRecordTypes]
    });
  }
  if (nonStandardRecordTypes.length > 0) {
    issues.push({
      code: 'official_submission_nonstandard_record_present',
      message: `令和8年6月版の調剤記録条件仕様にない ${nonStandardRecordTypes.join('・')} レコードが含まれています。`,
      recordTypes: nonStandardRecordTypes
    });
  }
  if (firstRecordType !== 'YK') {
    issues.push({
      code: 'official_submission_first_record_not_yk',
      message: '公式提出ファイルの先頭はYKレコードである必要があります。',
      recordTypes: firstRecordType ? [firstRecordType] : []
    });
  }
  if (lastRecordType !== 'GO') {
    issues.push({
      code: 'official_submission_last_record_not_go',
      message: '公式提出ファイルの末尾はGOレコードである必要があります。',
      recordTypes: lastRecordType ? [lastRecordType] : []
    });
  }
  if (!records.some((record) => record.type === 'SH' || record.type === 'KI')) {
    issues.push({
      code: 'official_submission_claim_body_missing',
      message: '各レセプトにはSHまたはKIのいずれかが必要です。',
      recordTypes: ['SH', 'KI']
    });
  }

  const ok = issues.length === 0;
  return {
    ok,
    source: DISPENSING_UKE_RECORD_SPEC_SOURCE,
    standardRecordTypes,
    observedRecordTypes,
    missingRequiredRecordTypes: [...missingRequiredRecordTypes],
    nonStandardRecordTypes,
    firstRecordType,
    lastRecordType,
    issues,
    statusLabel: ok ? '公式提出形式の骨格確認OK' : '公式提出形式へ修正が必要',
    requiredActions: ok
      ? ['令和8年6月版仕様PDFの全項目順、桁数、必須条件の照合結果を確認する']
      : [
        '令和8年6月版仕様に沿ってYK/RE/HO/KO/SN/JD/MF/SH/CZ/IY/TO/CO/TK/KI/ST/GOを生成する',
        'pharma-oss独自または公式サンプル管理用レコードを提出ファイルへ含めない',
        'GOレコードの総件数、総合計点数、マルチボリューム識別情報を確認する'
      ]
  };
}

export function formatDispensingUkeOfficialSubmissionGate(
  gate: DispensingUkeOfficialSubmissionGate
): string {
  const missing = gate.missingRequiredRecordTypes.length > 0
    ? ` / 必須不足 ${gate.missingRequiredRecordTypes.join('・')}`
    : '';
  const nonStandard = gate.nonStandardRecordTypes.length > 0
    ? ` / 非標準 ${gate.nonStandardRecordTypes.join('・')}`
    : '';
  return `${gate.source.label}: ${gate.statusLabel} / 先頭 ${gate.firstRecordType || 'なし'} / 末尾 ${gate.lastRecordType || 'なし'}${missing}${nonStandard}`;
}

function collectDuplicateItemNumbers(indexes: number[]): number[] {
  const counts = new Map<number, number>();
  for (const index of indexes) {
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([index]) => index + 1)
    .sort((left, right) => left - right);
}

function buildMissingItemNumbers(expectedFieldCount: number, indexes: Set<number>): number[] {
  return Array.from({ length: expectedFieldCount }, (_, index) => index + 1)
    .filter((itemNumber) => !indexes.has(itemNumber - 1));
}

export function buildDispensingUkeOfficialAllFieldDefinitionGate(
  recordSpecs: DispensingUkeRecordSpec[] = DISPENSING_UKE_OFFICIAL_RECORD_SPEC
): DispensingUkeOfficialAllFieldDefinitionGate {
  const expectedRecordTypes = [...DISPENSING_UKE_OFFICIAL_SUBMISSION_RECORD_TYPES];
  const expectedRecordTypeSet = new Set<string>(expectedRecordTypes);
  const defaultSpecsByRecordType = new Map(DISPENSING_UKE_OFFICIAL_RECORD_SPEC.map((spec) => [spec.type, spec]));
  const specsByRecordType = new Map(recordSpecs.map((spec) => [spec.type, spec]));
  const implementedRecordTypes = sortedUnique(recordSpecs
    .map((spec) => spec.type)
    .filter((recordType) => expectedRecordTypeSet.has(recordType)));
  const issues: DispensingUkeOfficialAllFieldDefinitionGateIssue[] = [];
  const items: DispensingUkeOfficialAllFieldDefinitionGateItem[] = [];

  for (const recordType of expectedRecordTypes) {
    const spec = specsByRecordType.get(recordType);
    const defaultSpec = defaultSpecsByRecordType.get(recordType);
    const expectedFieldCount = spec?.minFields ?? defaultSpec?.minFields ?? 0;
    const allFields = spec?.allFields ?? [];
    const allFieldIndexes = allFields.map((field) => field.index);
    const validIndexSet = new Set(allFieldIndexes.filter((index) => index >= 0 && index < expectedFieldCount));
    const missingItemNumbers = buildMissingItemNumbers(expectedFieldCount, validIndexSet);
    const duplicateItemNumbers = collectDuplicateItemNumbers(allFieldIndexes);
    const outOfRangeItemNumbers = allFieldIndexes
      .filter((index) => index < 0 || index >= expectedFieldCount)
      .map((index) => index + 1)
      .sort((left, right) => left - right);
    let statusLabel = '定義完了';

    if (!spec) {
      statusLabel = 'レコード未定義';
      issues.push({
        code: 'official_all_fields_record_missing',
        recordType,
        message: `${recordType}レコードの公式提出用仕様定義がありません。`
      });
    } else if (allFields.length === 0) {
      statusLabel = 'allFields未定義';
      issues.push({
        code: 'official_all_fields_missing',
        recordType,
        message: `${recordType}レコードのallFieldsが未定義です。`
      });
    } else {
      if (missingItemNumbers.length > 0) {
        statusLabel = '項目不足';
        issues.push({
          code: 'official_all_fields_item_missing',
          recordType,
          message: `${recordType}レコードのallFieldsに${missingItemNumbers.join('・')}項目目がありません。`
        });
      }
      if (duplicateItemNumbers.length > 0) {
        statusLabel = '項目重複';
        issues.push({
          code: 'official_all_fields_item_duplicate',
          recordType,
          message: `${recordType}レコードのallFieldsで${duplicateItemNumbers.join('・')}項目目が重複しています。`
        });
      }
      if (outOfRangeItemNumbers.length > 0) {
        statusLabel = '項目位置要確認';
        issues.push({
          code: 'official_all_fields_item_out_of_range',
          recordType,
          message: `${recordType}レコードのallFieldsに範囲外の${outOfRangeItemNumbers.join('・')}項目目があります。`
        });
      }
    }

    items.push({
      recordType,
      label: spec?.label ?? defaultSpec?.label ?? recordType,
      expectedFieldCount,
      definedFieldCount: allFields.length,
      missingItemNumbers,
      duplicateItemNumbers,
      outOfRangeItemNumbers,
      statusLabel
    });
  }

  const missingRecordTypes = expectedRecordTypes.filter((recordType) => !specsByRecordType.has(recordType));
  const recordTypesWithoutAllFields = items
    .filter((item) => item.statusLabel !== '定義完了')
    .map((item) => item.recordType);
  const expectedFieldCount = items.reduce((sum, item) => sum + item.expectedFieldCount, 0);
  const definedFieldCount = items.reduce((sum, item) => sum + item.definedFieldCount, 0);
  const completedRecordTypeCount = items.filter((item) => item.statusLabel === '定義完了').length;
  const ok = issues.length === 0;

  return {
    ok,
    source: DISPENSING_UKE_RECORD_SPEC_SOURCE,
    expectedRecordTypes,
    implementedRecordTypes,
    completedRecordTypeCount,
    missingRecordTypes,
    recordTypesWithoutAllFields,
    expectedFieldCount,
    definedFieldCount,
    issueCount: issues.length,
    issues,
    items,
    statusLabel: ok ? '公式提出allFields定義完了' : '公式提出allFields定義に残りあり',
    nextActions: ok
      ? ['P1-05で複数処方グループの点数配分と条件付きレコード生成を確認する']
      : [
        '未定義レコードのallFieldsを追加する',
        '不足、重複、範囲外の項番を令和8年6月版仕様PDFに合わせて修正する',
        '修正後にCSVを監査台帳へ保存する'
      ]
  };
}

export function buildDispensingUkeOfficialAllFieldDefinitionGateCsv(
  gate: DispensingUkeOfficialAllFieldDefinitionGate
): string {
  const rows = [
    ['出典', '出典URL', '判定', 'レコード種別', 'レコード名', '期待項目数', '定義項目数', '不足項番', '重複項番', '範囲外項番', '状態', 'メモ'],
    ...gate.items.map((item) => [
      gate.source.label,
      gate.source.url,
      gate.statusLabel,
      item.recordType,
      item.label,
      item.expectedFieldCount,
      item.definedFieldCount,
      item.missingItemNumbers.join('・'),
      item.duplicateItemNumbers.join('・'),
      item.outOfRangeItemNumbers.join('・'),
      item.statusLabel,
      gate.issues
        .filter((issue) => issue.recordType === item.recordType)
        .map((issue) => issue.message)
        .join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatDispensingUkeOfficialAllFieldDefinitionGate(
  gate: DispensingUkeOfficialAllFieldDefinitionGate
): string {
  const status = gate.ok ? 'OK' : '要確認';
  const issueText = gate.recordTypesWithoutAllFields.length > 0
    ? ` / 要確認 ${gate.recordTypesWithoutAllFields.join('・')}`
    : '';

  return `${gate.source.label} 公式提出allFields完了ゲート: ${status} / レコード ${gate.completedRecordTypeCount}/${gate.expectedRecordTypes.length} / 定義 ${gate.definedFieldCount}/${gate.expectedFieldCount} / 指摘 ${gate.issueCount}${issueText}`;
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function formatAllFieldValidationStatus(
  status: DispensingUkeAllFieldValidationItemStatus
): string {
  switch (status) {
    case 'ok':
      return '確認済み';
    case 'missing':
      return '必須抜け';
    case 'format_invalid':
      return '形式不備';
  }
}

export function getDispensingUkeRecordDefinedFields(
  spec: DispensingUkeRecordSpec
): DispensingUkeRecordFieldSpec[] {
  const fieldsByIndex = new Map<number, DispensingUkeRecordFieldSpec>();
  for (const field of [...spec.keyFields, ...(spec.allFields ?? [])]) {
    fieldsByIndex.set(field.index, field);
  }
  return Array.from(fieldsByIndex.values()).sort((left, right) => left.index - right.index);
}

export function buildDispensingUkeSpecCoverageReport(records: UkeRecord[]): DispensingUkeSpecCoverageReport {
  const knownRecordTypes = DISPENSING_UKE_KNOWN_RECORD_SPEC.map((spec) => spec.type);
  const generatedRecordTypes = Array.from(new Set(records.map((record) => record.type))).sort();
  const generatedSet = new Set(generatedRecordTypes);
  const knownSet = new Set(knownRecordTypes);

  return {
    knownRecordTypes,
    generatedRecordTypes,
    requiredRecordTypes: [...REQUIRED_RECORD_TYPES],
    missingKnownRecordTypes: knownRecordTypes.filter((type) => !generatedSet.has(type)),
    missingRequiredRecordTypes: REQUIRED_RECORD_TYPES.filter((type) => !generatedSet.has(type)),
    unknownRecordTypes: generatedRecordTypes.filter((type) => !knownSet.has(type))
  };
}

export function buildDispensingUkeRecordSpecReview(records: UkeRecord[] = []): DispensingUkeRecordSpecReview {
  const expectedRecordTypes = DISPENSING_UKE_KNOWN_RECORD_SPEC.map((spec) => spec.type);
  const expectedSet = new Set(expectedRecordTypes);
  const implementedRecordTypes = Object.keys(RECORD_RULES);
  const implementedSet = new Set(implementedRecordTypes);
  const expectedRequiredRecordTypes = DISPENSING_UKE_KNOWN_RECORD_SPEC
    .filter((spec) => spec.required)
    .map((spec) => spec.type);
  const expectedSingletonRecordTypes = DISPENSING_UKE_KNOWN_RECORD_SPEC
    .filter((spec) => spec.singleton)
    .map((spec) => spec.type);
  const expectedRequiredSet = new Set(expectedRequiredRecordTypes);
  const expectedSingletonSet = new Set(expectedSingletonRecordTypes);
  const actualRequiredSet = new Set(REQUIRED_RECORD_TYPES);
  const actualSingletonSet = new Set(SINGLETON_RECORD_TYPES);
  const generatedRecordTypes = sortedUnique(records.map((record) => record.type));
  const generatedSet = new Set(generatedRecordTypes);
  const mismatchedOrderRecordTypes: Array<{ type: string; expected: number; actual: number }> = [];
  const mismatchedMinFieldRecordTypes: Array<{ type: string; expected: number; actual: number }> = [];
  const keyFieldIssues: string[] = [];

  for (const spec of DISPENSING_UKE_KNOWN_RECORD_SPEC) {
    const rule = RECORD_RULES[spec.type];
    if (rule && rule.minFields !== spec.minFields) {
      mismatchedMinFieldRecordTypes.push({
        type: spec.type,
        expected: spec.minFields,
        actual: rule.minFields
      });
    }

    const actualOrderStage = RECORD_ORDER_STAGE[spec.type];
    if (actualOrderStage !== undefined && actualOrderStage !== spec.orderStage) {
      mismatchedOrderRecordTypes.push({
        type: spec.type,
        expected: spec.orderStage,
        actual: actualOrderStage
      });
    }

    const allFieldIndexes = new Set<number>();
    for (const field of spec.allFields ?? []) {
      if (allFieldIndexes.has(field.index)) {
        keyFieldIssues.push(`${spec.type}.${field.index + 1}項目の全項目定義が重複しています。`);
      }
      allFieldIndexes.add(field.index);
    }

    for (const field of getDispensingUkeRecordDefinedFields(spec)) {
      if (field.index < 0 || field.index >= spec.minFields) {
        keyFieldIssues.push(`${spec.type}.${field.label}の項目位置が${spec.minFields}項目の範囲外です。`);
      }
      if (field.lengths && field.lengths.some((length) => !Number.isInteger(length) || length <= 0)) {
        keyFieldIssues.push(`${spec.type}.${field.label}の桁数定義を確認してください。`);
      }
    }
  }

  const missingRuleRecordTypes = arrayDiff(expectedRecordTypes, implementedSet);
  const extraRuleRecordTypes = arrayDiff(implementedRecordTypes, expectedSet);
  const missingRequiredRecordTypes = arrayDiff(expectedRequiredRecordTypes, actualRequiredSet);
  const extraRequiredRecordTypes = arrayDiff(REQUIRED_RECORD_TYPES, expectedRequiredSet);
  const missingSingletonRecordTypes = arrayDiff(expectedSingletonRecordTypes, actualSingletonSet);
  const extraSingletonRecordTypes = arrayDiff(SINGLETON_RECORD_TYPES, expectedSingletonSet);
  const missingOrderRecordTypes = DISPENSING_UKE_KNOWN_RECORD_SPEC
    .filter((spec) => RECORD_ORDER_STAGE[spec.type] === undefined)
    .map((spec) => spec.type);
  const missingGeneratedRecordTypes = records.length > 0
    ? arrayDiff(expectedRecordTypes, generatedSet)
    : [];
  const unknownGeneratedRecordTypes = records.length > 0
    ? generatedRecordTypes.filter((type) => !expectedSet.has(type))
    : [];

  const issues = [
    ...missingRuleRecordTypes.map((type) => `${type}レコードの検証ルールが未定義です。`),
    ...extraRuleRecordTypes.map((type) => `${type}レコードは検証ルールにありますが仕様点検表にありません。`),
    ...missingRequiredRecordTypes.map((type) => `${type}レコードの必須設定が不足しています。`),
    ...extraRequiredRecordTypes.map((type) => `${type}レコードが仕様点検表より広く必須扱いです。`),
    ...missingSingletonRecordTypes.map((type) => `${type}レコードの単一設定が不足しています。`),
    ...extraSingletonRecordTypes.map((type) => `${type}レコードが仕様点検表より広く単一扱いです。`),
    ...missingOrderRecordTypes.map((type) => `${type}レコードの出力順序が未定義です。`),
    ...mismatchedOrderRecordTypes.map((item) => `${item.type}レコードの順序段階が仕様点検表と異なります。`),
    ...mismatchedMinFieldRecordTypes.map((item) => `${item.type}レコードの最小項目数が仕様点検表と異なります。`),
    ...keyFieldIssues,
    ...unknownGeneratedRecordTypes.map((type) => `${type}レコードは仕様点検表にない生成種別です。`)
  ];

  return {
    ok: issues.length === 0 && missingGeneratedRecordTypes.length === 0,
    source: DISPENSING_UKE_RECORD_SPEC_SOURCE,
    expectedRecordTypes,
    implementedRecordTypes,
    missingRuleRecordTypes,
    extraRuleRecordTypes,
    missingRequiredRecordTypes,
    extraRequiredRecordTypes,
    missingSingletonRecordTypes,
    extraSingletonRecordTypes,
    missingOrderRecordTypes,
    mismatchedOrderRecordTypes,
    mismatchedMinFieldRecordTypes,
    keyFieldIssues,
    generatedRecordTypes,
    missingGeneratedRecordTypes,
    unknownGeneratedRecordTypes,
    issues
  };
}

export function formatDispensingUkeRecordSpecReview(review: DispensingUkeRecordSpecReview): string {
  const status = review.ok ? 'OK' : '要確認';
  const generatedText = review.generatedRecordTypes.length > 0
    ? ` / 生成 ${review.generatedRecordTypes.length}/${review.expectedRecordTypes.length}`
    : '';
  const issueText = review.issues.length > 0
    ? ` / ${review.issues.slice(0, 3).join(' ')}${review.issues.length > 3 ? ` ほか${review.issues.length - 3}件` : ''}`
    : '';
  const missingGeneratedText = review.missingGeneratedRecordTypes.length > 0
    ? ` / 未生成 ${review.missingGeneratedRecordTypes.join('・')}`
    : '';

  return `${review.source.label}: ${status} / 検証対象 ${review.implementedRecordTypes.length}/${review.expectedRecordTypes.length} / 必須 ${REQUIRED_RECORD_TYPES.length} / 単一 ${SINGLETON_RECORD_TYPES.length}${generatedText}${missingGeneratedText}${issueText}`;
}

function addIssue(
  issues: DispensingUkeValidationIssue[],
  issue: DispensingUkeValidationIssue
) {
  issues.push(issue);
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

function isDigits(value: unknown): boolean {
  return !isBlank(value) && /^\d+$/.test(String(value));
}

function isDigitsOfLength(value: unknown, lengths: number[]): boolean {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) && lengths.includes(text.length);
}

function encodedByteLength(value: string): number {
  const unicodeArray = encoding.stringToCode(value);
  const sjisArray = encoding.convert(unicodeArray, {
    to: 'SJIS',
    from: 'UNICODE'
  });
  return sjisArray.length;
}

function getRecords(records: UkeRecord[], type: string): Array<{ record: UkeRecord; index: number }> {
  const matches: Array<{ record: UkeRecord; index: number }> = [];
  for (let i = 0; i < records.length; i++) {
    if (records[i].type === type) {
      matches.push({ record: records[i], index: i });
    }
  }
  return matches;
}

function isSequencedFeeRecord(record: UkeRecord): boolean {
  return FEE_RECORD_TYPES.has(record.type) && isDigits(record.fields[0]);
}

function getRecordMinFields(type: string, context: DispensingUkeValidationContext): number | undefined {
  if (context === 'official_sample' && OFFICIAL_SAMPLE_MIN_FIELDS[type] !== undefined) {
    return OFFICIAL_SAMPLE_MIN_FIELDS[type];
  }
  return RECORD_RULES[type]?.minFields;
}

function validateSingletonRecordCounts(records: UkeRecord[], issues: DispensingUkeValidationIssue[]) {
  for (const type of SINGLETON_RECORD_TYPES) {
    const matches = getRecords(records, type);
    if (matches.length <= 1) continue;
    addIssue(issues, {
      severity: 'error',
      code: `uke_duplicate_${type.toLowerCase()}`,
      title: `${type}レコードが重複しています`,
      message: `単一請求のUKEでは${RECORD_RULES[type]?.label || type}の${type}レコードは1件だけにしてください。`,
      recordIndex: matches[1].index,
      recordType: type
    });
  }
}

function validateRecordOrder(records: UkeRecord[], issues: DispensingUkeValidationIssue[]) {
  let lastStage = -1;
  let lastKnownType = '';
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const stage = RECORD_ORDER_STAGE[record.type];
    if (stage === undefined) continue;
    if (stage < lastStage) {
      addIssue(issues, {
        severity: 'error',
        code: 'uke_record_order_invalid',
        title: 'UKEレコードの並び順が不正です',
        message: `${record.type}レコードが${lastKnownType}レコードより後ろにあります。薬局情報、患者情報、保険/公費、調剤日、処方箋、算定/薬剤、合計、出力情報の順で出力してください。`,
        recordIndex: i,
        recordType: record.type
      });
      return;
    }
    lastStage = stage;
    lastKnownType = record.type;
  }
}

function requireField(
  issues: DispensingUkeValidationIssue[],
  record: UkeRecord,
  index: number,
  fieldIndex: number,
  label: string,
  severity: DispensingUkeValidationSeverity = 'error'
) {
  if (!isBlank(record.fields[fieldIndex])) return;
  addIssue(issues, {
    severity,
    code: `${record.type.toLowerCase()}_field_missing_${fieldIndex}`,
    title: `${record.type} ${label}が未入力です`,
    message: `UKE出力に必要な ${label} を設定してから再出力してください。`,
    recordIndex: index,
    recordType: record.type
  });
}

function requireDigitFormat(
  issues: DispensingUkeValidationIssue[],
  record: UkeRecord,
  index: number,
  fieldIndex: number,
  label: string,
  code: string,
  lengths?: number[]
) {
  if (isBlank(record.fields[fieldIndex])) return;
  const value = record.fields[fieldIndex];
  const isValid = lengths ? isDigitsOfLength(value, lengths) : isDigits(value);
  if (isValid) return;
  const lengthText = lengths ? `${lengths.join('桁または')}桁の` : '';
  addIssue(issues, {
    severity: 'error',
    code,
    title: `${record.type} ${label}の形式が不正です`,
    message: `${label}は${lengthText}半角数字で出力してください。`,
    recordIndex: index,
    recordType: record.type
  });
}

function requirePercentRange(
  issues: DispensingUkeValidationIssue[],
  record: UkeRecord,
  index: number,
  fieldIndex: number,
  label: string,
  code: string
) {
  if (isBlank(record.fields[fieldIndex])) return;
  const text = String(record.fields[fieldIndex]).trim();
  const numberValue = Number(text);
  if (/^\d+$/.test(text) && numberValue >= 0 && numberValue <= 100) return;
  addIssue(issues, {
    severity: 'error',
    code,
    title: `${record.type} ${label}の形式が不正です`,
    message: `${label}は0から100の半角数字で出力してください。`,
    recordIndex: index,
    recordType: record.type
  });
}

function isNumberValue(value: unknown): boolean {
  if (isBlank(value)) return false;
  return /^-?\d+(?:\.\d+)?$/.test(String(value).trim());
}

function getDefaultFieldLengths(
  field: DispensingUkeRecordFieldSpec
): number[] | undefined {
  if (field.lengths) return field.lengths;
  if (field.format === 'month') return [6];
  if (field.format === 'date') return [8];
  if (field.format === 'timestamp') return [14];
  return undefined;
}

function validateAllFieldFormat(
  issues: DispensingUkeValidationIssue[],
  record: UkeRecord,
  recordIndex: number,
  field: DispensingUkeRecordFieldSpec
) {
  const value = record.fields[field.index];
  if (isBlank(value)) return;

  const code = `${record.type.toLowerCase()}_all_field_${field.index + 1}_${field.format}_invalid`;
  switch (field.format) {
    case 'digits':
    case 'month':
    case 'date':
    case 'timestamp': {
      const lengths = getDefaultFieldLengths(field);
      if (lengths ? isDigitsOfLength(value, lengths) : isDigits(value)) return;
      const lengthText = lengths ? `${lengths.join('桁または')}桁の` : '';
      addIssue(issues, {
        severity: 'error',
        code,
        title: `${record.type} ${field.label}の形式が不正です`,
        message: `${field.label}は全項目定義に従い、${lengthText}半角数字で出力してください。`,
        recordIndex,
        recordType: record.type
      });
      return;
    }
    case 'number':
      if (isNumberValue(value)) return;
      addIssue(issues, {
        severity: 'error',
        code,
        title: `${record.type} ${field.label}の形式が不正です`,
        message: `${field.label}は全項目定義に従い、半角数字または小数で出力してください。`,
        recordIndex,
        recordType: record.type
      });
      return;
    case 'percent': {
      const text = String(value).trim();
      const numberValue = Number(text);
      if (/^\d+$/.test(text) && numberValue >= 0 && numberValue <= 100) return;
      addIssue(issues, {
        severity: 'error',
        code,
        title: `${record.type} ${field.label}の形式が不正です`,
        message: `${field.label}は全項目定義に従い、0から100の半角数字で出力してください。`,
        recordIndex,
        recordType: record.type
      });
      return;
    }
    case 'flag':
      if (['0', '1'].includes(String(value).trim())) return;
      addIssue(issues, {
        severity: 'error',
        code,
        title: `${record.type} ${field.label}の形式が不正です`,
        message: `${field.label}は全項目定義に従い、0または1で出力してください。`,
        recordIndex,
        recordType: record.type
      });
      return;
    case 'text':
      return;
  }
}

function validateAllFieldDefinitions(
  records: UkeRecord[],
  specs: DispensingUkeRecordSpec[],
  issues: DispensingUkeValidationIssue[]
) {
  const specsByRecordType = new Map(specs.map((spec) => [spec.type, spec]));
  for (const { record, index } of records.map((record, index) => ({ record, index }))) {
    const spec = specsByRecordType.get(record.type);
    if (!spec?.allFields) continue;

    for (const field of spec.allFields) {
      if (field.required && isBlank(record.fields[field.index])) {
        addIssue(issues, {
          severity: 'error',
          code: `${record.type.toLowerCase()}_all_field_${field.index + 1}_missing`,
          title: `${record.type} ${field.label}が未入力です`,
          message: `${field.label}は全項目定義で必須です。値の出し方を確認してから再出力してください。`,
          recordIndex: index,
          recordType: record.type
        });
      }
      validateAllFieldFormat(issues, record, index, field);
    }
  }
}

function claimSegmentBounds(records: UkeRecord[], recordIndex: number): { start: number; end: number } {
  let start = 0;
  for (let index = recordIndex; index >= 0; index -= 1) {
    if (records[index].type === 'RE') {
      start = index;
      break;
    }
  }

  let end = records.length;
  for (let index = recordIndex + 1; index < records.length; index += 1) {
    if (records[index].type === 'RE' || records[index].type === 'GO') {
      end = index;
      break;
    }
  }

  return { start, end };
}

function hasClaimSegmentPayerRecord(records: UkeRecord[], start: number, end: number): boolean {
  return records.slice(start, end).some((record) => record.type === 'HO' || record.type === 'KO');
}

function validateOfficialSubmissionConditionalRecords(
  records: UkeRecord[],
  issues: DispensingUkeValidationIssue[]
) {
  for (const { record, index } of records.map((record, index) => ({ record, index }))) {
    if (!['SN', 'JD', 'MF'].includes(record.type)) continue;

    const { start, end } = claimSegmentBounds(records, index);
    if (hasClaimSegmentPayerRecord(records, start, end)) continue;

    addIssue(issues, {
      severity: 'error',
      code: `official_submission_${record.type.toLowerCase()}_without_payer_record`,
      title: `${record.type}レコードの出力条件を確認してください`,
      message: `${record.type}レコードは同じレセプト内のHOまたはKOに付随する条件付き情報です。保険・公費レコードを確認してから再出力してください。`,
      recordIndex: index,
      recordType: record.type
    });
  }
}

export function validateDispensingUkeRecords(
  records: UkeRecord[],
  options: ValidateDispensingUkeRecordsOptions = {}
): DispensingUkeValidationIssue[] {
  const context = options.context ?? 'generated';
  const recordSpecs = options.recordSpecs ?? DISPENSING_UKE_KNOWN_RECORD_SPEC;
  const isGeneratedContext = context === 'generated';
  const issues: DispensingUkeValidationIssue[] = [];

  if (records.length === 0) {
    addIssue(issues, {
      severity: 'error',
      code: 'uke_empty',
      title: 'UKEレコードがありません',
      message: '出力対象の処方・患者・薬局情報を確認してください。'
    });
    return issues;
  }

  if (options.officialSubmission) {
    const officialSubmissionGate = buildDispensingUkeOfficialSubmissionGate(records);
    for (const gateIssue of officialSubmissionGate.issues) {
      addIssue(issues, {
        severity: 'error',
        code: gateIssue.code,
        title: '公式提出形式へ修正が必要です',
        message: gateIssue.message,
        recordType: gateIssue.recordTypes[0]
      });
    }
  }

  if (isGeneratedContext) {
    for (const type of REQUIRED_RECORD_TYPES) {
      if (!records.some((record) => record.type === type)) {
        addIssue(issues, {
          severity: 'error',
          code: `uke_missing_${type.toLowerCase()}`,
          title: `${type}レコードがありません`,
          message: `${RECORD_RULES[type]?.label || type}のレコードが不足しています。`
        });
      }
    }

    if (!records.some((record) => record.type === 'IY')) {
      addIssue(issues, {
        severity: 'error',
        code: 'uke_missing_iy',
        title: '医薬品レコードがありません',
        message: '処方薬がない状態ではUKE出力できません。'
      });
    }

    if (records[0]?.type !== 'YK') {
      addIssue(issues, {
        severity: 'error',
        code: 'uke_first_record_not_yk',
        title: '先頭が薬局情報レコードではありません',
        message: 'UKEの先頭レコードは薬局情報から始まる必要があります。',
        recordIndex: 0,
        recordType: records[0]?.type
      });
    }

    if (records[records.length - 1]?.type !== 'ST') {
      addIssue(issues, {
        severity: 'error',
        code: 'uke_last_record_not_st',
        title: '末尾が出力情報レコードではありません',
        message: 'UKEの末尾レコードは出力情報で終わる必要があります。',
        recordIndex: records.length - 1,
        recordType: records[records.length - 1]?.type
      });
    }

    validateSingletonRecordCounts(records, issues);
    validateRecordOrder(records, issues);
  }

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const rule = RECORD_RULES[record.type];

    if (!/^[A-Z]{2}$/.test(record.type)) {
      addIssue(issues, {
        severity: 'error',
        code: 'uke_invalid_record_type',
        title: '不正なレコード種別があります',
        message: `レコード種別「${record.type}」を確認してください。`,
        recordIndex: i,
        recordType: record.type
      });
    }

    if (!rule) {
      addIssue(issues, {
        severity: 'warning',
        code: 'uke_unknown_record_type',
        title: '未定義のレコード種別があります',
        message: `アプリの検証ルールにないレコード種別「${record.type}」です。公式仕様との突合を確認してください。`,
        recordIndex: i,
        recordType: record.type
      });
    } else if (context !== 'official_submission') {
      const minFields = getRecordMinFields(record.type, context) ?? rule.minFields;
      if (record.fields.length < minFields) {
        addIssue(issues, {
          severity: 'error',
          code: 'uke_field_count_short',
          title: `${record.type}レコードの項目数が不足しています`,
          message: `${rule.label}は少なくとも${minFields}項目必要ですが、${record.fields.length}項目しかありません。`,
          recordIndex: i,
          recordType: record.type
        });
      }
    }

    for (let fieldIndex = 0; fieldIndex < record.fields.length; fieldIndex++) {
      const value = record.fields[fieldIndex] || '';
      if (/[\r\n]/.test(value)) {
        addIssue(issues, {
          severity: 'error',
          code: 'uke_field_has_newline',
          title: `${record.type}レコードに改行を含む項目があります`,
          message: 'UKE項目内の改行は審査用データの崩れにつながるため、摘要や理由文を1行にしてください。',
          recordIndex: i,
          recordType: record.type
        });
      }

      if (encodedByteLength(value) > 2000) {
        addIssue(issues, {
          severity: 'warning',
          code: 'uke_field_too_long',
          title: `${record.type}レコードに長すぎる項目があります`,
          message: '摘要や理由文が長すぎる可能性があります。公式仕様の項目長と突合してください。',
          recordIndex: i,
          recordType: record.type
        });
      }
    }
  }

  validateAllFieldDefinitions(records, recordSpecs, issues);
  if (options.officialSubmission) {
    validateOfficialSubmissionConditionalRecords(records, issues);
  }

  if (isGeneratedContext) {
    for (const { record, index } of getRecords(records, 'YK')) {
      requireField(issues, record, index, 0, '保険薬局コード');
      requireField(issues, record, index, 1, '薬局名');
      requireField(issues, record, index, 4, '薬局所在地', 'warning');
      requireField(issues, record, index, 5, '薬局電話番号', 'warning');
      requireDigitFormat(issues, record, index, 0, '保険薬局コード', 'yk_pharmacy_code_format_invalid', [7]);
    }

    for (const { record, index } of getRecords(records, 'RE')) {
      requireField(issues, record, index, 1, '請求年月');
      requireField(issues, record, index, 2, '受付ID');
      requireField(issues, record, index, 3, '患者ID');
      requireField(issues, record, index, 4, '患者氏名');
      requireField(issues, record, index, 7, '患者生年月日');
      requireField(issues, record, index, 8, '合計点数');
      requireDigitFormat(issues, record, index, 1, '請求年月', 're_claim_month_format_invalid', [6]);
      requireDigitFormat(issues, record, index, 8, '合計点数', 're_total_points_format_invalid');

      if (!['0', '1', '2'].includes(String(record.fields[6] || ''))) {
        addIssue(issues, {
          severity: 'warning',
          code: 're_gender_unknown',
          title: '患者性別コードを確認してください',
          message: '性別コードは 1:男性、2:女性、0:未設定 として出力されています。',
          recordIndex: index,
          recordType: 'RE'
        });
      }

      if (!/^\d{8}$/.test(String(record.fields[7] || ''))) {
        addIssue(issues, {
          severity: 'error',
          code: 're_birthdate_invalid',
          title: '患者生年月日の形式が不正です',
          message: '患者生年月日はYYYYMMDD形式で出力できる必要があります。',
          recordIndex: index,
          recordType: 'RE'
        });
      }
    }

    if (!records.some((record) => record.type === 'HO')) {
      addIssue(issues, {
        severity: 'warning',
        code: 'uke_missing_ho',
        title: '保険者情報レコードがありません',
        message: '保険請求の場合は患者の保険情報を確認してください。'
      });
    }

    for (const { record, index } of getRecords(records, 'HO')) {
      requireField(issues, record, index, 0, '保険者番号');
      requireField(issues, record, index, 1, '記号番号');
      requireField(issues, record, index, 2, '負担割合', 'warning');
      requireDigitFormat(issues, record, index, 0, '保険者番号', 'ho_insurer_number_format_invalid', [6, 8]);
      requirePercentRange(issues, record, index, 2, '負担割合', 'ho_burden_ratio_format_invalid');
    }

    for (const { record, index } of getRecords(records, 'KO')) {
      requireField(issues, record, index, 0, '公費負担者番号');
      requireField(issues, record, index, 1, '公費受給者番号');
      requireField(issues, record, index, 2, '公費負担割合', 'warning');
      requireDigitFormat(issues, record, index, 0, '公費負担者番号', 'ko_public_provider_format_invalid', [8]);
      requireDigitFormat(issues, record, index, 1, '公費受給者番号', 'ko_public_recipient_format_invalid', [7]);
      requirePercentRange(issues, record, index, 2, '公費負担割合', 'ko_public_burden_ratio_format_invalid');
    }

    for (const { record, index } of getRecords(records, 'JD')) {
      requireDigitFormat(issues, record, index, 0, '調剤年月日', 'jd_dispensing_date_format_invalid', [8]);
    }

    for (const { record, index } of getRecords(records, 'SH')) {
      requireDigitFormat(issues, record, index, 0, '処方箋交付年月日', 'sh_prescription_date_format_invalid', [8]);
    }

    for (const { record, index } of getRecords(records, 'IY')) {
      requireField(issues, record, index, 1, 'RP番号');
      requireField(issues, record, index, 2, 'YJコードまたは薬品コード');
      requireField(issues, record, index, 3, 'レセ電医薬品コード');
      requireField(issues, record, index, 4, '薬品名');
      requireField(issues, record, index, 5, '分量');
      requireField(issues, record, index, 8, '薬価', 'warning');

      if (!['0', '1'].includes(String(record.fields[9] || ''))) {
        addIssue(issues, {
          severity: 'error',
          code: 'iy_drug_fee_flag_invalid',
          title: '薬剤料算定フラグが不正です',
          message: '薬剤料算定フラグは0または1で出力する必要があります。',
          recordIndex: index,
          recordType: 'IY'
        });
      }

      if (!['0', '1'].includes(String(record.fields[10] || ''))) {
        addIssue(issues, {
          severity: 'error',
          code: 'iy_diagnostic_flag_invalid',
          title: '検査薬フラグが不正です',
          message: '検査薬フラグは0または1で出力する必要があります。',
          recordIndex: index,
          recordType: 'IY'
        });
      }
    }
  }

  for (const { record, index } of getRecords(records, 'MN')) {
    requireField(issues, record, index, 0, '公式サンプル管理番号');
    requireField(issues, record, index, 2, '公式サンプル画像番号');
    requireDigitFormat(issues, record, index, 0, '公式サンプル管理番号', 'mn_sample_control_number_format_invalid');
    requireDigitFormat(issues, record, index, 2, '公式サンプル画像番号', 'mn_sample_image_number_format_invalid');
  }

  for (const { record, index } of getRecords(records, 'SN')) {
    requireField(issues, record, index, 0, 'SN区分');
    requireField(issues, record, index, 1, 'SN枝番');
    requireDigitFormat(issues, record, index, 0, 'SN区分', 'sn_category_format_invalid');
    requireDigitFormat(issues, record, index, 1, 'SN枝番', 'sn_branch_format_invalid');
  }

  for (const { record, index } of getRecords(records, 'JY')) {
    requireField(issues, record, index, 0, 'JY区分');
    requireField(issues, record, index, 1, 'JY種別');
    requireDigitFormat(issues, record, index, 0, 'JY区分', 'jy_category_format_invalid');
    requireDigitFormat(issues, record, index, 1, 'JY種別', 'jy_type_format_invalid');
  }

  for (const { record, index } of getRecords(records, 'ON')) {
    requireField(issues, record, index, 0, 'ON区分');
    requireDigitFormat(issues, record, index, 0, 'ON区分', 'on_category_format_invalid');
    requireDigitFormat(issues, record, index, 3, 'ON有効日時', 'on_effective_timestamp_format_invalid', [12]);
  }

  for (const { record, index } of getRecords(records, 'EX')) {
    requireField(issues, record, index, 11, 'EXペイロード');
  }

  for (const { record, index } of getRecords(records, 'RC')) {
    requireField(issues, record, index, 0, 'RC検証文字列');
  }

  for (const { record, index } of getRecords(records, 'MF')) {
    requireField(issues, record, index, 0, 'MF区分');
    requireDigitFormat(issues, record, index, 0, 'MF区分', 'mf_category_format_invalid');
  }

  if (isGeneratedContext) {
    for (const { record, index } of getRecords(records, 'TK')) {
      requireField(issues, record, index, 0, '合計点数');
      requireField(issues, record, index, 1, '算定レコード件数');
      requireField(issues, record, index, 2, '医薬品レコード件数');
      requireDigitFormat(issues, record, index, 0, '合計点数', 'tk_total_points_format_invalid');
      requireDigitFormat(issues, record, index, 1, '算定レコード件数', 'tk_fee_count_format_invalid');
      requireDigitFormat(issues, record, index, 2, '医薬品レコード件数', 'tk_iy_count_format_invalid');
    }

    for (const { record, index } of getRecords(records, 'ST')) {
      requireDigitFormat(issues, record, index, 0, '出力日時', 'st_timestamp_format_invalid', [14]);
    }

    const re = getRecords(records, 'RE')[0]?.record;
    const tk = getRecords(records, 'TK')[0]?.record;
    if (re && tk && String(re.fields[8] || '') !== String(tk.fields[0] || '')) {
      addIssue(issues, {
        severity: 'error',
        code: 'uke_total_points_mismatch',
        title: 'REとTKの合計点数が一致しません',
        message: `RE=${re.fields[8] || '未設定'}点、TK=${tk.fields[0] || '未設定'}点として出力されます。`
      });
    }

    if (tk) {
      const feeRecordCount = records.filter(isSequencedFeeRecord).length;
      if (isDigits(tk.fields[1]) && Number(tk.fields[1]) !== feeRecordCount) {
        addIssue(issues, {
          severity: 'error',
          code: 'uke_fee_count_mismatch',
          title: '算定レコード件数が一致しません',
          message: `TKの算定件数は${tk.fields[1]}件ですが、実際の算定レコードは${feeRecordCount}件です。`
        });
      }

      const iyCount = records.filter((record) => record.type === 'IY').length;
      if (isDigits(tk.fields[2]) && Number(tk.fields[2]) !== iyCount) {
        addIssue(issues, {
          severity: 'error',
          code: 'uke_iy_count_mismatch',
          title: '医薬品レコード件数が一致しません',
          message: `TKの医薬品件数は${tk.fields[2]}件ですが、実際のIYレコードは${iyCount}件です。`
        });
      }
    }
  }

  return issues;
}

function isAllFieldValidationIssue(issue: DispensingUkeValidationIssue): boolean {
  return issue.code.includes('_all_field_');
}

function issueMatchesAllField(
  issue: DispensingUkeValidationIssue,
  recordIndex: number,
  recordType: string,
  field: DispensingUkeRecordFieldSpec
): boolean {
  return issue.recordIndex === recordIndex
    && issue.recordType === recordType
    && issue.code.includes(`_all_field_${field.index + 1}_`);
}

export function buildDispensingUkeAllFieldValidationReport(
  records: UkeRecord[],
  options: ValidateDispensingUkeRecordsOptions = {}
): DispensingUkeAllFieldValidationReport {
  const recordSpecs = options.recordSpecs ?? DISPENSING_UKE_KNOWN_RECORD_SPEC;
  const specsByRecordType = new Map(recordSpecs.map((spec) => [spec.type, spec]));
  const issues = validateDispensingUkeRecords(records, options).filter(isAllFieldValidationIssue);
  const items: DispensingUkeAllFieldValidationItem[] = [];

  for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
    const record = records[recordIndex];
    const spec = specsByRecordType.get(record.type);
    if (!spec?.allFields) continue;

    for (const field of spec.allFields) {
      const itemIssues = issues.filter((issue) => issueMatchesAllField(issue, recordIndex, record.type, field));
      const hasMissingIssue = itemIssues.some((issue) => issue.code.endsWith('_missing'));
      const status: DispensingUkeAllFieldValidationItemStatus = hasMissingIssue
        ? 'missing'
        : itemIssues.length > 0 ? 'format_invalid' : 'ok';
      items.push({
        recordIndex,
        recordType: record.type,
        itemNumber: field.index + 1,
        label: field.label,
        required: field.required,
        format: field.format,
        valuePresent: !isBlank(record.fields[field.index]),
        status,
        statusLabel: formatAllFieldValidationStatus(status),
        issueCodes: itemIssues.map((issue) => issue.code),
        issueMessages: itemIssues.map((issue) => issue.message)
      });
    }
  }

  return {
    ok: issues.length === 0,
    source: DISPENSING_UKE_RECORD_SPEC_SOURCE,
    definedAllFieldCount: countDefinedAllFields(recordSpecs),
    definedAllFieldRecordTypes: getDefinedAllFieldRecordTypes(recordSpecs),
    checkedFieldCount: items.length,
    okFieldCount: items.filter((item) => item.status === 'ok').length,
    issueFieldCount: items.filter((item) => item.status !== 'ok').length,
    missingFieldCount: items.filter((item) => item.status === 'missing').length,
    formatIssueFieldCount: items.filter((item) => item.status === 'format_invalid').length,
    recordTypes: sortedUnique(items.map((item) => item.recordType)),
    recordTypesWithIssues: sortedUnique(items.filter((item) => item.status !== 'ok').map((item) => item.recordType)),
    issues,
    items
  };
}

export function buildDispensingUkeAllFieldValidationReportCsv(
  report: DispensingUkeAllFieldValidationReport
): string {
  const rows = [
    ['出典', '出典URL', '定義レコード', '定義項目数', 'レコード位置', 'レコード種別', '項番', '項目名', '必須', '形式', '値あり', '判定', '指摘コード', '指摘内容'],
    ...report.items.map((item) => [
      report.source.label,
      report.source.url,
      report.definedAllFieldRecordTypes.join('・'),
      report.definedAllFieldCount,
      item.recordIndex + 1,
      item.recordType,
      item.itemNumber,
      item.label,
      item.required ? '必須' : '任意',
      item.format,
      item.valuePresent ? 'あり' : 'なし',
      item.statusLabel,
      item.issueCodes.join(' / '),
      item.issueMessages.join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatDispensingUkeAllFieldValidationReport(
  report: DispensingUkeAllFieldValidationReport
): string {
  const status = report.ok ? 'OK' : '要確認';
  const recordText = report.recordTypesWithIssues.length > 0
    ? ` / 要確認 ${report.recordTypesWithIssues.join('・')}`
    : '';

  return `${report.source.label} allFields検証: ${status} / 定義 ${report.definedAllFieldCount} / 確認 ${report.checkedFieldCount} / 指摘 ${report.issueFieldCount} / 必須抜け ${report.missingFieldCount} / 形式不備 ${report.formatIssueFieldCount}${recordText}`;
}
