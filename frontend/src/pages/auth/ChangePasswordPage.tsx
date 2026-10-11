import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowRight, Lock, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';

/**
 * First-login password change.
 *
 * Rendered by the App gate whenever the signed-in user carries
 * `mustChangePassword`. It is deliberately the ONLY screen a flagged account
 * can reach: every other protected route is refused server-side, so this is not
 * a cosmetic redirect. On success the backend returns a fresh token whose flag
 * is cleared and the App gate lifts.
 */
export const ChangePasswordPage: React.FC = () => {
  const { changePassword, user, logout } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate before the round-trip so the user gets instant, specific feedback.
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in the current password and the new password twice.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current password.');
      return;
    }

    setLoading(true);
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword });
      // The user state now has mustChangePassword=false; return to the portal.
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.rawMessage || err?.userMessage || err?.message || 'Could not update your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const passwordField = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    show: boolean,
    toggle: () => void,
    autoComplete: string
  ) => (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Lock size={14} color="#64748B" /> {label}
        </span>
        <span className="required-star">*</span>
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className="form-control"
          style={{ paddingRight: '3rem' }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          required
          autoComplete={autoComplete}
          aria-label={label}
        />
        <button
          type="button"
          onClick={toggle}
          className="login-password-toggle"
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-head">
            <img
              src="/ksrce-logo.png"
              alt="K.S.R. College of Engineering"
              className="login-card-logo"
            />
            <h2 className="login-title">Set a new password</h2>
            <p className="login-sub">
              {user?.role === 'PRINCIPAL'
                ? 'For your security, the Principal account must replace its initial password before continuing.'
                : 'For your security, you must set a new password before continuing.'}
            </p>
          </div>

          {error && (
            <div className="login-alert" role="alert">
              <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {passwordField(
              'cp-current',
              'Current password',
              currentPassword,
              setCurrentPassword,
              showCurrent,
              () => setShowCurrent((v) => !v),
              'current-password'
            )}
            {passwordField(
              'cp-new',
              'New password',
              newPassword,
              setNewPassword,
              showNew,
              () => setShowNew((v) => !v),
              'new-password'
            )}
            {passwordField(
              'cp-confirm',
              'Confirm new password',
              confirmPassword,
              setConfirmPassword,
              showConfirm,
              () => setShowConfirm((v) => !v),
              'new-password'
            )}

            <p
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                color: '#64748B',
                marginTop: '-0.35rem',
                marginBottom: '1rem',
              }}
            >
              <KeyRound size={14} /> At least 6 characters. Choose something you have not used before.
            </p>

            <button
              type="submit"
              className={`btn btn-primary btn-block ${loading ? 'btn-loading' : ''}`}
              disabled={loading}
            >
              {loading ? 'Updating password…' : 'Update password'} {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="login-foot" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="login-pwa-btn"
              onClick={logout}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
            >
              Sign in with a different account
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
