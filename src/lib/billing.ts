export interface InsuranceAmountBreakdown {
  totalPoints: number;
  burdenRatio: number;
  totalCostYen: number;
  rawPatientCopayYen: number;
  patientCopayYen: number;
  insurerBurdenYen: number;
}

function normalizeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function calculateInsuranceAmounts(totalPoints: number, burdenRatio = 30): InsuranceAmountBreakdown {
  const normalizedPoints = Math.max(0, Math.round(normalizeNumber(totalPoints, 0)));
  const normalizedBurdenRatio = Math.min(100, Math.max(0, normalizeNumber(burdenRatio, 30)));
  const totalCostYen = normalizedPoints * 10;
  const rawPatientCopayYen = totalCostYen * (normalizedBurdenRatio / 100);

  return {
    totalPoints: normalizedPoints,
    burdenRatio: normalizedBurdenRatio,
    totalCostYen,
    rawPatientCopayYen,
    patientCopayYen: Math.round(rawPatientCopayYen / 10) * 10,
    insurerBurdenYen: totalCostYen - Math.round(rawPatientCopayYen / 10) * 10
  };
}

export function formatYen(value: number): string {
  return Math.round(value).toLocaleString('ja-JP');
}
