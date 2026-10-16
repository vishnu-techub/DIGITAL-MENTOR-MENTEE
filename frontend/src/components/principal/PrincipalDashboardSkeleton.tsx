import React from 'react';
import { Skeleton } from '../common/Skeleton';

/**
 * Principal-specific loading skeleton. Mirrors the executive layout (compact
 * heading, KPI grid, analytics) so the page does not reflow when data lands.
 */
export const PrincipalDashboardSkeleton: React.FC = () => (
  <div className="pd-root" aria-busy="true" aria-live="polite" aria-label="Loading Principal dashboard">
    <Skeleton height="52px" borderRadius="10px" />
    <div className="pd-kpi-grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} height="112px" borderRadius="14px" />
      ))}
    </div>
    <div className="pd-analytics-grid">
      <Skeleton height="300px" borderRadius="14px" />
      <Skeleton height="300px" borderRadius="14px" />
      <Skeleton height="220px" borderRadius="14px" style={{ gridColumn: '1 / -1' }} />
      <Skeleton height="220px" borderRadius="14px" style={{ gridColumn: '1 / -1' }} />
    </div>
  </div>
);

export default PrincipalDashboardSkeleton;
