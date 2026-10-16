import React from 'react';
import { Activity, AlertTriangle, Building2, ShieldAlert, ShieldX, UserX } from 'lucide-react';
import type { AdminMentoringDashboardData, AdminDepartmentRow } from '../../api/client';
import { EmptyState } from '../common/EmptyState';
import { formatShortDay } from './PrincipalCharts';

/**
 * ============================================================================
 * Institutional activity + pending attention — Principal role ONLY
 * ============================================================================
 *
 * Both panels are derived purely from real server fields:
 *   • Recent activity  → each department's `lastMentoringActivity` (a real day
 *                        emitted from stored counselling / meeting records),
 *                        newest first.
 *   • Pending attention → the college-wide `summary` counts plus the
 *                        per-department `hodCount` / `unassignedStudents` /
 *                        `students` fields. No item is invented and an
 *                        all-clear state is shown when nothing needs attention.
 *
 * There is deliberately no "announcements" feed: the Principal's read surface
 * exposes no announcements, so we do not fabricate one.
 */

type AlertTone = 'amber' | 'red' | 'slate';

const ALERT_PAINT: Record<AlertTone, { bg: string; fg: string }> = {
  amber: { bg: 'var(--color-warning-50)', fg: 'var(--color-warning-600)' },
  red: { bg: 'var(--color-danger-50)', fg: 'var(--color-danger-600)' },
  slate: { bg: 'var(--color-slate-100)', fg: 'var(--color-slate-600)' },
};

export const PrincipalActivityFeed: React.FC<{ departments: AdminDepartmentRow[] }> = ({
  departments,
}) => {
  const rows = departments
    .filter((d) => Boolean(d.lastMentoringActivity))
    .slice()
    .sort((a, b) => (a.lastMentoringActivity! < b.lastMentoringActivity! ? 1 : -1))
    .slice(0, 8);

  if (!rows.length) {
    return (
      <EmptyState
        compact
        icon={<Activity size={30} style={{ color: 'var(--color-slate-300)' }} />}
        title="No institutional activity yet"
        description="Recent mentoring activity appears here as departments record mentoring sessions and Saturday meetings."
      />
    );
  }

  return (
    <div className="pd-activity">
      {rows.map((dept) => (
        <div className="pd-activity-item" key={dept.departmentId}>
          <div className="pd-activity-dot" aria-hidden="true">
            <Activity size={16} />
          </div>
          <div className="pd-activity-body">
            <div className="pd-activity-title">{dept.departmentName}</div>
            <div className="pd-activity-meta">
              {dept.mentoredThisMonth} mentored this month · {dept.totalMentoringSessions} sessions
              recorded · {dept.mentoringCoverage}% coverage
            </div>
          </div>
          <div className="pd-activity-date">
            {dept.lastMentoringActivity ? formatShortDay(dept.lastMentoringActivity) : '—'}
          </div>
        </div>
      ))}
    </div>
  );
};

interface AlertItem {
  key: string;
  tone: AlertTone;
  icon: React.ReactNode;
  title: string;
  desc: string;
  value: number;
}

export const PrincipalAlerts: React.FC<{
  summary: AdminMentoringDashboardData['summary'] | undefined;
  departments: AdminDepartmentRow[];
}> = ({ summary, departments }) => {
  if (!summary) {
    return (
      <EmptyState
        compact
        icon={<ShieldAlert size={30} style={{ color: 'var(--color-slate-300)' }} />}
        title="No institutional summary available"
        description="Pending-attention items appear once the college-wide summary is available."
      />
    );
  }

  const noHod = departments.filter((d) => d.hodCount === 0);
  const noStudents = departments.filter((d) => d.students === 0);
  const unassigned = departments.reduce((sum, d) => sum + (d.unassignedStudents || 0), 0);

  const candidates: Array<AlertItem | null> = [
    summary.departmentsWithoutHod > 0
      ? {
          key: 'no-hod',
          tone: 'amber',
          icon: <ShieldAlert size={16} />,
          title: 'Departments without an HOD',
          desc: noHod.length
            ? noHod.map((d) => d.departmentCode || d.departmentName).join(', ')
            : `${summary.departmentsWithoutHod} department(s) awaiting leadership`,
          value: summary.departmentsWithoutHod,
        }
      : null,
    summary.studentsWithoutDepartment > 0
      ? {
          key: 'no-department',
          tone: 'red',
          icon: <ShieldX size={16} />,
          title: 'Students without a department',
          desc: 'Registered students not yet mapped to any department.',
          value: summary.studentsWithoutDepartment,
        }
      : null,
    unassigned > 0
      ? {
          key: 'unassigned',
          tone: 'red',
          icon: <UserX size={16} />,
          title: 'Students without a mentor',
          desc: 'Students in a department with no active mentor assignment.',
          value: unassigned,
        }
      : null,
    summary.pendingStudents > 0
      ? {
          key: 'pending',
          tone: 'amber',
          icon: <AlertTriangle size={16} />,
          title: 'Pending mentoring this month',
          desc: 'Students not yet mentored in the current reporting month.',
          value: summary.pendingStudents,
        }
      : null,
    noStudents.length > 0
      ? {
          key: 'no-students',
          tone: 'slate',
          icon: <Building2 size={16} />,
          title: 'Departments with no students',
          desc: noStudents.map((d) => d.departmentCode || d.departmentName).join(', '),
          value: noStudents.length,
        }
      : null,
  ];

  const items = candidates.filter((item): item is AlertItem => item !== null);

  if (!items.length) {
    return (
      <EmptyState
        compact
        icon={<ShieldAlert size={30} style={{ color: 'var(--color-success-500)' }} />}
        title="No items require institutional attention"
        description="Every department has leadership, every student is mapped, and there are no pending mentoring gaps for the reporting month."
      />
    );
  }

  return (
    <div className="pd-alerts">
      {items.map((item) => {
        const paint = ALERT_PAINT[item.tone];
        return (
          <div className="pd-alert" key={item.key}>
            <div className="pd-alert-icon" style={{ background: paint.bg, color: paint.fg }} aria-hidden="true">
              {item.icon}
            </div>
            <div className="pd-alert-body">
              <div className="pd-alert-title">{item.title}</div>
              <div className="pd-alert-desc">{item.desc}</div>
            </div>
            <div className="pd-alert-value" style={{ color: paint.fg }}>
              {item.value}
            </div>
          </div>
        );
      })}
    </div>
  );
};
