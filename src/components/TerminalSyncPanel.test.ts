import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COLLECTION_LABELS, formatDateTime } from './TerminalSyncPanel';

describe('TerminalSyncPanel contracts and styling regressions', () => {
  it('maps key collections to human-readable Japanese labels', () => {
    assert.equal(COLLECTION_LABELS.patients, '患者');
    assert.equal(COLLECTION_LABELS.visits, '受付');
    assert.equal(COLLECTION_LABELS.prescription_items, '処方');
    assert.equal(COLLECTION_LABELS.soap_records, '薬歴');
    assert.equal(COLLECTION_LABELS.audit_logs, '監査ログ');
    assert.equal(COLLECTION_LABELS.drugs, '医薬品マスタ');
    assert.equal(COLLECTION_LABELS.drug_stocks, '在庫');
  });

  it('formats date and time accurately, returning dash for falsy or invalid values', () => {
    assert.equal(formatDateTime(null), '—');
    assert.equal(formatDateTime(undefined), '—');
    assert.equal(formatDateTime(''), '—');
    assert.equal(formatDateTime('invalid-date-string'), '—');

    const formatted = formatDateTime('2026-09-30T10:15:00Z');
    assert.ok(formatted !== '—');
    assert.ok(formatted.includes(':') || formatted.includes('15'));
  });

  it('strictly prohibits inline style={{}} in TerminalSyncPanel.tsx', () => {
    const filePath = path.join(process.cwd(), 'src', 'components', 'TerminalSyncPanel.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const styleMatches = content.match(/style=\{\{/g) || [];
    assert.equal(
      styleMatches.length,
      0,
      `Expected 0 inline style={{}} in TerminalSyncPanel.tsx, found ${styleMatches.length}`
    );
  });

  it('strictly prohibits inline style={{}} in ClientLayout.tsx', () => {
    const filePath = path.join(process.cwd(), 'src', 'app', 'ClientLayout.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const styleMatches = content.match(/style=\{\{/g) || [];
    assert.equal(
      styleMatches.length,
      0,
      `Expected 0 inline style={{}} in ClientLayout.tsx, found ${styleMatches.length}`
    );
  });

  it('verifies that total inline style={{}} across entire src does not exceed 3 legitimate dynamic styles', () => {
    function findTsxFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findTsxFiles(fullPath));
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const tsxFiles = findTsxFiles(path.join(process.cwd(), 'src'));
    const filesWithInlineStyles: { file: string; count: number }[] = [];
    let totalInlineStyles = 0;

    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(/style=\{\{/g) || [];
      if (matches.length > 0) {
        filesWithInlineStyles.push({
          file: path.relative(process.cwd(), file),
          count: matches.length
        });
        totalInlineStyles += matches.length;
      }
    }

    // Only AuditSettingsTab.tsx (2) and print/[visitId]/page.tsx (1) are permitted for dynamic CSS variables
    assert.equal(
      totalInlineStyles,
      3,
      `Expected exactly 3 legitimate dynamic inline style={{}}, but found ${totalInlineStyles}: ${JSON.stringify(filesWithInlineStyles)}`
    );
  });
});
