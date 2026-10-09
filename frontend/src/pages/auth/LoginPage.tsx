import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePwa } from '../../context/PwaContext';
import {
  ShieldCheck,
  ArrowRight,
  Lock,
  Eye,
  EyeOff,
  Download,
  UserRound,
  Users,
  GraduationCap,
  Briefcase,
  BarChart3,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { isInstalled, promptInstall } = usePwa();
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
      setError(err.rawMessage || err.userMessage || err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Institutional brand panel (desktop) */}
      <section className="login-brand" aria-hidden="false">
        <div className="login-crest">
          <img src="/ksrce-logo.png" alt="K.S.R. College of Engineering crest" />
          <div>
            <div className="login-crest-name">K.S.R. COLLEGE OF ENGINEERING</div>
            <div className="login-crest-sub">Autonomous • Tiruchengode</div>
          </div>
        </div>

        <div>
          <h1 className="login-hero-title">
            Digital <span>Mentor–Mentee</span> Management System
          </h1>
          <p className="login-hero-text">
            One secure campus platform for mentoring, counselling, academics, placements and
            achievement records — across every department.
          </p>
          <div className="login-hero-points">
            <div className="login-hero-point">
              <Users size={17} /> Mentor &amp; mentee assignment with full history
            </div>
            <div className="login-hero-point">
              <GraduationCap size={17} /> Academic ledger, internal marks &amp; documents
            </div>
            <div className="login-hero-point">
              <Briefcase size={17} /> Placement monitoring and achievement leaderboard
            </div>
            <div className="login-hero-point">
              <BarChart3 size={17} /> Department and institution-wide analytics
            </div>
          </div>
        </div>

        <div className="login-legal">
          Permanent Academic Records System • Secured Institutional Access
        </div>
      </section>

      {/* Sign-in panel */}
      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-head">
            <img
              src="/ksrce-logo.png"
              alt="K.S.R. College of Engineering"
              className="login-card-logo"
            />
            <h2 className="login-title">Sign in to your portal</h2>
            <p className="login-sub">
              KSRCE Digital Mentor–Mentee Management System
            </p>
          </div>

          {error && (
            <div className="login-alert" role="alert">
              <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="alert alert-info" style={{ marginBottom: '1.25rem', fontSize: 'var(--text-sm)' }}>
            <ShieldCheck size={16} />
            <span style={{ fontWeight: 600 }}>
              Institutional Portal Access • Role-Based Authentication
            </span>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="login-username">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <UserRound size={14} color="#64748B" /> Username or Register Number
                </span>
                <span className="required-star">*</span>
              </label>
              <input
                id="login-username"
                type="text"
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. Ksrce@admin or 731522104001"
                required
                autoComplete="username"
                aria-label="Username or register number"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Lock size={14} color="#64748B" /> Password
                </span>
                <span className="required-star">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  style={{ paddingRight: '2.5rem' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  required
                  autoComplete="current-password"
                  aria-label="Password"
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
                    padding: '4px',
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className={`btn btn-primary btn-block ${loading ? 'btn-loading' : ''}`}
              style={{ marginTop: '0.75rem', fontSize: 'var(--text-md)' }}
              disabled={loading}
            >
              {loading ? 'Authenticating…' : 'Sign In to Portal'} {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          {!isInstalled && (
            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <button
                type="button"
                onClick={promptInstall}
                style={{
                  background: 'linear-gradient(135deg, #0B2545 0%, #133E68 100%)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 215, 0, 0.45)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.55rem 1rem',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(11, 37, 69, 0.15)',
                }}
              >
                <Download size={14} color="#FDE047" /> Download / Install KSRCE Web App
              </button>
            </div>
          )}

          <div className="login-foot">
            Permanent Academic Records System
            <br />
            Secured Institutional Access • K.S.R. College of Engineering
          </div>
        </div>
      </section>
    </div>
  );
};
