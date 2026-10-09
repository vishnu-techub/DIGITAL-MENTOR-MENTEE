import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  CalendarCheck2,
  FileText,
  Settings,
  History,
  ShieldAlert,
  BarChart3,
  Award,
  BookOpen,
  UserCheck,
  UserCog,
  User,
  FileCheck,
  School,
  Download,
  LogOut,
  X,
  Sparkles,
  Bell,
  ClipboardList,
  Briefcase,
  Trophy,
  Upload,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  /** Group label rendered above the items. A section without a label renders ungrouped. */
  label?: string;
  items: NavItem[];
}

/**
 * Role-aware navigation. The item keys, labels and icons are unchanged from the
 * previous implementation - only the group labels were reorganised so each role
 * reads as MAIN / MANAGEMENT / ACADEMIC / MENTORING / PERFORMANCE-style sections.
 * Every key below is a real tab handled by the matching dashboard; nothing new is
 * invented, and nothing existing is removed.
 */
const NAV_BY_ROLE: Record<string, NavSection[]> = {
  ADMIN: [
    {
      label: 'MAIN',
      items: [
        { key: 'overview', label: 'Admin Dashboard', icon: LayoutDashboard },
        { key: 'mentoring-dashboard', label: 'Mentoring Dashboard', icon: BarChart3 },
      ],
    },
    {
      label: 'MANAGEMENT',
      items: [
        { key: 'hod-management', label: 'HOD Management', icon: UserCog },
        { key: 'faculty', label: 'Faculty / Mentors', icon: Users },
        { key: 'students', label: 'Students Master', icon: GraduationCap },
        { key: 'identity-requests', label: 'Identity Edit Requests', icon: FileCheck },
        { key: 'assignment', label: 'Mentor Assignment', icon: UserCheck },
        { key: 'reassignment', label: 'Mentor Reassignment', icon: UserCog },
      ],
    },
    {
      label: 'ACADEMIC',
      items: [{ key: 'internal-marks', label: 'Internal Marks', icon: ClipboardList }],
    },
    {
      label: 'MENTORING',
      items: [
        { key: 'counselling', label: 'Counselling Records', icon: FileText },
        { key: 'meetings', label: 'Saturday Meetings', icon: CalendarCheck2 },
        { key: 'monthly-progress', label: 'Monthly Progress', icon: Award },
        { key: 'documents', label: 'Student Documents', icon: FileCheck },
      ],
    },
    {
      label: 'DATA',
      items: [
        { key: 'bulk-upload', label: 'Bulk Upload', icon: Upload },
        { key: 'departments', label: 'Departments', icon: BookOpen },
        { key: 'schools', label: 'Schools Directory', icon: School },
      ],
    },
    {
      label: 'INSIGHTS & SYSTEM',
      items: [
        { key: 'reports', label: 'Institutional Reports', icon: BarChart3 },
        { key: 'pdf-downloads', label: 'PDF Downloads', icon: Download },
        { key: 'notifications', label: 'System Notifications', icon: Bell },
        { key: 'audit-trail', label: 'Audit Logs', icon: History },
        { key: 'saturday-settings', label: 'System Settings', icon: Settings },
      ],
    },
  ],
  HOD: [
    {
      label: 'MAIN',
      items: [{ key: 'overview', label: 'Department Overview', icon: LayoutDashboard }],
    },
    {
      label: 'MANAGEMENT',
      items: [
        { key: 'students', label: 'Department Mentees', icon: GraduationCap },
        { key: 'faculty', label: 'Faculty Mentors', icon: Users },
        { key: 'reassignment', label: 'Mentor Reassignment', icon: UserCog },
      ],
    },
    {
      label: 'MENTORING',
      items: [{ key: 'meetings', label: 'Saturday Meetings', icon: CalendarCheck2 }],
    },
    {
      label: 'PERFORMANCE',
      items: [
        { key: 'placement', label: 'Placement Monitoring', icon: Briefcase },
        { key: 'leaderboard', label: 'Achievement Leaderboard', icon: Trophy },
      ],
    },
    {
      label: 'INSIGHTS',
      items: [
        { key: 'reports', label: 'Department Reports', icon: BarChart3 },
        { key: 'notifications', label: 'Faculty Notifications', icon: Bell },
      ],
    },
  ],
  FACULTY: [
    {
      label: 'MAIN',
      items: [{ key: 'overview', label: 'Mentor Dashboard', icon: LayoutDashboard }],
    },
    {
      label: 'MENTORING',
      items: [
        { key: 'mentees', label: 'My Mentees', icon: Users },
        { key: 'meetings', label: 'Saturday Meetings', icon: CalendarCheck2 },
        { key: 'counselling', label: '5-Domain Counselling', icon: BookOpen },
      ],
    },
    {
      label: 'RECORDS',
      items: [
        { key: 'documents', label: 'Student Documents', icon: FileCheck },
        { key: 'progress', label: 'Monthly Improvement', icon: Award },
      ],
    },
    {
      label: 'PERFORMANCE',
      items: [{ key: 'leaderboard', label: 'Achievement Leaderboard', icon: Trophy }],
    },
    {
      label: 'TOOLS',
      items: [
        { key: 'ai-advisor', label: 'AI Assistant', icon: Sparkles },
        { key: 'notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ],
  STUDENT: [
    {
      label: 'MAIN',
      items: [
        { key: 'overview', label: 'My Dashboard', icon: LayoutDashboard },
        { key: 'profile', label: 'My Profile', icon: User },
      ],
    },
    {
      label: 'ACADEMIC',
      items: [{ key: 'academics', label: 'Academic Ledger (Sem 1-8)', icon: GraduationCap }],
    },
    {
      label: 'MENTORING',
      items: [
        { key: 'meetings', label: 'Saturday Meetings', icon: CalendarCheck2 },
        { key: 'mentoring-history', label: 'Mentoring & Counselling', icon: History },
        { key: 'my-progress', label: 'My Progress', icon: Award },
      ],
    },
    {
      label: 'PERFORMANCE',
      items: [{ key: 'leaderboard', label: 'Achievement Leaderboard', icon: Trophy }],
    },
    {
      label: 'RECORDS',
      items: [
        { key: 'documents', label: 'My Documents', icon: FileCheck },
        { key: 'pdf', label: 'Official Record Book (PDF)', icon: FileText },
      ],
    },
  ],
};

const COLLAPSE_KEY = 'ksrce_sidebar_collapsed';

/** Resolve the human label of a tab for the current role (used by the topbar context). */
export const getNavLabel = (role: string | undefined, tab: string): string | undefined => {
  const sections = NAV_BY_ROLE[role || ''] || [];
  for (const section of sections) {
    const hit = section.items.find((item) => item.key === tab);
    if (hit) return hit.label;
  }
  return undefined;
};

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, isOpen = false, onClose }) => {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Close the off-canvas drawer with Escape, like a native dialog.
  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable - the session still works, just without persistence */
      }
      return next;
    });
  };

  const handleSelect = (tab: string) => {
    onSelectTab(tab);
    if (onClose) onClose();
  };

  const role = user?.role || '';
  const sections = NAV_BY_ROLE[role] || [];

  const displayName = user?.fullName?.includes('Balasubramanian')
    ? 'System admin'
    : user?.fullName || 'System admin';

  const roleBadge = role === 'ADMIN' ? 'ADMIN • KSRCE' : `${role} • ${user?.dept_code || 'KSRCE'}`;

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside
        id="primary-sidebar"
        className={`sidebar ${isOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}
        aria-label="Primary navigation"
      >
        <div className="sidebar-portal">
          <button
            type="button"
            className="sidebar-collapse"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="sidebar-close"
              aria-label="Close navigation drawer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <nav className="sidebar-nav" aria-label={`${role || 'User'} portal sections`}>
          {sections.map((section, sIdx) => (
            <React.Fragment key={section.label || `section-${sIdx}`}>
              {section.label && <div className="nav-section-label">{section.label}</div>}
              {section.items.map(({ key, label, icon: Icon }) => {
                const active = currentTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`nav-item ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => handleSelect(key)}
                    title={collapsed ? label : undefined}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span className="nav-label">{label}</span>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </nav>

        {/* Off-canvas drawer footer (mobile + tablet): identity + logout */}
        <div className="sidebar-footer sidebar-drawer-user">
          <div style={{ marginBottom: '0.1rem' }}>
            <div className="sidebar-user-name">{displayName}</div>
            <div className="sidebar-user-role">{roleBadge}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onClose) onClose();
              logout();
            }}
            className="btn btn-danger btn-block"
            style={{ fontWeight: 600 }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>

        {/* Desktop footer (expanded + collapsed rail) */}
        <div className="sidebar-footer sidebar-desktop-user">
          <div className="sidebar-user-name">{displayName}</div>
          <div className="sidebar-user-role" style={{ marginBottom: '0.35rem' }}>
            {roleBadge}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'rgba(203,213,225,0.55)', letterSpacing: '0.03em' }}>
            KSRCE Mentoring v1.0
          </div>
        </div>
      </aside>
    </>
  );
};