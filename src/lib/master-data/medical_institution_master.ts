export interface MedicalInstitutionRecord {
  // 公式には「都道府県2桁+点数表区分1桁+検索番号7桁」の10桁だが、地方厚生局の
  // 「コード内容別医療機関一覧表」からは点数表区分(1桁)を確実に判定できないため、
  // 厚生局データ由来のレコードは「都道府県2桁+検索番号7桁」の9桁になる場合がある。
  // (詳細: src/lib/master-data/medical_institution_bureau_import.ts の説明コメント参照)
  code: string;
  scoreCode: string; // 検索番号(届出番号)7桁
  prefectureCode: string; // 都道府県コード 2桁 (例: "13" 東京)
  name: string; // 正式医療機関名称
  nameKana?: string; // 医療機関カナ
  category?: 'hospital' | 'clinic' | 'dental' | 'pharmacy'; // 施設分類
  postalCode?: string; // 郵便番号
  address?: string; // 所在地
  phone?: string; // 電話番号
}

// 厚労省・地方厚生局届出マスタ形式の代表的医療機関シードデータ
export const SEED_MEDICAL_INSTITUTIONS: MedicalInstitutionRecord[] = [
  {
    code: '1310112345',
    scoreCode: '1011234',
    prefectureCode: '13',
    name: '日本中央総合病院',
    nameKana: 'ニホンチュウオウソウゴウビョウイン',
    category: 'hospital',
    postalCode: '100-0001',
    address: '東京都千代田区千代田1-1',
    phone: '03-1234-5678'
  },
  {
    code: '1310223456',
    scoreCode: '1022345',
    prefectureCode: '13',
    name: 'サクラ内科クリニック',
    nameKana: 'サクラナイカクリニック',
    category: 'clinic',
    postalCode: '101-0051',
    address: '東京都千代田区神田神保町1-2-3',
    phone: '03-2345-6789'
  },
  {
    code: '1310334567',
    scoreCode: '1033456',
    prefectureCode: '13',
    name: 'みどり小児科医院',
    nameKana: 'ミドリショウニカイイン',
    category: 'clinic',
    postalCode: '102-0072',
    address: '東京都千代田区飯田橋2-3-4',
    phone: '03-3456-7890'
  },
  {
    code: '1410198765',
    scoreCode: '1019876',
    prefectureCode: '14',
    name: '横浜みなと医療センター',
    nameKana: 'ヨコハマミナトイリョウセンター',
    category: 'hospital',
    postalCode: '220-0012',
    address: '神奈川県横浜市西区みなとみらい2-1',
    phone: '045-123-4567'
  },
  {
    code: '2710154321',
    scoreCode: '1015432',
    prefectureCode: '27',
    name: '大阪なんばクリニック',
    nameKana: 'オオサカナンバクリニック',
    category: 'clinic',
    postalCode: '542-0076',
    address: '大阪府大阪市中央区難波3-4-5',
    phone: '06-6123-4567'
  }
];

export function normalizeInstitutionCode(code: string): string {
  if (!code) return '';
  return code.replace(/[^\d]/g, '').trim();
}

export interface BureauSyncLogEntry {
  sourceFileName?: string;
  prefectureName: string;
  importedCount: number;
  skippedInactiveCount: number;
  issueCount: number;
  importedAt: string;
}

let activeInstitutionRecords: MedicalInstitutionRecord[] = [...SEED_MEDICAL_INSTITUTIONS];
let lastSyncTimestamp: string | null = null;
let bureauSyncLog: BureauSyncLogEntry[] = [];

export function updateMedicalInstitutionMasterRecords(newRecords: MedicalInstitutionRecord[]) {
  if (!newRecords || newRecords.length === 0) return;
  activeInstitutionRecords = [...newRecords];
  lastSyncTimestamp = new Date().toISOString();
  bureauSyncLog = [];
}

/**
 * 地方厚生局の一覧表から取り込んだレコードを、同一都道府県の既存レコードだけを
 * 置き換える形でマージする(他の都道府県・シードデータは保持する)。
 * 月次で該当都道府県のみ再取込みしても、他都道府県分が消えない「更新に耐える」設計。
 */
export function mergeBureauMedicalInstitutionRecords(
  newRecords: MedicalInstitutionRecord[],
  meta: { prefectureName: string; sourceFileName?: string; skippedInactiveCount?: number; issueCount?: number }
): void {
  const prefectureCode = newRecords[0]?.prefectureCode;
  const isSeedOnly = activeInstitutionRecords === SEED_MEDICAL_INSTITUTIONS || lastSyncTimestamp === null;
  const kept = isSeedOnly
    ? []
    : activeInstitutionRecords.filter((rec) => !(prefectureCode && rec.prefectureCode === prefectureCode));

  const byCode = new Map<string, MedicalInstitutionRecord>();
  for (const rec of [...kept, ...newRecords]) {
    byCode.set(rec.code, rec);
  }
  activeInstitutionRecords = [...byCode.values()];
  lastSyncTimestamp = new Date().toISOString();

  bureauSyncLog = [
    {
      sourceFileName: meta.sourceFileName,
      prefectureName: meta.prefectureName,
      importedCount: newRecords.length,
      skippedInactiveCount: meta.skippedInactiveCount || 0,
      issueCount: meta.issueCount || 0,
      importedAt: lastSyncTimestamp
    },
    ...bureauSyncLog
  ].slice(0, 50);
}

export function getBureauSyncLog(): BureauSyncLogEntry[] {
  return bureauSyncLog;
}

export function getActiveMedicalInstitutionRecords(): MedicalInstitutionRecord[] {
  return activeInstitutionRecords;
}

export function getMedicalInstitutionMasterStats() {
  return {
    totalCount: activeInstitutionRecords.length,
    lastSyncTimestamp
  };
}

/**
 * 一度も厚生局マスタファイルを取り込んでおらず、同梱の架空シードデータ(5件)のみで
 * 動作している状態かどうか。true の場合、コード検索の候補は実在しない架空データ。
 */
export function isUsingSeedMedicalInstitutionData(): boolean {
  return lastSyncTimestamp === null;
}

export function importMedicalInstitutionMasterCsv(csvText: string): MedicalInstitutionRecord[] {
  if (!csvText) return [];
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const parsed: MedicalInstitutionRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') || line.includes('医療機関コード') || line.includes('点数表')) {
      continue;
    }
    const cols = line.split(/,|\t/).map((c) => c.replace(/^["']|["']$/g, '').trim());
    if (cols.length >= 2) {
      const rawCode = cols[0] || '';
      const rawName = cols[1] || '';
      const rawScoreCode = cols[2] || (rawCode.length >= 7 ? rawCode.slice(-7) : rawCode);
      const rawPref = cols[3] || (rawCode.length >= 2 ? rawCode.slice(0, 2) : '13');
      const rawKana = cols[4] || '';
      const rawAddress = cols[5] || '';

      if (rawCode && rawName) {
        parsed.push({
          code: rawCode,
          scoreCode: rawScoreCode,
          prefectureCode: rawPref,
          name: rawName,
          nameKana: rawKana,
          address: rawAddress
        });
      }
    }
  }

  if (parsed.length > 0) {
    updateMedicalInstitutionMasterRecords(parsed);
  }

  return parsed;
}

export function importMedicalInstitutionMasterJson(jsonText: string): MedicalInstitutionRecord[] {
  try {
    const parsed = JSON.parse(jsonText);
    const records: MedicalInstitutionRecord[] = Array.isArray(parsed) ? parsed : parsed.institutions || parsed.data || [];
    if (Array.isArray(records) && records.length > 0) {
      updateMedicalInstitutionMasterRecords(records);
      return records;
    }
  } catch (err) {
    console.warn('[MedicalInstitutionMaster] JSON parse error:', err);
  }
  return [];
}

/**
 * 医療機関コード(10桁)または点数表番号(7桁)から医療機関情報を検索
 */
export function findMedicalInstitutionByCode(
  code: string,
  records: MedicalInstitutionRecord[] = activeInstitutionRecords
): MedicalInstitutionRecord | undefined {
  const normalized = normalizeInstitutionCode(code);
  if (!normalized) return undefined;

  return records.find((rec) => {
    const recCode = normalizeInstitutionCode(rec.code);
    const recScoreCode = normalizeInstitutionCode(rec.scoreCode);
    return recCode === normalized || recScoreCode === normalized;
  });
}

/**
 * コード・名称・カナからインクリメンタルオートコンプリート検索
 */
export function searchMedicalInstitutions(
  query: string,
  limit = 20,
  records: MedicalInstitutionRecord[] = activeInstitutionRecords
): MedicalInstitutionRecord[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const normQueryCode = normalizeInstitutionCode(trimmed);

  return records
    .filter((rec) => {
      if (normQueryCode && (rec.code.includes(normQueryCode) || rec.scoreCode.includes(normQueryCode))) {
        return true;
      }
      const normName = rec.name.toLowerCase();
      const normKana = (rec.nameKana || '').toLowerCase();
      return normName.includes(trimmed) || normKana.includes(trimmed);
    })
    .slice(0, limit);
}

