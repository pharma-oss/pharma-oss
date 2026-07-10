// チュートリアル用デモデータの投入。
// 初回起動時に「デモ患者・受付・処方・在庫(ロット/棚番地/JAN)」を一式そろえ、
// 受付〜ピッキング(GS1照合・不足記録)〜薬歴〜印刷までを実データで練習できるようにする。
// デモは「デモ」接頭辞・固定IDで実データと区別し、何度呼んでも安全(冪等)にする。

import { logAuditAction } from '@/lib/audit';

export const DEMO_PATIENT_ID = 'pt_demo_tutorial';
export const DEMO_INSTITUTION_NAME = 'デモ内科クリニック';
export const DEMO_DRUG_CODE_PREFIX = 'DEMO-';

const DEMO_ALERT_ID = 'alert_demo_tutorial';
const DEMO_PREVIOUS_VISIT_ID = 'v_demo_tutorial_prev';
const DEMO_PREVIOUS_SOAP_ID = 'soap_demo_tutorial_prev';

// デモ患者に紐づくデータかどうかの判定。
// 請求(月次UKE・UKE出力・外部機器連携)へデモデータを混入させないための単一の判定点。
export function isDemoPatientId(patientId?: string | null): boolean {
  return patientId === DEMO_PATIENT_ID;
}

export function isDemoVisit(visit?: { patientId?: string | null } | null): boolean {
  return isDemoPatientId(visit?.patientId);
}

export function isDemoDrugCode(code?: string | null): boolean {
  return typeof code === 'string' && code.startsWith(DEMO_DRUG_CODE_PREFIX);
}

interface DemoDrugSpec {
  code: string;
  name: string;
  yjCode: string;
  genericName: string;
  price: number;
  location: string;
  janCode: string;
  lotNumber: string;
  expirationDate: string;
  stockQuantity: number;
}

// GS1照合の練習用に、在庫ロットへJANコードを持たせる。
// 3剤目は必要量より在庫を少なくして「不足を記録」の練習ができるようにする。
const DEMO_DRUGS: DemoDrugSpec[] = [
  {
    code: 'DEMO-2171022G1',
    name: '「デモ」アムロジピンOD錠5mg',
    yjCode: '2171022G1023',
    genericName: 'アムロジピンベシル酸塩',
    price: 10.1,
    location: 'A-01',
    janCode: '4987000000011',
    lotNumber: 'DEMO-LOT-A',
    expirationDate: '2028-12-31',
    stockQuantity: 100
  },
  {
    code: 'DEMO-2649943S1',
    name: '「デモ」ロキソプロフェンNaテープ50mg',
    yjCode: '2649943S1096',
    genericName: 'ロキソプロフェンナトリウム水和物',
    price: 17.1,
    location: 'B-03',
    janCode: '4987000000028',
    lotNumber: 'DEMO-LOT-B',
    expirationDate: '2028-06-30',
    stockQuantity: 21
  },
  {
    code: 'DEMO-2359005S1',
    name: '「デモ」ピコスルファートNa内用液0.75%',
    yjCode: '2359005S1310',
    genericName: 'ピコスルファートナトリウム水和物',
    price: 89.4,
    location: 'C-02',
    janCode: '4987000000035',
    lotNumber: 'DEMO-LOT-C',
    expirationDate: '2027-12-31',
    stockQuantity: 1
  }
];

const toDateInputValue = (date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

export interface SeedTutorialDemoDataResult {
  visitId: string;
  alreadySeeded: boolean;
}

export async function seedTutorialDemoData(db: any): Promise<SeedTutorialDemoDataResult> {
  if (!db) throw new Error('データベースが未接続です。');

  // 練習中(処理中)のデモ受付があればそれを再利用する
  const existingVisits = await db.visits.find({
    selector: { patientId: DEMO_PATIENT_ID, status: 'processing' }
  }).exec();
  if (existingVisits.length > 0) {
    return { visitId: existingVisits[0].visitId, alreadySeeded: true };
  }

  // 薬品マスタ・在庫ロット(JAN/棚番地付き)は毎回上書きで整える
  const drugUpserts = DEMO_DRUGS.map((drug) => db.drugs.upsert({
    code: drug.code,
    name: drug.name,
    yjCode: drug.yjCode,
    isGeneric: true,
    genericName: drug.genericName,
    isAbolished: false,
    price: drug.price,
    stockQuantity: drug.stockQuantity,
    location: drug.location
  }));
  const stockUpserts = DEMO_DRUGS.map((drug) => db.drug_stocks.upsert({
    id: `stock_demo_${drug.code}`,
    drugCode: drug.code,
    janCode: drug.janCode,
    lotNumber: drug.lotNumber,
    expirationDate: drug.expirationDate,
    quantity: drug.stockQuantity,
    arrivalDate: toDateInputValue(),
    supplier: 'デモ卸'
  }));
  await Promise.all([...drugUpserts, ...stockUpserts]);

  await db.patients.upsert({
    patientId: DEMO_PATIENT_ID,
    name: 'デモ患者 みどり',
    kana: 'デモカンジャ ミドリ',
    birthDate: '1958-05-12',
    gender: 'female',
    insuranceInfo: {
      provider: 'デモ保険者',
      number: '00000000',
      burdenRatio: 30
    }
  });

  // 副作用歴アラート: 2剤目(ロキソプロフェン)に一致し「薬剤師確認」の練習になる。
  // アレルギー(要修正=エラー)ではなく副作用歴(警告)にして、練習の完了フローを止めない。
  await db.alerts.upsert({
    alertId: DEMO_ALERT_ID,
    patientId: DEMO_PATIENT_ID,
    type: 'side_effect',
    content: '過去にロキソプロフェンで胃部不快感（デモ練習用）',
    status: 'active'
  });

  // 前回来局(28日前・完了済み): 処方履歴タイムライン・前回Do・前回薬歴参照の練習用。
  // 過去日付の完了受付なので、本日の受付件数や日次締めには影響しない。
  const previousDate = daysAgo(28);
  const previousDateValue = toDateInputValue(previousDate);
  await db.visits.upsert({
    visitId: DEMO_PREVIOUS_VISIT_ID,
    patientId: DEMO_PATIENT_ID,
    institutionId: DEMO_INSTITUTION_NAME,
    institutionCode: '',
    institutionName: DEMO_INSTITUTION_NAME,
    departmentName: '内科',
    doctorId: 'デモ 一郎',
    doctorName: 'デモ 一郎',
    prescriptionDate: previousDateValue,
    dispensingDate: previousDateValue,
    issueDate: previousDate.toISOString(),
    status: 'completed'
  });
  await db.prescription_items.upsert({
    itemId: `item_${DEMO_PREVIOUS_VISIT_ID}_1`,
    visitId: DEMO_PREVIOUS_VISIT_ID,
    rpNumber: 1,
    drugId: DEMO_DRUGS[0].code,
    dispensedDrug: DEMO_DRUGS[0].name,
    dispensedDrugCode: '',
    amount: 1,
    usage: '1日1回朝食後',
    days: 28,
    rpComment: '',
    dosageCategory: 'internal',
    dosageCategorySource: 'auto',
    isIppoka: false,
    isCrushed: false,
    tokkanType: 'none',
    isPicked: true
  });
  await db.soap_records.upsert({
    soapId: DEMO_PREVIOUS_SOAP_ID,
    visitId: DEMO_PREVIOUS_VISIT_ID,
    authorId: 'demo_tutorial',
    updatedAt: previousDate.toISOString(),
    problems: [
      {
        id: `${DEMO_PREVIOUS_SOAP_ID}_p1`,
        title: '血圧コントロール（デモ）',
        entries: [
          { type: 'S', text: 'めまいはない。飲み忘れは週1回ほど。' },
          { type: 'O', text: '家庭血圧 132/84。残薬2錠。' },
          { type: 'A', text: 'アドヒアランス概ね良好。継続で問題なし。' },
          { type: 'P', text: '飲み忘れ時は気づいた時点で1回分。次回残薬確認。' }
        ]
      }
    ],
    structuredAssessment: {
      adherence: 'good',
      leftoverMedicine: 'has',
      adverseEvent: 'none',
      genericChangePreference: 'accepted',
      medicationNotebook: 'issued'
    }
  });

  // 完了済みの練習が残っていても、新しい受付IDで再度練習できるようにする
  const seedTag = Date.now().toString(36);
  const visitId = `v_demo_${seedTag}`;
  const today = toDateInputValue();
  await db.visits.insert({
    visitId,
    patientId: DEMO_PATIENT_ID,
    institutionId: DEMO_INSTITUTION_NAME,
    institutionCode: '',
    institutionName: DEMO_INSTITUTION_NAME,
    departmentName: '内科',
    doctorId: 'デモ 一郎',
    doctorName: 'デモ 一郎',
    prescriptionDate: today,
    dispensingDate: today,
    issueDate: new Date().toISOString(),
    status: 'processing'
  });

  const itemsResult = await db.prescription_items.bulkInsert([
    {
      itemId: `item_demo_${seedTag}_1`,
      visitId,
      rpNumber: 1,
      drugId: DEMO_DRUGS[0].code,
      dispensedDrug: DEMO_DRUGS[0].name,
      dispensedDrugCode: '',
      amount: 1,
      usage: '1日1回朝食後',
      days: 14,
      rpComment: '',
      dosageCategory: 'internal',
      dosageCategorySource: 'auto',
      isIppoka: false,
      isCrushed: false,
      tokkanType: 'none'
    },
    {
      itemId: `item_demo_${seedTag}_2`,
      visitId,
      rpNumber: 2,
      drugId: DEMO_DRUGS[1].code,
      dispensedDrug: DEMO_DRUGS[1].name,
      dispensedDrugCode: '',
      amount: 1,
      usage: '1日1回 腰部に貼付',
      days: 14,
      rpComment: '',
      dosageCategory: 'external',
      dosageCategorySource: 'auto',
      isIppoka: false,
      isCrushed: false,
      tokkanType: 'none'
    },
    {
      itemId: `item_demo_${seedTag}_3`,
      visitId,
      rpNumber: 3,
      drugId: DEMO_DRUGS[2].code,
      dispensedDrug: DEMO_DRUGS[2].name,
      dispensedDrugCode: '',
      amount: 2,
      usage: '便秘時 就寝前に10滴',
      days: 1,
      rpComment: '在庫が必要量より少ないため、不足記録の練習に使えます。',
      dosageCategory: 'internal_drop',
      dosageCategorySource: 'auto',
      isIppoka: false,
      isCrushed: false,
      tokkanType: 'none'
    }
  ]);
  if (itemsResult?.error?.length > 0) {
    console.error('Failed to seed demo prescription items:', itemsResult.error);
    throw new Error('デモ処方明細の投入に失敗しました。');
  }

  await logAuditAction(
    db,
    'stock_update',
    `チュートリアルデモデータ投入: デモ患者「デモ患者 みどり」の受付・処方3剤・在庫ロット(JAN/棚番地付き)・前回薬歴・副作用歴アラートを登録しました。`,
    DEMO_PATIENT_ID,
    'デモ患者 みどり'
  );

  return { visitId, alreadySeeded: false };
}

// デモデータが残っているかの判定。ダッシュボードの片づけ促しバナーに使う。
// 患者・受付・薬品マスタのいずれかにデモ固定IDが残っていれば true。
export async function hasTutorialDemoData(db: any): Promise<boolean> {
  if (!db) return false;
  const patientDoc = await db.patients.findOne(DEMO_PATIENT_ID).exec();
  if (patientDoc) return true;
  const demoVisits = await db.visits.find({ selector: { patientId: DEMO_PATIENT_ID } }).exec();
  if (demoVisits.length > 0) return true;
  const demoDrugs = await db.drugs.find({ selector: { code: { $in: DEMO_DRUGS.map((drug) => drug.code) } } }).exec();
  return demoDrugs.length > 0;
}

export interface CleanupTutorialDemoDataResult {
  removedVisits: number;
  removedPrescriptionItems: number;
  removedSoapRecords: number;
  removedInterventions: number;
  removedAlerts: number;
  removedDrugs: number;
  removedStocks: number;
  removedPatient: boolean;
}

const getDocValue = (doc: any, key: string): any => (
  typeof doc?.get === 'function' ? doc.get(key) : doc?.[key]
);

async function removeDocs(docs: any[]): Promise<number> {
  let removed = 0;
  for (const doc of docs) {
    await doc.remove();
    removed++;
  }
  return removed;
}

// 練習が終わったデモ患者・受付・薬歴・在庫一式を削除する。
// 実データはデモ固定ID・「DEMO-」接頭辞に一致しないため影響しない。何度呼んでも安全。
export async function cleanupTutorialDemoData(db: any): Promise<CleanupTutorialDemoDataResult> {
  if (!db) throw new Error('データベースが未接続です。');

  const demoVisits = await db.visits.find({ selector: { patientId: DEMO_PATIENT_ID } }).exec();
  const demoVisitIds = demoVisits.map((doc: any) => getDocValue(doc, 'visitId')).filter(Boolean);

  const [itemDocs, soapDocs, interventionDocs] = await Promise.all([
    demoVisitIds.length > 0
      ? db.prescription_items.find({ selector: { visitId: { $in: demoVisitIds } } }).exec()
      : Promise.resolve([]),
    demoVisitIds.length > 0
      ? db.soap_records.find({ selector: { visitId: { $in: demoVisitIds } } }).exec()
      : Promise.resolve([]),
    demoVisitIds.length > 0
      ? db.interventions.find({ selector: { visitId: { $in: demoVisitIds } } }).exec()
      : Promise.resolve([])
  ]);
  const alertDocs = await db.alerts.find({ selector: { patientId: DEMO_PATIENT_ID } }).exec();
  const demoDrugCodes = DEMO_DRUGS.map((drug) => drug.code);
  const drugDocs = await db.drugs.find({ selector: { code: { $in: demoDrugCodes } } }).exec();
  const stockDocs = await db.drug_stocks.find({ selector: { drugCode: { $in: demoDrugCodes } } }).exec();
  const patientDoc = await db.patients.findOne(DEMO_PATIENT_ID).exec();

  const result: CleanupTutorialDemoDataResult = {
    removedPrescriptionItems: await removeDocs(itemDocs),
    removedSoapRecords: await removeDocs(soapDocs),
    removedInterventions: await removeDocs(interventionDocs),
    removedAlerts: await removeDocs(alertDocs),
    removedVisits: await removeDocs(demoVisits),
    removedStocks: await removeDocs(stockDocs),
    removedDrugs: await removeDocs(drugDocs),
    removedPatient: false
  };
  if (patientDoc) {
    await patientDoc.remove();
    result.removedPatient = true;
  }

  await logAuditAction(
    db,
    'stock_update',
    `チュートリアルデモデータ削除: デモ患者・受付${result.removedVisits}件・処方${result.removedPrescriptionItems}件・薬歴${result.removedSoapRecords}件・アラート${result.removedAlerts}件・薬品${result.removedDrugs}件・在庫ロット${result.removedStocks}件を削除しました。`,
    DEMO_PATIENT_ID,
    'デモ患者 みどり'
  );

  return result;
}
