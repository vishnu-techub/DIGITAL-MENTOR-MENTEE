import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, User, ArrowRight, Lock, Eye, EyeOff } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ username, password });
    } catch (err: any) {
      setError(err.message || 'Invalid institutional credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #071526 0%, #0B2545 50%, #13315C 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: '460px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        {/* Institutional Crest Header */}
        <div
          style={{
            backgroundColor: '#0B2545',
            padding: '2.25rem 1.5rem 1.75rem',
            textAlign: 'center',
            color: '#ffffff',
            borderBottom: '4px solid #C59B27',
          }}
        >
          <img
            src="/ksrce-logo.png"
            alt="K.S.R. College of Engineering"
            style={{
              width: '84px',
              height: '84px',
              objectFit: 'contain',
              backgroundColor: '#ffffff',
              borderRadius: '50%',
              margin: '0 auto 0.85rem',
              display: 'block',
              border: '3px solid #C59B27',
              padding: '4px',
              boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
            }}
          />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.3px', margin: 0 }}>
            K.S.R. COLLEGE OF ENGINEERING
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#D4AF37', fontWeight: 600, marginTop: '4px' }}>
            Autonomous • Affiliated to Anna University • Tiruchengode
          </p>
          <div
            style={{
              display: 'inline-block',
              marginTop: '10px',
              padding: '4px 14px',
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.6px',
            }}
          >
            DIGITAL MENTOR–MENTEE PORTAL
          </div>
        </div>

        <div style={{ padding: '2rem' }}>
          {error && (
            <div
              style={{
                backgroundColor: '#FEE2E2',
                color: '#DC2626',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '1.25rem',
                border: '1px solid #FCA5A5',
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.65rem 0.85rem',
              backgroundColor: '#EFF6FF',
              borderRadius: '8px',
              border: '1px solid #BFDBFE',
              marginBottom: '1.25rem',
            }}
          >
            <Shield size={16} color="#1D4ED8" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1E40AF' }}>
              Institutional Portal Access • Role-Based Authentication
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <User size={14} color="#64748B" /> Username or Register Number
                </span>
                <span className="required-star">*</span>
              </label>
              <input
                type="text"
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. Ksrce@admin or 731522104001"
                required
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Lock size={14} color="#64748B" /> Password
                </span>
                <span className="required-star">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  style={{ paddingRight: '2.5rem' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem', fontSize: '0.9rem' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In to Portal'} <ArrowRight size={16} />
            </button>
          </form>

          <div style={{ marginTop: '1.75rem', textAlign: 'center', fontSize: '0.75rem', color: '#94A3B8' }}>
            Permanent Academic Records System • Secured Institutional Access
          </div>
        </div>
      </div>
    </div>
  );
};
