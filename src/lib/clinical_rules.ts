export interface UsageWarningContext {
  amount: number;
  dose?: number;
  age?: number;
  diseases: string[];
}

export interface UsageWarningEvaluation {
  /** 条件が成立したか。unevaluable が true のときは常に false。 */
  triggered: boolean;
  /** 条件の評価に必要な値（年齢など）が揃わず判定できなかったか。 */
  unevaluable: boolean;
}

function getNumericValue(field: string, context: UsageWarningContext): number | undefined {
  if (field === 'amount') return context.amount;
  if (field === 'dose') return context.dose ?? context.amount;
  if (field === 'age') return context.age;
  return undefined;
}

function compareNumeric(left: number, operator: string, right: number): boolean {
  switch (operator) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '==':
    case '===':
    case '=':
      return left === right;
    default:
      return false;
  }
}

export function evaluateUsageWarning(
  condition: string,
  context: UsageWarningContext
): UsageWarningEvaluation {
  const normalized = condition.trim();
  const numericMatch = normalized.match(/^(amount|dose|age)\s*(>=|<=|===|==|=|>|<)\s*(-?\d+(?:\.\d+)?)$/);

  if (numericMatch) {
    const field = numericMatch[1];
    const left = getNumericValue(field, context);
    const right = Number(numericMatch[3]);

    if (field === 'age' && (left === undefined || !Number.isFinite(left))) {
      return { triggered: false, unevaluable: true };
    }

    if (left === undefined || !Number.isFinite(left) || !Number.isFinite(right)) {
      return { triggered: false, unevaluable: false };
    }
    return {
      triggered: compareNumeric(left, numericMatch[2], right),
      unevaluable: false
    };
  }

  const diseaseMatch = normalized.match(/^diseases\s*&&\s*diseases\.includes\((['"])(.*?)\1\)$/);
  if (diseaseMatch) {
    return {
      triggered: context.diseases.includes(diseaseMatch[2]),
      unevaluable: false
    };
  }

  return { triggered: false, unevaluable: false };
}

export function evaluateUsageWarningCondition(condition: string, context: UsageWarningContext): boolean {
  return evaluateUsageWarning(condition, context).triggered;
}
