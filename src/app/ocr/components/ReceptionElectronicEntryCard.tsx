import React from 'react';
import { FileSearch, Search } from 'lucide-react';
import {
  FEATURE_AVAILABILITY,
  UNIMPLEMENTED_BADGE_LABEL,
  isFeatureImplemented,
  labelWithAvailability
} from '@/lib/feature_availability';

export function formatIntakeToolsToggleLabel(
  electronicPrescriptionImplemented: boolean = isFeatureImplemented('electronicPrescription')
): string {
  return electronicPrescriptionImplemented ? 'QR・電子処方箋から取り込む' : '処方箋QRから取り込む';
}

export function canOpenElectronicPrescriptionEntry(
  electronicPrescriptionImplemented: boolean = isFeatureImplemented('electronicPrescription')
): boolean {
  return electronicPrescriptionImplemented;
}

export interface ReceptionElectronicEntryCardProps {
  implemented?: boolean;
  unavailableReason?: string;
  onOpen: () => void;
}

export const ReceptionElectronicEntryCard = React.memo(function ReceptionElectronicEntryCard({
  implemented = isFeatureImplemented('electronicPrescription'),
  unavailableReason = FEATURE_AVAILABILITY.electronicPrescription.unavailableReason,
  onOpen
}: ReceptionElectronicEntryCardProps) {
  return (
    <button
      type="button"
      className="manual-entry-card glass"
      data-testid="electronic-prescription-entry"
      disabled={!implemented}
      aria-disabled={!implemented}
      onClick={() => {
        if (!canOpenElectronicPrescriptionEntry(implemented)) return;
        onOpen();
      }}
    >
      <FileSearch size={42} aria-hidden="true" />
      <span className="manual-entry-title">
        電子処方箋で受付
        {!implemented && (
          <span className="unimplemented-badge" data-testid="electronic-prescription-entry-badge">
            {UNIMPLEMENTED_BADGE_LABEL}
          </span>
        )}
      </span>
      <span className="manual-entry-subtitle">
        {implemented
          ? 'yakurekiの接続モジュールから取得して確認します。'
          : unavailableReason}
      </span>
    </button>
  );
});

export interface ElectronicPrescriptionUnimplementedPanelProps {
  unavailableReason?: string;
}

export const ElectronicPrescriptionUnimplementedPanel = React.memo(
  function ElectronicPrescriptionUnimplementedPanel({
    unavailableReason = FEATURE_AVAILABILITY.electronicPrescription.unavailableReason
  }: ElectronicPrescriptionUnimplementedPanelProps) {
    return (
      <section
        className="electronic-prescription-panel is-unimplemented"
        data-testid="electronic-prescription-panel"
        aria-label="電子処方箋受付（未実装）"
      >
        <div className="electronic-prescription-header">
          <div>
            <span className="section-kicker">電子処方箋</span>
            <strong>電子処方箋での受付</strong>
          </div>
          <span className="status-chip warning" data-testid="electronic-prescription-unimplemented-badge">
            {UNIMPLEMENTED_BADGE_LABEL}
          </span>
        </div>
        <p className="electronic-prescription-note">{unavailableReason}</p>
        <button
          type="button"
          className="btn-secondary flex-center gap-2"
          disabled
          aria-disabled="true"
          data-testid="electronic-prescription-fetch"
        >
          <Search size={16} aria-hidden="true" />
          {labelWithAvailability('electronicPrescription', '取得して確認')}
        </button>
      </section>
    );
  }
);
