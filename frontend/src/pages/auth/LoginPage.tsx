import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, KeyRound, User, School, ArrowRight, Lock } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
          maxWidth: '480px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        {/* Institutional Crest Header */}
        <div
          style={{
            backgroundColor: '#0B2545',
            padding: '2rem 1.5rem 1.5rem',
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
              padding: '3px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.5px',
            }}
          >
            DIGITAL MENTOR–MENTEE PORTAL
          </div>
        </div>

        <div style={{ padding: '2rem 2rem 2.25rem' }}>

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
              backgroundColor: '#eff6ff',
              borderRadius: '8px',
              border: '1px solid #bfdbfe',
              marginBottom: '1.25rem',
            }}
          >
            <Shield size={16} color="#1d4ed8" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e40af' }}>
              Institutional Portal Access • Secured by Bcrypt & Role-Based Access Control
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <User size={14} /> Institutional Username / Register Number
              </label>
              <input
                type="text"
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin or 731522104001"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Lock size={14} /> Password
              </label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter account password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In to Portal'} <ArrowRight size={16} />
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.75rem', color: '#94A3B8' }}>
            Permanent Academic Records System • Secured Institutional Access
          </div>
        </div>
      </div>
    </div>
  );
};
