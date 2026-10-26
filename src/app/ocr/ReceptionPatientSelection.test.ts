import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 処方箋受付は、登録済みの患者を検索して選び、初めての方は先に患者登録をしてから受け付ける。
// 受付ページ全体は単体描画できないため、その配線を画面ソースで確かめる
// (検索・登録の判定そのものは patient_search / patient_registration のテストが担う)。
describe('reception page selects an existing patient and registers new ones first', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'ocr', 'page.tsx'), 'utf-8');
  const saveStart = content.indexOf('const handleSave = async () => {');
  const saveBody = content.slice(saveStart, content.indexOf('const isEditorOpen', saveStart));

  it('the save handler stops before any write when no patient is selected, and says to register first', () => {
    assert.ok(saveStart > 0, 'handleSave must exist');
    const guard = saveBody.indexOf('if (!selectedPatientId) {');
    const firstWrite = saveBody.indexOf('registerPrescriptionAtomically(');
    assert.ok(guard > 0, 'the selection guard must exist');
    assert.ok(guard < firstWrite, 'the guard must run before the prescription is written');
    const guardBody = saveBody.slice(guard, saveBody.indexOf('return;', guard));
    assert.ok(guardBody.includes('alert('), 'the guard must tell the user');
    assert.ok(guardBody.includes('新規患者を登録'), 'the message must point to the registration button');
  });

  it('never creates a patient silently at save time', () => {
    assert.equal(content.includes('簡易新規患者登録'), false, 'the old simple-registration audit wording must be gone');
    assert.equal(content.includes('`pt_${generateUUID()}`'), false, 'the reception must not mint patient IDs itself');
    assert.equal(content.includes('findMatchingPatient'), false, 'the reception must not fall back to name matching at save');
    assert.ok(saveBody.includes('db.patients.findOne(selectedPatientId)'), 'the selected patient is re-read right before saving');
    assert.ok(saveBody.includes("toast.error('選択した患者が見つかりません。患者を選び直してください。')"));
  });

  it('keeps the selected patient\'s name and birth date from the master, whatever the prescription read says', () => {
    assert.ok(saveBody.includes('name: existingPatient.name,'));
    assert.ok(saveBody.includes('birthDate: existingPatient.birthDate,'));
    assert.equal(/name:\s*patientName,/.test(saveBody), false, 'the master must not be renamed from the reception field');
  });

  it('writes the insurer number to the field it belongs to, not always to number', () => {
    assert.ok(saveBody.includes('buildReceptionInsuranceNumberPatch(existingPatient.insuranceInfo, insuranceNumber)'));
    assert.equal(saveBody.includes('number: currentInsuranceNumber'), false);
  });

  it('replaces the free-text patient name and birth date fields with a patient search', () => {
    assert.equal(content.includes('id="patientName"'), false);
    assert.equal(content.includes('id="patientBirthDate"'), false);
    const search = content.slice(content.indexOf('id="patientSearch"') - 100, content.indexOf('id="patientSearch"') + 700);
    assert.ok(search.includes('value={patientSearchQuery}'));
    assert.ok(search.includes('setPatientSearchQuery(e.target.value)'));
    assert.ok(search.includes('data-testid="patient-search-input"'));
    // 手入力受付を始めたとき、続けて検索できるよう検索欄へ進める
    assert.ok(content.includes("document.getElementById('patientSearch')"));
  });

  it('fills the search from every source that learns the patient (QR, OCR text, electronic prescription, Myna card)', () => {
    const fromPrescription = content.match(/setPatientSearchQuery\(buildPatientSearchQuery\(/g) || [];
    assert.ok(fromPrescription.length >= 3, `QR, OCR and electronic prescription must feed the search (found ${fromPrescription.length})`);
    const hook = fs.readFileSync(path.join(process.cwd(), 'src', 'hooks', 'useOcrPatientEligibility.ts'), 'utf-8');
    assert.ok(hook.includes('setPatientSearchQuery(buildPatientSearchQuery({ name: data.name, birthDate }))'), 'the Myna read must search by the card\'s name and birth date');
  });

  it('selecting a patient (by click, auto-match or registration) reloads the insurer number and burden from that patient', () => {
    const hook = fs.readFileSync(path.join(process.cwd(), 'src', 'hooks', 'useOcrPatientEligibility.ts'), 'utf-8');
    const select = hook.slice(hook.indexOf('const selectPatient = useCallback'), hook.indexOf('// 処方箋・QR・マイナ読取で氏名と生年月日'));
    assert.ok(select.includes('resolveReceptionInsuranceFields(patient, mynaReadResult)'));
    assert.ok(select.includes('setInsuranceNumber(insuranceFields.insuranceNumber)'));
    assert.ok(select.includes('setBurdenRatio(insuranceFields.burdenRatio)'));
    // 候補のクリックは、その患者を選ぶ関数をそのまま呼ぶ
    assert.ok(content.includes('onClick={() => selectPatient(patient)}'));
    // 登録済みの患者だと分かって選ぶ操作も、同じ関数を通る
    const existing = content.slice(content.indexOf('const handleSelectExistingFromRegistration'), content.indexOf('const openPatientMergeReview'));
    assert.ok(existing.includes('selectPatient(patient)'));
  });

  it('opens the registration dialog from the search row and from the not-found note, and selects the registered patient', () => {
    assert.ok(content.includes('data-testid="patient-register-open-button"'));
    assert.ok(content.includes('data-testid="patient-register-from-empty-button"'));
    const modal = content.slice(content.indexOf('<PatientRegistrationModal'), content.indexOf('/>', content.indexOf('<PatientRegistrationModal')));
    for (const prop of ['db={db}', 'initialForm={patientRegistrationInitial.form}', 'mynaReaderState={mynaReaderState}', 'onRegistered={handlePatientRegistered}', 'onSelectExisting={handleSelectExistingFromRegistration}']) {
      assert.ok(modal.includes(prop), `the dialog must receive ${prop}`);
    }
    const registered = content.slice(content.indexOf('const handlePatientRegistered'), content.indexOf('const handleSelectExistingFromRegistration'));
    assert.ok(registered.includes('selectPatient('), 'a registered patient is selected so reception continues');
  });

  it('starts the registration form empty while a patient is selected, so a different new person is not pre-filled with them', () => {
    const initial = content.slice(content.indexOf('const patientRegistrationInitial'), content.indexOf('const openPatientRegistration'));
    assert.ok(initial.includes('if (selectedPatientId) return { form: EMPTY_PATIENT_REGISTRATION_FORM, fromMyna: false };'));
    assert.ok(initial.includes('checkMynaReadMatchesPatient('), 'a Myna read of someone else must not be carried into the form');
  });

  it('marks the patient step done only when a patient is selected', () => {
    assert.ok(content.includes("{ key: 'patient', label: '患者', ready: !!selectedPatientId, text: selectedPatientId ? '選択済' : '未選択' }"));
  });
});
