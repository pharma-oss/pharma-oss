import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { InsuranceEligibilityIssue } from '@/lib/insurance_eligibility';
import {
  filterReceptionEligibilityAlerts,
  buildCandidatePublicInsuranceSummary
} from './helpers';

describe('OCR Reception Public Insurance & Eligibility helpers', () => {
  describe('buildCandidatePublicInsuranceSummary', () => {
    it('creates summary with legal categories and detects expired status', () => {
      const patient = {
        publicInsurances: [
          {
            provider: '54123456',
            recipient: '1234567',
            burdenRatio: 10,
            startDate: '2025-04-01',
            endDate: '2026-03-31'
          },
          {
            provider: '21987654',
            recipient: '7654321',
            burdenRatio: 10,
            startDate: '2025-04-01',
            endDate: '2026-03-31'
          }
        ]
      };
      const issues: InsuranceEligibilityIssue[] = [
        {
          severity: 'error',
          code: 'public_insurance_expired',
          title: '公費1が期限切れです',
          message: '公費1の有効期限を過ぎています。'
        }
      ];

      const result = buildCandidatePublicInsuranceSummary(patient, issues);
      assert.ok(result, 'Result should not be undefined');
      assert.equal(result.summary, '指定難病 / 精神通院医療');
      assert.equal(result.hasExpired, true);
      assert.equal(result.hasWarning, false);
    });

    it('detects expiring soon warning when no expired issues exist', () => {
      const patient = {
        publicInsurances: [
          {
            provider: '51123456',
            recipient: '1234567',
            burdenRatio: 10,
            startDate: '2026-04-01',
            endDate: '2026-10-15'
          }
        ]
      };
      const issues: InsuranceEligibilityIssue[] = [
        {
          severity: 'warning',
          code: 'public_insurance_expiring_soon',
          title: '公費1の期限が近づいています',
          message: '有効期限まで30日以内です。'
        }
      ];

      const result = buildCandidatePublicInsuranceSummary(patient, issues);
      assert.ok(result);
      assert.equal(result.summary, '特定疾患（指定難病等）');
      assert.equal(result.hasExpired, false);
      assert.equal(result.hasWarning, true);
    });

    it('returns undefined when patient has no public insurances', () => {
      assert.equal(buildCandidatePublicInsuranceSummary({ publicInsurances: [] }, []), undefined);
      assert.equal(buildCandidatePublicInsuranceSummary({ publicInsurances: undefined }, []), undefined);
    });
  });

  describe('filterReceptionEligibilityAlerts', () => {
    it('surfaces public insurance issues and primary insurance expiration issues', () => {
      const allIssues: InsuranceEligibilityIssue[] = [
        {
          severity: 'error',
          code: 'public_insurance_expired',
          title: '公費1が期限切れです',
          message: '公費1の有効期限（2026-03-31）を過ぎています。'
        },
        {
          severity: 'warning',
          code: 'public_insurance_monthly_limit_missing',
          title: '公費1の負担上限が未設定です',
          message: '公費併用請求の自己負担上限を確認してください。'
        },
        {
          severity: 'error',
          code: 'insurance_expired',
          title: '保険資格が期限切れです',
          message: '保険資格の有効期限を過ぎています。'
        },
        {
          severity: 'warning',
          code: 'insurance_eligibility_unchecked',
          title: '資格確認が未実施です',
          message: 'オンライン資格確認または保険証確認日を記録してください。'
        },
        {
          severity: 'warning',
          code: 'insurance_relationship_missing',
          title: '本人・家族区分が未設定です',
          message: '本人か家族かが未記録です。'
        }
      ];

      const surfaced = filterReceptionEligibilityAlerts(allIssues);
      const surfacedCodes = surfaced.map((i) => i.code);

      assert.ok(surfacedCodes.includes('public_insurance_expired'), 'Should include public insurance expired');
      assert.ok(surfacedCodes.includes('public_insurance_monthly_limit_missing'), 'Should include public insurance limit missing');
      assert.ok(surfacedCodes.includes('insurance_expired'), 'Should include insurance expired');
      assert.ok(surfacedCodes.includes('insurance_eligibility_unchecked'), 'Should include unchecked eligibility');
      assert.ok(!surfacedCodes.includes('insurance_relationship_missing'), 'Should exclude minor relationship field warning');
      assert.equal(surfaced.length, 4);
    });

    it('returns empty array when no relevant issues exist', () => {
      const issues: InsuranceEligibilityIssue[] = [
        {
          severity: 'warning',
          code: 'insurance_relationship_unrecognized',
          title: '本人・家族区分を確認してください',
          message: '未標準区分'
        }
      ];
      assert.deepEqual(filterReceptionEligibilityAlerts(issues), []);
    });
  });
});
