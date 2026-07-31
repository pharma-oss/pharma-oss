import React from 'react';
import { UploadCloud, AlertTriangle, Loader2, Save, FileText, Search, Fingerprint, KeyRound, Plus, Trash2, Download, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PatientMedicationInfoTemplate } from '@/db/types';
import {
  getPatientMedicationInfoApprovalIssues,
  getPatientMedicationInfoApprovalReadinessIssues,
  isApprovedPatientMedicationInfoTemplate
} from '@/lib/patient_medication_info';
import {
  MEDICATION_INFO_SOURCE_TYPE_LABELS,
  MEDICATION_INFO_TEMPLATE_READINESS_LABELS,
  MEDICATION_INFO_TEMPLATE_STATUS_LABELS,
  type MedicationInfoCsvImportSummary,
  type MedicationInfoSourceType,
  type MedicationInfoTemplateForm,
  type MedicationInfoTemplateReadinessFilter,
  type MedicationInfoTemplateStatusFilter
} from '@/lib/medication_info_template_ui';

interface MedicationInfoTemplateSettingsTabProps {
  invalidApprovedMedicationInfoTemplates: PatientMedicationInfoTemplate[];
  medicationInfoTemplateStatusFilter: MedicationInfoTemplateStatusFilter;
  setMedicationInfoTemplateStatusFilter: (status: MedicationInfoTemplateStatusFilter) => void;
  medicationInfoTemplates: PatientMedicationInfoTemplate[];
  medicationInfoTemplateStatusCounts: Record<PatientMedicationInfoTemplate['status'], number>;
  medicationInfoTemplateReadinessFilter: MedicationInfoTemplateReadinessFilter;
  setMedicationInfoTemplateReadinessFilter: (readiness: MedicationInfoTemplateReadinessFilter) => void;
  medicationInfoTemplateReadinessCounts: Record<MedicationInfoTemplateReadinessFilter, number>;
  medicationInfoTemplateSearch: string;
  setMedicationInfoTemplateSearch: (value: string) => void;
  filteredMedicationInfoTemplates: PatientMedicationInfoTemplate[];
  isLoadingMedicationInfoTemplates: boolean;
  selectedMedicationInfoTemplateId: string;
  handleSelectMedicationInfoTemplate: (template: PatientMedicationInfoTemplate) => void;
  getMedicationInfoTemplateReadinessIssues: (template: PatientMedicationInfoTemplate) => ReturnType<typeof getPatientMedicationInfoApprovalReadinessIssues>;
  handleNewMedicationInfoTemplate: () => void;
  isSavingMedicationInfoTemplate: boolean;
  isImportingMedicationInfoCsv: boolean;
  handleExportMedicationInfoCsv: () => Promise<void>;
  canManageFacility: boolean;
  handleImportMedicationInfoCsv: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleUsePmdaMedicationInfoSearchUrl: () => void;
  isBuildingMedicationInfoSafetyDraft: boolean;
  handleApplyMedicationInfoSafetyDraft: () => Promise<void>;
  handleExportMedicationInfoSafetyDraftCsv: () => Promise<void>;
  isExportingMedicationInfoSafetyDraftCsv: boolean;
  medicationInfoCsvImportSummary: MedicationInfoCsvImportSummary | null;
  selectedMedicationInfoTemplate: PatientMedicationInfoTemplate | undefined;
  isEditingImmutableMedicationInfoRevision: boolean;
  medicationInfoTemplateForm: MedicationInfoTemplateForm;
  handleMedicationInfoTemplateFormChange: <K extends keyof MedicationInfoTemplateForm>(field: K, value: MedicationInfoTemplateForm[K]) => void;
  currentMedicationInfoApprovalIssues: ReturnType<typeof getPatientMedicationInfoApprovalIssues>;
  handleSaveMedicationInfoTemplate: (statusOverride?: PatientMedicationInfoTemplate['status']) => Promise<void>;
}

export default function MedicationInfoTemplateSettingsTab({
  invalidApprovedMedicationInfoTemplates,
  medicationInfoTemplateStatusFilter,
  setMedicationInfoTemplateStatusFilter,
  medicationInfoTemplates,
  medicationInfoTemplateStatusCounts,
  medicationInfoTemplateReadinessFilter,
  setMedicationInfoTemplateReadinessFilter,
  medicationInfoTemplateReadinessCounts,
  medicationInfoTemplateSearch,
  setMedicationInfoTemplateSearch,
  filteredMedicationInfoTemplates,
  isLoadingMedicationInfoTemplates,
  selectedMedicationInfoTemplateId,
  handleSelectMedicationInfoTemplate,
  getMedicationInfoTemplateReadinessIssues,
  handleNewMedicationInfoTemplate,
  isSavingMedicationInfoTemplate,
  isImportingMedicationInfoCsv,
  handleExportMedicationInfoCsv,
  canManageFacility,
  handleImportMedicationInfoCsv,
  handleUsePmdaMedicationInfoSearchUrl,
  isBuildingMedicationInfoSafetyDraft,
  handleApplyMedicationInfoSafetyDraft,
  handleExportMedicationInfoSafetyDraftCsv,
  isExportingMedicationInfoSafetyDraftCsv,
  medicationInfoCsvImportSummary,
  selectedMedicationInfoTemplate,
  isEditingImmutableMedicationInfoRevision,
  medicationInfoTemplateForm,
  handleMedicationInfoTemplateFormChange,
  currentMedicationInfoApprovalIssues,
  handleSaveMedicationInfoTemplate
}: MedicationInfoTemplateSettingsTabProps) {
  return (
        <div className="settings-section glass medication-info-template-section" data-testid="medication-info-template-section">
          <h2>薬情テンプレ承認</h2>
          <p className="section-desc">
            患者向け印刷に使う薬剤情報を、薬局で作成・確認したテンプレとして管理します。承認済みのテンプレだけが薬情印刷へ反映されます。
          </p>

          {invalidApprovedMedicationInfoTemplates.length > 0 && (
            <div
              role="alert"
              data-testid="medication-info-invalid-approved-alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.85rem',
                padding: '0.65rem 0.75rem',
                border: '1px solid #dc2626',
                borderRadius: '8px',
                color: '#991b1b',
                background: '#fef2f2',
                fontWeight: 700,
                fontSize: '0.84rem'
              }}
            >
              <AlertTriangle size={17} aria-hidden="true" />
              承認条件を満たさず印刷に使われないテンプレが{invalidApprovedMedicationInfoTemplates.length}件あります。
            </div>
          )}

          <div
            role="group"
            aria-label="薬情テンプレ状態絞り込み"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.65rem',
              marginBottom: '1rem'
            }}
          >
            {([
              ['all', 'すべて'],
              ...Object.entries(MEDICATION_INFO_TEMPLATE_STATUS_LABELS)
            ] as [MedicationInfoTemplateStatusFilter, string][]).map(([status, label]) => {
              const isActive = medicationInfoTemplateStatusFilter === status;
              const count = status === 'all'
                ? medicationInfoTemplates.length
                : medicationInfoTemplateStatusCounts[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setMedicationInfoTemplateStatusFilter(status)}
                  aria-pressed={isActive}
                  data-testid={`medication-info-template-status-filter-${status}`}
                  style={{
                    border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.65rem 0.75rem',
                    background: isActive ? '#eff6ff' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {count}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="薬情テンプレ承認準備絞り込み"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.45rem',
              marginBottom: '1rem'
            }}
          >
            {(['all', 'ready', 'missing'] as MedicationInfoTemplateReadinessFilter[]).map((readiness) => {
              const isActive = medicationInfoTemplateReadinessFilter === readiness;
              return (
                <button
                  key={readiness}
                  type="button"
                  onClick={() => setMedicationInfoTemplateReadinessFilter(readiness)}
                  aria-pressed={isActive}
                  data-testid={`medication-info-template-readiness-filter-${readiness}`}
                  style={{
                    border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.45rem 0.7rem',
                    background: isActive ? '#eff6ff' : 'white',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 800
                  }}
                >
                  {MEDICATION_INFO_TEMPLATE_READINESS_LABELS[readiness]} {medicationInfoTemplateReadinessCounts[readiness]}
                </button>
              );
            })}
          </div>

          <div className="medication-info-template-layout">
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.85rem',
                background: 'white'
              }}
            >
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="medication-info-template-search">テンプレ検索</label>
                <input
                  id="medication-info-template-search"
                  className="form-control"
                  value={medicationInfoTemplateSearch}
                  onChange={(e) => setMedicationInfoTemplateSearch(e.target.value)}
                  placeholder="薬品名、コード、状態"
                  data-testid="medication-info-template-search"
                />
              </div>

              <div
                role="status"
                data-testid="medication-info-template-result-count"
                style={{ marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700 }}
              >
                {filteredMedicationInfoTemplates.length.toLocaleString()}件
                {filteredMedicationInfoTemplates.length > 80
                  ? '（先頭80件を表示）'
                  : 'を表示'}
              </div>

              <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '560px', overflowY: 'auto' }}>
                {isLoadingMedicationInfoTemplates ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', padding: '0.75rem' }}>
                    読み込み中...
                  </div>
                ) : filteredMedicationInfoTemplates.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', padding: '0.75rem' }}>
                    {medicationInfoTemplates.length === 0
                      ? 'テンプレはまだありません。'
                      : '条件に一致するテンプレはありません。'}
                  </div>
                ) : (
                  filteredMedicationInfoTemplates.slice(0, 80).map((template) => {
                    const isSelected = template.templateId === selectedMedicationInfoTemplateId;
                    const hasInvalidApproval = template.status === 'approved'
                      && !isApprovedPatientMedicationInfoTemplate(template);
                    const readinessIssues = getMedicationInfoTemplateReadinessIssues(template);
                    const isReadyForApproval = readinessIssues.length === 0;
                    const statusColor = hasInvalidApproval
                      ? '#dc2626'
                      : template.status === 'approved'
                      ? '#15803d'
                      : template.status === 'needs_review'
                        ? '#b45309'
                        : template.status === 'retired'
                          ? '#64748b'
                          : '#2563eb';
                    return (
                      <button
                        key={template.templateId}
                        type="button"
                        onClick={() => handleSelectMedicationInfoTemplate(template)}
                        style={{
                          textAlign: 'left',
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                          borderRadius: '8px',
                          padding: '0.7rem',
                          background: isSelected ? '#eff6ff' : '#fff',
                          cursor: 'pointer',
                          display: 'grid',
                          gap: '0.3rem'
                        }}
                      >
                        <span style={{ fontWeight: 800, color: 'var(--text-main)', wordBreak: 'break-word' }}>
                          {template.drugName}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {template.drugCode}
                          {template.genericName ? ` / ${template.genericName}` : ''}
                        </span>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          <span
                            style={{
                              width: 'fit-content',
                              borderRadius: '999px',
                              padding: '0.12rem 0.5rem',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              color: statusColor,
                              background: '#f8fafc',
                              border: `1px solid ${statusColor}`
                            }}
                          >
                            {hasInvalidApproval ? '承認不備' : MEDICATION_INFO_TEMPLATE_STATUS_LABELS[template.status]}
                          </span>
                          <span
                            title={isReadyForApproval
                              ? '承認に必要な本文と参照元が揃っています'
                              : readinessIssues.map((issue) => issue.message).join('、')}
                            style={{
                              width: 'fit-content',
                              borderRadius: '999px',
                              padding: '0.12rem 0.5rem',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              color: isReadyForApproval ? '#047857' : '#b45309',
                              background: isReadyForApproval ? '#ecfdf5' : '#fffbeb',
                              border: `1px solid ${isReadyForApproval ? '#10b981' : '#f59e0b'}`
                            }}
                          >
                            {isReadyForApproval ? '承認準備OK' : `不足 ${readinessIssues.length}`}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="actions medication-info-template-actions">
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={handleNewMedicationInfoTemplate}
                  disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv}
                >
                  <Plus size={16} aria-hidden="true" />
                  <span>新規</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => void handleExportMedicationInfoCsv()}
                  disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || !canManageFacility}
                  data-testid="medication-info-template-csv-export"
                >
                  <Download size={16} aria-hidden="true" />
                  <span>CSV書出</span>
                </button>
                <label
                  className="btn-secondary flex-center gap-2"
                  aria-disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || !canManageFacility}
                  style={{
                    cursor: isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || !canManageFacility ? 'not-allowed' : 'pointer',
                    opacity: isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || !canManageFacility ? 0.6 : 1
                  }}
                >
                  {isImportingMedicationInfoCsv
                    ? <Loader2 size={16} className="spin" aria-hidden="true" />
                    : <UploadCloud size={16} aria-hidden="true" />}
                  <span>{isImportingMedicationInfoCsv ? '取込中...' : 'CSV下書き取込'}</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleImportMedicationInfoCsv}
                    className="hidden-input"
                    disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || !canManageFacility}
                    data-testid="medication-info-template-csv-input"
                    aria-label="薬情テンプレCSVを下書きとして取り込む"
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={handleUsePmdaMedicationInfoSearchUrl}
                  disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || isBuildingMedicationInfoSafetyDraft}
                >
                  <Search size={16} aria-hidden="true" />
                  <span>PMDA検索URL</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => void handleApplyMedicationInfoSafetyDraft()}
                  disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || isBuildingMedicationInfoSafetyDraft || !canManageFacility}
                  data-testid="medication-info-template-safety-draft"
                >
                  {isBuildingMedicationInfoSafetyDraft
                    ? <Loader2 size={16} className="spin" aria-hidden="true" />
                    : <FileText size={16} aria-hidden="true" />}
                  <span>副作用/注意案</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => void handleExportMedicationInfoSafetyDraftCsv()}
                  disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || isExportingMedicationInfoSafetyDraftCsv || !canManageFacility}
                  data-testid="medication-info-template-safety-draft-csv-export"
                >
                  {isExportingMedicationInfoSafetyDraftCsv
                    ? <Loader2 size={16} className="spin" aria-hidden="true" />
                    : <Download size={16} aria-hidden="true" />}
                  <span>注意案CSV</span>
                </button>
                <span className="medication-info-template-draft-note">
                  副作用・使用上の注意案は下書きです。薬剤師確認後に承認してください。
                </span>
              </div>

              {medicationInfoCsvImportSummary && (
                <div
                  role="status"
                  data-testid="medication-info-template-csv-import-summary"
                  style={{
                    display: 'grid',
                    gap: '0.25rem',
                    marginBottom: '0.85rem',
                    padding: '0.65rem 0.75rem',
                    border: '1px solid #93c5fd',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    color: '#1e40af',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    lineHeight: 1.45
                  }}
                >
                  <span>
                    CSV下書き取込: {medicationInfoCsvImportSummary.fileName}
                  </span>
                  <span>
                    {medicationInfoCsvImportSummary.importedCount.toLocaleString()}件中、
                    承認準備OK {medicationInfoCsvImportSummary.readyForApprovalCount.toLocaleString()}件 /
                    不足・警告 {medicationInfoCsvImportSummary.warningCount.toLocaleString()}件
                  </span>
                  <span style={{ color: '#1d4ed8', fontSize: '0.76rem' }}>
                    取込日時 {new Date(medicationInfoCsvImportSummary.importedAt).toLocaleString('ja-JP')}
                  </span>
                </div>
              )}

              {selectedMedicationInfoTemplate && selectedMedicationInfoTemplate.status !== 'draft' && (
                <div
                  role={isEditingImmutableMedicationInfoRevision ? 'alert' : 'status'}
                  data-testid="medication-info-template-revision-notice"
                  style={{
                    marginBottom: '0.85rem',
                    padding: '0.7rem 0.8rem',
                    border: `1px solid ${isEditingImmutableMedicationInfoRevision ? '#f59e0b' : '#93c5fd'}`,
                    borderRadius: '8px',
                    background: isEditingImmutableMedicationInfoRevision ? '#fffbeb' : '#eff6ff',
                    color: isEditingImmutableMedicationInfoRevision ? '#92400e' : '#1e40af',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    lineHeight: 1.5
                  }}
                >
                  {isEditingImmutableMedicationInfoRevision
                    ? '保存前の版から本文または参照元が変更されています。下書き保存または承認保存では新しいテンプレIDへ分岐し、元の版の内容を保持します。'
                    : '確定済みの版を表示しています。本文または参照元を編集すると新版の下書きへ切り替わり、元の版は変更されません。'}
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="medication-info-template-drug-code">薬品コード</label>
                  <input
                    id="medication-info-template-drug-code"
                    className="form-control"
                    value={medicationInfoTemplateForm.drugCode}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('drugCode', e.target.value)}
                    data-testid="medication-info-template-drug-code"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-drug-name">薬品名</label>
                  <input
                    id="medication-info-template-drug-name"
                    className="form-control"
                    value={medicationInfoTemplateForm.drugName}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('drugName', e.target.value)}
                    data-testid="medication-info-template-drug-name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-generic-name">一般名・成分名</label>
                  <input
                    id="medication-info-template-generic-name"
                    className="form-control"
                    value={medicationInfoTemplateForm.genericName}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('genericName', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-status">状態</label>
                  <input
                    id="medication-info-template-status"
                    className="form-control"
                    value={MEDICATION_INFO_TEMPLATE_STATUS_LABELS[medicationInfoTemplateForm.status]}
                    readOnly
                    data-testid="medication-info-template-current-status"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-source-type">参照元区分</label>
                  <select
                    id="medication-info-template-source-type"
                    className="form-control"
                    value={medicationInfoTemplateForm.sourceType}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('sourceType', e.target.value as MedicationInfoSourceType)}
                  >
                    {(Object.entries(MEDICATION_INFO_SOURCE_TYPE_LABELS) as [MedicationInfoSourceType, string][]).map(([sourceType, label]) => (
                      <option key={sourceType} value={sourceType}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-source-revision-date">参照元版日</label>
                  <input
                    id="medication-info-template-source-revision-date"
                    type="date"
                    className="form-control"
                    value={medicationInfoTemplateForm.sourceRevisionDate}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('sourceRevisionDate', e.target.value)}
                  />
                </div>

                <div className="form-group form-grid-wide">
                  <label htmlFor="medication-info-template-source-url">参照元URL</label>
                  <input
                    id="medication-info-template-source-url"
                    type="url"
                    className="form-control"
                    value={medicationInfoTemplateForm.sourceUrl}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('sourceUrl', e.target.value)}
                    placeholder="https://www.pmda.go.jp/..."
                    data-testid="medication-info-template-source-url"
                  />
                </div>

                <div className="form-group form-grid-wide">
                  <label htmlFor="medication-info-template-source-hash">参照元ハッシュ・版管理メモ</label>
                  <input
                    id="medication-info-template-source-hash"
                    className="form-control"
                    value={medicationInfoTemplateForm.sourceHash}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('sourceHash', e.target.value)}
                    placeholder="SHA-256 または社内管理番号"
                  />
                </div>

                <div className="form-group form-grid-wide">
                  <label htmlFor="medication-info-template-side-effect">副作用・相談目安</label>
                  <textarea
                    id="medication-info-template-side-effect"
                    className="form-control"
                    rows={5}
                    value={medicationInfoTemplateForm.sideEffectText}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('sideEffectText', e.target.value)}
                    data-testid="medication-info-template-side-effect"
                  />
                </div>

                <div className="form-group form-grid-wide">
                  <label htmlFor="medication-info-template-usage-caution">使用上の注意</label>
                  <textarea
                    id="medication-info-template-usage-caution"
                    className="form-control"
                    rows={5}
                    value={medicationInfoTemplateForm.counselingText}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('counselingText', e.target.value)}
                    data-testid="medication-info-template-usage-caution"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-review-reason">要再確認理由</label>
                  <textarea
                    id="medication-info-template-review-reason"
                    className="form-control"
                    rows={4}
                    value={medicationInfoTemplateForm.needsReviewReason}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('needsReviewReason', e.target.value)}
                  />
                </div>

                {medicationInfoTemplateForm.templateId && (
                  <div className="form-group form-grid-wide">
                    <label htmlFor="medication-info-template-id">テンプレID</label>
                    <input
                      id="medication-info-template-id"
                      className="form-control"
                      value={medicationInfoTemplateForm.templateId}
                      readOnly
                    />
                  </div>
                )}
              </div>

              <div
                id="medication-info-template-approval-readiness"
                role="status"
                data-testid="medication-info-template-approval-readiness"
                style={{
                  display: 'grid',
                  gap: '0.4rem',
                  marginTop: '0.75rem',
                  padding: '0.7rem 0.8rem',
                  border: `1px solid ${currentMedicationInfoApprovalIssues.length > 0 ? '#f59e0b' : '#16a34a'}`,
                  borderRadius: '8px',
                  background: currentMedicationInfoApprovalIssues.length > 0 ? '#fffbeb' : '#f0fdf4',
                  color: currentMedicationInfoApprovalIssues.length > 0 ? '#92400e' : '#166534',
                  fontSize: '0.82rem',
                  fontWeight: 700
                }}
              >
                <span>
                  {currentMedicationInfoApprovalIssues.length > 0
                    ? '承認前に必要な項目があります。'
                    : '承認条件を満たしています。'}
                </span>
                {currentMedicationInfoApprovalIssues.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', fontWeight: 600, lineHeight: 1.45 }}>
                    {currentMedicationInfoApprovalIssues.map((issue) => (
                      <li key={issue.code}>{issue.message}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="actions" style={{ marginTop: '1rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => handleSaveMedicationInfoTemplate('draft')}
                  disabled={isSavingMedicationInfoTemplate}
                  data-testid="medication-info-template-save-draft"
                >
                  {isSavingMedicationInfoTemplate ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                  <span>下書き保存</span>
                </button>
                <button
                  type="button"
                  className="btn-primary flex-center gap-2"
                  onClick={() => handleSaveMedicationInfoTemplate('approved')}
                  disabled={isSavingMedicationInfoTemplate || currentMedicationInfoApprovalIssues.length > 0}
                  aria-describedby="medication-info-template-approval-readiness"
                  title={currentMedicationInfoApprovalIssues.length > 0
                    ? currentMedicationInfoApprovalIssues.map((issue) => issue.message).join('、')
                    : '承認条件を満たしています'}
                  data-testid="medication-info-template-approve"
                >
                  {isSavingMedicationInfoTemplate ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <CheckCircle size={16} aria-hidden="true" />}
                  <span>承認して保存</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => handleSaveMedicationInfoTemplate('needs_review')}
                  disabled={isSavingMedicationInfoTemplate || isEditingImmutableMedicationInfoRevision}
                  title={isEditingImmutableMedicationInfoRevision
                    ? '本文・参照元の変更は新版として下書き保存してください'
                    : undefined}
                  data-testid="medication-info-template-needs-review"
                >
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>要再確認</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => {
                    if (!selectedMedicationInfoTemplateId) {
                      toast.info('廃止するテンプレを選択してください。');
                      return;
                    }
                    if (window.confirm('この薬情テンプレを廃止しますか？')) {
                      void handleSaveMedicationInfoTemplate('retired');
                    }
                  }}
                  disabled={isSavingMedicationInfoTemplate || isEditingImmutableMedicationInfoRevision}
                  title={isEditingImmutableMedicationInfoRevision
                    ? '本文・参照元の変更は新版として下書き保存してください'
                    : undefined}
                  data-testid="medication-info-template-retire"
                >
                  <Trash2 size={16} aria-hidden="true" />
                  <span>廃止</span>
                </button>
              </div>
            </div>
          </div>
        </div>
  );
}
