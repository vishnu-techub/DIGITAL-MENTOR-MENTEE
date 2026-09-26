import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { Bell, User, LogOut, CheckCheck, Calendar, Shield } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, triggerSaturdayReminders } = useNotifications();
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>



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
