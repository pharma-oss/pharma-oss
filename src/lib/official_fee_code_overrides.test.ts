import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildOfficialFeeCodeMasterProposalFromCsv,
  buildOfficialFeeCodeMasterProposalReviewCsv,
  buildOfficialFeeCodeOverrideTemplateCsv,
  makeOfficialFeeCodeMasterProposalReviewCsvFileName,
  makeOfficialFeeCodeOverrideCsvFileName,
  parseOfficialFeeCodeOverrideCsv
} from './official_fee_code_overrides.ts';
import { DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS } from './calculator.ts';

test('buildOfficialFeeCodeOverrideTemplateCsv exports all configurable fee code keys safely', () => {
  const csv = buildOfficialFeeCodeOverrideTemplateCsv({
    base_fee_1: '999000001',
    drug_preparation: '=999000002'
  });
  const lines = csv.split('\n');

  assert.match(lines[0], /^"項目キー","項目名","分類","公式算定コード"$/);
  assert.strictEqual(lines.length, DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS.length + 1);
  assert.match(csv, /"base_fee_1","調剤基本料1","基本料","999000001"/);
  assert.match(csv, /"drug_preparation","薬剤調製料","調製",""/);
  assert.doesNotMatch(csv, /","=999000002"/);
});

test('parseOfficialFeeCodeOverrideCsv imports valid codes and blank clears', () => {
  const csv = [
    '"項目キー","項目名","公式算定コード"',
    '"base_fee_1","調剤基本料1","999000001"',
    '"drug_preparation","薬剤調製料",""',
    '"unknown","未対応","999000002"'
  ].join('\n');

  const result = parseOfficialFeeCodeOverrideCsv(csv);

  assert.deepStrictEqual(result.overrides, {
    base_fee_1: '999000001',
    drug_preparation: ''
  });
  assert.strictEqual(result.importedCount, 1);
  assert.strictEqual(result.clearedCount, 1);
  assert.strictEqual(result.skippedCount, 1);
  assert.strictEqual(result.issues.length, 1);
  assert.strictEqual(result.issues[0].severity, 'warning');
  assert.strictEqual(result.issues[0].code, 'unknown_key');
});

test('parseOfficialFeeCodeOverrideCsv rejects incomplete or nonnumeric codes', () => {
  const csv = [
    '"項目キー","公式算定コード"',
    '"base_fee_1","12345"',
    '"base_fee_2","999-000-002"'
  ].join('\n');

  const result = parseOfficialFeeCodeOverrideCsv(csv);

  assert.deepStrictEqual(result.overrides, {});
  assert.strictEqual(result.importedCount, 0);
  assert.strictEqual(result.skippedCount, 2);
  assert.strictEqual(result.issues.filter((issue) => issue.severity === 'error').length, 2);
  assert.ok(result.issues.every((issue) => issue.code === 'invalid_code'));
});

test('parseOfficialFeeCodeOverrideCsv requires key and official fee code headers', () => {
  const result = parseOfficialFeeCodeOverrideCsv('"項目名","メモ"\n"調剤基本料1","x"');

  assert.deepStrictEqual(result.overrides, {});
  assert.strictEqual(result.issues[0].severity, 'error');
  assert.strictEqual(result.issues[0].code, 'missing_header');
});

test('makeOfficialFeeCodeOverrideCsvFileName uses a stable timestamp', () => {
  assert.strictEqual(
    makeOfficialFeeCodeOverrideCsvFileName(new Date(2026, 5, 21, 9, 8, 7)),
    'yakureki_official_fee_codes_20260621_090807.csv'
  );
  assert.strictEqual(
    makeOfficialFeeCodeMasterProposalReviewCsvFileName(new Date(2026, 5, 21, 9, 8, 7)),
    'yakureki_official_fee_code_master_review_20260621_090807.csv'
  );
});

test('buildOfficialFeeCodeMasterProposalFromCsv proposes unique name matches', () => {
  const csv = [
    '"算定コード","算定名称"',
    '"999000001","調剤基本料１"',
    '"999000002","薬剤調製料"',
    '"999000003","調剤管理料（内服薬）"'
  ].join('\n');

  const proposal = buildOfficialFeeCodeMasterProposalFromCsv(csv);

  assert.strictEqual(proposal.issues.filter((issue) => issue.severity === 'error').length, 0);
  assert.strictEqual(proposal.overrides.base_fee_1, '999000001');
  assert.strictEqual(proposal.overrides.drug_preparation, '999000002');
  assert.strictEqual(proposal.overrides.dispensing_management_internal, '999000003');
  assert.ok(proposal.candidates.some((candidate) => candidate.masterName === '調剤基本料１'));
  assert.ok(proposal.unresolvedCount > 0);
});

test('buildOfficialFeeCodeMasterProposalFromCsv skips invalid rows and leaves duplicates unresolved', () => {
  const csv = [
    '"コード","名称"',
    '"999000001","調剤基本料1"',
    '"999000002","調剤基本料1"',
    '"12345","薬剤調製料"',
    '"999000004",""'
  ].join('\n');

  const proposal = buildOfficialFeeCodeMasterProposalFromCsv(csv);

  assert.strictEqual(proposal.overrides.base_fee_1, undefined);
  assert.strictEqual(proposal.overrides.drug_preparation, undefined);
  assert.strictEqual(proposal.duplicateCount, 1);
  assert.strictEqual(proposal.skippedRowCount, 2);
  assert.ok(proposal.issues.some((issue) => issue.code === 'duplicate_master_match'));
  assert.ok(proposal.issues.some((issue) => issue.code === 'invalid_code'));
  assert.ok(proposal.issues.some((issue) => issue.code === 'missing_master_name'));
});

test('buildOfficialFeeCodeMasterProposalFromCsv requires code and name headers', () => {
  const proposal = buildOfficialFeeCodeMasterProposalFromCsv('"メモ","値"\n"x","y"');

  assert.strictEqual(proposal.matchedCount, 0);
  assert.strictEqual(proposal.issues[0].severity, 'error');
  assert.strictEqual(proposal.issues[0].code, 'missing_master_header');
});

test('buildOfficialFeeCodeMasterProposalReviewCsv exports candidates, unresolved rows, and issues safely', () => {
  const proposal = buildOfficialFeeCodeMasterProposalFromCsv([
    '"コード","名称"',
    '"999000001","調剤基本料1"',
    '"999000002","調剤基本料1"',
    '"999000003","=薬剤調製料"'
  ].join('\n'));

  const csv = buildOfficialFeeCodeMasterProposalReviewCsv(proposal, '=official.csv');

  assert.match(csv, /^"区分","元ファイル","項目キー","項目名","分類","公式算定コード","公式表名称","公式表行","判定","メモ"/);
  assert.match(csv, /"'=official\.csv"/);
  assert.match(csv, /"重複","'=official\.csv","base_fee_1","調剤基本料1","基本料","","","","複数候補あり"/);
  assert.match(csv, /"確認事項","'=official\.csv","","","","","","2","確認","調剤基本料1 に複数の候補があるため自動反映しません。"/);
  assert.doesNotMatch(csv, /","=薬剤調製料"/);
});
