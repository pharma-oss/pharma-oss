import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildPastProblemSuggestions,
  buildPrescriptionTimeline,
  buildSoapHistoryTimeline
} from '../lib/emr_patient_history';

test('buildPastProblemSuggestions extracts unique problem titles', () => {
  const soapRecords: any[] = [
    {
      soapId: 's1',
      visitId: 'v1',
      authorId: 'u1',
      problems: [
        { id: 'p1', title: '#1 高血圧', entries: [] },
        { id: 'p2', title: '#2 脂質異常症', entries: [] }
      ],
      updatedAt: '2026-08-20'
    },
    {
      soapId: 's2',
      visitId: 'v2',
      authorId: 'u1',
      problems: [
        { id: 'p3', title: '#1 高血圧', entries: [] }
      ],
      updatedAt: '2026-08-21'
    }
  ];

  const suggestions = buildPastProblemSuggestions(soapRecords);
  assert.ok(suggestions.length >= 2);
  assert.ok(suggestions.some(s => s.includes('高血圧')));
  assert.ok(suggestions.some(s => s.includes('脂質異常症')));
});

test('buildPrescriptionTimeline orders visits chronologically', () => {
  const visits: any[] = [
    { visitId: 'v1', issueDate: '2026-08-10', status: 'completed' },
    { visitId: 'v2', issueDate: '2026-08-20', status: 'completed' }
  ];
  const items: any[] = [
    { itemId: 'i1', visitId: 'v1', drugId: 'd1' },
    { itemId: 'i2', visitId: 'v2', drugId: 'd2' }
  ];
  const timeline = buildPrescriptionTimeline({ visits, items });
  assert.strictEqual(timeline.length, 2);
  assert.strictEqual(timeline[0].visitId, 'v2');
});

