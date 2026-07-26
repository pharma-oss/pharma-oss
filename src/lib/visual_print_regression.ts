export type PrintPresetTarget = 'a4_receipt' | 'a4_tracing' | 'roll_80mm' | 'medicine_bag';

export interface PrintLayoutCheckRule {
  target: PrintPresetTarget;
  requiredPageSize: string; // e.g. "A4", "80mm"
  requiredSelectors: string[];
  requiredTextKeywords: string[];
  preventOverflowSelectors?: string[];
}

export interface PrintLayoutValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function verifyPrintLayoutStructure(
  html: string,
  rule: PrintLayoutCheckRule
): PrintLayoutValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!html || !html.trim()) {
    return { valid: false, errors: ['HTML文面が空です。'], warnings };
  }

  const normalizedHtml = html.toLowerCase();

  if (!normalizedHtml.includes('@page')) {
    warnings.push('@page 印刷制御メディアクエリが見つかりません。');
  } else {
    const pageSizePattern = rule.requiredPageSize.toLowerCase();
    if (!normalizedHtml.includes(pageSizePattern)) {
      errors.push(`@page サイズ指定に "${rule.requiredPageSize}" が含まれていません。`);
    }
  }

  rule.requiredTextKeywords.forEach((keyword) => {
    if (!html.includes(keyword)) {
      errors.push(`必須テキストキーワード "${keyword}" が帳票HTML内に見つかりません。`);
    }
  });

  rule.requiredSelectors.forEach((selector) => {
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      const hasClassAttr = new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`, 'i').test(html);
      if (!hasClassAttr) {
        errors.push(`必須要素クラス "${selector}" が見つかりません。`);
      }
    } else if (selector.startsWith('#')) {
      const idName = selector.slice(1);
      if (!normalizedHtml.includes(`id="${idName}"`) && !normalizedHtml.includes(`id='${idName}'`)) {
        errors.push(`必須要素ID "${selector}" が見つかりません。`);
      }
    } else {
      if (!normalizedHtml.includes(`<${selector}`)) {
        errors.push(`必須HTMLタグ "<${selector}>" が見つかりません。`);
      }
    }
  });

  if (rule.target === 'roll_80mm') {
    if (normalizedHtml.includes('width: 100%') && !normalizedHtml.includes('max-width: 80mm') && !normalizedHtml.includes('width: 72mm') && !normalizedHtml.includes('width: 80mm')) {
      warnings.push('80mmロール紙用帳票において幅指定(80mm/72mm)が不足している可能性があります。');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
