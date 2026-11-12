import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findOpeningTag, listDisabledOpeningTags, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import PrescriptionQrReader from './PrescriptionQrReader';

const noop = () => {};

test('PrescriptionQrReader exports as callable React component', () => {
  assert.ok(PrescriptionQrReader, 'PrescriptionQrReader should be exported');
  assert.strictEqual(typeof PrescriptionQrReader, 'function', 'PrescriptionQrReader should be a function component');
});

test('PrescriptionQrReader action controls disabled and aria-disabled states when disabled is true vs false', () => {
  // 1. disabled: true (処方箋QR読取が無効化されている状態)
  const htmlDisabled = renderToStaticMarkup(
    React.createElement(PrescriptionQrReader, {
      disabled: true,
      onApplyQrData: noop
    })
  );

  // 全7個のフォームコントロール（input 1, textarea 1, button 5）が無効化されること
  const disabledTagsWhenDisabled = listDisabledOpeningTags(htmlDisabled);
  assert.strictEqual(
    disabledTagsWhenDisabled.length,
    7,
    `When disabled is true, exactly 7 controls must have disabled="":\n${disabledTagsWhenDisabled.join('\n')}`
  );

  // 画像取込ラベルの aria-disabled="true"
  const imageLabelTagDisabled = findOpeningTag(htmlDisabled, '画像', 'label');
  assert.match(imageLabelTagDisabled, /\saria-disabled="true"/, '画像取込ラベルに aria-disabled="true" が付与されていること');

  // 各コントロールの開始タグを検証
  const fileInputTagDisabled = findOpeningTag(htmlDisabled, 'accept="image/*"', 'input');
  assert.match(fileInputTagDisabled, /\sdisabled=""/, '画像ファイル入力が無効化されていること');

  const startCameraBtnDisabled = findOpeningTag(htmlDisabled, 'カメラ', 'button');
  assert.match(startCameraBtnDisabled, /\sdisabled=""/, 'カメラ開始ボタンが無効化されていること');

  const stopCameraBtnDisabled = findOpeningTag(htmlDisabled, 'title="カメラ停止"', 'button');
  assert.match(stopCameraBtnDisabled, /\sdisabled=""/, 'カメラ停止ボタンが無効化されていること');

  const textareaTagDisabled = findOpeningTag(htmlDisabled, 'id="prescriptionQrManual"', 'textarea');
  assert.match(textareaTagDisabled, /\sdisabled=""/, 'ハンディスキャナー入力textareaが無効化されていること');

  const addManualBtnDisabled = findOpeningTag(htmlDisabled, 'QRを追加', 'button');
  assert.match(addManualBtnDisabled, /\sdisabled=""/, 'QRを追加ボタンが無効化されていること');

  const clearBtnDisabled = findOpeningTag(htmlDisabled, 'title="読取済みQRをクリア"', 'button');
  assert.match(clearBtnDisabled, /\sdisabled=""/, '読取済みQRクリアボタンが無効化されていること');

  const applyBtnDisabled = findOpeningTag(htmlDisabled, 'data-testid="prescription-qr-apply"', 'button');
  assert.match(applyBtnDisabled, /\sdisabled=""/, '処方入力へ反映ボタンが無効化されていること');
  assert.strictEqual(htmlDisabled.includes('処方入力へ反映'), true, '初期状態のボタン文言が「処方入力へ反映」であること');

  // 2. disabled: false (処方箋QR読取が有効な状態)
  const htmlEnabled = renderToStaticMarkup(
    React.createElement(PrescriptionQrReader, {
      disabled: false,
      onApplyQrData: noop
    })
  );

  // disabled: false 時は、状態由来の4個（カメラ停止、QR追加、クリア、反映）のみが無効化されること
  const disabledTagsWhenEnabled = listDisabledOpeningTags(htmlEnabled);
  assert.strictEqual(
    disabledTagsWhenEnabled.length,
    4,
    `When disabled is false, exactly 4 controls (stopCamera, addManual, clear, apply) must have disabled="":\n${disabledTagsWhenEnabled.join('\n')}`
  );

  // 画像取込ラベルの aria-disabled は付与されないこと
  const imageLabelTagEnabled = findOpeningTag(htmlEnabled, '画像', 'label');
  assert.doesNotMatch(imageLabelTagEnabled, /\saria-disabled="true"/, '画像取込ラベルに aria-disabled="true" が付与されていないこと');

  // 画像ファイル入力・カメラ開始ボタン・textarea は有効（disabled="" なし）
  const fileInputTagEnabled = findOpeningTag(htmlEnabled, 'accept="image/*"', 'input');
  assert.doesNotMatch(fileInputTagEnabled, /\sdisabled=""/, '画像ファイル入力が有効であること');

  const startCameraBtnEnabled = findOpeningTag(htmlEnabled, 'カメラ', 'button');
  assert.doesNotMatch(startCameraBtnEnabled, /\sdisabled=""/, 'カメラ開始ボタンが有効であること');

  const textareaTagEnabled = findOpeningTag(htmlEnabled, 'id="prescriptionQrManual"', 'textarea');
  assert.doesNotMatch(textareaTagEnabled, /\sdisabled=""/, 'ハンディスキャナー入力textareaが有効であること');

  // カメラ未稼働、テキスト未入力、セグメント0件のため各ボタンが無効化されていること
  const stopCameraBtnEnabled = findOpeningTag(htmlEnabled, 'title="カメラ停止"', 'button');
  assert.match(stopCameraBtnEnabled, /\sdisabled=""/, 'カメラ未稼働時はカメラ停止ボタンが無効化されていること');

  const addManualBtnEnabled = findOpeningTag(htmlEnabled, 'QRを追加', 'button');
  assert.match(addManualBtnEnabled, /\sdisabled=""/, '手動テキスト空時はQRを追加ボタンが無効化されていること');

  const clearBtnEnabled = findOpeningTag(htmlEnabled, 'title="読取済みQRをクリア"', 'button');
  assert.match(clearBtnEnabled, /\sdisabled=""/, 'セグメント0件時はクリアボタンが無効化されていること');

  const applyBtnEnabled = findOpeningTag(htmlEnabled, 'data-testid="prescription-qr-apply"', 'button');
  assert.match(applyBtnEnabled, /\sdisabled=""/, 'セグメント0件時は反映ボタンが無効化されていること');

  // 初期メッセージの表示
  const cleanMarkup = stripStyleBlocks(htmlEnabled);
  assert.strictEqual(cleanMarkup.includes('QRコードを追加してください。'), true, '初期ステータスメッセージが表示されていること');
  assert.strictEqual(cleanMarkup.includes('読取済み 0'), true, '初期読取済み件数バッジが表示されていること');
});

