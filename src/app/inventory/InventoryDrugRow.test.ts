import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Drug } from '@/db/types';
import { DailyCheckPanel } from './components/DailyCheckPanel';
import { toInventoryDrugRow } from './types';

function drug(overrides: Partial<Drug> & Pick<Drug, 'code' | 'name'>): Drug {
  return { isGeneric: false, stockQuantity: 10, ...overrides };
}

// 描画した HTML から <style> の中身(styled-jsx の CSS 本文)を除き、DOM だけを検証する
function renderDailyCheckPanel(drugs: Drug[]): string {
  const rows = drugs.map(toInventoryDrugRow);
  const html = renderToStaticMarkup(
    React.createElement(DailyCheckPanel, { db: null, drugs: rows, pendingStockMap: new Map<string, number>() })
  );
  return html.replace(/<style[\s\S]*?<\/style>/g, '');
}

describe('toInventoryDrugRow', () => {
  it('carries the narcotic, psychotropic, poisonous and high-risk flags from the drug document', () => {
    const row = toInventoryDrugRow(drug({
      code: 'D1',
      name: '区分つき薬',
      isNarcotic: true,
      isPsychotropic: true,
      isPoisonous: true,
      isHighRisk: true
    }));
    assert.equal(row.isNarcotic, true);
    assert.equal(row.isPsychotropic, true);
    assert.equal(row.isPoisonous, true);
    assert.equal(row.isHighRisk, true);
  });

  it('leaves the flags unset when the drug document has none', () => {
    const row = toInventoryDrugRow(drug({ code: 'D2', name: '区分なし薬' }));
    assert.ok(!row.isNarcotic);
    assert.ok(!row.isPsychotropic);
    assert.ok(!row.isPoisonous);
    assert.ok(!row.isHighRisk);
  });

  it('keeps the document, the displayed fields and the lowercase search keys', () => {
    const source = drug({
      code: 'D3',
      name: 'ABC錠',
      yjCode: 'YJ123abc',
      genericName: '一般名',
      price: 12.5,
      location: 'A-01',
      stockQuantity: 7,
      isAbolished: false
    });
    const row = toInventoryDrugRow(source);
    assert.equal(row.doc, source);
    assert.equal(row.code, 'D3');
    assert.equal(row.name, 'ABC錠');
    assert.equal(row.genericName, '一般名');
    assert.equal(row.price, 12.5);
    assert.equal(row.location, 'A-01');
    assert.equal(row.stockQuantity, 7);
    assert.equal(row.searchNameLower, 'abc錠');
    assert.equal(row.searchYjCodeLower, 'yj123abc');
  });

  it('uses empty search keys when the name or YJ code is missing', () => {
    const row = toInventoryDrugRow({ code: 'D4', isGeneric: false } as Drug);
    assert.equal(row.searchNameLower, '');
    assert.equal(row.searchYjCodeLower, '');
  });
});

describe('DailyCheckPanel with drug rows built from drug documents', () => {
  it('lists narcotic and psychotropic drugs and leaves out ordinary ones', () => {
    const html = renderDailyCheckPanel([
      drug({ code: 'N1', name: '麻薬テスト錠', isNarcotic: true }),
      drug({ code: 'P1', name: '向精神薬テスト錠', isPsychotropic: true }),
      drug({ code: 'G1', name: '一般テスト錠' })
    ]);
    assert.match(html, /麻薬テスト錠/);
    assert.match(html, /向精神薬テスト錠/);
    assert.doesNotMatch(html, /一般テスト錠/);
    assert.doesNotMatch(html, /表示できる品目がありません/);
  });

  it('shows the empty state when no drug is a narcotic or psychotropic', () => {
    const html = renderDailyCheckPanel([
      drug({ code: 'G1', name: '一般テスト錠' }),
      drug({ code: 'H1', name: 'ハイリスクテスト錠', isHighRisk: true, isPoisonous: true })
    ]);
    assert.match(html, /表示できる品目がありません/);
    assert.doesNotMatch(html, /ハイリスクテスト錠/);
  });
});
