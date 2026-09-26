import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/auth/LoginPage';
import { Navbar } from './components/common/Navbar';
import { Sidebar } from './components/common/Sidebar';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { HodDashboard } from './pages/hod/HodDashboard';
import { FacultyDashboard } from './pages/faculty/FacultyDashboard';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { CompleteProfileWizard } from './pages/student/CompleteProfileWizard';

export const App: React.FC = () => {
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('overview');
  const [justCompletedProfile, setJustCompletedProfile] = useState<boolean>(false);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0B2545',
          color: '#ffffff',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            border: '4px solid #C59B27',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '1rem',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
          K.S.R. COLLEGE OF ENGINEERING
        </div>
        <div style={{ fontSize: '0.8rem', color: '#D4AF37', marginTop: '4px' }}>
          Initializing Digital Mentor–Mentee Management System...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Student First Login Check
  const isStudent = user?.role === 'STUDENT';
  const isProfileIncomplete = isStudent && !user?.profileCompleted && user?.student?.profile_completed !== 1;

  if (isProfileIncomplete && !justCompletedProfile) {
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navbar />
        <main className="main-content" style={{ padding: '2rem 1.5rem', backgroundColor: '#F8FAFC' }}>
          <CompleteProfileWizard
            onCompleted={async () => {
              setJustCompletedProfile(true);
              await refreshUser();
            }}
          />
        </main>
      </div>
    );
  }

  const renderDashboardByRole = () => {
    switch (user?.role) {
      case 'ADMIN':
        return <AdminDashboard currentTab={currentTab} onSelectTab={setCurrentTab} />;
      case 'HOD':
        return <HodDashboard currentTab={currentTab} onSelectTab={setCurrentTab} />;
      case 'FACULTY':
        return <FacultyDashboard currentTab={currentTab} onSelectTab={setCurrentTab} />;
      case 'STUDENT':
        return (
          <StudentDashboard
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            justCompleted={justCompletedProfile}
          />
        );
      default:
        return <div>Invalid user role.</div>;
    }
  };

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
      />
      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main className="main-content">
          <div className="page-body">
            {renderDashboardByRole()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
