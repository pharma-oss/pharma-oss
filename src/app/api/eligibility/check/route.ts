import { NextRequest, NextResponse } from 'next/server';
import {
  OnlineEligibilityConnectorError,
  requestOnlineEligibility,
  type OnlineEligibilityConnectorMode
} from '@/lib/online_eligibility_client';
import { getAppEnv } from '@/lib/env';

const INSURANCE_NUMBER_REGEX = /^\d{6,10}$/;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const insuranceNumber = String(body.insuranceNumber || '').replace(/[^\d]/g, '');
  const insuredNumber = String(body.insuredNumber || '').trim();
  const burdenRatio = body.burdenRatio !== undefined ? Number(body.burdenRatio) : undefined;

  if (!insuranceNumber) {
    return NextResponse.json(
      {
        status: 'warning',
        resultCode: '02',
        qualificationStatus: 'warning',
        message: '保険者番号が未入力です。'
      },
      { status: 400 }
    );
  }

  if (!INSURANCE_NUMBER_REGEX.test(insuranceNumber)) {
    return NextResponse.json({
      status: 'warning',
      resultCode: '02',
      qualificationStatus: 'warning',
      insurerNumber: insuranceNumber,
      message: '保険者番号の桁数を確認してください。'
    });
  }

  const env = getAppEnv();

  try {
    const result = await requestOnlineEligibility({
      patientName: String(body.patientName || '').trim(),
      birthDate: String(body.birthDate || '').trim(),
      insuranceNumber,
      insuredNumber,
      burdenRatio
    }, {
      endpoint: env.onlineEligibilityEndpoint || undefined,
      bearerToken: env.onlineEligibilityBearerToken || undefined,
      mode: env.onlineEligibilityMode as OnlineEligibilityConnectorMode,
      allowMockFallback: env.nodeEnv !== 'production' && env.onlineEligibilityAllowMock,
      timeoutMs: env.onlineEligibilityTimeoutMs
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OnlineEligibilityConnectorError) {
      return NextResponse.json(
        {
          status: 'unavailable',
          resultCode: '99',
          qualificationStatus: 'unavailable',
          code: error.code,
          message: error.message
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        status: 'unavailable',
        resultCode: '99',
        qualificationStatus: 'unavailable',
        code: 'online_eligibility_unexpected_error',
        message: '資格確認で予期しないエラーが発生しました。'
      },
      { status: 500 }
    );
  }
}
