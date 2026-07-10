import { test } from 'node:test';
import assert from 'node:assert';
import type { Patient, PrescriptionItem, Visit } from '../db/types.ts';
import {
  buildClaimReturnCorrectionHandoffMemo,
  buildClaimReturnCorrectionAction,
  buildClaimReturnCorrectionSuggestions,
  buildClaimExportSnapshot,
  buildClaimSnapshotDifferenceCsv,
  compareClaimExportSnapshotToCurrent,
  makeClaimSnapshotDifferenceCsvFileName
} from './claim_snapshot.ts';

test('buildClaimExportSnapshot captures patient, insurance, visit, and prescription state', () => {
  const patient: Patient = {
    patientId: 'pt_1',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1980-01-02',
    gender: 'male',
    insuranceInfo: {
      provider: '06123456',
      number: '記号123',
      burdenRatio: 30
    },
    publicInsurances: [
      { provider: '51136018', recipient: '1234567', burdenRatio: 10 }
    ]
  };
  const visit: Visit = {
    visitId: 'visit_1',
    patientId: 'pt_1',
    institutionCode: '1312345670',
    institutionName: '青山内科',
    departmentName: '内科',
    doctorName: '青山 一郎',
    prescriptionDate: '2026-06-13',
    dispensingDate: '2026-06-14',
    issueDate: '2026-06-14T09:00:00.000Z',
    status: 'completed'
  };
  const items: PrescriptionItem[] = [
    {
      itemId: 'item_1',
      visitId: 'visit_1',
      rpNumber: 1,
      drugId: 'drug_1',
      dispensedDrug: 'テスト錠10mg',
      dispensedDrugCode: 'drug_1',
      amount: 1,
      days: 7,
      usage: '1日1回朝食後'
    }
  ];

  const snapshot = buildClaimExportSnapshot({
    visit,
    patient,
    items,
    totalPoints: 147,
    createdAt: '2026-06-14T10:00:00.000Z',
    exportedFileName: 'RECEIPT_1.uke'
  });

  assert.strictEqual(snapshot.patientName, '山田 太郎');
  assert.strictEqual(snapshot.insuranceInfo?.number, '記号123');
  assert.strictEqual(snapshot.publicInsurances?.[0].provider, '51136018');
  assert.strictEqual(snapshot.prescriptionItems[0].drugId, 'drug_1');
  assert.strictEqual(snapshot.totalPoints, 147);
});

test('compareClaimExportSnapshotToCurrent reports changed patient, insurance, prescription, and points', () => {
  const snapshot = buildClaimExportSnapshot({
    visit: {
      visitId: 'visit_1',
      patientId: 'pt_1',
      issueDate: '2026-06-14T09:00:00.000Z',
      status: 'completed'
    },
    patient: {
      patientId: 'pt_1',
      name: '山田 太郎',
      kana: 'ヤマダ タロウ',
      birthDate: '1980-01-02',
      insuranceInfo: {
        provider: '06123456',
        number: '記号123',
        burdenRatio: 30
      }
    },
    items: [
      {
        itemId: 'item_1',
        visitId: 'visit_1',
        drugId: 'drug_1',
        dispensedDrug: 'テスト錠10mg',
        amount: 1,
        days: 7,
        usage: '1日1回朝食後'
      }
    ],
    totalPoints: 147,
    createdAt: '2026-06-14T10:00:00.000Z'
  });

  const differences = compareClaimExportSnapshotToCurrent({
    snapshot,
    patient: {
      patientId: 'pt_1',
      name: '山田 太郎',
      kana: 'ヤマダ タロウ',
      birthDate: '1980-01-02',
      insuranceInfo: {
        provider: '06123456',
        number: '記号999',
        burdenRatio: 20
      }
    },
    items: [
      {
        itemId: 'item_1',
        visitId: 'visit_1',
        drugId: 'drug_2',
        dispensedDrug: '変更後錠5mg',
        amount: 1,
        days: 14,
        usage: '1日1回夕食後'
      }
    ],
    totalPoints: 211
  });

  assert.deepStrictEqual(
    differences.map((difference) => difference.field),
    ['insuranceNumber', 'burdenRatio', 'prescriptionItems', 'totalPoints']
  );
  assert.strictEqual(differences[0].snapshotValue, '記号123');
  assert.strictEqual(differences[0].currentValue, '記号999');
});

test('compareClaimExportSnapshotToCurrent returns empty array when snapshot still matches current state', () => {
  const patient: Patient = {
    patientId: 'pt_1',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1980-01-02',
    insuranceInfo: {
      provider: '06123456',
      number: '記号123',
      burdenRatio: 30
    }
  };
  const items: PrescriptionItem[] = [
    {
      itemId: 'item_1',
      visitId: 'visit_1',
      drugId: 'drug_1',
      dispensedDrug: 'テスト錠10mg',
      amount: 1,
      days: 7,
      usage: '1日1回朝食後'
    }
  ];
  const snapshot = buildClaimExportSnapshot({
    visit: {
      visitId: 'visit_1',
      patientId: 'pt_1',
      issueDate: '2026-06-14T09:00:00.000Z',
      status: 'completed'
    },
    patient,
    items,
    totalPoints: 147,
    createdAt: '2026-06-14T10:00:00.000Z'
  });

  assert.deepStrictEqual(
    compareClaimExportSnapshotToCurrent({ snapshot, patient, items, totalPoints: 147 }),
    []
  );
});

test('buildClaimReturnCorrectionSuggestions groups snapshot differences into return correction actions', () => {
  const suggestions = buildClaimReturnCorrectionSuggestions([
    {
      field: 'insuranceNumber',
      label: '保険記号番号',
      snapshotValue: '記号123',
      currentValue: '記号999'
    },
    {
      field: 'publicInsurances',
      label: '公費',
      snapshotValue: '未設定',
      currentValue: '51136018/1234567'
    },
    {
      field: 'prescriptionItems',
      label: '処方内容',
      snapshotValue: '1薬品（旧薬）',
      currentValue: '1薬品（新薬）'
    },
    {
      field: 'totalPoints',
      label: '合計点数',
      snapshotValue: '147点',
      currentValue: '211点'
    }
  ]);

  assert.deepStrictEqual(
    suggestions.map((suggestion) => suggestion.id),
    ['insurance-master', 'prescription-items', 'claim-points']
  );
  assert.deepStrictEqual(
    suggestions.map((suggestion) => suggestion.actionTarget),
    ['patient-insurance-editor', 'prescription-intervention-record', 'claim-adjust-panel']
  );
  assert.strictEqual(suggestions[0].title, '保険・公費を確認');
  assert.deepStrictEqual(suggestions[0].fields, ['insuranceNumber', 'publicInsurances']);
  assert.match(suggestions[0].differenceSummary, /保険記号番号/);
  assert.strictEqual(suggestions[2].severity, 'warning');
  assert.match(suggestions[2].message, /処方内容の変更により点数が変わっています/);
});

test('buildClaimReturnCorrectionAction maps suggestions to stable correction destinations', () => {
  const suggestions = buildClaimReturnCorrectionSuggestions([
    {
      field: 'patientBirthDate',
      label: '生年月日',
      snapshotValue: '1980-01-02',
      currentValue: '1980-01-20'
    },
    {
      field: 'prescriptionItems',
      label: '処方内容',
      snapshotValue: '1薬品（旧薬）',
      currentValue: '1薬品（新薬）'
    },
    {
      field: 'totalPoints',
      label: '合計点数',
      snapshotValue: '147点',
      currentValue: '211点'
    }
  ]);

  const patientAction = buildClaimReturnCorrectionAction(suggestions[0], 'visit_1');
  const prescriptionAction = buildClaimReturnCorrectionAction(suggestions[1], 'visit_1');
  const pointsAction = buildClaimReturnCorrectionAction(suggestions[2], 'visit_1');

  assert.deepStrictEqual(patientAction, {
    type: 'route',
    pathname: '/emr',
    searchParams: {
      visitId: 'visit_1',
      openInsurance: '1',
      returnCorrection: 'patient-master'
    }
  });
  assert.deepStrictEqual(prescriptionAction, {
    type: 'route',
    pathname: '/emr',
    searchParams: {
      visitId: 'visit_1',
      openIntervention: '1',
      returnCorrection: 'prescription-items',
      reason: suggestions[1].differenceSummary ? `返戻修正候補: ${suggestions[1].differenceSummary}` : ''
    }
  });
  assert.deepStrictEqual(pointsAction, {
    type: 'anchor',
    elementId: 'claim-adjust-panel'
  });
});

test('claim snapshot difference exports CSV and handoff memo for return correction', () => {
  const snapshot = buildClaimExportSnapshot({
    visit: {
      visitId: 'visit_1',
      patientId: 'pt_1',
      issueDate: '2026-06-14T09:00:00.000Z',
      status: 'completed'
    },
    patient: {
      patientId: 'pt_1',
      name: '=山田 太郎',
      kana: 'ヤマダ タロウ',
      birthDate: '1980-01-02',
      insuranceInfo: {
        provider: '06123456',
        number: '記号123',
        burdenRatio: 30
      }
    },
    items: [],
    totalPoints: 147,
    createdAt: '2026-06-14T10:00:00.000Z',
    exportedFileName: 'RECEIPT_1.uke'
  });
  const differences = [
    {
      field: 'insuranceNumber',
      label: '保険記号番号',
      snapshotValue: '記号123',
      currentValue: '記号999'
    },
    {
      field: 'totalPoints',
      label: '合計点数',
      snapshotValue: '147点',
      currentValue: '211点'
    }
  ];
  const suggestions = buildClaimReturnCorrectionSuggestions(differences);
  const csv = buildClaimSnapshotDifferenceCsv({ snapshot, differences, suggestions });
  const memo = buildClaimReturnCorrectionHandoffMemo({ snapshot, differences, suggestions });

  assert.strictEqual(
    makeClaimSnapshotDifferenceCsvFileName(snapshot, new Date(2026, 5, 14, 9, 8, 7)),
    'CLAIM_SNAPSHOT_DIFF_visit_1_20260614_090807.csv'
  );
  assert.match(csv, /^"受付ID","患者ID","患者名","UKEファイル","請求時点","差分項目"/);
  assert.match(csv, /"visit_1","pt_1","'=山田 太郎","RECEIPT_1\.uke","2026-06-14T10:00:00\.000Z","保険記号番号"/);
  assert.match(csv, /"保険・公費を確認","保険・公費を修正","要修正"/);
  assert.match(csv, /"点数を再計算","点数内訳を確認","要修正"/);
  assert.doesNotMatch(csv, /","=山田/);
  assert.match(memo, /^返戻修正メモ/);
  assert.match(memo, /受付ID: visit_1/);
  assert.match(memo, /差分: 2件/);
  assert.match(memo, /保険記号番号: 請求時点「記号123」→ 現在「記号999」/);
  assert.match(memo, /次の対応/);
  assert.match(memo, /保険・公費を確認: 保険・公費を修正/);
});
