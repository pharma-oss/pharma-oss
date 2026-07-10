export interface UsageWarningContext {
  amount: number;
  dose?: number;
  age: number;
  diseases: string[];
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

export function evaluateUsageWarningCondition(condition: string, context: UsageWarningContext): boolean {
  const normalized = condition.trim();
  const numericMatch = normalized.match(/^(amount|dose|age)\s*(>=|<=|===|==|=|>|<)\s*(-?\d+(?:\.\d+)?)$/);

  if (numericMatch) {
    const left = getNumericValue(numericMatch[1], context);
    const right = Number(numericMatch[3]);
    if (left === undefined || !Number.isFinite(left) || !Number.isFinite(right)) {
      return false;
    }
    return compareNumeric(left, numericMatch[2], right);
  }

  const diseaseMatch = normalized.match(/^diseases\s*&&\s*diseases\.includes\((['"])(.*?)\1\)$/);
  if (diseaseMatch) {
    return context.diseases.includes(diseaseMatch[2]);
  }

  return false;
}
