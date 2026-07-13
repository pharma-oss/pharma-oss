// チュートリアル用デモデータの投入。
// 初回起動時に「デモ患者・受付・処方・在庫(ロット/棚番地/JAN)」を一式そろえ、
// 受付〜ピッキング(GS1照合・不足記録)〜薬歴〜印刷までを実データで練習できるようにする。
// デモは「デモ」接頭辞・固定IDで実データと区別し、何度呼んでも安全(冪等)にする。

import { logAuditAction } from '@/lib/audit';

export const DEMO_PATIENT_ID = 'pt_demo_tutorial';
export const DEMO_INSTITUTION_NAME = 'デモ内科クリニック';
export const DEMO_DRUG_CODE_PREFIX = 'DEMO-';

const DEMO_ALERT_ID = 'alert_demo_tutorial';
// 過去3回分の来局(84日前→56日前→28日前)を投入し、「経過」タブと薬剤履歴で
// 血圧コントロールというプロブレムが回を追って継続管理される様子を見せる。
const DEMO_ROUND1_VISIT_ID = 'v_demo_tutorial_r1';
const DEMO_ROUND1_SOAP_ID = 'soap_demo_tutorial_r1';
const DEMO_ROUND2_VISIT_ID = 'v_demo_tutorial_r2';
const DEMO_ROUND2_SOAP_ID = 'soap_demo_tutorial_r2';
const DEMO_PREVIOUS_VISIT_ID = 'v_demo_tutorial_prev';
const DEMO_PREVIOUS_SOAP_ID = 'soap_demo_tutorial_prev';

interface DemoExtraPatientSpec {
  patientId: string;
  name: string;
  kana: string;
  birthDate: string;
  gender: 'male' | 'female';
  insuranceNumber: string;
  burdenRatio: number;
}

// 患者検索・名寄せの練習用に、受付・処方は持たない軽量なデモ患者を追加する。
// pt_demo_extra_3(一郎)はDEMO_PATIENT_ID(みどり)と同じ生年月日にしてあり、
// 生年月日だけの検索では複数候補が返ることを体験できるようにしている。
const DEMO_EXTRA_PATIENTS: DemoExtraPatientSpec[] = [
  { patientId: 'pt_demo_extra_1', name: 'デモ患者 太郎', kana: 'デモカンジャ タロウ', birthDate: '1990-07-22', gender: 'male', insuranceNumber: '00000001', burdenRatio: 30 },
  { patientId: 'pt_demo_extra_2', name: 'デモ患者 花子', kana: 'デモカンジャ ハナコ', birthDate: '1985-03-15', gender: 'female', insuranceNumber: '00000002', burdenRatio: 30 },
  { patientId: 'pt_demo_extra_3', name: 'デモ患者 一郎', kana: 'デモカンジャ イチロウ', birthDate: '1958-05-12', gender: 'male', insuranceNumber: '00000003', burdenRatio: 20 },
  { patientId: 'pt_demo_extra_4', name: 'デモ患者 陽子', kana: 'デモカンジャ ヨウコ', birthDate: '1972-11-03', gender: 'female', insuranceNumber: '00000004', burdenRatio: 30 },
  { patientId: 'pt_demo_extra_5', name: 'デモ患者 健太', kana: 'デモカンジャ ケンタ', birthDate: '2001-01-30', gender: 'male', insuranceNumber: '00000005', burdenRatio: 30 },
  { patientId: 'pt_demo_extra_6', name: 'デモ患者 美咲', kana: 'デモカンジャ ミサキ', birthDate: '1995-09-18', gender: 'female', insuranceNumber: '00000006', burdenRatio: 30 },
  { patientId: 'pt_demo_extra_7', name: 'デモ患者 大輔', kana: 'デモカンジャ ダイスケ', birthDate: '1965-02-27', gender: 'male', insuranceNumber: '00000007', burdenRatio: 20 },
  { patientId: 'pt_demo_extra_8', name: 'デモ患者 直子', kana: 'デモカンジャ ナオコ', birthDate: '1978-06-09', gender: 'female', insuranceNumber: '00000008', burdenRatio: 30 },
  { patientId: 'pt_demo_extra_9', name: 'デモ患者 蓮', kana: 'デモカンジャ レン', birthDate: '2010-12-05', gender: 'male', insuranceNumber: '00000009', burdenRatio: 10 }
];
const DEMO_EXTRA_PATIENT_IDS = DEMO_EXTRA_PATIENTS.map((patient) => patient.patientId);

// デモ患者に紐づくデータかどうかの判定。
// 請求(月次UKE・UKE出力・外部機器連携)へデモデータを混入させないための単一の判定点。
export function isDemoPatientId(patientId?: string | null): boolean {
  if (!patientId) return false;
  return patientId === DEMO_PATIENT_ID || DEMO_EXTRA_PATIENT_IDS.includes(patientId);
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

interface DemoPastRoundItemSpec {
  drug: DemoDrugSpec;
  amount: number;
  usage: string;
  days: number;
  dosageCategory: 'internal' | 'external' | 'internal_drop';
  rpComment?: string;
}

interface DemoPastRoundProblemSpec {
  title: string;
  entries: { type: 'S' | 'O' | 'A' | 'P'; text: string }[];
}

interface DemoPastRoundSpec {
  visitId: string;
  soapId: string;
  daysAgoCount: number;
  items: DemoPastRoundItemSpec[];
  problems: DemoPastRoundProblemSpec[];
  structuredAssessment: {
    adherence: 'unknown' | 'good' | 'partial' | 'poor';
    leftoverMedicine: 'unknown' | 'none' | 'has';
    adverseEvent: 'unknown' | 'none' | 'has';
    genericChangePreference: 'unknown' | 'accepted' | 'declined' | 'consult';
    medicationNotebook: 'unknown' | 'issued' | 'not_issued';
  };
}

// 過去の完了来局(受付・処方明細・薬歴)を1回分投入する共通処理。
// 3回分の来局を同じ形で並べ、日付だけ変えて「経過」タブの変遷を見せる。
async function seedDemoPastRound(db: any, spec: DemoPastRoundSpec): Promise<void> {
  const visitDate = daysAgo(spec.daysAgoCount);
  const visitDateValue = toDateInputValue(visitDate);

  await db.visits.upsert({
    visitId: spec.visitId,
    patientId: DEMO_PATIENT_ID,
    institutionId: DEMO_INSTITUTION_NAME,
    institutionCode: '',
    institutionName: DEMO_INSTITUTION_NAME,
    departmentName: '内科',
    doctorId: 'デモ 一郎',
    doctorName: 'デモ 一郎',
    prescriptionDate: visitDateValue,
    dispensingDate: visitDateValue,
    issueDate: visitDate.toISOString(),
    status: 'completed'
  });

  await Promise.all(spec.items.map((item, index) => db.prescription_items.upsert({
    itemId: `item_${spec.visitId}_${index + 1}`,
    visitId: spec.visitId,
    rpNumber: index + 1,
    drugId: item.drug.code,
    dispensedDrug: '',
    dispensedDrugCode: '',
    amount: item.amount,
    usage: item.usage,
    days: item.days,
    rpComment: item.rpComment ?? '',
    dosageCategory: item.dosageCategory,
    dosageCategorySource: 'auto',
    isIppoka: false,
    isCrushed: false,
    tokkanType: 'none',
    isPicked: true
  })));

  await db.soap_records.upsert({
    soapId: spec.soapId,
    visitId: spec.visitId,
    authorId: 'demo_tutorial',
    updatedAt: visitDate.toISOString(),
    problems: spec.problems.map((problem, index) => ({
      id: `${spec.soapId}_p${index + 1}`,
      title: problem.title,
      entries: problem.entries
    })),
    structuredAssessment: spec.structuredAssessment
  });
}

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

  // 患者検索・名寄せの練習用。受付・処方は持たない軽量な追加デモ患者9名。
  await Promise.all(DEMO_EXTRA_PATIENTS.map((patient) => db.patients.upsert({
    patientId: patient.patientId,
    name: patient.name,
    kana: patient.kana,
    birthDate: patient.birthDate,
    gender: patient.gender,
    insuranceInfo: {
      provider: 'デモ保険者',
      number: patient.insuranceNumber,
      burdenRatio: patient.burdenRatio
    }
  })));

  // 副作用歴アラート: 2剤目(ロキソプロフェン)に一致し「薬剤師確認」の練習になる。
  // アレルギー(要修正=エラー)ではなく副作用歴(警告)にして、練習の完了フローを止めない。
  await db.alerts.upsert({
    alertId: DEMO_ALERT_ID,
    patientId: DEMO_PATIENT_ID,
    type: 'side_effect',
    content: '過去にロキソプロフェンで胃部不快感（デモ練習用）',
    status: 'active'
  });

  // 過去3回分の来局(84日前→56日前→28日前・いずれも完了済み): 処方履歴タイムライン・
  // 前回Do・薬剤履歴・「経過」タブの練習用。血圧コントロールのプロブレムを3回とも
  // 同じタイトルで書き継ぎ、過去の薬歴から継続管理している様子が見えるようにする。
  // 過去日付の完了受付なので、本日の受付件数や日次締めには影響しない。
  await seedDemoPastRound(db, {
    visitId: DEMO_ROUND1_VISIT_ID,
    soapId: DEMO_ROUND1_SOAP_ID,
    daysAgoCount: 84,
    items: [
      {
        drug: DEMO_DRUGS[0],
        amount: 1,
        usage: '1日1回朝食後',
        days: 28,
        dosageCategory: 'internal'
      }
    ],
    problems: [
      {
        title: '血圧コントロール（デモ）',
        entries: [
          { type: 'S', text: '健診で血圧を指摘され受診。自覚症状は特になし。' },
          { type: 'O', text: '家庭血圧 148/92。飲み忘れが週2〜3回ある。残薬9錠。' },
          { type: 'A', text: '血圧やや高値。アドヒアランス不良が主因と考えられる。' },
          { type: 'P', text: '服薬カレンダーの使用を提案。次回、血圧と残薬を確認。' }
        ]
      }
    ],
    structuredAssessment: {
      adherence: 'poor',
      leftoverMedicine: 'has',
      adverseEvent: 'none',
      genericChangePreference: 'unknown',
      medicationNotebook: 'issued'
    }
  });

  await seedDemoPastRound(db, {
    visitId: DEMO_ROUND2_VISIT_ID,
    soapId: DEMO_ROUND2_SOAP_ID,
    daysAgoCount: 56,
    items: [
      {
        drug: DEMO_DRUGS[0],
        amount: 1,
        usage: '1日1回朝食後',
        days: 28,
        dosageCategory: 'internal'
      },
      {
        drug: DEMO_DRUGS[1],
        amount: 1,
        usage: '1日1回 腰部に貼付',
        days: 14,
        dosageCategory: 'external',
        rpComment: '腰痛時の頓用貼付を追加。経口NSAIDsは胃部不快感の既往があるため外用剤を選択。'
      }
    ],
    problems: [
      {
        title: '血圧コントロール（デモ）',
        entries: [
          { type: 'S', text: '服薬カレンダーを使い始めてから飲み忘れが減った。' },
          { type: 'O', text: '家庭血圧 138/86。残薬2錠まで減少。' },
          { type: 'A', text: 'アドヒアランス改善し血圧も改善傾向。' },
          { type: 'P', text: '現行用量を継続。後発品への変更を提案し了承を得た。' }
        ]
      },
      {
        title: '腰痛（デモ）',
        entries: [
          { type: 'S', text: '数日前から腰痛があり、湿布を希望。' },
          { type: 'O', text: '腰部に圧痛あり、可動域制限なし。' },
          { type: 'A', text: '非特異的腰痛と考えられる。' },
          { type: 'P', text: 'ロキソプロフェンテープを追加。症状が続く場合は受診を検討。' }
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

  await seedDemoPastRound(db, {
    visitId: DEMO_PREVIOUS_VISIT_ID,
    soapId: DEMO_PREVIOUS_SOAP_ID,
    daysAgoCount: 28,
    items: [
      {
        drug: DEMO_DRUGS[0],
        amount: 1,
        usage: '1日1回朝食後',
        days: 28,
        dosageCategory: 'internal'
      }
    ],
    problems: [
      {
        title: '血圧コントロール（デモ）',
        entries: [
          { type: 'S', text: 'めまいはない。飲み忘れは週1回ほど。腰痛は治まった。' },
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
    `チュートリアルデモデータ投入: デモ患者10名(「デモ患者 みどり」の受付・処方3剤・在庫ロット(JAN/棚番地付き)・過去3回分の薬歴・副作用歴アラートに加え、患者検索練習用の軽量デモ患者9名)を登録しました。`,
    DEMO_PATIENT_ID,
    'デモ患者 みどり'
  );

  return { visitId, alreadySeeded: false };
}

const ALL_DEMO_PATIENT_IDS = [DEMO_PATIENT_ID, ...DEMO_EXTRA_PATIENT_IDS];

// デモデータが残っているかの判定。ダッシュボードの片づけ促しバナーに使う。
// 患者・受付・薬品マスタのいずれかにデモ固定IDが残っていれば true。
export async function hasTutorialDemoData(db: any): Promise<boolean> {
  if (!db) return false;
  const demoPatients = await db.patients.find({ selector: { patientId: { $in: ALL_DEMO_PATIENT_IDS } } }).exec();
  if (demoPatients.length > 0) return true;
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
  removedPatients: number;
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
  const demoPatientDocs = await db.patients.find({ selector: { patientId: { $in: ALL_DEMO_PATIENT_IDS } } }).exec();

  const result: CleanupTutorialDemoDataResult = {
    removedPrescriptionItems: await removeDocs(itemDocs),
    removedSoapRecords: await removeDocs(soapDocs),
    removedInterventions: await removeDocs(interventionDocs),
    removedAlerts: await removeDocs(alertDocs),
    removedVisits: await removeDocs(demoVisits),
    removedStocks: await removeDocs(stockDocs),
    removedDrugs: await removeDocs(drugDocs),
    removedPatients: await removeDocs(demoPatientDocs)
  };

  await logAuditAction(
    db,
    'stock_update',
    `チュートリアルデモデータ削除: デモ患者${result.removedPatients}名・受付${result.removedVisits}件・処方${result.removedPrescriptionItems}件・薬歴${result.removedSoapRecords}件・アラート${result.removedAlerts}件・薬品${result.removedDrugs}件・在庫ロット${result.removedStocks}件を削除しました。`,
    DEMO_PATIENT_ID,
    'デモ患者 みどり'
  );

  return result;
}
