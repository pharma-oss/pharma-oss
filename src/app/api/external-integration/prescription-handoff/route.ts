import { NextRequest, NextResponse } from 'next/server';
import { submitPharmacyDeviceOperation } from '@/lib/pharmacy_device_connector_client';
import {
  isPharmacyDeviceConnectorSimulatorEnabled,
  submitPharmacyDeviceSimulatorOperation
} from '@/lib/pharmacy_device_connector_simulator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = {
      operation: typeof body?.operation === 'string' ? body.operation : undefined,
      previousTransferId: typeof body?.previousTransferId === 'string' ? body.previousTransferId : undefined,
      reason: typeof body?.reason === 'string' ? body.reason : undefined,
      payload: body?.payload
    };
    const result = isPharmacyDeviceConnectorSimulatorEnabled()
      ? await submitPharmacyDeviceSimulatorOperation(input)
      : await submitPharmacyDeviceOperation(input);
    return NextResponse.json(result, { status: result.status === 'invalid_request' ? 400 : 200 });
  } catch {
    return NextResponse.json({
      status: 'invalid_request',
      message: '外部調剤機器への送信内容を処理できませんでした。'
    }, { status: 400 });
  }
}
