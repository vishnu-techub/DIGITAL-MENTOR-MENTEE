import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePwa } from '../../context/PwaContext';
import { Bell, User, LogOut, CheckCheck, Calendar, Shield, Menu, X, Download, CheckCircle2 } from 'lucide-react';

interface NavbarProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, isSidebarOpen }) => {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, triggerSaturdayReminders } = useNotifications();
  const { isInstalled, promptInstall } = usePwa();
  const [showNotifications, setShowNotifications] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowNotifications(false);
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showNotifications]);

  const handleTrigger = async (type: string) => {
    setIsTriggering(true);
    await triggerSaturdayReminders(type);
    setIsTriggering(false);
  };

  const getRoleBadgeClass = (role?: string) => {
    switch (role) {
      case 'ADMIN': return 'badge-danger';
      case 'HOD': return 'badge-warning';
      case 'FACULTY': return 'badge-primary';
      case 'STUDENT': return 'badge-success';
      default: return 'badge-info';
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'ADMIN': return 'Administrator';
      case 'HOD': return 'Head of Department';
      case 'FACULTY': return 'Faculty Mentor';
      case 'STUDENT': return 'Student';
      default: return role || 'User';
    }
  };

  return (
    <header className="ksrce-header">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="btn-hamburger"
            aria-label={isSidebarOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
            aria-expanded={isSidebarOpen}
            aria-controls="primary-sidebar"
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.45rem',
              color: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginRight: 'var(--space-3)',
              minHeight: 'var(--touch-target)',
              minWidth: 'var(--touch-target)',
            }}
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}

        <div className="ksrce-brand">
          <img
            src="/ksrce-logo.png"
            alt="K.S.R. College of Engineering official logo"
            className="ksrce-logo-img"
          />
          <div className="ksrce-brand-text desktop-only">
            <h1>K.S.R. COLLEGE OF ENGINEERING (Autonomous)</h1>
            <p>DIGITAL MENTOR–MENTEE MANAGEMENT SYSTEM • TIRUCHENGODE</p>
          </div>
          <div className="mobile-brand-text mobile-only">
            <h1>KSRCE Mentoring</h1>
            <p>Digital Portal</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        {/* PWA Download / Install App Button or Installed Badge */}
        {!isInstalled ? (
          <button
            onClick={promptInstall}
            className="btn-download-app desktop-only"
            style={{
              background: 'var(--gold-500)',
              color: 'var(--primary-900)',
              border: '1px solid var(--gold-600)',
              borderRadius: 'var(--radius-md)',
              padding: '0.42rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontWeight: 700,
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              transition: 'all var(--motion-fast) var(--ease-standard)',
            }}
            title="Download & Install KSRCE Web App"
          >
            <Download size={15} />
            <span className="download-app-text">Download App</span>
          </button>
        ) : (
          <span
            className="badge-app-installed"
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.18)',
              color: '#6EE7B7',
              border: '1px solid rgba(110, 231, 183, 0.4)',
              borderRadius: 'var(--radius-md)',
              padding: '0.38rem 0.65rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
            }}
            title="KSRCE Mentoring App is installed"
          >
            <CheckCircle2 size={14} />
            <span className="download-app-text">App Installed</span>
          </span>
        )}

        {/* Notifications Bell */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label={`Institutional notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ', none unread'}`}
            aria-expanded={showNotifications}
            aria-haspopup="true"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              position: 'relative',
              cursor: 'pointer',
              minHeight: 'var(--touch-target)',
              minWidth: 'var(--touch-target)',
              justifyContent: 'center',
              transition: 'background var(--motion-fast) var(--ease-standard)',
            }}
            title="Institutional Notifications"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: '#EF4444',
                  color: '#ffffff',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  borderRadius: '9999px',
                  padding: '1px 5px',
                  border: '2px solid #0B2545',
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div
              className="notification-dropdown"
              role="dialog"
              aria-label="Institutional notifications"
              style={{
                position: 'absolute',
                right: 0,
                top: '46px',
                width: '340px',
                maxWidth: 'calc(100vw - 24px)',
                backgroundColor: '#ffffff',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xl)',
                border: '1px solid var(--slate-200)',
                zIndex: 'var(--z-drawer)',
                color: 'var(--slate-800)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#F8FAFC',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0B2545' }}>
                  Notifications ({unreadCount} unread)
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAsRead('all')}
                    style={{
                      background: 'transparent',
                      color: 'var(--primary-600)',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      cursor: 'pointer',
                      padding: '0.25rem 0.4rem',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <CheckCheck size={14} /> Mark all read
                  </button>
                )}
              </div>

              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div
                    style={{
                      padding: '1.75rem 1.5rem',
                      textAlign: 'center',
                      color: 'var(--slate-500)',
                      fontSize: 'var(--text-base)',
                    }}
                  >
                    No new notifications.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => markAsRead(n.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid var(--slate-100)',
                        borderLeft: n.is_read ? '3px solid transparent' : '3px solid var(--gold-500)',
                        backgroundColor: n.is_read ? '#ffffff' : 'var(--primary-50)',
                        cursor: 'pointer',
                        transition: 'background var(--motion-fast) var(--ease-standard)',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: n.is_read ? 500 : 700,
                          fontSize: 'var(--text-sm)',
                          color: 'var(--slate-900)',
                          marginBottom: '2px',
                        }}
                      >
                        {n.title}
                        {!n.is_read && <span className="sr-only"> (unread)</span>}
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--slate-600)', lineHeight: 1.45 }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--slate-400)', marginTop: '4px' }}>
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Info - Desktop Only */}
        <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: '#ffffff' }}>
              {user?.fullName?.includes('Balasubramanian') ? 'System admin' : (user?.fullName || 'System admin')}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '2px' }}>
              <span className={`badge ${getRoleBadgeClass(user?.role)}`} style={{ fontSize: 'var(--text-xs)', padding: '0.1rem 0.45rem' }}>
                {getRoleLabel(user?.role)}
              </span>
              {user?.dept_code && (
                <span className="badge badge-info" style={{ fontSize: 'var(--text-xs)', padding: '0.1rem 0.45rem' }}>
                  {user.dept_code}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="btn btn-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              padding: '0.45rem 0.75rem',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.24)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; }}
            title="Sign out of institutional portal"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>
    </header>
  );
};
