import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePwa } from '../../context/PwaContext';
import { Bell, LogOut, CheckCheck, Menu, X, Download, CheckCircle2, ChevronDown, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  /** Human label of the section currently open, shown as topbar context. */
  pageLabel?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, isSidebarOpen, pageLabel }) => {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const { isInstalled, promptInstall } = usePwa();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setShowNotifications(false);
      if (profileRef.current && !profileRef.current.contains(target)) setShowProfile(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
        setShowProfile(false);
      }
    };
    if (showNotifications || showProfile) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showNotifications, showProfile]);

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'ADMIN': return 'Administrator';
      case 'HOD': return 'Head of Department';
      case 'FACULTY': return 'Faculty Mentor';
      case 'STUDENT': return 'Student';
      default: return role || 'User';
    }
  };

  const displayName = user?.fullName?.includes('Balasubramanian')
    ? 'System admin'
    : user?.fullName || 'System admin';

  const initials = (user?.fullName || 'User')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  const roleLine = user?.role === 'ADMIN'
    ? 'ADMIN • KSRCE'
    : `${user?.role || 'USER'}${user?.dept_code ? ` • ${user.dept_code}` : ''}`;

  return (
    <header className="ksrce-header">
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="btn-hamburger"
            aria-label={isSidebarOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
            aria-expanded={isSidebarOpen}
            aria-controls="primary-sidebar"
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
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
            <h1>K.S.R. COLLEGE OF ENGINEERING</h1>
            <p>DIGITAL MENTOR–MENTEE MANAGEMENT SYSTEM</p>
          </div>
          <div className="mobile-brand-text mobile-only">
            <h1>KSRCE Mentoring</h1>
            <p>Digital Portal</p>
          </div>
        </div>

        {pageLabel && (
          <div className="topbar-context desktop-only">
            <span className="topbar-context-label">{pageLabel}</span>
            <span className="topbar-context-role">{getRoleLabel(user?.role)}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {/* PWA Download / Install App */}
        {!isInstalled ? (
          <button
            type="button"
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
            className="badge-app-installed desktop-only"
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

        {/* Notifications */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={() => setShowNotifications((v) => !v)}
            aria-label={`Institutional notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ', none unread'}`}
            aria-expanded={showNotifications}
            aria-haspopup="true"
            title="Institutional Notifications"
          >
            <Bell size={20} />
            {unreadCount > 0 && <span className="topbar-unread">{unreadCount}</span>}
          </button>

          {showNotifications && (
            <div
              className="notification-dropdown"
              role="dialog"
              aria-label="Institutional notifications"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 0.55rem)',
                width: '360px',
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
              <div className="notif-head">
                <span className="notif-title">Notifications ({unreadCount} unread)</span>
                {unreadCount > 0 && (
                  <button type="button" className="notif-mark-all" onClick={() => markAsRead('all')}>
                    <CheckCheck size={14} /> Mark all read
                  </button>
                )}
              </div>

              <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div className="notif-empty">You are all caught up — no notifications right now.</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => markAsRead(n.id)}
                      className={`notif-item ${n.is_read ? '' : 'unread'}`}
                    >
                      <div className="notif-item-title">
                        {n.title}
                        {!n.is_read && <span className="sr-only"> (unread)</span>}
                      </div>
                      <div className="notif-item-msg">{n.message}</div>
                      <div className="notif-item-time">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User chip + profile menu (desktop) */}
        <div ref={profileRef} className="desktop-only" style={{ position: 'relative' }}>
          <button
            type="button"
            className="topbar-user"
            onClick={() => setShowProfile((v) => !v)}
            aria-expanded={showProfile}
            aria-haspopup="true"
            aria-label="Open account menu"
            title="Account menu"
          >
            <span className="topbar-user-avatar" aria-hidden="true">{initials}</span>
            <span className="topbar-user-name">{displayName}</span>
            <ChevronDown size={15} style={{ opacity: 0.85 }} aria-hidden="true" />
          </button>

          {showProfile && (
            <div className="profile-menu" role="menu" aria-label="Account menu">
              <div className="profile-menu-head">
                <div className="profile-menu-name">{displayName}</div>
                <div className="profile-menu-meta">
                  {getRoleLabel(user?.role)}
                  {user?.role !== 'ADMIN' && user?.dept_code ? ` • ${user.dept_code}` : ''}
                </div>
              </div>
              <div
                className="profile-menu-item"
                style={{ cursor: 'default', color: 'var(--slate-500)', fontWeight: 500 }}
                role="presentation"
              >
                <ShieldCheck size={16} /> Session active
              </div>
              <button type="button" className="profile-menu-item" role="menuitem" onClick={logout}>
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
