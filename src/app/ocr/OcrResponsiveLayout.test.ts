import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('OCR Responsive Layout and Action Bar Contracts (Track I-6)', () => {
  it('verifies that ocr/page.tsx defines responsive rules preventing 375px action button overflow', () => {
    const filePath = path.join(process.cwd(), 'src', 'app', 'ocr', 'page.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Must have max-width: 640px media query for form-actions
    assert.ok(content.includes('@media (max-width: 640px)'), 'Missing 640px media query in ocr/page.tsx');
    assert.ok(content.includes('grid-template-columns: 0.9fr 1.6fr;'), 'Missing responsive button grid in form-actions');
    assert.ok(content.includes('.form-actions .btn-label-sub'), 'Missing sublabel visibility handling');
    assert.ok(content.includes('.btn-label-main'), 'Missing btn-label-main class');
  });

  it('verifies that ocr/page.tsx hides visual-column in manual-mode on smaller screens', () => {
    const filePath = path.join(process.cwd(), 'src', 'app', 'ocr', 'page.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(
      content.includes('.side-by-side-container.manual-mode .visual-column'),
      'Must hide visual-column in manual mode on narrow screens'
    );
  });

  it('verifies that PrescriptionGroupEditor.tsx wraps usage selector and handles 480px screens', () => {
    const filePath = path.join(process.cwd(), 'src', 'app', 'ocr', 'components', 'PrescriptionGroupEditor.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(content.includes('flex-wrap: wrap;'), 'usage-selector-wrap must allow flex-wrap');
    assert.ok(content.includes('@media (max-width: 480px)'), 'Missing 480px media query in PrescriptionGroupEditor');
    assert.ok(content.includes('.btn-select-usage'), 'Missing .btn-select-usage class');
  });

  it('verifies that PrescriptionRow.tsx defines 640px responsive rule for agent-override and flags', () => {
    const filePath = path.join(process.cwd(), 'src', 'app', 'ocr', 'components', 'PrescriptionRow.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(content.includes('@media (max-width: 640px)'), 'Missing 640px media query in PrescriptionRow');
    assert.ok(content.includes('.agent-override-chip'), 'Missing agent-override-chip responsive handling');
  });
});
