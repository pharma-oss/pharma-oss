import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const settingsPageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const globalsCssSource = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');
const staffTabSource = readFileSync(new URL('../../components/settings/StaffSettingsTab.tsx', import.meta.url), 'utf8');
const facilityTabSource = readFileSync(new URL('../../components/settings/FacilitySettingsTab.tsx', import.meta.url), 'utf8');

test('verifies that SettingsPage section-tabs defines smooth touch horizontal scrolling on mobile and tablet', () => {
  // Check @media (max-width: 768px) rule in settings page style jsx
  const media768Match = settingsPageSource.match(/@media\s*\(max-width:\s*768px\)\s*{([\s\S]*?)(?=\n\s*@media|$)/);
  assert.ok(media768Match, '@media (max-width: 768px) must exist in SettingsPage style jsx');
  const media768 = media768Match[1];

  assert.match(media768, /\.section-tabs\s*{[\s\S]*?overflow-x:\s*auto/);
  assert.match(media768, /\.section-tabs\s*{[\s\S]*?-webkit-overflow-scrolling:\s*touch/);
  assert.match(media768, /\.section-tabs\s*{[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(media768, /\.tab-pill\s*{[\s\S]*?scroll-snap-align:\s*start/);
});

test('verifies that SettingsPage initial setup panel adapts to 2x2 grid and full-width buttons on mobile', () => {
  // Check @media (max-width: 700px) rule in settings page style jsx
  const media700Match = settingsPageSource.match(/@media\s*\(max-width:\s*700px\)\s*{([\s\S]*?)(?=`|\n\s*@media|$)/);
  assert.ok(media700Match, '@media (max-width: 700px) must exist in SettingsPage style jsx');
  const media700 = media700Match[1];

  assert.match(media700, /\.initial-setup-metrics\s*{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(media700, /\.initial-setup-actions\s*{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(media700, /\.initial-setup-actions\s+button\s*{[\s\S]*?width:\s*100%/);
  assert.match(media700, /\.initial-setup-step\s+button\s*{[\s\S]*?width:\s*100%/);
});

test('verifies that StaffSettingsTab header wraps and table is horizontally scrollable with min-width on mobile', () => {
  // staff-header must have flex-wrap: wrap
  assert.match(staffTabSource, /\.staff-header\s*{[\s\S]*?flex-wrap:\s*wrap/);

  // staff-table-wrapper must have overflow-x: auto and -webkit-overflow-scrolling: touch
  assert.match(staffTabSource, /\.staff-table-wrapper\s*{[\s\S]*?overflow-x:\s*auto/);
  assert.match(staffTabSource, /\.staff-table-wrapper\s*{[\s\S]*?-webkit-overflow-scrolling:\s*touch/);
  assert.match(staffTabSource, /\.staff-table\s*{[\s\S]*?min-width:\s*580px/);

  // mobile media query in StaffSettingsTab
  const mediaMatch = staffTabSource.match(/@media\s*\(max-width:\s*640px\)\s*{([\s\S]*?)(?=`|$)/);
  assert.ok(mediaMatch, '@media (max-width: 640px) must exist in StaffSettingsTab style jsx');
  const media = mediaMatch[1];

  assert.match(media, /\.staff-header\s*{[\s\S]*?flex-direction:\s*column/);
  assert.match(media, /\.btn-add-staff\s*{[\s\S]*?width:\s*100%/);
});

test('verifies that globals.css provides mobile single-column layout for form-grid and full width form-control', () => {
  assert.match(globalsCssSource, /\.form-grid\s*{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(globalsCssSource, /@media\s*\(max-width:\s*640px\)\s*{\s*\.form-grid\s*{\s*grid-template-columns:\s*1fr;/);
  assert.match(globalsCssSource, /@media\s*\(max-width:\s*640px\)\s*{\s*\.form-control\s*{\s*max-width:\s*100%;/);
  assert.match(globalsCssSource, /@media\s*\(max-width:\s*640px\)\s*{\s*\.settings-section\s*{\s*padding:\s*1\.25rem\s+0\.85rem;/);
});

test('verifies that no new inline style={{}} is added in settings page or tabs', () => {
  const settingsInlineStyles = (settingsPageSource.match(/style={{/g) || []).length;
  const staffInlineStyles = (staffTabSource.match(/style={{/g) || []).length;
  const facilityInlineStyles = (facilityTabSource.match(/style={{/g) || []).length;

  assert.strictEqual(settingsInlineStyles, 0, 'SettingsPage must not contain inline style={{}}');
  assert.strictEqual(staffInlineStyles, 0, 'StaffSettingsTab must not contain inline style={{}}');
  assert.strictEqual(facilityInlineStyles, 0, 'FacilitySettingsTab must not contain inline style={{}}');
});
