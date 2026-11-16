import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findOpeningTag, listDisabledOpeningTags, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import PrescriptionQrReader from './PrescriptionQrReader';

const noop = () => { };

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

type QrStateOverrides = {
  segments?: Array<{ id: string; text: string; source: 'camera' | 'image' | 'manual' }>;
  manualText?: string;
  message?: string;
  isCameraActive?: boolean;
  isStartingCamera?: boolean;
  isDecodingImage?: boolean;
  isApplying?: boolean;
};

function renderWithQrState(
  props: { disabled?: boolean; onApplyQrData: () => void },
  overrides: QrStateOverrides
): string {
  return renderMarkupWithReactUseStateMock(
    () => React.createElement(PrescriptionQrReader, props),
    {
      componentName: 'PrescriptionQrReader',
      restoreAtCallIndex: 6,
      expectedCalls: 7,
      overrides: {
        0: {
          assertInitial: (v) =>
            assert.ok(
              Array.isArray(v) && v.length === 0,
              `Expected useState #0 initial value to be [] (segments), got ${String(v)}`
            ),
          ...('segments' in overrides ? { value: overrides.segments } : {})
        },
        1: {
          assertInitial: (v) =>
            assert.strictEqual(
              v,
              '',
              `Expected useState #1 initial value to be "" (manualText), got ${String(v)}`
            ),
          ...('manualText' in overrides ? { value: overrides.manualText } : {})
        },
        2: {
          assertInitial: (v) =>
            assert.strictEqual(
              v,
              'QRコードを追加してください。',
              `Expected useState #2 initial value to be default message, got ${String(v)}`
            ),
          ...('message' in overrides ? { value: overrides.message } : {})
        },
        3: {
          assertInitial: (v) =>
            assert.strictEqual(v, false, 'Expected useState #3 (isCameraActive) initial value false'),
          ...('isCameraActive' in overrides ? { value: overrides.isCameraActive } : {})
        },
        4: {
          assertInitial: (v) =>
            assert.strictEqual(v, false, 'Expected useState #4 (isStartingCamera) initial value false'),
          ...('isStartingCamera' in overrides ? { value: overrides.isStartingCamera } : {})
        },
        5: {
          assertInitial: (v) =>
            assert.strictEqual(v, false, 'Expected useState #5 (isDecodingImage) initial value false'),
          ...('isDecodingImage' in overrides ? { value: overrides.isDecodingImage } : {})
        },
        6: {
          assertInitial: (v) =>
            assert.strictEqual(v, false, 'Expected useState #6 (isApplying) initial value false'),
          ...('isApplying' in overrides ? { value: overrides.isApplying } : {})
        }
      }
    }
  );
}

test('PrescriptionQrReader pins disabled prop interaction with manualText and segments state', () => {
  // manualText 入力あり: disabled=false なら「QRを追加」は有効、disabled=true なら「QRを追加」は無効
  const withManualEnabledHtml = renderWithQrState(
    { disabled: false, onApplyQrData: noop },
    { manualText: 'JAHIS10\n1,テスト' }
  );
  const addManualEnabled = findOpeningTag(withManualEnabledHtml, 'QRを追加', 'button');
  assert.doesNotMatch(addManualEnabled, /\sdisabled=""/, 'manualText入力あり・disabled=false時はQRを追加ボタンが有効であること');

  const withManualDisabledHtml = renderWithQrState(
    { disabled: true, onApplyQrData: noop },
    { manualText: 'JAHIS10\n1,テスト' }
  );
  const addManualDisabled = findOpeningTag(withManualDisabledHtml, 'QRを追加', 'button');
  assert.match(addManualDisabled, /\sdisabled=""/, 'manualText入力ありでもdisabled=true時はQRを追加ボタンが無効化されること');

  // segments あり: disabled=false ならクリア・反映ボタンは有効、disabled=true なら両方無効
  const sampleSegments = [{ id: 'qr-1', text: 'JAHIS10\n1,テスト', source: 'manual' as const }];
  const withSegmentsEnabledHtml = renderWithQrState(
    { disabled: false, onApplyQrData: noop },
    { segments: sampleSegments }
  );
  const cleanSegmentsEnabled = stripStyleBlocks(withSegmentsEnabledHtml);
  assert.ok(cleanSegmentsEnabled.includes('読取済み 1'), 'セグメント1件時は読取済み 1が表示されること');
  assert.ok(cleanSegmentsEnabled.includes('1. スキャナー / 2行'), 'セグメント行数が一覧表示されること');
  assert.doesNotMatch(
    findOpeningTag(withSegmentsEnabledHtml, 'title="読取済みQRをクリア"', 'button'),
    /\sdisabled=""/,
    'segmentsあり・disabled=false時はクリアボタンが有効であること'
  );
  assert.doesNotMatch(
    findOpeningTag(withSegmentsEnabledHtml, 'data-testid="prescription-qr-apply"', 'button'),
    /\sdisabled=""/,
    'segmentsあり・disabled=false時は反映ボタンが有効であること'
  );

  const withSegmentsDisabledHtml = renderWithQrState(
    { disabled: true, onApplyQrData: noop },
    { segments: sampleSegments }
  );
  assert.match(
    findOpeningTag(withSegmentsDisabledHtml, 'title="読取済みQRをクリア"', 'button'),
    /\sdisabled=""/,
    'segmentsありでもdisabled=true時はクリアボタンが無効化されること'
  );
  assert.match(
    findOpeningTag(withSegmentsDisabledHtml, 'data-testid="prescription-qr-apply"', 'button'),
    /\sdisabled=""/,
    'segmentsありでもdisabled=true時は反映ボタンが無効化されること'
  );
});

