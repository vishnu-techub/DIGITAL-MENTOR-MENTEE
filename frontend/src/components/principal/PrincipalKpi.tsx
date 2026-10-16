import React from 'react';

export type PdTone = 'navy' | 'gold' | 'green' | 'amber' | 'red' | 'violet' | 'cyan';

interface TonePaint {
  /** Icon tile background. */
  bg: string;
  /** Icon glyph colour. */
  fg: string;
}

/**
 * Icon-tile paint per tone. All values are existing design-system tokens so the
 * Principal KPI grid stays visually consistent with the rest of the product.
 */
export const PD_TONE_PAINT: Record<PdTone, TonePaint> = {
  navy: { bg: 'var(--color-navy-50)', fg: 'var(--color-navy-700)' },
  gold: { bg: 'var(--color-gold-100)', fg: 'var(--color-gold-700)' },
  green: { bg: 'var(--color-success-50)', fg: 'var(--color-success-600)' },
  amber: { bg: 'var(--color-warning-50)', fg: 'var(--color-warning-600)' },
  red: { bg: 'var(--color-danger-50)', fg: 'var(--color-danger-600)' },
  violet: { bg: '#EDE9FE', fg: '#6D28D9' },
  cyan: { bg: 'var(--color-info-50)', fg: 'var(--color-info-600)' },
};

export interface PrincipalKpiCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone?: PdTone;
}

/**
 * A single executive KPI card: icon tile, label, prominent value and an
 * optional supporting hint. The card only ever renders the values it is given —
 * it performs no arithmetic and never invents a trend.
 */
export const PrincipalKpiCard: React.FC<PrincipalKpiCardProps> = ({
  label,
  value,
  hint,
  icon,
  tone = 'navy',
}) => {
  const paint = PD_TONE_PAINT[tone];
  return (
    <div className={`pd-kpi tone-${tone}`}>
      <div className="pd-kpi-icon" style={{ background: paint.bg, color: paint.fg }} aria-hidden="true">
        {icon}
      </div>
      <div className="pd-kpi-body">
        <div className="pd-kpi-label">{label}</div>
        <div className="pd-kpi-value">{value}</div>
        {hint ? <div className="pd-kpi-hint">{hint}</div> : null}
      </div>
    </div>
  );
};

export default PrincipalKpiCard;
