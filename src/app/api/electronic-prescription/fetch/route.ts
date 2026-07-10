import { NextRequest, NextResponse } from 'next/server';
import { fetchElectronicPrescription } from '@/lib/electronic_prescription_client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await fetchElectronicPrescription({
      fetchKey: String(body?.fetchKey || ''),
      keyKind: body?.keyKind,
      insuredNumber: typeof body?.insuredNumber === 'string' ? body.insuredNumber : undefined,
      patientBirthDate: typeof body?.patientBirthDate === 'string' ? body.patientBirthDate : undefined
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      status: 'error',
      mode: 'off',
      message: '電子処方箋取得リクエストを処理できませんでした。',
      warnings: []
    }, { status: 400 });
  }
}
