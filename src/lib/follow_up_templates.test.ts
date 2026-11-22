import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  EMR_FOLLOW_UP_AUDIT_FAILED_MESSAGE,
  buildDrugFollowUpTemplatePresets,
  buildEmrFollowUpSchedulePatch,
  buildGuidanceSoapInsertDetail,
  createUnconfirmedSoapEntryFromGuidance,
  normalizeFollowUpDueDate,
  saveEmrFollowUpSchedule
} from './follow_up_templates.ts';
import { buildAutoTracingReportDraft } from './tracing_report.ts';
import { calculateDashboardFollowUpCandidates } from './dashboard_tasks.ts';
import { AuditLogFailedError } from './audit_guard.ts';
import { EmrFollowUpCard } from '../app/emr/components/EmrFollowUpCard';
import { MedicationGuidanceModal } from '../app/emr/components/MedicationGuidanceModal';

describe('F-1: follow-up and drug guidance templates', () => {
  it('builds structured follow-up presets covering leftover, adverse event, adherence, and next check', () => {
    const presets = buildDrugFollowUpTemplatePresets('アムロジピン錠5mg');
    assert.deepEqual(
      presets.map((p) => p.category),
      ['leftover', 'adverse_event', 'adherence', 'next_check']
    );
    assert.deepEqual(presets.map((p) => p.type), ['S', 'A', 'O', 'P']);
    for (const preset of presets) {
      assert.ok(preset.text.includes('アムロジピン錠5mg'));
      assert.ok(preset.defaultNextAction.includes('アムロジピン錠5mg'));
    }

    const fallbackPresets = buildDrugFollowUpTemplatePresets('');
    assert.ok(fallbackPresets[0].text.includes('処方薬'));
  });

  it('always marks template SOAP insertions as unconfirmed ai_draft and excludes them from tracing reports until confirmed (Rule 1)', () => {
    const detail = buildGuidanceSoapInsertDetail({
      type: 'P',
      text: '残薬確認: 次回来局時に残薬数を確認する。',
      sourceKey: 'followup-leftover'
    });
    assert.equal(detail.origin, 'ai_draft');
    assert.equal(detail.aiStatus, 'unconfirmed');
    assert.equal(detail.type, 'P');
    assert.match(detail.aiDraftId, /^guidance-p-followup-leftover$/);

    const entry = createUnconfirmedSoapEntryFromGuidance(detail);
    const tracingDraft = buildAutoTracingReportDraft({
      patientName: '山田 太郎',
      soapProblems: [
        {
          title: '高血圧',
          entries: [
            entry,
            { type: 'A', text: '薬剤師確認済み評価', origin: 'manual' }
          ]
        }
      ]
    });
    assert.ok(!(tracingDraft.proposal || '').includes('残薬確認: 次回来局時に残薬数を確認する'));
    assert.ok((tracingDraft.assessment || '').includes('薬剤師確認済み評価'));
  });

  it('builds visit.followUp patches that surface directly in dashboard follow-up candidates', () => {
    const basis = new Date(2026, 10, 22, 9, 0, 0);
    assert.equal(normalizeFollowUpDueDate('', basis), '2026-11-29');
    assert.equal(normalizeFollowUpDueDate('2026-12-01', basis), '2026-12-01');

    const followUp = buildEmrFollowUpSchedulePatch({
      reasonFlags: ['残薬確認', '副作用確認', '残薬確認'],
      nextAction: '7日後に残薬数とめまいの有無を電話確認',
      dueDate: '2026-11-29',
      contactMethod: 'phone',
      nowIso: '2026-11-22T00:00:00.000Z',
      basisDate: basis
    });
    assert.equal(followUp.status, 'open');
    assert.deepEqual(followUp.reasonFlags, ['残薬確認', '副作用確認']);
    assert.equal(followUp.dueDate, '2026-11-29');
    assert.equal(followUp.contactMethod, 'phone');

    const dashboardResult = calculateDashboardFollowUpCandidates({
      completedVisits: [
        {
          visitId: 'v_followup_1',
          patientId: 'pt_1',
          issueDate: '2026-11-22T09:00:00.000Z',
          followUp
        }
      ],
      itemsByVisitId: new Map([['v_followup_1', [{ visitId: 'v_followup_1', drugId: 'd1', amount: 1, days: 14 }]]]),
      alertsByPatientId: new Map(),
      drugMap: new Map([['d1', { code: 'd1', name: '通常薬' }]]),
      interventionVisitIds: new Set(),
      patientMap: new Map([['pt_1', { name: '佐藤 花子' }]]),
      basisDate: basis
    });

    assert.equal(dashboardResult.followUpDueCount, 1);
    assert.equal(dashboardResult.followUpCandidates.length, 1);
    assert.equal(dashboardResult.followUpCandidates[0].dueDate, '2026-11-29');
    assert.equal(dashboardResult.followUpCandidates[0].suggestedAction, '7日後に残薬数とめまいの有無を電話確認');
    assert.ok(dashboardResult.followUpCandidates[0].reasonFlags.includes('残薬確認'));
    assert.ok(dashboardResult.followUpCandidates[0].reasonFlags.includes('副作用確認'));
  });

  it('saveEmrFollowUpSchedule records audit log and rolls back on audit failure', async () => {
    let storedFollowUp: unknown = { status: 'open', dueDate: '2026-11-20', nextAction: '旧予定' };
    const visitDoc = {
      patch: async (values: Record<string, unknown>) => {
        storedFollowUp = values.followUp;
      },
      incrementalPatch: async (values: Record<string, unknown>) => {
        storedFollowUp = values.followUp;
      }
    };
    const nextPatch = buildEmrFollowUpSchedulePatch({
      reasonFlags: ['副作用確認'],
      nextAction: '新予定',
      dueDate: '2026-11-30',
      contactMethod: 'visit',
      nowIso: '2026-11-22T00:00:00.000Z'
    });

    const auditedMessages: string[] = [];
    await saveEmrFollowUpSchedule({
      visitDoc,
      previousFollowUp: storedFollowUp as NonNullable<Parameters<typeof saveEmrFollowUpSchedule>[0]['previousFollowUp']>,
      followUpPatch: nextPatch,
      logAudit: async (detail) => {
        auditedMessages.push(detail);
        return true;
      }
    });
    assert.equal((storedFollowUp as { nextAction?: string }).nextAction, '新予定');
    assert.equal(auditedMessages.length, 1);
    assert.match(auditedMessages[0], /服薬フォロー予定登録: 期限 2026-11-30 \/ 方法 来局時/);

    const beforeFail = storedFollowUp;
    await assert.rejects(
      saveEmrFollowUpSchedule({
        visitDoc,
        previousFollowUp: beforeFail as NonNullable<Parameters<typeof saveEmrFollowUpSchedule>[0]['previousFollowUp']>,
        followUpPatch: { ...nextPatch, nextAction: '失敗すべき予定' },
        logAudit: async () => false
      }),
      (err: unknown) => err instanceof AuditLogFailedError && err.message === EMR_FOLLOW_UP_AUDIT_FAILED_MESSAGE
    );
    assert.deepEqual(storedFollowUp, beforeFail);
  });

  it('renders EmrFollowUpCard and MedicationGuidanceModal follow-up template controls', () => {
    const cardHtml = renderToStaticMarkup(
      React.createElement(EmrFollowUpCard, {
        prescribedDrugs: [{ code: 'D1', name: 'アムロジピン錠5mg' }],
        initialFollowUp: {
          status: 'open',
          dueDate: '2026-11-29',
          contactMethod: 'phone',
          reasonFlags: ['残薬確認'],
          nextAction: '残薬確認'
        },
        onInsertFollowUpDraft: () => {}
      })
    );
    assert.ok(cardHtml.includes('data-testid="emr-follow-up-card"'));
    assert.ok(cardHtml.includes('予定あり (2026-11-29)'));
    assert.ok(cardHtml.includes('未確認下書き'));
    assert.ok(cardHtml.includes('data-testid="follow-up-preset-leftover"'));
    assert.ok(cardHtml.includes('data-testid="follow-up-preset-adverse_event"'));
    assert.ok(cardHtml.includes('data-testid="follow-up-preset-adherence"'));
    assert.ok(cardHtml.includes('data-testid="follow-up-preset-next_check"'));
    assert.ok(cardHtml.includes('data-testid="emr-follow-up-save-btn"'));

    const modalHtml = renderToStaticMarkup(
      React.createElement(MedicationGuidanceModal, {
        isOpen: true,
        onClose: () => {},
        drug: { code: 'D1', name: 'アムロジピン錠5mg' }
      })
    );
    assert.ok(modalHtml.includes('フォロー定型文'));
    assert.ok(modalHtml.includes('data-testid="guidance-preset-leftover"'));
    assert.ok(modalHtml.includes('data-testid="guidance-preset-next_check"'));
  });
});
