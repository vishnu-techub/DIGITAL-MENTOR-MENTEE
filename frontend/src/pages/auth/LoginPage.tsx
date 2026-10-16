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

/**
 * Cinematic K.S.R. College of Engineering campus-at-twilight photograph
 * (building + entrance under a sunset). It lives in this app's own public
 * folder and is applied as the hero's CSS background from `styles/index.css`
 * via the public URL `/assets/ksrce-campus-twilight.png` — never as an
 * absolute local file path. See `.lg-brand` for the cover/position rules.
 */

/** Public-facing capability highlights shown on the branding panel. */
const FEATURE_HIGHLIGHTS: Array<{
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  description: string;
}> = [
  {
    icon: Users,
    title: 'Mentor & Mentee Management',
    description: 'Build stronger academic relationships.',
  },
  {
    icon: GraduationCap,
    title: 'Academic Records & Analytics',
    description: 'Track progress and performance.',
  },
  {
    icon: Briefcase,
    title: 'Placement Monitoring & Achievements',
    description: 'Capture opportunities and success.',
  },
  {
    icon: BarChart3,
    title: 'Department & Institution Insights',
    description: 'Department-wise mentoring overview.',
  },
];

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
    <div className="lg-page">
      {/* ---------------------------------------------------------------
          Left (desktop) / top banner (mobile): cinematic campus hero.
          The campus-at-twilight photograph is applied as a `cover` CSS
          background on `.lg-brand`; the veil supplies the navy scrim so the
          copy stays readable while the sunset remains visible.
          --------------------------------------------------------------- */}
      <section
        className="lg-brand"
        aria-label="K.S.R. College of Engineering campus at twilight"
      >
        <span className="lg-brand-veil" aria-hidden="true" />
        <span className="lg-brand-grid" aria-hidden="true" />

        {/* One shared content container: the crest, hero copy, feature list and
            bottom tagline all inherit this single left edge and spacing rhythm
            (see `.lg-brand-inner`), so every block lines up column-perfect. */}
        <div className="lg-brand-inner">
          <header className="lg-crest">
            <span className="lg-crest-badge">
              <img src="/ksrce-logo.png" alt="K.S.R. College of Engineering crest" />
            </span>
            <span className="lg-crest-text">
              <span className="lg-crest-name">K.S.R. COLLEGE OF ENGINEERING</span>
              <span className="lg-crest-sub">Autonomous • Tiruchengode</span>
            </span>
          </header>

          <div className="lg-brand-body">
            <h1 className="lg-hero-title lg-hero-title-v2">
              <span className="lg-hero-line">WELCOME TO</span>
              <span className="lg-hero-line">DIGITAL</span>
              <span className="lg-hero-line lg-hero-accent">MENTOR–MENTEE</span>
              <span className="lg-hero-line">MANAGEMENT SYSTEM</span>
            </h1>
            <p className="lg-hero-text">
              One secure campus platform for mentoring, counselling, academics,
              placements and achievement records — across every department.
            </p>

            <ul className="lg-features">
              {FEATURE_HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
                <li className="lg-feature" key={title}>
                  <span className="lg-feature-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="lg-feature-text">
                    <span className="lg-feature-title">{title}</span>
                    <span className="lg-feature-desc">{description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <footer className="lg-brand-foot">
            <span className="lg-brand-foot-rule" aria-hidden="true" />
            <span className="lg-brand-foot-text">Empowering Future Engineers</span>
          </footer>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Right (desktop) / below (mobile): sign-in card
          --------------------------------------------------------------- */}
      <section className="lg-panel">
        <div className="lg-card">
          <div className="lg-card-head">
            <span className="lg-card-logo-badge">
              <img
                src="/ksrce-logo.png"
                alt="K.S.R. College of Engineering"
                className="lg-card-logo"
              />
            </span>
            <span className="lg-card-college">K.S.R. COLLEGE OF ENGINEERING</span>
            <span className="lg-card-system">Digital Mentor–Mentee Management System</span>
            <span className="lg-card-divider" aria-hidden="true" />
            <h2 className="lg-title">WELCOME BACK</h2>
            <p className="lg-sub">Sign in to your secured campus portal.</p>
          </div>

          {error && (
            <div className="lg-alert" role="alert">
              <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="login-username">
                <span className="lg-label-inner">
                  <UserRound size={14} /> Username or Register Number
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
                <span className="lg-label-inner">
                  <Lock size={14} /> Password
                </span>
                <span className="required-star">*</span>
              </label>
              <div className="lg-password-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
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
                  className="lg-password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className={`btn btn-primary btn-block lg-submit ${loading ? 'btn-loading' : ''}`}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? 'Authenticating…' : 'Sign In to Portal'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          {!isInstalled && (
            <>
              <div className="lg-or-sep" aria-hidden="true">
                <span className="lg-or-line" />
                <span className="lg-or-text">OR</span>
                <span className="lg-or-line" />
              </div>
              <div className="lg-pwa-row">
                <button type="button" onClick={promptInstall} className="lg-pwa-btn">
                  <Download size={15} /> Download / Install KSRCE Web App
                </button>
              </div>
            </>
          )}

          <div className="lg-foot">
            Permanent Academic Records System
            <br />
            Secured Institutional Access • K.S.R. College of Engineering
          </div>
        </div>
      </section>
    </div>
  );
};
