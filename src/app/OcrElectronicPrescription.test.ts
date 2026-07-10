import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ocrSource = readFileSync(new URL('./ocr/page.tsx', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('./api/electronic-prescription/fetch/route.ts', import.meta.url), 'utf8');
const operationRouteSource = readFileSync(new URL('./api/electronic-prescription/operation/route.ts', import.meta.url), 'utf8');

test('ocr page exposes electronic prescription intake without claiming demo as production', () => {
  assert.match(ocrSource, /data-testid="electronic-prescription-entry"/);
  assert.match(ocrSource, /data-testid="electronic-prescription-panel"/);
  assert.match(ocrSource, /data-testid="electronic-prescription-key-kind"/);
  assert.match(ocrSource, /data-testid="electronic-prescription-key-kind-exchange"/);
  assert.match(ocrSource, /data-testid="electronic-prescription-key-kind-prescription-id"/);
  assert.match(ocrSource, /data-testid="electronic-prescription-key"/);
  assert.match(ocrSource, /data-testid="electronic-prescription-insured-number"/);
  assert.match(ocrSource, /data-testid="electronic-prescription-fetch"/);
  assert.match(ocrSource, /data-testid="electronic-prescription-review"/);
  assert.match(ocrSource, /data-testid="electronic-prescription-apply"/);
  assert.match(ocrSource, /\/api\/electronic-prescription\/fetch/);
  assert.match(ocrSource, /keyKind: electronicPrescriptionKeyKind/);
  assert.match(ocrSource, /接続先未設定時は取得せず、デモ応答も本番受付へ反映しません/);
  assert.match(ocrSource, /現在の処方入力を電子処方箋の内容で置き換えます/);
  assert.match(ocrSource, /同一患者・同一医療機関・同日発行の電子処方箋/);
  assert.match(ocrSource, /linkedPrescriptions/);
  assert.match(ocrSource, /同日処方として追加/);
  assert.match(ocrSource, /unitCode: item\.unitCode/);
  assert.match(ocrSource, /electronicUnitConversion/);
  assert.match(ocrSource, /electronicUsageFallbackText/);
  assert.match(ocrSource, /electronicUsageSupplementText/);
  assert.match(ocrSource, /electronicSourceDrugName/);
  assert.match(ocrSource, /electronicMasterDrugName/);
  assert.match(ocrSource, /electronicDrugNameVerificationStatus/);
  assert.match(ocrSource, /data-testid="electronic-prescription-supplementary"/);
  assert.match(ocrSource, /検査値/);
  assert.match(ocrSource, /麻薬施用情報/);
  assert.match(ocrSource, /prescribedDrugCodeStatus/);
  assert.match(ocrSource, /signatureHpkiVerification/);
  assert.match(ocrSource, /hpkiVerification/);
  assert.match(ocrSource, /dispensingResultEverRegistered: false/);
  assert.match(ocrSource, /buildElectronicPrescriptionApplyDecision/);
  assert.match(ocrSource, /重複投薬・併用禁忌の注意内容を確認してください/);
  assert.match(ocrSource, /紙の処方箋原本を受領し、取得内容と照合しました/);
  assert.match(ocrSource, /electronic_prescription/);
});

test('electronic prescription api route delegates to the safe client', () => {
  assert.match(routeSource, /fetchElectronicPrescription/);
  assert.match(routeSource, /fetchKey/);
  assert.match(routeSource, /insuredNumber/);
  assert.match(routeSource, /patientBirthDate/);
  assert.match(operationRouteSource, /submitElectronicPrescriptionOperation/);
  assert.match(operationRouteSource, /dispensingResultId/);
  assert.match(operationRouteSource, /prescriptionIds/);
  assert.match(operationRouteSource, /integrityHash/);
  assert.match(operationRouteSource, /signatureRequirement/);
  assert.match(operationRouteSource, /payload/);
});
