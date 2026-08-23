'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { ExternalConnectorReadinessReport } from '@/lib/external_connector_readiness';

interface UseExternalConnectorSettingsProps {
  canManageFacility: boolean;
  activeTab?: string;
}

export function useExternalConnectorSettings({
  canManageFacility,
  activeTab
}: UseExternalConnectorSettingsProps) {
  const [externalConnectorReadiness, setExternalConnectorReadiness] = useState<ExternalConnectorReadinessReport | null>(null);
  const [isLoadingExternalConnectorReadiness, setIsLoadingExternalConnectorReadiness] = useState(false);

  const refreshExternalConnectorReadiness = useCallback(async () => {
    setIsLoadingExternalConnectorReadiness(true);
    try {
      const response = await fetch('/api/system/connector-readiness');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setExternalConnectorReadiness(await response.json());
    } catch (error) {
      console.error('Failed to load external connector readiness:', error);
      setExternalConnectorReadiness(null);
      toast.error('外部連携の接続準備を確認できませんでした。');
    } finally {
      setIsLoadingExternalConnectorReadiness(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'external' || !canManageFacility) return;
    void refreshExternalConnectorReadiness();
  }, [activeTab, canManageFacility, refreshExternalConnectorReadiness]);

  return {
    externalConnectorReadiness,
    isLoadingExternalConnectorReadiness,
    refreshExternalConnectorReadiness
  };
}
