import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  GraduationCap,
  UserCheck,
  BookOpen,
  CalendarCheck2,
  FileCheck,
  Trophy,
  BarChart3,
  Bell,
  School,
  ShieldAlert,
} from 'lucide-react';

/**
 * About Us — institutional + platform information.
 *
 * Every institutional fact here is taken VERBATIM from the project's own single
 * source of truth for the institutional header
 * (`backend/src/modules/pdf/institutional-header.ts`), and every capability
 * listed is a real screen in this application. Nothing is invented: there are no
 * fabricated dates, accreditations or figures.
 *
 * It is a standalone route (`/about`) rather than a dashboard tab, mirroring the
 * existing `/students/:id` and `/mentor/:id` direct routes, so it is reachable
 * from anywhere without belonging to one role's navigation.
 */

const INSTITUTION = {
  name: 'K.S.R. COLLEGE OF ENGINEERING',
  affiliation:
    '(An Autonomous Institution, Approved by AICTE, New Delhi & Affiliated to Anna University, Chennai)',
  address: 'K.S.R. Kalvi Nagar, Tiruchengode – 637 215, Namakkal District, Tamil Nadu',
  website: 'www.ksrce.ac.in',
};

const PLATFORM = {
  name: 'Digital Mentor–Mentee Management System',
  product: 'KSRCE Mentoring',
};

const CAPABILITIES: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <UserCheck size={20} />,
    title: 'Mentor–Mentee Management',
    body: 'Assign and reassign mentees to faculty mentors, with one active mentor per student and full assignment history.',
  },
  {
    icon: <BookOpen size={20} />,
    title: '5-Domain Mentoring Records',
    body: 'Capture academic, skill, career, personal and extra-curricular mentoring sessions with evidence.',
  },
  {
    icon: <CalendarCheck2 size={20} />,
    title: 'Saturday Meetings',
    body: 'Track the institutional mentoring-day meetings, attendance and per-student outcomes.',
  },
  {
    icon: <GraduationCap size={20} />,
    title: 'Academic Records & Arrears',
    body: 'Semester-wise internal marks, CGPA/SGPA tracking and active-arrear monitoring from a single calculation rule.',
  },
  {
    icon: <FileCheck size={20} />,
    title: 'Document Verification',
    body: 'Upload, verify and archive student certificates and institutional documents with watermarked copies.',
  },
  {
    icon: <Trophy size={20} />,
    title: 'Achievement Leaderboard',
    body: 'Recognise verified student achievements and participation through a points-based leaderboard.',
  },
  {
    icon: <BarChart3 size={20} />,
    title: 'Institutional Reports',
    body: 'Department, mentor and college-wide reports, plus an official per-student Record Book (PDF).',
  },
  {
    icon: <Bell size={20} />,
    title: 'Notifications & Audit',
    body: 'Role-based notifications, meeting reminders and a complete compliance audit trail.',
  },
];

export const AboutUsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: '1080px', margin: '0 auto' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => navigate('/')}
        style={{ marginBottom: '1.25rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <ChevronLeft size={16} /> Back to Dashboard
      </button>

      {/* Institution hero */}
      <section
        aria-labelledby="about-college-name"
        style={{
          background: 'linear-gradient(135deg, #0d2a4d 0%, #061b36 100%)',
          color: '#fff',
          borderRadius: '16px',
          padding: '2rem 1.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          flexWrap: 'wrap',
          boxShadow: '0 12px 30px rgba(6, 27, 54, 0.28)',
        }}
      >
        <img
          src="/ksrce-logo.png"
          alt="K.S.R. College of Engineering logo"
          style={{
            width: '76px',
            height: '76px',
            objectFit: 'contain',
            background: '#fff',
            borderRadius: '50%',
            padding: '6px',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: '260px' }}>
          <h1 id="about-college-name" style={{ margin: 0, fontSize: 'clamp(1.15rem, 2.4vw, 1.6rem)', letterSpacing: '0.5px' }}>
            {INSTITUTION.name}
          </h1>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.86rem', color: 'rgba(255,255,255,0.86)', lineHeight: 1.5 }}>
            {INSTITUTION.affiliation}
          </p>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.86rem', color: 'rgba(255,255,255,0.78)' }}>
            {INSTITUTION.address}
          </p>
        </div>
      </section>

      {/* Platform */}
      <section
        className="card"
        aria-labelledby="about-platform"
        style={{ marginTop: '1.5rem', padding: '1.5rem', borderTop: '3px solid #F5BD35' }}
      >
        <h2 id="about-platform" style={{ margin: 0, fontSize: '1.15rem', color: 'var(--color-navy-800)' }}>
          {PLATFORM.name}
        </h2>
        <p style={{ margin: '0.6rem 0 0', color: 'var(--color-slate-600)', lineHeight: 1.65, fontSize: '0.92rem' }}>
          {PLATFORM.product} is the institution's mentoring platform for K.S.R. College of
          Engineering. It brings mentor–mentee assignment, mentoring records, academic tracking,
          document verification and institutional reporting into one role-based system for
          Administrators, Heads of Department, Faculty mentors, Students and the Principal.
        </p>
      </section>

      {/* Capabilities */}
      <section aria-labelledby="about-capabilities" style={{ marginTop: '1.5rem' }}>
        <h2
          id="about-capabilities"
          style={{ margin: '0 0 0.9rem', fontSize: '1.05rem', color: 'var(--color-navy-800)' }}
        >
          What the platform provides
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
          }}
        >
          {CAPABILITIES.map((cap) => (
            <div key={cap.title} className="card" style={{ padding: '1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--color-navy-50)',
                    color: 'var(--color-navy-800)',
                    flexShrink: 0,
                  }}
                >
                  {cap.icon}
                </span>
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-navy-800)' }}>{cap.title}</h3>
              </div>
              <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--color-slate-500)', lineHeight: 1.55 }}>
                {cap.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Institution details */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem',
          marginTop: '1.5rem',
        }}
      >
        <section className="card" aria-labelledby="about-contact" style={{ padding: '1.35rem' }}>
          <h2
            id="about-contact"
            style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--color-navy-800)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <School size={18} /> Institution
          </h2>
          <dl style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-slate-600)', lineHeight: 1.7 }}>
            <dt style={{ fontWeight: 700, color: 'var(--color-slate-700)' }}>Address</dt>
            <dd style={{ margin: '0 0 0.6rem' }}>{INSTITUTION.address}</dd>
            <dt style={{ fontWeight: 700, color: 'var(--color-slate-700)' }}>Affiliation</dt>
            <dd style={{ margin: '0 0 0.6rem' }}>{INSTITUTION.affiliation}</dd>
            <dt style={{ fontWeight: 700, color: 'var(--color-slate-700)' }}>Website</dt>
            <dd style={{ margin: 0 }}>
              <a
                href={`https://${INSTITUTION.website}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-navy-700, #1d4ed8)' }}
              >
                {INSTITUTION.website}
              </a>
            </dd>
          </dl>
        </section>

        <section className="card" aria-labelledby="about-about" style={{ padding: '1.35rem' }}>
          <h2
            id="about-about"
            style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--color-navy-800)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <ShieldAlert size={18} /> About this system
          </h2>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', color: 'var(--color-slate-600)', lineHeight: 1.65 }}>
            Records entered in {PLATFORM.product} are institutional mentoring and academic records.
            Access is role-based, sensitive documents are served only through authenticated
            endpoints, and every official record book is generated from the stored data.
          </p>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-slate-500)' }}>
            {PLATFORM.product} · {INSTITUTION.name.split(',')[0]}
          </p>
        </section>
      </div>
    </div>
  );
};
