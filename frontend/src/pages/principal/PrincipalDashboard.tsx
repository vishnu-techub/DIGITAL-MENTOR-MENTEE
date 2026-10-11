import React from 'react';
import { AdminMentoringDashboard } from '../admin/AdminMentoringDashboard';

/**
 * ============================================================================
 * Principal portal — college-wide, READ-ONLY
 * ============================================================================
 *
 * The Principal is the institutional leadership role. It reads the SAME
 * server-computed college-wide mentoring surface as the Admin mentoring
 * dashboard, but nothing else: no user/HOD management, no approvals, no
 * settings, no exports and no write controls. All of that is enforced on the
 * backend by an allow-list — every route outside
 * `/api/admin/overview/*` refuses the PRINCIPAL role with 403 — so this
 * component cannot widen the role's reach no matter what it renders.
 *
 * Reusing `AdminMentoringDashboard` keeps a single source of truth for the
 * college figures: the Principal, the HOD portals and the Admin all read the
 * same server arithmetic and can never disagree.
 */
const DEFAULT_TAB = 'mentoring-dashboard';

interface PrincipalDashboardProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const PrincipalDashboard: React.FC<PrincipalDashboardProps> = ({
  currentTab,
  onSelectTab,
}) => {
  // The shared dashboard indexes itself by `mentoring-*` tab keys. Normalise
  // anything else (for example the app-wide default `overview`) so a Principal
  // always lands on the college overview and never on a blank panel.
  const activeTab = currentTab.startsWith('mentoring-') ? currentTab : DEFAULT_TAB;
  return <AdminMentoringDashboard currentTab={activeTab} onSelectTab={onSelectTab} />;
};

export default PrincipalDashboard;
