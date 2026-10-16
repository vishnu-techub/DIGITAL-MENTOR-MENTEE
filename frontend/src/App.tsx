import React, { Suspense, useEffect, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/auth/LoginPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { Navbar } from './components/common/Navbar';
import { Sidebar, getNavLabel } from './components/common/Sidebar';
import { PwaInstallBanner } from './components/common/PwaInstallBanner';
import { DashboardSkeleton } from './components/common/SkeletonLoader';
import { NotFoundPage } from './pages/error/NotFoundPage';
import { AccessDeniedState } from './pages/error/AccessDeniedState';
import { SessionExpiredState } from './pages/error/SessionExpiredState';
import { ServerErrorState } from './pages/error/ServerErrorState';
import { NetworkErrorState } from './pages/error/NetworkErrorState';

/**
 * Role portals, the profile wizard and the AI assistant are code-split.
 *
 * Each dashboard is a large, self-contained module (the Admin portal alone is
 * thousands of lines with its own tables and charts) and no session ever needs
 * more than one of them. Statically importing all of them put every portal in
 * the initial bundle (~1 MB) even though a Student only ever loads the Student
 * portal. Lazy-loading shrinks the first paint for every role; the chunk for a
 * portal is fetched in parallel while the shell renders its skeleton.
 */
const AdminDashboard = React.lazy(() =>
  import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const PrincipalDashboard = React.lazy(() =>
  import('./pages/principal/PrincipalDashboard').then((m) => ({ default: m.PrincipalDashboard }))
);
const HodDashboard = React.lazy(() =>
  import('./pages/hod/HodDashboard').then((m) => ({ default: m.HodDashboard }))
);
const FacultyDashboard = React.lazy(() =>
  import('./pages/faculty/FacultyDashboard').then((m) => ({ default: m.FacultyDashboard }))
);
const StudentDashboard = React.lazy(() =>
  import('./pages/student/StudentDashboard').then((m) => ({ default: m.StudentDashboard }))
);
const CompleteProfileWizard = React.lazy(() =>
  import('./pages/student/CompleteProfileWizard').then((m) => ({ default: m.CompleteProfileWizard }))
);
const AiAssistant = React.lazy(() =>
  import('./components/ai/AiAssistant').then((m) => ({ default: m.AiAssistant }))
);
const StudentRouteView = React.lazy(() =>
  import('./pages/common/StudentRouteView').then((m) => ({ default: m.StudentRouteView }))
);
const MentorViewWrapper = React.lazy(() =>
  import('./pages/common/MentorViewWrapper').then((m) => ({ default: m.MentorViewWrapper }))
);
const AboutUsPage = React.lazy(() =>
  import('./pages/common/AboutUsPage').then((m) => ({ default: m.AboutUsPage }))
);

/** Shared fallback while a code-split portal chunk is being fetched. */
const PortalFallback: React.FC = () => (
  <div className="page-body" aria-busy="true">
    <DashboardSkeleton />
  </div>
);


export const App: React.FC = () => {
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState<string>('overview');
  const [justCompletedProfile, setJustCompletedProfile] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Keep the Principal on a valid read-only tab: the app-wide default `overview`
  // is not part of the Principal's surface, so normalise it to the college
  // dashboard. (PrincipalDashboard also guards this, but doing it here keeps the
  // sidebar highlight and topbar label in sync.)
  useEffect(() => {
    if (user?.role === 'PRINCIPAL' && !currentTab.startsWith('mentoring-')) {
      setCurrentTab('mentoring-dashboard');
    }
  }, [user?.role, currentTab]);

  if (isLoading) {
    return (
      <div className="app-boot" role="status" aria-live="polite">
        <img
          src="/ksrce-logo.png"
          alt="KSRCE Logo"
          style={{ width: '68px', height: '68px', objectFit: 'contain' }}
        />
        <div className="app-boot-spinner" aria-hidden="true" />
        <div className="app-boot-title">K.S.R. COLLEGE OF ENGINEERING</div>
        <div className="app-boot-sub">Initializing Digital Mentor–Mentee Management System…</div>
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
          <Route path="/session-expired" element={<SessionExpiredState onLoginAgain={() => navigate('/login')} />} />
          <Route path="/401" element={<SessionExpiredState onLoginAgain={() => navigate('/login')} />} />
          <Route path="/403" element={<AccessDeniedState onGoDashboard={() => navigate('/login')} />} />
          <Route path="/500" element={<ServerErrorState onRetry={() => window.location.reload()} />} />
          <Route path="/network-error" element={<NetworkErrorState onRetry={() => window.location.reload()} />} />
          <Route path="*" element={<NotFoundPage onGoDashboard={() => navigate('/login')} onGoBack={() => navigate('/login')} />} />
        </Routes>
        <PwaInstallBanner />
      </>
    );
  }

  // Mandatory first-login password change (provisioned accounts such as the
  // Principal). While the flag is set the backend refuses every protected route,
  // so this is a hard gate rather than a cosmetic redirect.
  if (user?.mustChangePassword === true) {
    return (
      <>
        <ChangePasswordPage />
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
          <Suspense fallback={<DashboardSkeleton />}>
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
          </Suspense>
        </main>
        <PwaInstallBanner />
      </div>
    );
  }

  const renderDashboardByRole = () => {
    switch (user?.role) {
      case 'ADMIN':
        return <AdminDashboard currentTab={currentTab} onSelectTab={setCurrentTab} />;
      case 'PRINCIPAL':
        return <PrincipalDashboard currentTab={currentTab} onSelectTab={setCurrentTab} />;
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
        pageLabel={getNavLabel(user?.role, currentTab)}
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
            <Suspense fallback={<DashboardSkeleton />}>
              {renderDashboardByRole()}
            </Suspense>
          </div>
        </main>
      </div>
      <PwaInstallBanner />
    </div>
  );

  return (
    <>
      <Routes>
        <Route path="/" element={MainDashboardLayout} />
      <Route path="/dashboard" element={MainDashboardLayout} />

      {/* Direct routes for student & mentor detail views */}
      <Route
        path="/students/:id"
        element={
          <Suspense fallback={<DashboardSkeleton />}>
            <StudentRouteView />
          </Suspense>
        }
      />
      <Route
        path="/mentor/:id"
        element={
          <Suspense fallback={<DashboardSkeleton />}>
            <MentorViewWrapper />
          </Suspense>
        }
      />

      {/* Institutional / platform information page. Direct route (mirrors the
          detail views above) so any authenticated role can reach it, without
          adding an entry to one role's sidebar. */}
      <Route
        path="/about"
        element={
          <Suspense fallback={<DashboardSkeleton />}>
            <AboutUsPage />
          </Suspense>
        }
      />

      {/* Role-based guards */}
      <Route
        path="/admin/*"
        element={user?.role === 'ADMIN' ? MainDashboardLayout : <AccessDeniedState onGoDashboard={() => navigate('/')} />}
      />
      <Route
        path="/principal/*"
        element={user?.role === 'PRINCIPAL' ? MainDashboardLayout : <AccessDeniedState onGoDashboard={() => navigate('/')} />}
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

      {/* Explicit Error Pages (Section 4) */}
      <Route path="/session-expired" element={<SessionExpiredState onLoginAgain={() => navigate('/login')} />} />
      <Route path="/401" element={<SessionExpiredState onLoginAgain={() => navigate('/login')} />} />
      <Route path="/access-denied" element={<AccessDeniedState onGoDashboard={() => navigate('/')} />} />
      <Route path="/403" element={<AccessDeniedState onGoDashboard={() => navigate('/')} />} />
      <Route path="/server-error" element={<ServerErrorState onRetry={() => window.location.reload()} />} />
      <Route path="/500" element={<ServerErrorState onRetry={() => window.location.reload()} />} />
      <Route path="/network-error" element={<NetworkErrorState onRetry={() => window.location.reload()} />} />

      {/* Catch-all 404 Route (Requirement 14) */}
        <Route path="*" element={<NotFoundPage onGoDashboard={() => navigate('/')} onGoBack={() => navigate(-1)} />} />
      </Routes>
      <Suspense fallback={null}>
        <AiAssistant />
      </Suspense>
    </>
  );
};

export default App;
