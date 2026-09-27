import React, { useState } from 'react';
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

  return (
    <header className="ksrce-header">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="btn-hamburger"
            aria-label="Toggle Navigation Drawer"
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              borderRadius: '8px',
              padding: '0.45rem',
              color: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginRight: '0.75rem',
            }}
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}

        <div className="ksrce-brand">
          <img
            src="/ksrce-logo.png"
            alt="K.S.R. College of Engineering"
            className="ksrce-logo-img"
          />
          <div className="ksrce-brand-text">
            <h1>K.S.R. COLLEGE OF ENGINEERING (Autonomous)</h1>
            <p>DIGITAL MENTOR–MENTEE MANAGEMENT SYSTEM • TIRUCHENGODE</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        {/* PWA Download / Install App Button or Installed Badge */}
        {!isInstalled ? (
          <button
            onClick={promptInstall}
            className="btn-download-app"
            style={{
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.42rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(217, 119, 6, 0.35)',
              transition: 'all 0.15s ease',
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
              color: '#34D399',
              border: '1px solid rgba(52, 211, 153, 0.4)',
              borderRadius: '8px',
              padding: '0.38rem 0.65rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.74rem',
              fontWeight: 700,
            }}
            title="KSRCE Mentoring App is installed"
          >
            <CheckCircle2 size={14} />
            <span className="download-app-text">App Installed</span>
          </span>
        )}

        {/* Notifications Bell */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              position: 'relative',
              cursor: 'pointer',
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
              style={{
                position: 'absolute',
                right: 0,
                top: '42px',
                width: '340px',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                border: '1px solid #E2E8F0',
                zIndex: 100,
                color: '#1E293B',
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
                    onClick={() => markAsRead('all')}
                    style={{
                      background: 'transparent',
                      color: '#1D4ED8',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <CheckCheck size={14} /> Mark all read
                  </button>
                )}
              </div>

              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                    No new notifications.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => markAsRead(n.id)}
                      style={{
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: n.is_read ? '#ffffff' : '#EFF6FF',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#0F172A', marginBottom: '2px' }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '4px' }}>
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>
              {user?.fullName}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '2px' }}>
              <span className={`badge ${getRoleBadgeClass(user?.role)}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                {user?.role}
              </span>
              {user?.dept_code && (
                <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                  {user.dept_code}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={logout}
            className="btn btn-secondary btn-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              border: 'none',
              padding: '0.45rem 0.75rem',
            }}
            title="Sign out of institutional portal"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>
    </header>
  );
};
