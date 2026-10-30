import React, { useEffect, useState } from 'react';
import type { PharmacyBusinessHours } from '@/db/types';
import {
  parseBusinessHoursDraft,
  toBusinessHoursDraft,
  type BusinessHoursDraft,
  type BusinessHoursIssue
} from '@/lib/business_hours_input';

interface BusinessHoursSettingsSectionProps {
  businessHours: PharmacyBusinessHours | undefined;
  disabled: boolean;
  onChange: (hours: PharmacyBusinessHours | undefined) => void;
}

// 受付時刻から 時間外・休日・深夜 を自動判定するための、薬局ごとの定義。
// 入力途中の文字を失わないよう、画面は文字列の下書きを持ち、完成した組だけを保存する値にする。
export default function BusinessHoursSettingsSection({
  businessHours,
  disabled,
  onChange
}: BusinessHoursSettingsSectionProps) {
  const [draft, setDraft] = useState<BusinessHoursDraft>(() => toBusinessHoursDraft(businessHours));

  // 設定の読み込みなど、外から値が変わったときだけ下書きを作り直す (自分の入力で変わった分は作り直さない)。
  const storedSignature = JSON.stringify(businessHours ?? null);
  useEffect(() => {
    setDraft((current) => {
      const currentSignature = JSON.stringify(parseBusinessHoursDraft(current).hours ?? null);
      return currentSignature === storedSignature ? current : toBusinessHoursDraft(businessHours);
    });
    // businessHours 本体ではなく、その中身を表す storedSignature の変化だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedSignature]);

  const { issues } = parseBusinessHoursDraft(draft);
  const issueFor = (field: keyof BusinessHoursDraft): BusinessHoursIssue | undefined =>
    issues.find((issue) => issue.field === field);

  const update = (field: keyof BusinessHoursDraft, value: string) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    onChange(parseBusinessHoursDraft(next).hours);
  };

  const timeField = (field: keyof BusinessHoursDraft, id: string, label: string) => (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="time"
        value={draft[field]}
        disabled={disabled}
        onChange={(e) => update(field, e.target.value)}
        className="form-control"
        aria-invalid={issueFor(field) ? true : undefined}
      />
      {issueFor(field) ? <small className="help-text" role="alert">{issueFor(field)?.message}</small> : null}
    </div>
  );

  return (
    <>
      <h3 className="subsection-title">開局時間・休日（時間外・休日・深夜の自動判定）</h3>
      <p className="section-desc">
        受付時刻から、領収証の「時間外・休日・深夜」を自動で判定するための定義です。未入力のままなら自動判定せず、領収証の横で手動で選びます。
        日曜は休日として扱います。祝日・年末年始は、下の欄に日付を登録してください。
      </p>
      <div className="form-grid" data-testid="business-hours-settings">
        {timeField('weekdayOpen', 'businessHoursWeekdayOpen', '平日（月〜金）の開局')}
        {timeField('weekdayClose', 'businessHoursWeekdayClose', '平日（月〜金）の閉局')}
        {timeField('saturdayOpen', 'businessHoursSaturdayOpen', '土曜の開局')}
        {timeField('saturdayClose', 'businessHoursSaturdayClose', '土曜の閉局')}
        {timeField('lateNightStart', 'businessHoursLateNightStart', '深夜の開始')}
        {timeField('lateNightEnd', 'businessHoursLateNightEnd', '深夜の終了（翌朝）')}
        <div className="form-group form-grid-wide">
          <label htmlFor="businessHoursHolidayDates">休日として扱う日付（祝日・年末年始など）</label>
          <textarea
            id="businessHoursHolidayDates"
            value={draft.holidayDatesText}
            disabled={disabled}
            rows={4}
            placeholder={'2026-11-03\n2026-12-29'}
            onChange={(e) => update('holidayDatesText', e.target.value)}
            className="form-control"
            aria-invalid={issueFor('holidayDatesText') ? true : undefined}
          />
          <small className="help-text">1行に1日、YYYY-MM-DD で入力します。土曜の閉局日や臨時休業も、ここに登録すると休日として判定されます。</small>
          {issues.filter((issue) => issue.field === 'holidayDatesText').map((issue) => (
            <small className="help-text" role="alert" key={issue.message}>{issue.message}</small>
          ))}
        </div>
      </div>
      <p className="section-desc">
        判定の優先順位は 深夜 → 休日 → 時間外 → 通常 です。算定する点数と割合は、点数表（コード上の差し替え表）に入れた値で計算されます。
      </p>
    </>
  );
}
