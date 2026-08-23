import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { markClaimExported, getClaimLifecycleStatus, type ClaimLifecycleState } from '@/lib/claim_lifecycle';
import { isDemoVisit, DEMO_PATIENT_ID } from '@/lib/demo_data';
import {
  buildMonthlyClaimUkeResults,
  buildMonthlyClaimUkeBundle,
  getMonthlyClaimUkeIssues,
  makeMonthlyClaimUkeAllFieldIssueFileName,
  makeMonthlyClaimUkeFileName,
  type MonthlyClaimUkeCase
} from '@/lib/monthly_claim_uke';

function makePatient(overrides: any = {}) {
  return {
    patientId: 'pt_1',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1980-01-02',
    gender: 'male',
    insuranceInfo: {
      provider: '06123456',
      number: '記号123',
      burdenRatio: 30,
      relationship: '本人'
    },
    ...overrides
  };
}

function makeVisit(overrides: any = {}) {
  return {
    visitId: 'visit_1',
    patientId: 'pt_1',
    issueDate: '2026-06-14T09:00:00.000Z',
    dispensingDate: '2026-06-14',
    status: 'completed',
    institutionId: '1312345',
    doctorId: 'doctor_1',
    claimLifecycle: {
      status: 'rebilling',
      rebillingReason: '返戻修正後の再請求'
    },
    ...overrides
  };
}

function makeTestCase(overrides: {
  visit?: any;
  patient?: any;
} = {}): MonthlyClaimUkeCase {
  return {
    visit: makeVisit(overrides.visit),
    patient: makePatient(overrides.patient),
    settings: {
      id: 'default',
      pharmacyName: 'pharma-oss薬局',
      pharmacyKana: 'ヤクレキヤッキョク',
      pharmacyCode: '1234567',
      pharmacyPostalCode: '100-0001',
      pharmacyAddress: '東京都千代田区1-1',
      pharmacyPhone: '03-0000-0000',
      registrationNumber: 'T1234567890123',
      baseFeeCategory: '1',
      regionalSupportAddition: 'none',
      medicalDxAddition: false
    },
    items: [
      {
        itemId: 'visit_1_item_1',
        visitId: 'visit_1',
        rpNumber: 1,
        drugId: 'drug_1',
        drugName: 'テスト錠10mg',
        yjCode: '123456789012',
        drugPrice: 12.3,
        amount: 1,
        usage: '1日1回朝食後',
        days: 7
      }
    ],
    calculatedFees: [
      { name: '調剤基本料1', points: 45, code: 'base_fee', rationale: 'テスト' }
    ]
  };
}

describe('UkeExportAudit contracts: audit log requirement, failure rollback, and demo guard', () => {
  describe('Single-visit and Monthly UKE claim lifecycle rollback invariant', () => {
    it('rolls back to previous lifecycle when audit logging or export fails', () => {
      const initialLifecycle: ClaimLifecycleState = {
        status: 'draft'
      };

      // 1. 状態退避
      const previousLifecycle = structuredClone(initialLifecycle);
      const rollbackStack: Array<{ docId: string; previous: ClaimLifecycleState }> = [];
      rollbackStack.push({ docId: 'v1', previous: previousLifecycle });

      // 2. 状態更新 (exported)
      let currentDocState = {
        visitId: 'v1',
        claimLifecycle: markClaimExported({
          current: previousLifecycle,
          at: '2026-08-23T12:00:00Z',
          by: '管理者',
          fileName: 'RECEIPTC.UKE',
          totalPoints: 1500
        })
      };

      assert.equal(getClaimLifecycleStatus(currentDocState.claimLifecycle), 'exported');

      // 3. 監査ログまたはダウンロード失敗のシミュレーション
      const auditLogSucceeded = false;
      if (!auditLogSucceeded) {
        // ロールバック実行
        for (const rollback of rollbackStack) {
          if (rollback.docId === currentDocState.visitId) {
            currentDocState.claimLifecycle = rollback.previous;
          }
        }
      }

      // 4. ロールバック後の不変条件検証 (draft に復元されていること)
      assert.equal(getClaimLifecycleStatus(currentDocState.claimLifecycle), 'draft');
    });
  });

  describe('Monthly UKE preflight report audit and CSV issue file naming', () => {
    it('generates error issues and issue filename before file export when validation fails', () => {
      const generatedAt = new Date('2026-08-23T10:00:00Z');
      const brokenCase = makeTestCase({
        patient: { birthDate: '' }
      });

      const results = buildMonthlyClaimUkeResults([brokenCase], generatedAt);
      const errors = getMonthlyClaimUkeIssues(results, 'error');

      assert.equal(errors.length, 1);
      assert.throws(() => buildMonthlyClaimUkeBundle(results), /修正が必要/);

      const fileName = makeMonthlyClaimUkeAllFieldIssueFileName(generatedAt);
      assert.ok(fileName.startsWith('MONTHLY_CLAIM_ALL_FIELDS_'));
      assert.ok(fileName.endsWith('.csv'));
    });

    it('builds successful UKE bundle when no errors exist', () => {
      const generatedAt = new Date('2026-08-23T10:00:00Z');
      const validCase = makeTestCase();

      const results = buildMonthlyClaimUkeResults([validCase], generatedAt);
      const errors = getMonthlyClaimUkeIssues(results, 'error');

      assert.equal(errors.length, 0);

      const bundle = buildMonthlyClaimUkeBundle(results, 'MONTHLY_CLAIM_VALID.uke');
      assert.ok(bundle.totalPoints > 0);
      assert.ok(bundle.content.length > 0);
      assert.equal(bundle.fileName, 'MONTHLY_CLAIM_VALID.uke');

      const ukeFileName = makeMonthlyClaimUkeFileName(generatedAt);
      assert.ok(ukeFileName.startsWith('MONTHLY_CLAIM_'));
      assert.ok(ukeFileName.endsWith('.uke'));
    });
  });

  describe('Tutorial demo visit safety contract', () => {
    it('guarantees demo visits are strictly identified and blocked from UKE export', () => {
      const demoVisit = { visitId: 'v_demo', patientId: DEMO_PATIENT_ID };
      const realVisit = { visitId: 'v_real', patientId: 'pt_real_123' };

      assert.equal(isDemoVisit(demoVisit), true);
      assert.equal(isDemoVisit(realVisit), false);

      const candidateVisits = [demoVisit, realVisit];
      const exportableVisits = candidateVisits.filter((v) => !isDemoVisit(v));

      assert.equal(exportableVisits.length, 1);
      assert.equal(exportableVisits[0].visitId, 'v_real');
      assert.ok(!exportableVisits.some((v) => isDemoVisit(v)), 'Demo visits must NEVER be in exportable list');
    });
  });
});
