import { test } from 'node:test';
import assert from 'node:assert';
import { buildOcrConfidenceReport } from './ocr_confidence.ts';

test('buildOcrConfidenceReport scores complete OCR input as high confidence', () => {
  const report = buildOcrConfidenceReport({
    ocrText: '山田太郎 1980年1月1日 保険者番号 12345678 青空クリニック 内科 鈴木医師 アムロジピン錠5mg 1日1回 朝食後 28日分',
    patientName: '山田太郎',
    patientBirthDate: '1980-01-01',
    insuranceNumber: '12345678',
    institutionName: '青空クリニック',
    departmentName: '内科',
    doctorName: '鈴木医師',
    prescriptions: [
      {
        drugName: 'アムロジピン錠5mg',
        amount: '1',
        usage: '1日1回 朝食後',
        days: '28'
      }
    ]
  });

  assert.equal(report.tone, 'green');
  assert.ok(report.score >= 85);
  assert.ok(report.evidence.some((item) => item.includes('OCR本文')));
  assert.equal(report.reviewPoints.length, 0);
});

test('buildOcrConfidenceReport highlights missing required fields and prescription details', () => {
  const report = buildOcrConfidenceReport({
    ocrText: '処方箋 □□ ? アムロジピン',
    patientName: '',
    patientBirthDate: '',
    institutionName: '',
    departmentName: '内科',
    doctorName: '',
    prescriptions: [
      {
        drugName: '',
        amount: '',
        usage: '',
        days: ''
      }
    ]
  });

  assert.equal(report.tone, 'red');
  assert.ok(report.score < 65);
  assert.ok(report.reviewPoints.some((point) => point.label === '患者名'));
  assert.ok(report.reviewPoints.some((point) => point.label === '文字認識'));
  assert.ok(report.reviewPoints.some((point) => point.label === '処方薬1'));
  assert.ok(report.reviewPoints.every((point) => point.suggestedAction));
});

test('buildOcrConfidenceReport asks for manual review when input is not found in OCR text', () => {
  const report = buildOcrConfidenceReport({
    ocrText: '佐藤花子 さくら薬局',
    patientName: '佐藤花子',
    patientBirthDate: '1975-05-01',
    insuranceNumber: '１２３４',
    institutionName: '海辺クリニック',
    departmentName: '循環器内科',
    doctorName: '田中医師',
    prescriptions: [
      {
        drugName: 'ワルファリン錠1mg',
        amount: '1',
        usage: '1日1回',
        days: '14'
      }
    ]
  });

  assert.equal(report.tone, 'red');
  assert.ok(report.score < 65);
  assert.ok(report.reviewPoints.some((point) => point.field === 'institutionName'));
  assert.ok(report.reviewPoints.some((point) => point.field === 'insuranceNumber'));
  assert.ok(report.reviewPoints.some((point) => point.field === 'prescriptions.0.drugName'));
});
