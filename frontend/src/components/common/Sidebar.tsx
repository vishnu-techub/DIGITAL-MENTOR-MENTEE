import React from 'react';
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
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, isOpen = false, onClose }) => {
  const { user, logout } = useAuth();

  const handleSelect = (tab: string) => {
    onSelectTab(tab);
    if (onClose) onClose();
  };

  const renderNavItems = () => {
    switch (user?.role) {
      case 'ADMIN':
        return (
          <>
            <button
              type="button"
              className={`nav-item ${currentTab === 'overview' ? 'active' : ''} aria-current={currentTab === 'overview' ? 'page' : undefined}`}
              onClick={() => handleSelect('overview')}
            >
              <LayoutDashboard size={18} /> Admin Dashboard
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'students' ? 'active' : ''} aria-current={currentTab === 'students' ? 'page' : undefined}`}
              onClick={() => handleSelect('students')}
            >
              <GraduationCap size={18} /> Students Master
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'identity-requests' ? 'active' : ''} aria-current={currentTab === 'identity-requests' ? 'page' : undefined}`}
              onClick={() => handleSelect('identity-requests')}
            >
              <FileCheck size={18} /> Identity Edit Requests
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'faculty' ? 'active' : ''} aria-current={currentTab === 'faculty' ? 'page' : undefined}`}
              onClick={() => handleSelect('faculty')}
            >
              <Users size={18} /> Faculty / Mentors
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'departments' ? 'active' : ''} aria-current={currentTab === 'departments' ? 'page' : undefined}`}
              onClick={() => handleSelect('departments')}
            >
              <BookOpen size={18} /> Departments
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'schools' ? 'active' : ''} aria-current={currentTab === 'schools' ? 'page' : undefined}`}
              onClick={() => handleSelect('schools')}
            >
              <School size={18} /> Schools Directory
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'assignment' ? 'active' : ''} aria-current={currentTab === 'assignment' ? 'page' : undefined}`}
              onClick={() => handleSelect('assignment')}
            >
              <UserCheck size={18} /> Mentor Assignment
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'reassignment' ? 'active' : ''} aria-current={currentTab === 'reassignment' ? 'page' : undefined}`}
              onClick={() => handleSelect('reassignment')}
            >
              <UserCog size={18} /> Mentor Reassignment
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'documents' ? 'active' : ''} aria-current={currentTab === 'documents' ? 'page' : undefined}`}
              onClick={() => handleSelect('documents')}
            >
              <FileCheck size={18} /> Student Documents
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'counselling' ? 'active' : ''} aria-current={currentTab === 'counselling' ? 'page' : undefined}`}
              onClick={() => handleSelect('counselling')}
            >
              <FileText size={18} /> Counselling Records
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''} aria-current={currentTab === 'meetings' ? 'page' : undefined}`}
              onClick={() => handleSelect('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'monthly-progress' ? 'active' : ''} aria-current={currentTab === 'monthly-progress' ? 'page' : undefined}`}
              onClick={() => handleSelect('monthly-progress')}
            >
              <Award size={18} /> Monthly Progress
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'notifications' ? 'active' : ''} aria-current={currentTab === 'notifications' ? 'page' : undefined}`}
              onClick={() => handleSelect('notifications')}
            >
              <ShieldAlert size={18} /> System Notifications
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'reports' ? 'active' : ''} aria-current={currentTab === 'reports' ? 'page' : undefined}`}
              onClick={() => handleSelect('reports')}
            >
              <BarChart3 size={18} /> Institutional Reports
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'pdf-downloads' ? 'active' : ''} aria-current={currentTab === 'pdf-downloads' ? 'page' : undefined}`}
              onClick={() => handleSelect('pdf-downloads')}
            >
              <Download size={18} /> PDF Downloads
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'saturday-settings' ? 'active' : ''} aria-current={currentTab === 'saturday-settings' ? 'page' : undefined}`}
              onClick={() => handleSelect('saturday-settings')}
            >
              <Settings size={18} /> System Settings
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'audit-trail' ? 'active' : ''} aria-current={currentTab === 'audit-trail' ? 'page' : undefined}`}
              onClick={() => handleSelect('audit-trail')}
            >
              <History size={18} /> Audit Logs
            </button>
          </>
        );

      case 'HOD':
        return (
          <>
            <button
              type="button"
              className={`nav-item ${currentTab === 'overview' ? 'active' : ''} aria-current={currentTab === 'overview' ? 'page' : undefined}`}
              onClick={() => handleSelect('overview')}
            >
              <LayoutDashboard size={18} /> Department Overview
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'students' ? 'active' : ''} aria-current={currentTab === 'students' ? 'page' : undefined}`}
              onClick={() => handleSelect('students')}
            >
              <GraduationCap size={18} /> Department Mentees
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'faculty' ? 'active' : ''} aria-current={currentTab === 'faculty' ? 'page' : undefined}`}
              onClick={() => handleSelect('faculty')}
            >
              <Users size={18} /> Faculty Mentors
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'reassignment' ? 'active' : ''} aria-current={currentTab === 'reassignment' ? 'page' : undefined}`}
              onClick={() => handleSelect('reassignment')}
            >
              <UserCog size={18} /> Mentor Reassignment
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''} aria-current={currentTab === 'meetings' ? 'page' : undefined}`}
              onClick={() => handleSelect('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'reports' ? 'active' : ''} aria-current={currentTab === 'reports' ? 'page' : undefined}`}
              onClick={() => handleSelect('reports')}
            >
              <BarChart3 size={18} /> Department Reports
            </button>
          </>
        );

      case 'FACULTY':
        return (
          <>
            <button
              type="button"
              className={`nav-item ${currentTab === 'overview' ? 'active' : ''} aria-current={currentTab === 'overview' ? 'page' : undefined}`}
              onClick={() => handleSelect('overview')}
            >
              <LayoutDashboard size={18} /> Mentor Dashboard
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'mentees' ? 'active' : ''} aria-current={currentTab === 'mentees' ? 'page' : undefined}`}
              onClick={() => handleSelect('mentees')}
            >
              <Users size={18} /> My Mentees
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''} aria-current={currentTab === 'meetings' ? 'page' : undefined}`}
              onClick={() => handleSelect('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'counselling' ? 'active' : ''} aria-current={currentTab === 'counselling' ? 'page' : undefined}`}
              onClick={() => handleSelect('counselling')}
            >
              <BookOpen size={18} /> 5-Domain Counselling
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'documents' ? 'active' : ''} aria-current={currentTab === 'documents' ? 'page' : undefined}`}
              onClick={() => handleSelect('documents')}
            >
              <FileCheck size={18} /> Student Documents
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'progress' ? 'active' : ''} aria-current={currentTab === 'progress' ? 'page' : undefined}`}
              onClick={() => handleSelect('progress')}
            >
              <Award size={18} /> Monthly Improvement
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'ai-advisor' ? 'active' : ''} aria-current={currentTab === 'ai-advisor' ? 'page' : undefined}`}
              onClick={() => handleSelect('ai-advisor')}
            >
              <Sparkles size={18} /> AI Assistant
            </button>
          </>
        );

      case 'STUDENT':
        return (
          <>
            <button
              type="button"
              className={`nav-item ${currentTab === 'overview' ? 'active' : ''} aria-current={currentTab === 'overview' ? 'page' : undefined}`}
              onClick={() => handleSelect('overview')}
            >
              <LayoutDashboard size={18} /> My Dashboard
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'profile' ? 'active' : ''} aria-current={currentTab === 'profile' ? 'page' : undefined}`}
              onClick={() => handleSelect('profile')}
            >
              <User size={18} /> My Profile
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'academics' ? 'active' : ''} aria-current={currentTab === 'academics' ? 'page' : undefined}`}
              onClick={() => handleSelect('academics')}
            >
              <GraduationCap size={18} /> Academic Ledger (Sem 1-8)
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''} aria-current={currentTab === 'meetings' ? 'page' : undefined}`}
              onClick={() => handleSelect('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'mentoring-history' ? 'active' : ''} aria-current={currentTab === 'mentoring-history' ? 'page' : undefined}`}
              onClick={() => handleSelect('mentoring-history')}
            >
              <History size={18} /> Mentoring & Counselling
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'my-progress' ? 'active' : ''} aria-current={currentTab === 'my-progress' ? 'page' : undefined}`}
              onClick={() => handleSelect('my-progress')}
            >
              <Award size={18} /> My Progress
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'documents' ? 'active' : ''} aria-current={currentTab === 'documents' ? 'page' : undefined}`}
              onClick={() => handleSelect('documents')}
            >
              <FileCheck size={18} /> My Documents
            </button>
            <button
              type="button"
              className={`nav-item ${currentTab === 'pdf' ? 'active' : ''} aria-current={currentTab === 'pdf' ? 'page' : undefined}`}
              onClick={() => handleSelect('pdf')}
            >
              <FileText size={18} /> Official Record Book (PDF)
            </button>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside
        id="primary-sidebar"
        className={`sidebar ${isOpen ? 'open' : ''}`}
        aria-label="Primary navigation"
      >
        <div style={{ padding: '1.25rem 1rem 0.75rem', borderBottom: '1px solid var(--slate-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.75px', color: 'var(--slate-500)', fontWeight: 700 }}>
              {user?.role} PORTAL
            </div>
            <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--primary-800)', marginTop: '2px' }}>
              {user?.departmentId ? `${user.dept_code || 'CSE'} Department` : 'Central Administration'}
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="mobile-only"
              aria-label="Close navigation drawer"
              style={{
                background: 'var(--slate-100)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '8px',
                color: 'var(--slate-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                minWidth: 'var(--touch-target)',
                minHeight: 'var(--touch-target)',
                flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
        <nav className="sidebar-nav" aria-label={`${user?.role || 'User'} portal sections`}>
          {renderNavItems()}
        </nav>
        {/* Mobile Drawer User Details & Logout */}
        <div className="mobile-only" style={{ padding: '1rem', borderTop: '1px solid var(--slate-100)', backgroundColor: 'var(--slate-50)' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--primary-800)' }}>
              {user?.fullName?.includes('Balasubramanian') ? 'System admin' : (user?.fullName || 'System admin')}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--slate-500)' }}>
              {user?.role} • {user?.dept_code || 'KSRCE'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onClose) onClose();
              logout();
            }}
            className="btn btn-danger"
            style={{
              width: '100%',
              minHeight: 'var(--touch-target)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              fontWeight: 600,
            }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
        <div className="desktop-only" style={{ padding: '1rem', borderTop: '1px solid var(--slate-100)', fontSize: 'var(--text-sm)', color: 'var(--slate-400)' }}>
          KSRCE Mentoring v1.0<br />Autonomous Institutional Build
        </div>
      </aside>
    </>
  );
};
