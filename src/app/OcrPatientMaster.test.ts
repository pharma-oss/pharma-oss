import { test } from 'node:test';
import assert from 'node:assert';
import { describePatientMasterChanges } from '@/lib/patient_master_update';
import { buildOcrConfidenceReport } from '@/lib/ocr_confidence';
import { buildPatientCandidateMatches } from '@/lib/patient_matching';
import {
  buildPatientMergePlan,
  buildPatientMergeExecutionPlan
} from '@/lib/patient_merge';
import { toPatientEligibilityStatus } from '@/app/ocr/helpers';
import type { PatientCandidate } from '@/hooks/useOcrPatientEligibility';

test('患者マスター更新差分の計算と資格確認ステータス変換が正しく機能する', () => {
  const current = {
    name: '山田 太郎',
    birthDate: '1985-03-15',
    insuranceInfo: { number: '12345678', burdenRatio: 30 }
  };
  const updated = {
    name: '山田 太郎',
    birthDate: '1985-03-15',
    insuranceInfo: { number: '12345678', burdenRatio: 20 }
  };

  const changes = describePatientMasterChanges(current as any, updated as any);
  assert.ok(changes.some((c) => c.includes('負担割合') || c.includes('30') || c.includes('20')));

  // 資格確認ステータス変換
  assert.strictEqual(toPatientEligibilityStatus('confirmed'), 'valid');
  assert.strictEqual(toPatientEligibilityStatus('warning'), 'warning');
  assert.strictEqual(toPatientEligibilityStatus('unavailable'), 'unavailable');
  assert.strictEqual(toPatientEligibilityStatus('unchecked'), undefined);
});

test('OCR信頼度レポートが処方データとOCRテキストから正しく生成される', () => {
  const report = buildOcrConfidenceReport({
    ocrText: '処方箋\n患者氏名: 山田 太郎\n生年月日: 1985-03-15\n保険者番号: 12345678\nアムロジピン錠5mg 1錠 1日1回朝食後 14日分',
    patientName: '山田 太郎',
    patientBirthDate: '1985-03-15',
    insuranceNumber: '12345678',
    institutionName: 'テストクリニック',
    departmentName: '内科',
    doctorName: 'テスト医師',
    prescriptions: [
      {
        drugName: 'アムロジピン錠5mg',
        amount: '1',
        usage: '1日1回朝食後',
        days: '14'
      }
    ]
  });

  assert.ok(report.score >= 0 && report.score <= 100);
  assert.ok(['green', 'amber', 'red'].includes(report.tone));
  assert.ok(Array.isArray(report.evidence));
  assert.ok(Array.isArray(report.reviewPoints));
});

test('患者候補の一致理由と要確認メッセージが正しく導出される', () => {
  const mockCandidates: PatientCandidate[] = [
    {
      patientId: 'P001',
      name: '山田 太郎',
      kana: 'ヤマダ タロウ',
      birthDate: '1985-03-15',
      gender: 'male',
      insuranceInfo: { number: '12345678' }
    } as unknown as PatientCandidate
  ];

  const matches = buildPatientCandidateMatches(mockCandidates, {
    name: '山田 太郎',
    birthDate: '1985-03-15',
    insuranceNumber: '12345678'
  }, 5);

  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].patient.patientId, 'P001');
  assert.ok(matches[0].reasonLabels.length >= 1);
});

test('同姓同名患者の統合計画と実行計画が正常に生成される', () => {
  const source = {
    patientId: 'P_OLD',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1985-03-15',
    gender: 'male'
  } as any;
  const target = {
    patientId: 'P_NEW',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1985-03-15',
    gender: 'male'
  } as any;

  const plan = buildPatientMergePlan({
    targetPatient: target,
    sourcePatient: source,
    sourceVisits: [{ visitId: 'V001' }],
    sourceAlerts: [{ alertId: 'A001' }]
  });
  assert.ok(plan);
  assert.strictEqual(plan.sourcePatientId, 'P_OLD');
  assert.strictEqual(plan.targetPatientId, 'P_NEW');

  const executionPlan = buildPatientMergeExecutionPlan(plan);
  assert.ok(executionPlan.applyOperations.length > 0);
});
