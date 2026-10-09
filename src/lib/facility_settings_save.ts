import type { FacilitySettings, PharmacyDatabase } from '../db/types.ts';
import { runWithAuditRollback } from './audit_guard.ts';
import { restoreFields } from './rxdb_restore.ts';

export const FACILITY_SETTINGS_AUDIT_ROLLED_BACK = '施設基準設定の監査ログ記録に失敗したため、変更を元に戻しました。';

// 保存前の値へ戻すためのパッチ。保存で新しく入った項目(保存前には無かったキー)は undefined で消す。
export function buildFacilitySettingsRestorePatch(
  previous: Partial<FacilitySettings>,
  next: Partial<FacilitySettings>
): Partial<FacilitySettings> {
  const restore: Record<string, unknown> = { ...previous };
  for (const key of Object.keys(next)) {
    if (!(key in previous)) restore[key] = undefined;
  }
  return restore as Partial<FacilitySettings>;
}

// 施設設定の保存: 書き込み -> 監査ログ。調剤基本料や公式算定コードなど、算定に直結する設定なので、
// 監査ログが残らなければ保存前の値へ戻して失敗にする(初回の新規作成なら作成を取り消す)。
export async function saveFacilitySettingsWithAudit(params: {
  db: Pick<PharmacyDatabase, 'facility_settings'>;
  settings: FacilitySettings;
  logAudit: () => Promise<boolean>;
}): Promise<void> {
  const { db, settings, logAudit } = params;
  const doc = await db.facility_settings.findOne('default').exec();
  const previous = doc ? { ...doc.toJSON() } : null;

  await runWithAuditRollback({
    write: async () => {
      if (doc) {
        await doc.patch(settings);
      } else {
        await db.facility_settings.insert(settings);
      }
    },
    logAudit,
    rollback: async () => {
      if (doc && previous) {
        await restoreFields(doc, buildFacilitySettingsRestorePatch(previous, settings));
        return;
      }
      const inserted = await db.facility_settings.findOne('default').exec();
      await inserted?.remove();
    },
    failureMessage: FACILITY_SETTINGS_AUDIT_ROLLED_BACK
  });
}
