import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  stripStyleBlocks,
  findOpeningTag
} from '@/lib/test_support/html_disabled_tags';
import type {
  ConditionChoicePreview,
  ConditionChoicePreviews
} from '@/lib/claim_condition_previews';
import type {
  AfterHoursJudgement,
  ClaimConditionOptions
} from '@/lib/claim_conditions';
import {
  ReceiptConditionPanel,
  type ReceiptBarcodeStatus,
  type ReceiptConditionPanelProps
} from './ReceiptConditionPanel';

function createMockPreviews(): ConditionChoicePreviews {
  const basePreview: ConditionChoicePreview = {
    totalPoints: 100,
    copayYen: 300,
    unsetFeeNames: []
  };

  return {
    medicationNotebook: {
      carried: { ...basePreview },
      not_carried: { ...basePreview, totalPoints: 110, copayYen: 330 }
    },
    afterHoursCategory: {
      none: { ...basePreview },
      after_hours: { ...basePreview, totalPoints: 140, copayYen: 420 },
      holiday: { ...basePreview, totalPoints: 200, copayYen: 600 },
      late_night: { ...basePreview, totalPoints: 300, copayYen: 900 }
    },
    tokkanOverride: {
      item: { ...basePreview },
      none: { ...basePreview, totalPoints: 90, copayYen: 270 },
      '1': { ...basePreview, totalPoints: 110, copayYen: 330 },
      '3_i': { ...basePreview, totalPoints: 120, copayYen: 360 }
    }
  };
}

function createMockProps(
  overrides?: Partial<ReceiptConditionPanelProps>
): ReceiptConditionPanelProps {
  return {
    conditions: {
      medicationNotebook: 'carried',
      afterHoursCategory: 'none',
      tokkanOverride: undefined
    },
    previews: createMockPreviews(),
    current: {
      totalPoints: 100,
      copayYen: 300,
      unsetFeeNames: []
    },
    autoJudgement: {
      status: 'judged',
      category: 'none',
      reason: '通常時間帯'
    },
    receptionAtText: '10:30',
    busy: false,
    lockedReason: undefined,
    canPrintReceipt: true,
    barcodeStatus: {
      kind: 'ok',
      payload: '123456789',
      categoryText: '社保',
      amountYen: 300,
      assumed: false,
      reason: '社保本人3割'
    },
    onChange: (_patch: ClaimConditionOptions) => {},
    onApplyAutoJudgement: () => {},
    onPrintReceiptOnly: () => {},
    ...overrides
  };
}

function renderPanel(props: ReceiptConditionPanelProps): string {
  return renderToStaticMarkup(React.createElement(ReceiptConditionPanel, props));
}

describe('ReceiptConditionPanel', () => {
  it('通常時 (busy=false, lockedReason=undefined, canPrintReceipt=true, unsetFeeNames=[]) はすべての条件 fieldset と印刷ボタンが有効', () => {
    const props = createMockProps();
    const html = renderPanel(props);
    const cleanMarkup = stripStyleBlocks(html);

    // 3つの条件グループ fieldset（お薬手帳、時間外、特管）が disabled を持たない
    const notebookGroupTag = findOpeningTag(cleanMarkup, 'legend>お薬手帳<', 'fieldset');
    assert.ok(
      !notebookGroupTag.includes('disabled=""'),
      `Notebook fieldset must not be disabled: ${notebookGroupTag}`
    );

    const afterHoursGroupTag = findOpeningTag(cleanMarkup, 'legend>時間外・休日・深夜<', 'fieldset');
    assert.ok(
      !afterHoursGroupTag.includes('disabled=""'),
      `After-hours fieldset must not be disabled: ${afterHoursGroupTag}`
    );

    const tokkanGroupTag = findOpeningTag(cleanMarkup, 'legend>特定薬剤管理指導加算（特管）<', 'fieldset');
    assert.ok(
      !tokkanGroupTag.includes('disabled=""'),
      `Tokkan fieldset must not be disabled: ${tokkanGroupTag}`
    );

    // 領収証だけ印刷ボタンが disabled を持たない
    const printBtnTag = findOpeningTag(cleanMarkup, 'data-testid="print-receipt-only-button"', 'button');
    assert.ok(
      !printBtnTag.includes('disabled=""'),
      `Print receipt button must not be disabled: ${printBtnTag}`
    );
    assert.ok(
      printBtnTag.includes('title="領収証だけを印刷します（他の帳票は刷りません）。"'),
      `Print receipt button must have default title: ${printBtnTag}`
    );

    // 点数未確定およびロック警告が表示されない
    assert.ok(!cleanMarkup.includes('data-testid="receipt-condition-unset"'));
    assert.ok(!cleanMarkup.includes('data-testid="receipt-condition-locked"'));
  });

  it('処理中 (busy=true) はすべての条件 fieldset と領収証印刷ボタンが無効化される', () => {
    const props = createMockProps({ busy: true });
    const html = renderPanel(props);
    const cleanMarkup = stripStyleBlocks(html);

    const notebookGroupTag = findOpeningTag(cleanMarkup, 'legend>お薬手帳<', 'fieldset');
    assert.ok(
      notebookGroupTag.includes('disabled=""'),
      `Notebook fieldset must have disabled="" during busy: ${notebookGroupTag}`
    );

    const afterHoursGroupTag = findOpeningTag(cleanMarkup, 'legend>時間外・休日・深夜<', 'fieldset');
    assert.ok(
      afterHoursGroupTag.includes('disabled=""'),
      `After-hours fieldset must have disabled="" during busy: ${afterHoursGroupTag}`
    );

    const tokkanGroupTag = findOpeningTag(cleanMarkup, 'legend>特定薬剤管理指導加算（特管）<', 'fieldset');
    assert.ok(
      tokkanGroupTag.includes('disabled=""'),
      `Tokkan fieldset must have disabled="" during busy: ${tokkanGroupTag}`
    );

    const printBtnTag = findOpeningTag(cleanMarkup, 'data-testid="print-receipt-only-button"', 'button');
    assert.ok(
      printBtnTag.includes('disabled=""'),
      `Print receipt button must have disabled="" during busy: ${printBtnTag}`
    );
  });

  it('請求ロック時 (lockedReason あり) は条件変更が無効化されロック理由が表示されるが、領収証印刷ボタンは有効を維持', () => {
    const lockedReason = '月次請求確定済みのため条件変更はできません';
    const props = createMockProps({
      lockedReason,
      canPrintReceipt: true,
      busy: false
    });
    const html = renderPanel(props);
    const cleanMarkup = stripStyleBlocks(html);

    // 条件 fieldset はすべて無効
    const notebookGroupTag = findOpeningTag(cleanMarkup, 'legend>お薬手帳<', 'fieldset');
    assert.ok(notebookGroupTag.includes('disabled=""'), 'Notebook fieldset must be disabled when locked');

    const afterHoursGroupTag = findOpeningTag(cleanMarkup, 'legend>時間外・休日・深夜<', 'fieldset');
    assert.ok(afterHoursGroupTag.includes('disabled=""'), 'After-hours fieldset must be disabled when locked');

    const tokkanGroupTag = findOpeningTag(cleanMarkup, 'legend>特定薬剤管理指導加算（特管）<', 'fieldset');
    assert.ok(tokkanGroupTag.includes('disabled=""'), 'Tokkan fieldset must be disabled when locked');

    // ロック理由バナーの表示
    assert.ok(cleanMarkup.includes('data-testid="receipt-condition-locked"'));
    assert.ok(cleanMarkup.includes(lockedReason));

    // 領収証印刷ボタンは再発行のため有効のまま
    const printBtnTag = findOpeningTag(cleanMarkup, 'data-testid="print-receipt-only-button"', 'button');
    assert.ok(
      !printBtnTag.includes('disabled=""'),
      `Print receipt button must remain enabled when only lockedReason is set: ${printBtnTag}`
    );
  });

  it('領収証印刷権限なし (canPrintReceipt=false) の場合、条件変更は可能だが領収証印刷ボタンが無効化される', () => {
    const props = createMockProps({
      canPrintReceipt: false,
      busy: false,
      lockedReason: undefined
    });
    const html = renderPanel(props);
    const cleanMarkup = stripStyleBlocks(html);

    const notebookGroupTag = findOpeningTag(cleanMarkup, 'legend>お薬手帳<', 'fieldset');
    assert.ok(!notebookGroupTag.includes('disabled=""'), 'Notebook fieldset must remain enabled');

    const printBtnTag = findOpeningTag(cleanMarkup, 'data-testid="print-receipt-only-button"', 'button');
    assert.ok(
      printBtnTag.includes('disabled=""'),
      `Print receipt button must be disabled when canPrintReceipt is false: ${printBtnTag}`
    );
  });

  it('点数未設定 (unsetFeeNames 存在) の場合、点数未確定アラートを表示し領収証印刷ボタンが無効化される', () => {
    const props = createMockProps({
      current: {
        totalPoints: 0,
        copayYen: null,
        unsetFeeNames: ['調剤基本料1', '地域支援体制加算1']
      },
      canPrintReceipt: true,
      busy: false
    });
    const html = renderPanel(props);
    const cleanMarkup = stripStyleBlocks(html);

    // 点数未確定アラート
    assert.ok(cleanMarkup.includes('data-testid="receipt-condition-unset"'));
    assert.ok(cleanMarkup.includes('調剤基本料1・地域支援体制加算1の点数が点数表に未設定のため'));

    // 印刷ボタンは disabled かつ未設定 title
    const printBtnTag = findOpeningTag(cleanMarkup, 'data-testid="print-receipt-only-button"', 'button');
    assert.ok(
      printBtnTag.includes('disabled=""'),
      `Print receipt button must be disabled when printBlocked: ${printBtnTag}`
    );
    assert.ok(
      printBtnTag.includes('title="点数が未設定のため印刷できません。"'),
      `Print receipt button title must indicate fees unset: ${printBtnTag}`
    );
  });

  it('自動判定適用ボタンの表示と disabled 制御（通常時有効、busy/lockedReason 時無効）', () => {
    // autoDiffers=true のケース
    const propsDiffers = createMockProps({
      conditions: {
        medicationNotebook: 'carried',
        afterHoursCategory: 'none',
        tokkanOverride: undefined
      },
      autoJudgement: {
        status: 'judged',
        category: 'after_hours',
        reason: '夜間受付（19:30）'
      },
      busy: false,
      lockedReason: undefined
    });

    // 1. 通常時はボタンが表示され有効
    const htmlDiffers = renderPanel(propsDiffers);
    const cleanDiffers = stripStyleBlocks(htmlDiffers);
    assert.ok(cleanDiffers.includes('data-testid="condition-apply-auto"'));
    const autoBtnTag = findOpeningTag(cleanDiffers, 'data-testid="condition-apply-auto"', 'button');
    assert.ok(
      !autoBtnTag.includes('disabled=""'),
      `Apply auto judgement button must be enabled normally: ${autoBtnTag}`
    );

    // 2. busy=true のときは disabled=""
    const htmlBusy = renderPanel({ ...propsDiffers, busy: true });
    const cleanBusy = stripStyleBlocks(htmlBusy);
    const autoBtnTagBusy = findOpeningTag(cleanBusy, 'data-testid="condition-apply-auto"', 'button');
    assert.ok(
      autoBtnTagBusy.includes('disabled=""'),
      `Apply auto judgement button must be disabled during busy: ${autoBtnTagBusy}`
    );

    // 3. lockedReason ありのときは disabled=""
    const htmlLocked = renderPanel({ ...propsDiffers, lockedReason: '請求締め済み' });
    const cleanLocked = stripStyleBlocks(htmlLocked);
    const autoBtnTagLocked = findOpeningTag(cleanLocked, 'data-testid="condition-apply-auto"', 'button');
    assert.ok(
      autoBtnTagLocked.includes('disabled=""'),
      `Apply auto judgement button must be disabled when locked: ${autoBtnTagLocked}`
    );

    // 4. autoDiffers=false のときはボタン自体が表示されない
    const htmlSame = renderPanel({
      ...propsDiffers,
      conditions: {
        medicationNotebook: 'carried',
        afterHoursCategory: 'after_hours',
        tokkanOverride: undefined
      }
    });
    assert.ok(!stripStyleBlocks(htmlSame).includes('data-testid="condition-apply-auto"'));
  });

  it('照合バーコード自費扱い警告の表示制御（assumed=true で警告表示、false で非表示）', () => {
    // assumed=true
    const propsAssumed = createMockProps({
      barcodeStatus: {
        kind: 'ok',
        payload: '999000123',
        categoryText: '自費扱い',
        amountYen: 1200,
        assumed: true,
        reason: '保険種別未登録のため自費扱い'
      }
    });
    const htmlAssumed = renderPanel(propsAssumed);
    const cleanAssumed = stripStyleBlocks(htmlAssumed);
    assert.ok(cleanAssumed.includes('data-testid="receipt-condition-barcode-assumed"'));
    assert.ok(cleanAssumed.includes('保険区分を判定できないため、自費として扱っています'));

    // assumed=false
    const propsNormal = createMockProps({
      barcodeStatus: {
        kind: 'ok',
        payload: '123456789',
        categoryText: '社保',
        amountYen: 300,
        assumed: false,
        reason: '社保本人3割'
      }
    });
    const htmlNormal = renderPanel(propsNormal);
    assert.ok(!stripStyleBlocks(htmlNormal).includes('data-testid="receipt-condition-barcode-assumed"'));
  });

  it('領収証印刷ボタンの複合 disabled 制御 (!canPrintReceipt || printBlocked || busy) を各項独立で固定', () => {
    // 1. canPrintReceipt=false のみ
    const htmlCanPrint = renderPanel(createMockProps({
      canPrintReceipt: false,
      busy: false,
      current: { totalPoints: 100, copayYen: 300, unsetFeeNames: [] }
    }));
    const tagCanPrint = findOpeningTag(stripStyleBlocks(htmlCanPrint), 'data-testid="print-receipt-only-button"', 'button');
    assert.ok(tagCanPrint.includes('disabled=""'), 'Disabled when only canPrintReceipt is false');

    // 2. printBlocked=true のみ
    const htmlPrintBlocked = renderPanel(createMockProps({
      canPrintReceipt: true,
      busy: false,
      current: { totalPoints: 0, copayYen: null, unsetFeeNames: ['基本料'] }
    }));
    const tagPrintBlocked = findOpeningTag(stripStyleBlocks(htmlPrintBlocked), 'data-testid="print-receipt-only-button"', 'button');
    assert.ok(tagPrintBlocked.includes('disabled=""'), 'Disabled when only printBlocked is true');

    // 3. busy=true のみ
    const htmlBusy = renderPanel(createMockProps({
      canPrintReceipt: true,
      busy: true,
      current: { totalPoints: 100, copayYen: 300, unsetFeeNames: [] }
    }));
    const tagBusy = findOpeningTag(stripStyleBlocks(htmlBusy), 'data-testid="print-receipt-only-button"', 'button');
    assert.ok(tagBusy.includes('disabled=""'), 'Disabled when only busy is true');

    // 4. 全項目が偽（正常時）
    const htmlAllValid = renderPanel(createMockProps({
      canPrintReceipt: true,
      busy: false,
      current: { totalPoints: 100, copayYen: 300, unsetFeeNames: [] }
    }));
    const tagAllValid = findOpeningTag(stripStyleBlocks(htmlAllValid), 'data-testid="print-receipt-only-button"', 'button');
    assert.ok(!tagAllValid.includes('disabled=""'), 'Enabled when all three flags allow printing');
  });
});
