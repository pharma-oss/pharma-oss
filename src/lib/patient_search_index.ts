import CryptoJS from 'crypto-js';
import type { Patient, PharmacyDatabase } from '../db/types';
import { parseFlexibleDateInput } from './date_input';
import { searchPatients } from './patient_search';

/**
 * 暗号化患者マスタ（PATIENT_SCHEMA v5）向けの鍵付きブラインドインデックス。
 *
 * 氏名・フリガナ・生年月日の平文は IndexedDB に一切出さず（金科玉条 第二条）、
 * DB 暗号鍵からドメイン分離した HMAC-SHA256 ダイジェストだけを非暗号化スカラー索引に保持する。
 * 鍵ごとの短い識別子（searchIndexVersion: `v1:<8hex>`）を併記するため、
 * 旧 v4 データ・別鍵バックアップ復元・サテライト同期データでも安全に自動再索引・フォールバックできる。
 */

export const PATIENT_BLIND_INDEX_FORMAT = 'v1';

export interface PatientBlindIndexFields {
  searchIndexVersion: string;
  birthDateHash?: string;
  namePrefixHash?: string;
  kanaPrefixHash?: string;
  givenNamePrefixHash?: string;
  givenKanaPrefixHash?: string;
}

const dbBlindIndexKeyMap = new WeakMap<object, string>();

export function derivePatientSearchIndexKey(dbPassword: string): string {
  return CryptoJS.HmacSHA256('yakureki:patient-blind-index:key:v1', dbPassword).toString(CryptoJS.enc.Hex);
}

export function getPatientSearchIndexVersionTag(hmacKey: string): string {
  const keyId = CryptoJS.HmacSHA256('yakureki:patient-blind-index:key-id:v1', hmacKey)
    .toString(CryptoJS.enc.Hex)
    .slice(0, 8);
  return `${PATIENT_BLIND_INDEX_FORMAT}:${keyId}`;
}

export function registerPatientSearchIndexKey(db: object, dbPassword: string): string {
  const hmacKey = derivePatientSearchIndexKey(dbPassword);
  dbBlindIndexKeyMap.set(db, hmacKey);
  return hmacKey;
}

export function getRegisteredPatientSearchIndexKey(db: object | null | undefined): string | undefined {
  if (!db) return undefined;
  return dbBlindIndexKeyMap.get(db);
}

function normalizeBlindIndexText(value: string | undefined): string {
  return (value || '')
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60))
    .toLowerCase();
}

function extractFirstCharacter(normalized: string): string {
  const compact = normalized.replace(/\s+/g, '');
  if (!compact) return '';
  return Array.from(compact)[0] || '';
}

function extractGivenPartFirstCharacter(normalized: string): string {
  const parts = normalized.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return '';
  return Array.from(parts[1])[0] || '';
}

export function normalizeBirthDateDigits(value: string | undefined): string {
  const parsed = parseFlexibleDateInput(value || '');
  if (parsed) return parsed.replace(/-/g, '');
  const digits = (value || '').normalize('NFKC').replace(/\D/g, '');
  return digits.length === 8 ? digits : '';
}

function computeBlindDigest(hmacKey: string, domain: string, value: string): string | undefined {
  if (!value) return undefined;
  return CryptoJS.HmacSHA256(`${domain}:${value}`, hmacKey).toString(CryptoJS.enc.Hex);
}

export function computePatientBlindIndexFields(
  patient: Pick<Patient, 'name' | 'kana' | 'birthDate'>,
  hmacKey: string
): PatientBlindIndexFields {
  const normalizedName = normalizeBlindIndexText(patient.name);
  const normalizedKana = normalizeBlindIndexText(patient.kana);
  const birthDigits = normalizeBirthDateDigits(patient.birthDate);

  const fields: PatientBlindIndexFields = {
    searchIndexVersion: getPatientSearchIndexVersionTag(hmacKey)
  };

  const birthDateHash = computeBlindDigest(hmacKey, 'birthDate', birthDigits);
  if (birthDateHash) fields.birthDateHash = birthDateHash;

  const namePrefixHash = computeBlindDigest(hmacKey, 'nameInitial', extractFirstCharacter(normalizedName));
  if (namePrefixHash) fields.namePrefixHash = namePrefixHash;

  const kanaPrefixHash = computeBlindDigest(hmacKey, 'kanaInitial', extractFirstCharacter(normalizedKana));
  if (kanaPrefixHash) fields.kanaPrefixHash = kanaPrefixHash;

  const givenNamePrefixHash = computeBlindDigest(
    hmacKey,
    'givenNameInitial',
    extractGivenPartFirstCharacter(normalizedName)
  );
  if (givenNamePrefixHash) fields.givenNamePrefixHash = givenNamePrefixHash;

  const givenKanaPrefixHash = computeBlindDigest(
    hmacKey,
    'givenKanaInitial',
    extractGivenPartFirstCharacter(normalizedKana)
  );
  if (givenKanaPrefixHash) fields.givenKanaPrefixHash = givenKanaPrefixHash;

  return fields;
}

export function applyPatientBlindIndexToDocData(
  docData: Partial<Patient> & Pick<Patient, 'name' | 'kana' | 'birthDate'>,
  hmacKey: string
): void {
  const fields = computePatientBlindIndexFields(docData, hmacKey);
  docData.searchIndexVersion = fields.searchIndexVersion;
  if (fields.birthDateHash) docData.birthDateHash = fields.birthDateHash;
  else delete docData.birthDateHash;
  if (fields.namePrefixHash) docData.namePrefixHash = fields.namePrefixHash;
  else delete docData.namePrefixHash;
  if (fields.kanaPrefixHash) docData.kanaPrefixHash = fields.kanaPrefixHash;
  else delete docData.kanaPrefixHash;
  if (fields.givenNamePrefixHash) docData.givenNamePrefixHash = fields.givenNamePrefixHash;
  else delete docData.givenNamePrefixHash;
  if (fields.givenKanaPrefixHash) docData.givenKanaPrefixHash = fields.givenKanaPrefixHash;
  else delete docData.givenKanaPrefixHash;
}

export interface PatientHookableCollectionLike {
  preInsert: (fn: (plainData: Patient) => void, parallel: boolean) => void;
  preSave: (fn: (plainData: Patient) => void, parallel: boolean) => void;
}

export function attachPatientSearchIndexHooks(
  patientsCollection: PatientHookableCollectionLike,
  hmacKey: string
): void {
  patientsCollection.preInsert((plainData) => {
    applyPatientBlindIndexToDocData(plainData, hmacKey);
  }, false);
  patientsCollection.preSave((plainData) => {
    applyPatientBlindIndexToDocData(plainData, hmacKey);
  }, false);
}

export function buildPatientBlindIndexSelector(
  query: string,
  hmacKey: string
): Record<string, unknown> | null {
  const rawTokens = query.normalize('NFKC').trim().split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return null;

  // 1. 生年月日 8 桁（または YYYY-MM-DD / YYYY/M/D 等）がクエリに含まれる場合、最も選択性の高い birthDateHash を最優先で使う
  for (const raw of rawTokens) {
    const birthDigits = normalizeBirthDateDigits(raw);
    if (birthDigits) {
      const birthDateHash = computeBlindDigest(hmacKey, 'birthDate', birthDigits);
      if (birthDateHash) {
        return { birthDateHash };
      }
    }
  }

  // 2. 氏名・カナ先頭文字のブラインドインデックス（姓または名の先頭一致）
  const firstTextToken = rawTokens.find((raw) => !/^[\d\-/.]+$/.test(raw));
  if (!firstTextToken) return null;

  const initialChar = extractFirstCharacter(normalizeBlindIndexText(firstTextToken));
  if (!initialChar) return null;

  const orClauses: Array<Record<string, string>> = [];
  const nameInitial = computeBlindDigest(hmacKey, 'nameInitial', initialChar);
  const kanaInitial = computeBlindDigest(hmacKey, 'kanaInitial', initialChar);
  const givenNameInitial = computeBlindDigest(hmacKey, 'givenNameInitial', initialChar);
  const givenKanaInitial = computeBlindDigest(hmacKey, 'givenKanaInitial', initialChar);
  if (nameInitial) orClauses.push({ namePrefixHash: nameInitial });
  if (kanaInitial) orClauses.push({ kanaPrefixHash: kanaInitial });
  if (givenNameInitial) orClauses.push({ givenNamePrefixHash: givenNameInitial });
  if (givenKanaInitial) orClauses.push({ givenKanaPrefixHash: givenKanaInitial });

  return orClauses.length > 0 ? { $or: orClauses } : null;
}

export async function backfillPatientSearchIndexes(
  db: Pick<PharmacyDatabase, 'patients'>,
  hmacKey: string,
  batchSize = 200
): Promise<number> {
  const versionTag = getPatientSearchIndexVersionTag(hmacKey);
  let updatedCount = 0;

  while (true) {
    const docs = await db.patients.find({
      selector: {
        searchIndexVersion: { $ne: versionTag }
      },
      limit: batchSize
    }).exec();

    if (docs.length === 0) break;

    for (const doc of docs) {
      const json = doc.toJSON() as Patient;
      const fields = computePatientBlindIndexFields(json, hmacKey);
      await doc.incrementalPatch(fields);
      updatedCount += 1;
    }

    if (docs.length < batchSize) break;
  }

  return updatedCount;
}

export interface SearchPatientsBlindIndexResult {
  patients: Patient[];
  usedBlindIndex: boolean;
}

/**
 * ブラインドインデックスを優先して暗号化患者を検索する。
 *
 * - 全患者の索引が現行鍵で揃っている場合、IndexedDB レベルで候補を絞ってから復号・精査する。
 * - 部分文字列（例: 「山田」に対する「田」）等で索引ヒットが 0 件だった場合、または未索引レコードが残っている場合は
 *   安全に全件検索へフォールバックし、既存の部分一致検索の取りこぼしを防ぐ。
 */
export async function searchPatientsViaBlindIndex(
  db: Pick<PharmacyDatabase, 'patients'>,
  query: string,
  limit = 8,
  explicitHmacKey?: string
): Promise<SearchPatientsBlindIndexResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { patients: [], usedBlindIndex: false };
  }

  const hmacKey = explicitHmacKey ?? getRegisteredPatientSearchIndexKey(db);
  if (hmacKey) {
    const selector = buildPatientBlindIndexSelector(trimmed, hmacKey);
    if (selector) {
      const versionTag = getPatientSearchIndexVersionTag(hmacKey);
      const unindexedDoc = await db.patients.findOne({
        selector: { searchIndexVersion: { $ne: versionTag } }
      }).exec();

      if (!unindexedDoc) {
        const candidateDocs = await db.patients.find({ selector }).exec();
        const candidates = candidateDocs.map((doc) => (
          typeof doc?.toJSON === 'function' ? doc.toJSON() : doc
        ) as Patient);
        const matches = searchPatients(candidates, trimmed, limit).map((m) => m.patient);
        if (matches.length > 0) {
          return { patients: matches, usedBlindIndex: true };
        }
        // 生年月日8桁など完全一致条件で0件なら他レコードにも一致しないため全件復号を省略できる
        if ('birthDateHash' in selector) {
          return { patients: [], usedBlindIndex: true };
        }
      }
    }
  }

  const allDocs = await db.patients.find().exec();
  const allPatients = (allDocs || []).map((doc) => (
    typeof doc?.toJSON === 'function' ? doc.toJSON() : doc
  ) as Patient);
  const matches = searchPatients(allPatients, trimmed, limit).map((m) => m.patient);
  return { patients: matches, usedBlindIndex: false };
}
