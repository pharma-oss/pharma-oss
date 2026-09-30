import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const inventoryCssSource = readFileSync(new URL('./inventory.css', import.meta.url), 'utf8');
const inventoryRowSource = readFileSync(new URL('./components/InventoryRow.tsx', import.meta.url), 'utf8');

test('verifies that inventory page.tsx places drug name first in table header', () => {
  // <thead> <tr> must have <th>医薬品名</th> as the very first column
  const theadMatch = pageSource.match(/<thead>\s*<tr>([\s\S]*?)<\/tr>\s*<\/thead>/);
  assert.ok(theadMatch, 'data-table must have thead > tr');
  const theadContent = theadMatch[1];
  const firstThMatch = theadContent.match(/<th>(.*?)<\/th>/);
  assert.ok(firstThMatch, 'thead must contain at least one th');
  assert.strictEqual(firstThMatch[1].trim(), '医薬品名', 'first th must be 医薬品名 for immediate mobile and desktop recognition');
});

test('verifies that InventoryRow.tsx places drug name cell first in table body row', () => {
  // <tr> must have inventory-name-cell in the very first <td>
  const firstTdMatch = inventoryRowSource.match(/return\s*\(\s*<tr>([\s\S]*?)<\/tr>\s*\)/);
  assert.ok(firstTdMatch, 'InventoryRow must return <tr>');
  const trContent = firstTdMatch[1];
  const firstTd = trContent.match(/<td>([\s\S]*?)<\/td>/);
  assert.ok(firstTd, 'tr must contain at least one td');
  assert.ok(
    firstTd[1].includes('inventory-name-cell') && firstTd[1].includes('{drug.name}'),
    'first td in InventoryRow must contain inventory-name-cell with drug.name'
  );
});

test('verifies that inventory.css sets proper min-width on first column (drug name)', () => {
  assert.match(
    inventoryCssSource,
    /\.data-table\s+th:first-child,\s*\.data-table\s+td:first-child\s*{[\s\S]*?min-width:\s*260px/
  );
});

test('verifies that inventory.css defines smooth touch scrolling on tabs and 640px 2x2 grid on order-workbench-actions', () => {
  // Touch scrolling on tabs
  const tabsRule = inventoryCssSource.match(/\.tabs\s*{([^}]*)}/)?.[1] || '';
  assert.match(tabsRule, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(tabsRule, /overflow-x:\s*auto/);

  // 640px media query
  const media640Match = inventoryCssSource.match(/@media\s*\(max-width:\s*640px\)\s*{([\s\S]*?)(?=\n@media|$)/);
  assert.ok(media640Match, '@media (max-width: 640px) must exist in inventory.css');
  const mediaContent = media640Match[1];

  // 2x2 grid for order-workbench-actions
  assert.match(mediaContent, /\.order-workbench-actions\s*{[\s\S]*?grid-template-columns:\s*1fr 1fr/);
  assert.match(mediaContent, /\.order-workbench-actions\s+button\s*{[\s\S]*?width:\s*100%/);

  // mobile tab size
  assert.match(mediaContent, /\.tab\s*{[\s\S]*?min-height:\s*40px/);
});
