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
              className={`nav-item ${currentTab === 'overview' ? 'active' : ''}`}
              onClick={() => handleSelect('overview')}
            >
              <LayoutDashboard size={18} /> Admin Dashboard
            </button>
            <button
              className={`nav-item ${currentTab === 'students' ? 'active' : ''}`}
              onClick={() => handleSelect('students')}
            >
              <GraduationCap size={18} /> Students Master
            </button>
            <button
              className={`nav-item ${currentTab === 'faculty' ? 'active' : ''}`}
              onClick={() => handleSelect('faculty')}
            >
              <Users size={18} /> Faculty / Mentors
            </button>
            <button
              className={`nav-item ${currentTab === 'departments' ? 'active' : ''}`}
              onClick={() => handleSelect('departments')}
            >
              <BookOpen size={18} /> Departments
            </button>
            <button
              className={`nav-item ${currentTab === 'schools' ? 'active' : ''}`}
              onClick={() => handleSelect('schools')}
            >
              <School size={18} /> Schools Directory
            </button>
            <button
              className={`nav-item ${currentTab === 'assignment' ? 'active' : ''}`}
              onClick={() => handleSelect('assignment')}
            >
              <UserCheck size={18} /> Mentor Assignment
            </button>
            <button
              className={`nav-item ${currentTab === 'reassignment' ? 'active' : ''}`}
              onClick={() => handleSelect('reassignment')}
            >
              <UserCog size={18} /> Mentor Reassignment
            </button>
            <button
              className={`nav-item ${currentTab === 'documents' ? 'active' : ''}`}
              onClick={() => handleSelect('documents')}
            >
              <FileCheck size={18} /> Student Documents
            </button>
            <button
              className={`nav-item ${currentTab === 'counselling' ? 'active' : ''}`}
              onClick={() => handleSelect('counselling')}
            >
              <FileText size={18} /> Counselling Records
            </button>
            <button
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''}`}
              onClick={() => handleSelect('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              className={`nav-item ${currentTab === 'monthly-progress' ? 'active' : ''}`}
              onClick={() => handleSelect('monthly-progress')}
            >
              <Award size={18} /> Monthly Progress
            </button>
            <button
              className={`nav-item ${currentTab === 'notifications' ? 'active' : ''}`}
              onClick={() => handleSelect('notifications')}
            >
              <ShieldAlert size={18} /> System Notifications
            </button>
            <button
              className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
              onClick={() => handleSelect('reports')}
            >
              <BarChart3 size={18} /> Institutional Reports
            </button>
            <button
              className={`nav-item ${currentTab === 'pdf-downloads' ? 'active' : ''}`}
              onClick={() => handleSelect('pdf-downloads')}
            >
              <Download size={18} /> PDF Downloads
            </button>
            <button
              className={`nav-item ${currentTab === 'saturday-settings' ? 'active' : ''}`}
              onClick={() => handleSelect('saturday-settings')}
            >
              <Settings size={18} /> System Settings
            </button>
            <button
              className={`nav-item ${currentTab === 'audit-trail' ? 'active' : ''}`}
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
              className={`nav-item ${currentTab === 'overview' ? 'active' : ''}`}
              onClick={() => handleSelect('overview')}
            >
              <LayoutDashboard size={18} /> Department Overview
            </button>
            <button
              className={`nav-item ${currentTab === 'students' ? 'active' : ''}`}
              onClick={() => handleSelect('students')}
            >
              <GraduationCap size={18} /> Department Mentees
            </button>
            <button
              className={`nav-item ${currentTab === 'faculty' ? 'active' : ''}`}
              onClick={() => handleSelect('faculty')}
            >
              <Users size={18} /> Faculty Mentors
            </button>
            <button
              className={`nav-item ${currentTab === 'reassignment' ? 'active' : ''}`}
              onClick={() => handleSelect('reassignment')}
            >
              <UserCog size={18} /> Mentor Reassignment
            </button>
            <button
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''}`}
              onClick={() => handleSelect('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
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
              className={`nav-item ${currentTab === 'overview' ? 'active' : ''}`}
              onClick={() => handleSelect('overview')}
            >
              <LayoutDashboard size={18} /> Mentor Dashboard
            </button>
            <button
              className={`nav-item ${currentTab === 'mentees' ? 'active' : ''}`}
              onClick={() => handleSelect('mentees')}
            >
              <Users size={18} /> My Mentees
            </button>
            <button
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''}`}
              onClick={() => handleSelect('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              className={`nav-item ${currentTab === 'counselling' ? 'active' : ''}`}
              onClick={() => handleSelect('counselling')}
            >
              <BookOpen size={18} /> 5-Domain Counselling
            </button>
            <button
              className={`nav-item ${currentTab === 'progress' ? 'active' : ''}`}
              onClick={() => handleSelect('progress')}
            >
              <Award size={18} /> Monthly Improvement
            </button>
          </>
        );

      case 'STUDENT':
        return (
          <>
            <button
              className={`nav-item ${currentTab === 'overview' ? 'active' : ''}`}
              onClick={() => handleSelect('overview')}
            >
              <LayoutDashboard size={18} /> My Dashboard
            </button>
            <button
              className={`nav-item ${currentTab === 'profile' ? 'active' : ''}`}
              onClick={() => handleSelect('profile')}
            >
              <User size={18} /> My Profile
            </button>
            <button
              className={`nav-item ${currentTab === 'academics' ? 'active' : ''}`}
              onClick={() => handleSelect('academics')}
            >
              <GraduationCap size={18} /> Academic Ledger (Sem 1-8)
            </button>
            <button
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''}`}
              onClick={() => handleSelect('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              className={`nav-item ${currentTab === 'mentoring-history' ? 'active' : ''}`}
              onClick={() => handleSelect('mentoring-history')}
            >
              <History size={18} /> Mentoring & Counselling
            </button>
            <button
              className={`nav-item ${currentTab === 'documents' ? 'active' : ''}`}
              onClick={() => handleSelect('documents')}
            >
              <FileCheck size={18} /> My Documents
            </button>
            <button
              className={`nav-item ${currentTab === 'pdf' ? 'active' : ''}`}
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
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} aria-label="Close Sidebar" />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div style={{ padding: '1.25rem 1rem 0.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.75px', color: '#64748B', fontWeight: 700 }}>
              {user?.role} PORTAL
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0B2545', marginTop: '2px' }}>
              {user?.departmentId ? `${user.dept_code || 'CSE'} Department` : 'Central Administration'}
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="mobile-only"
              aria-label="Close drawer"
              style={{
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '8px',
                padding: '8px',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                minWidth: '40px',
                minHeight: '40px',
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
        <nav className="sidebar-nav">
          {renderNavItems()}
        </nav>
        {/* Mobile Drawer User Details & Logout */}
        <div className="mobile-only" style={{ padding: '1rem', borderTop: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0B2545' }}>
              {user?.fullName}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
              {user?.role} • {user?.dept_code || 'KSRCE'}
            </div>
          </div>
          <button
            onClick={() => {
              if (onClose) onClose();
              logout();
            }}
            className="btn btn-secondary btn-sm"
            style={{
              width: '100%',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              fontWeight: 600,
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              border: '1px solid #FECACA',
            }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
        <div className="desktop-only" style={{ padding: '1rem', borderTop: '1px solid #F1F5F9', fontSize: '0.75rem', color: '#94A3B8' }}>
          KSRCE Mentoring v1.0<br />Autonomous Institutional Build
        </div>
      </aside>
    </>
  );
};
