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
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const { user } = useAuth();

  const renderNavItems = () => {
    switch (user?.role) {
      case 'ADMIN':
        return (
          <>
            <button
              className={`nav-item ${currentTab === 'overview' ? 'active' : ''}`}
              onClick={() => onSelectTab('overview')}
            >
              <LayoutDashboard size={18} /> Admin Dashboard
            </button>
            <button
              className={`nav-item ${currentTab === 'students' ? 'active' : ''}`}
              onClick={() => onSelectTab('students')}
            >
              <GraduationCap size={18} /> Students Master
            </button>
            <button
              className={`nav-item ${currentTab === 'faculty' ? 'active' : ''}`}
              onClick={() => onSelectTab('faculty')}
            >
              <Users size={18} /> Faculty / Mentors
            </button>
            <button
              className={`nav-item ${currentTab === 'departments' ? 'active' : ''}`}
              onClick={() => onSelectTab('departments')}
            >
              <BookOpen size={18} /> Departments
            </button>
            <button
              className={`nav-item ${currentTab === 'schools' ? 'active' : ''}`}
              onClick={() => onSelectTab('schools')}
            >
              <School size={18} /> Schools Directory
            </button>
            <button
              className={`nav-item ${currentTab === 'assignment' ? 'active' : ''}`}
              onClick={() => onSelectTab('assignment')}
            >
              <UserCheck size={18} /> Mentor Assignment
            </button>
            <button
              className={`nav-item ${currentTab === 'reassignment' ? 'active' : ''}`}
              onClick={() => onSelectTab('reassignment')}
            >
              <UserCog size={18} /> Mentor Reassignment
            </button>
            <button
              className={`nav-item ${currentTab === 'documents' ? 'active' : ''}`}
              onClick={() => onSelectTab('documents')}
            >
              <FileCheck size={18} /> Student Documents
            </button>
            <button
              className={`nav-item ${currentTab === 'counselling' ? 'active' : ''}`}
              onClick={() => onSelectTab('counselling')}
            >
              <FileText size={18} /> Counselling Records
            </button>
            <button
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''}`}
              onClick={() => onSelectTab('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              className={`nav-item ${currentTab === 'monthly-progress' ? 'active' : ''}`}
              onClick={() => onSelectTab('monthly-progress')}
            >
              <Award size={18} /> Monthly Progress
            </button>
            <button
              className={`nav-item ${currentTab === 'notifications' ? 'active' : ''}`}
              onClick={() => onSelectTab('notifications')}
            >
              <ShieldAlert size={18} /> System Notifications
            </button>
            <button
              className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
              onClick={() => onSelectTab('reports')}
            >
              <BarChart3 size={18} /> Institutional Reports
            </button>
            <button
              className={`nav-item ${currentTab === 'pdf-downloads' ? 'active' : ''}`}
              onClick={() => onSelectTab('pdf-downloads')}
            >
              <Download size={18} /> PDF Downloads
            </button>
            <button
              className={`nav-item ${currentTab === 'saturday-settings' ? 'active' : ''}`}
              onClick={() => onSelectTab('saturday-settings')}
            >
              <Settings size={18} /> System Settings
            </button>
            <button
              className={`nav-item ${currentTab === 'audit-trail' ? 'active' : ''}`}
              onClick={() => onSelectTab('audit-trail')}
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
              onClick={() => onSelectTab('overview')}
            >
              <LayoutDashboard size={18} /> Department Overview
            </button>
            <button
              className={`nav-item ${currentTab === 'students' ? 'active' : ''}`}
              onClick={() => onSelectTab('students')}
            >
              <GraduationCap size={18} /> Department Mentees
            </button>
            <button
              className={`nav-item ${currentTab === 'faculty' ? 'active' : ''}`}
              onClick={() => onSelectTab('faculty')}
            >
              <Users size={18} /> Faculty Mentors
            </button>
            <button
              className={`nav-item ${currentTab === 'reassignment' ? 'active' : ''}`}
              onClick={() => onSelectTab('reassignment')}
            >
              <UserCog size={18} /> Mentor Reassignment
            </button>
            <button
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''}`}
              onClick={() => onSelectTab('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
              onClick={() => onSelectTab('reports')}
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
              onClick={() => onSelectTab('overview')}
            >
              <LayoutDashboard size={18} /> Mentor Dashboard
            </button>
            <button
              className={`nav-item ${currentTab === 'mentees' ? 'active' : ''}`}
              onClick={() => onSelectTab('mentees')}
            >
              <Users size={18} /> My Mentees
            </button>
            <button
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''}`}
              onClick={() => onSelectTab('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              className={`nav-item ${currentTab === 'counselling' ? 'active' : ''}`}
              onClick={() => onSelectTab('counselling')}
            >
              <BookOpen size={18} /> 5-Domain Counselling
            </button>
            <button
              className={`nav-item ${currentTab === 'progress' ? 'active' : ''}`}
              onClick={() => onSelectTab('progress')}
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
              onClick={() => onSelectTab('overview')}
            >
              <LayoutDashboard size={18} /> My Dashboard
            </button>
            <button
              className={`nav-item ${currentTab === 'profile' ? 'active' : ''}`}
              onClick={() => onSelectTab('profile')}
            >
              <User size={18} /> My Profile
            </button>
            <button
              className={`nav-item ${currentTab === 'academics' ? 'active' : ''}`}
              onClick={() => onSelectTab('academics')}
            >
              <GraduationCap size={18} /> Academic Ledger (Sem 1-8)
            </button>
            <button
              className={`nav-item ${currentTab === 'meetings' ? 'active' : ''}`}
              onClick={() => onSelectTab('meetings')}
            >
              <CalendarCheck2 size={18} /> Saturday Meetings
            </button>
            <button
              className={`nav-item ${currentTab === 'mentoring-history' ? 'active' : ''}`}
              onClick={() => onSelectTab('mentoring-history')}
            >
              <History size={18} /> Mentoring & Counselling
            </button>
            <button
              className={`nav-item ${currentTab === 'documents' ? 'active' : ''}`}
              onClick={() => onSelectTab('documents')}
            >
              <FileCheck size={18} /> My Documents
            </button>
            <button
              className={`nav-item ${currentTab === 'pdf' ? 'active' : ''}`}
              onClick={() => onSelectTab('pdf')}
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
    <aside className="sidebar">
      <div style={{ padding: '1.25rem 1rem 0.5rem', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.75px', color: '#64748B', fontWeight: 700 }}>
          {user?.role} PORTAL
        </div>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0B2545', marginTop: '2px' }}>
          {user?.departmentId ? `${user.dept_code || 'CSE'} Department` : 'Central Administration'}
        </div>
      </div>
      <nav className="sidebar-nav">
        {renderNavItems()}
      </nav>
      <div style={{ padding: '1rem', borderTop: '1px solid #F1F5F9', fontSize: '0.75rem', color: '#94A3B8' }}>
        KSRCE Mentoring v1.0<br />Autonomous Institutional Build
      </div>
    </aside>
  );
};
