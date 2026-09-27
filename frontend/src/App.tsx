import React, { useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/auth/LoginPage';
import { Navbar } from './components/common/Navbar';
import { Sidebar } from './components/common/Sidebar';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { HodDashboard } from './pages/hod/HodDashboard';
import { FacultyDashboard } from './pages/faculty/FacultyDashboard';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { CompleteProfileWizard } from './pages/student/CompleteProfileWizard';
import { PwaInstallBanner } from './components/common/PwaInstallBanner';
import { NotFoundPage } from './pages/error/NotFoundPage';
import { AccessDeniedState } from './pages/error/AccessDeniedState';
import { StudentRouteView } from './pages/common/StudentRouteView';
import { MentorViewWrapper } from './pages/common/MentorViewWrapper';

export const App: React.FC = () => {
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState<string>('overview');
  const [justCompletedProfile, setJustCompletedProfile] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

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
        <img
          src="/ksrce-logo.png"
          alt="KSRCE Logo"
          style={{ width: '64px', height: '64px', objectFit: 'contain', marginBottom: '1.25rem' }}
        />
        <div
          style={{
            width: '42px',
            height: '42px',
            border: '4px solid #C59B27',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '1rem',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.03em' }}>
          K.S.R. COLLEGE OF ENGINEERING
        </div>
        <div style={{ fontSize: '0.82rem', color: '#D4AF37', marginTop: '4px', letterSpacing: '0.04em' }}>
          Initializing Digital Mentor–Mentee Management System...
        </div>
      </div>
    );
  }

  // Unauthenticated routes
  if (!isAuthenticated) {
    return (
      <>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<NotFoundPage onGoDashboard={() => navigate('/login')} onGoBack={() => navigate('/login')} />} />
        </Routes>
        <PwaInstallBanner />
      </>
    );
  }

  // Student First Login Check
  const isStudent = user?.role === 'STUDENT';
  const isProfileIncomplete = isStudent && !user?.profileCompleted && user?.student?.profile_completed !== 1;

  if (isProfileIncomplete && !justCompletedProfile) {
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navbar />
        <main className="main-content" style={{ padding: '2rem 1.5rem', backgroundColor: '#F8FAFC' }}>
          <Routes>
            <Route
              path="/student/complete-profile"
              element={
                <CompleteProfileWizard
                  onCompleted={async () => {
                    setJustCompletedProfile(true);
                    await refreshUser();
                  }}
                />
              }
            />
            <Route
              path="*"
              element={
                <CompleteProfileWizard
                  onCompleted={async () => {
                    setJustCompletedProfile(true);
                    await refreshUser();
                  }}
                />
              }
            />
          </Routes>
        </main>
        <PwaInstallBanner />
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
        return <AccessDeniedState onGoDashboard={() => navigate('/')} />;
    }
  };

  const MainDashboardLayout = (
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
      <PwaInstallBanner />
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={MainDashboardLayout} />
      <Route path="/dashboard" element={MainDashboardLayout} />

      {/* Direct routes for student & mentor detail views */}
      <Route path="/students/:id" element={<StudentRouteView />} />
      <Route path="/mentor/:id" element={<MentorViewWrapper />} />

      {/* Role-based guards */}
      <Route
        path="/admin/*"
        element={user?.role === 'ADMIN' ? MainDashboardLayout : <AccessDeniedState onGoDashboard={() => navigate('/')} />}
      />
      <Route
        path="/hod/*"
        element={user?.role === 'HOD' ? MainDashboardLayout : <AccessDeniedState onGoDashboard={() => navigate('/')} />}
      />
      <Route
        path="/faculty/*"
        element={user?.role === 'FACULTY' ? MainDashboardLayout : <AccessDeniedState onGoDashboard={() => navigate('/')} />}
      />
      <Route
        path="/student/*"
        element={user?.role === 'STUDENT' ? MainDashboardLayout : <AccessDeniedState onGoDashboard={() => navigate('/')} />}
      />

      {/* Catch-all 404 Route (Requirement 14) */}
      <Route path="*" element={<NotFoundPage onGoDashboard={() => navigate('/')} onGoBack={() => navigate(-1)} />} />
    </Routes>
  );
};

export default App;
