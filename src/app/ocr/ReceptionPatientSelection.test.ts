import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Patient } from '@/db/types';
import { EMPTY_PATIENT_REGISTRATION_FORM } from '@/lib/patient_registration';
import { getMynaReaderButtonView } from '@/lib/myna_read_display';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';
import { buildSelectedPatientFormState } from '@/hooks/useOcrPatientEligibility';
import {
  RECEPTION_SELECTED_PATIENT_NOT_FOUND_TOAST,
  buildPatientRegistrationInitialState,
  buildReceptionPatientSearchQueryForSource,
  buildReceptionPatientUpdatePayload,
  buildReceptionReadinessSteps,
  createEmptyPrescription,
  resolveReceptionTargetPatient,
  validateReceptionSaveInputs
} from './helpers';
import {
  PatientNotFoundPrompt,
  ReceptionPatientSearchBar
} from './components/ReceptionPatientSearchBar';

// 処方箋受付は、登録済みの患者を検索して選び、初めての方は先に患者登録をしてから受け付ける。
// 純粋ヘルパーの実実行と受付UI部品の renderToStaticMarkup で契約を固定する。
describe('reception page selects an existing patient and registers new ones first', () => {
  const validPrescription = createEmptyPrescription('rp_1', {
    id: 'item_1',
    drugCode: '620000001',
    drugName: 'アムロジピン錠5mg',
    amount: '1',
    usage: '1日1回朝食後',
    days: '14'
  });

  it('stops before any write when no patient is selected, and tells the user to register first', () => {
    const outcome = validateReceptionSaveInputs({
      selectedPatientId: null,
      insuranceNumber: '06139999',
      institutionName: '東京内科クリニック',
      departmentName: '内科',
      doctorName: '山田 医師',
      prescriptionDate: '2026-11-21',
      dispensingDate: '2026-11-21',
      prescriptions: [validPrescription]
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.kind, 'alert');
      assert.ok(outcome.message.includes('新規患者を登録'), 'the message must point to the registration button');
    }

    const okOutcome = validateReceptionSaveInputs({
      selectedPatientId: 'pt_1',
      insuranceNumber: '06139999',
      institutionName: '東京内科クリニック',
      departmentName: '内科',
      doctorName: '山田 医師',
      prescriptionDate: '2026-11-21',
      dispensingDate: '2026-11-21',
      prescriptions: [validPrescription]
    });
    assert.deepEqual(okOutcome, { ok: true });
  });

  it('re-reads the selected patient right before saving and refuses silent creation when missing', async () => {
    const existing: Patient = {
      patientId: 'pt_existing',
      name: '山田 太郎',
      kana: 'ヤマダ タロウ',
      birthDate: '1985-03-15',
      insuranceInfo: { provider: '06139999', number: '記号12 番号345', burdenRatio: 30 }
    };

    const missing = await resolveReceptionTargetPatient(
      async () => null,
      'pt_deleted_by_merge'
    );
    assert.deepEqual(missing, {
      ok: false,
      toastMessage: RECEPTION_SELECTED_PATIENT_NOT_FOUND_TOAST
    });

    const found = await resolveReceptionTargetPatient(
      async (id) => (id === 'pt_existing' ? { toJSON: () => existing } : null),
      'pt_existing'
    );
    assert.equal(found.ok, true);
    if (found.ok) {
      assert.equal(found.existingPatient.patientId, 'pt_existing');
      assert.equal(found.existingPatient.name, '山田 太郎');
    }
  });

  it('keeps the selected patient master name and birthDate and writes insurer number to the right field', () => {
    const existingMaster: Patient = {
      patientId: 'pt_master',
      name: '正本 太郎',
      kana: 'セイホン タロウ',
      birthDate: '1980-04-01',
      insuranceInfo: { provider: '06139999', number: '記号12 番号345', burdenRatio: 30 }
    };

    const update = buildReceptionPatientUpdatePayload({
      existingPatient: existingMaster,
      insuranceNumber: '06138888',
      burdenRatio: '20',
      eligibilityStatus: 'unchecked',
      eligibilityResult: null
    });
    assert.equal(update.name, '正本 太郎');
    assert.equal(update.birthDate, '1980-04-01');
    // 保険者番号は provider に入り、記号・番号 (number) は上書きされないこと
    assert.equal(update.insuranceInfo.provider, '06138888');
    assert.equal(update.insuranceInfo.number, '記号12 番号345');
    assert.equal(update.insuranceInfo.burdenRatio, 20);

    // 旧形式(numberに保険者番号が入っていた患者)は number を維持して更新する
    const legacyMaster: Patient = {
      patientId: 'pt_legacy',
      name: '旧形式 花子',
      kana: 'キュウケイシキ ハナコ',
      birthDate: '1970-01-01',
      insuranceInfo: { number: '138012', burdenRatio: 30 }
    };
    const legacyUpdate = buildReceptionPatientUpdatePayload({
      existingPatient: legacyMaster,
      insuranceNumber: '138099',
      burdenRatio: '30',
      eligibilityStatus: 'unchecked',
      eligibilityResult: null
    });
    assert.equal(legacyUpdate.insuranceInfo.number, '138099');
    assert.equal(legacyUpdate.insuranceInfo.provider, undefined);
  });

  it('renders a patient search input and registration triggers instead of free-text patient name/birthDate inputs', () => {
    const searchHtml = renderToStaticMarkup(
      React.createElement(ReceptionPatientSearchBar, {
        patientSearchQuery: '山田 19850315',
        onPatientSearchQueryChange: () => {},
        hasImage: false,
        isReadingMyna: false,
        mynaReadButton: getMynaReaderButtonView({ status: 'ready', available: false }, 'マイナ読取'),
        mynaMessage: '',
        hasDb: true,
        onMynaRead: () => {},
        onOpenPatientRegistration: () => {}
      })
    );
    assert.equal(searchHtml.includes('id="patientName"'), false);
    assert.equal(searchHtml.includes('id="patientBirthDate"'), false);
    const searchInputTag = findOpeningTag(searchHtml, 'data-testid="patient-search-input"', 'input');
    assert.ok(searchInputTag.includes('id="patientSearch"'));
    assert.ok(searchInputTag.includes('value="山田 19850315"'));
    assert.ok(searchHtml.includes('data-testid="patient-register-open-button"'));

    const emptyPromptHtml = renderToStaticMarkup(
      React.createElement(PatientNotFoundPrompt, {
        prompt: '該当する患者が見つかりません。',
        hasDb: true,
        onOpenPatientRegistration: () => {}
      })
    );
    assert.ok(emptyPromptHtml.includes('data-testid="patient-not-found-note"'));
    assert.ok(emptyPromptHtml.includes('data-testid="patient-register-from-empty-button"'));
  });

  it('fills the search query consistently across QR, OCR, electronic prescription, and Myna sources', () => {
    const sources = ['qr', 'ocr', 'electronic_prescription', 'myna'] as const;
    for (const source of sources) {
      assert.equal(
        buildReceptionPatientSearchQueryForSource(source, { name: '山田 太郎', birthDate: '1985-03-15' }),
        '山田 太郎 1985-03-15'
      );
    }
  });

  it('reloads insurer number and burden ratio from the selected patient and matching Myna read', () => {
    const patient: Patient = {
      patientId: 'pt_sel',
      name: '佐藤 花子',
      kana: 'サトウ ハナコ',
      birthDate: '1990-07-07',
      insuranceInfo: { provider: '06139999', burdenRatio: 20 }
    };
    const withoutMyna = buildSelectedPatientFormState(patient, null);
    assert.deepEqual(withoutMyna, {
      selectedPatientId: 'pt_sel',
      patientName: '佐藤 花子',
      patientBirthDate: '1990-07-07',
      insuranceNumber: '06139999',
      burdenRatio: '20'
    });

    const withMatchingMyna = buildSelectedPatientFormState(patient, {
      name: '佐藤 花子',
      kana: 'サトウ ハナコ',
      birthDate: '1990-07-07',
      insuranceInfo: { provider: '06137777', burdenRatio: 10 },
      readerSource: 'folder',
      readerCheckedAt: '2026-11-21T09:00:00.000Z',
      readerMessage: '読取完了'
    });
    assert.equal(withMatchingMyna.insuranceNumber, '06137777');
    assert.equal(withMatchingMyna.burdenRatio, '10');
  });

  it('starts the registration form empty while a patient is selected and never carries another person Myna read', () => {
    const whenSelected = buildPatientRegistrationInitialState({
      selectedPatientId: 'pt_existing',
      patientSearchQuery: '山田 太郎 19850315',
      patientName: '山田 太郎',
      patientBirthDate: '1985-03-15',
      mynaReadResult: {
        name: '山田 太郎',
        kana: 'ヤマダ タロウ',
        birthDate: '1985-03-15',
        gender: 'male',
        insuranceInfo: { provider: '06139999', burdenRatio: 30 },
        readerSource: 'folder',
        readerCheckedAt: '2026-11-21T09:00:00.000Z',
        readerMessage: '読取完了'
      }
    });
    assert.deepEqual(whenSelected, { form: EMPTY_PATIENT_REGISTRATION_FORM, fromMyna: false });

    // 別人のマイナ読取結果は初期値に持ち込まない
    const differentPersonMyna = buildPatientRegistrationInitialState({
      selectedPatientId: null,
      patientSearchQuery: '鈴木 次郎 19780402',
      patientName: '鈴木 次郎',
      patientBirthDate: '1978-04-02',
      mynaReadResult: {
        name: '山田 太郎',
        kana: 'ヤマダ タロウ',
        birthDate: '1985-03-15',
        gender: 'male',
        insuranceInfo: { provider: '06139999', burdenRatio: 10 },
        readerSource: 'folder',
        readerCheckedAt: '2026-11-21T09:00:00.000Z',
        readerMessage: '読取完了'
      }
    });
    assert.equal(differentPersonMyna.fromMyna, false);
    assert.equal(differentPersonMyna.form.name, '鈴木 次郎');
    assert.equal(differentPersonMyna.form.insurerNumber, '');
  });

  it('marks the patient step done only when a patient is selected', () => {
    const unselectedSteps = buildReceptionReadinessSteps({
      selectedPatientId: null,
      institutionName: '東京内科',
      departmentName: '内科',
      doctorName: '山田',
      missingPrescriptionTotal: 0
    });
    assert.deepEqual(unselectedSteps[0], {
      key: 'patient',
      label: '患者',
      ready: false,
      text: '未選択'
    });

    const selectedSteps = buildReceptionReadinessSteps({
      selectedPatientId: 'pt_1',
      institutionName: '東京内科',
      departmentName: '内科',
      doctorName: '山田',
      missingPrescriptionTotal: 0
    });
    assert.deepEqual(selectedSteps[0], {
      key: 'patient',
      label: '患者',
      ready: true,
      text: '選択済'
    });
  });

  it('allows empty departmentName in reception save validation and readiness steps while requiring institutionName and doctorName', () => {
    const okWithoutDept = validateReceptionSaveInputs({
      selectedPatientId: 'pt_1',
      insuranceNumber: '06139999',
      institutionName: '佐藤クリニック',
      departmentName: '',
      doctorName: '佐藤 一郎',
      prescriptionDate: '2026-11-22',
      dispensingDate: '2026-11-22',
      prescriptions: [validPrescription]
    });
    assert.deepEqual(okWithoutDept, { ok: true });

    const missingInstitution = validateReceptionSaveInputs({
      selectedPatientId: 'pt_1',
      insuranceNumber: '06139999',
      institutionName: '   ',
      departmentName: '',
      doctorName: '佐藤 一郎',
      prescriptionDate: '2026-11-22',
      dispensingDate: '2026-11-22',
      prescriptions: [validPrescription]
    });
    assert.equal(missingInstitution.ok, false);

    const missingDoctor = validateReceptionSaveInputs({
      selectedPatientId: 'pt_1',
      insuranceNumber: '06139999',
      institutionName: '佐藤クリニック',
      departmentName: '',
      doctorName: '   ',
      prescriptionDate: '2026-11-22',
      dispensingDate: '2026-11-22',
      prescriptions: [validPrescription]
    });
    assert.equal(missingDoctor.ok, false);

    const stepsWithoutDept = buildReceptionReadinessSteps({
      selectedPatientId: 'pt_1',
      institutionName: '佐藤クリニック',
      departmentName: '',
      doctorName: '佐藤 一郎',
      missingPrescriptionTotal: 0
    });
    assert.deepEqual(stepsWithoutDept[1], {
      key: 'provider',
      label: '処方元',
      ready: true,
      text: '入力済'
    });
  });
});
