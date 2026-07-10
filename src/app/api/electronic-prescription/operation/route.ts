import { NextRequest, NextResponse } from 'next/server';
import { submitElectronicPrescriptionOperation } from '@/lib/electronic_prescription_client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await submitElectronicPrescriptionOperation({
      operation: typeof body?.operation === 'string' ? body.operation : undefined,
      prescriptionId: typeof body?.prescriptionId === 'string' ? body.prescriptionId : undefined,
      prescriptionIds: Array.isArray(body?.prescriptionIds)
        ? body.prescriptionIds.filter((value: unknown): value is string => typeof value === 'string').slice(0, 21)
        : undefined,
      dispensingResultId: typeof body?.dispensingResultId === 'string' ? body.dispensingResultId : undefined,
      integrityHash: typeof body?.integrityHash === 'string' ? body.integrityHash : undefined,
      reason: typeof body?.reason === 'string' ? body.reason : undefined,
      signatureRequirement: body?.signatureRequirement,
      payload: body?.payload
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      status: 'invalid_request',
      mode: 'off',
      message: '電子処方箋操作リクエストを処理できませんでした。',
      warnings: []
    }, { status: 400 });
  }
}
