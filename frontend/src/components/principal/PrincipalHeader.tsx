import React from 'react';
import { CalendarDays } from 'lucide-react';

/**
 * ============================================================================
 * Principal page heading — Principal role ONLY
 * ============================================================================
 *
 * A small, elegant heading that opens the Principal dashboard straight into the
 * executive overview. It deliberately replaces the previous oversized hero
 * banner: there is no decorative navy gradient card, no repeated college
 * branding (the crest + name already live once in the shared `Navbar`), no
 * role/read-only badge row and no welcome-message duplication. What remains is
 * the page title, a short supporting line and a compact current-date chip.
 *
 * Nothing here is data-driven and no other role imports this file, so Admin /
 * HOD / Faculty / Mentor / Student portals are unaffected.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

/** Locale-independent long date, e.g. `Monday, 12 October 2026`. */
function formatLongDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const PrincipalHeader: React.FC = () => {
  const now = new Date();

  return (
    <header className="pd-pagehead" aria-label="Principal dashboard heading">
      <div className="pd-pagehead-main">
        <h1 className="pd-pagehead-title">Principal Dashboard</h1>
        <p className="pd-pagehead-sub">Institutional performance at a glance</p>
      </div>
      <span className="pd-pagehead-date">
        <CalendarDays size={15} aria-hidden="true" />
        {formatLongDate(now)}
      </span>
    </header>
  );
};

export default PrincipalHeader;
