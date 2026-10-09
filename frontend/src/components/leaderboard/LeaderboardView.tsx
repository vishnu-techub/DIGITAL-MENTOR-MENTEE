import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Building2,
  Crown,
  GraduationCap,
  Info,
  Medal,
  Sparkles,
  Target,
  Trophy,
  University,
  Users,
} from 'lucide-react';
import { api, type LeaderboardEntry, type LeaderboardResponse } from '../../api/client';
import { EmptyState } from '../common/EmptyState';
import { Skeleton } from '../common/Skeleton';

/**
 * Shared, read-only achievement leaderboard (presentation layer only).
 *
 * Renders exactly what `GET /api/leaderboard` returns: the scope label, the
 * caller's own rank (students), the deterministic point ranking, the
 * per-category point totals and the server definitions. Ranking, points,
 * tie-breaking, scope and authorization are computed server-side and shown
 * verbatim - this component never scores, filters or reorders anything.
 *
 * No query parameters exist for this endpoint, so no filter controls are
 * offered: the scope chip in the hero reflects the server-resolved scope.
 */

type ScopeKey = LeaderboardResponse['scope'];

const SCOPE_ICON: Record<ScopeKey, React.ReactNode> = {
  COLLEGE: <University size={14} aria-hidden="true" />,
  DEPARTMENT: <Building2 size={14} aria-hidden="true" />,
  MENTEES: <GraduationCap size={14} aria-hidden="true" />,
};

const PODIUM_TITLE: Record<ScopeKey, string> = {
  COLLEGE: 'Top performers',
  DEPARTMENT: 'Department top performers',
  MENTEES: 'Mentee top performers',
};

const MEDAL_COLOR = ['var(--gold-600)', 'var(--slate-500)', '#B45309'];

const ordinal = (rank: number) => {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `${rank}th`;
};

const initialsOf = (name: string, fallback: string) => {
  const src = (name || fallback || '').trim();
  if (!src) return '?';
  const parts = src.split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts.length > 1 ? parts[1]?.charAt(0) ?? '' : '';
  return (first + second).toUpperCase() || '?';
};

interface LevelStyle {
  label: string;
  className: string;
}

/**
 * Presentational status only - derived from the server's rank and verified
 * points. It never feeds back into scoring, ordering or the API.
 */
const levelFor = (entry: LeaderboardEntry): LevelStyle => {
  if (entry.totalPoints <= 0) return { label: 'No verified points yet', className: 'lb-level--muted' };
  if (entry.rank === 1) return { label: 'Gold - Rank 1', className: 'lb-level--gold' };
  if (entry.rank === 2) return { label: 'Silver - Rank 2', className: 'lb-level--silver' };
  if (entry.rank === 3) return { label: 'Bronze - Rank 3', className: 'lb-level--bronze' };
  return { label: 'Verified achiever', className: 'lb-level--scored' };
};

const rankFill = (entry: LeaderboardEntry) => {
  if (entry.rank === 1 && entry.totalPoints > 0) return 'var(--gold-500)';
  if (entry.rank === 2 && entry.totalPoints > 0) return 'var(--slate-400)';
  if (entry.rank === 3 && entry.totalPoints > 0) return '#D97706';
  return 'var(--primary-600)';
};

const rankIcon = (rank: number, size = 14) => {
  if (rank === 1) return <Crown size={size} color="var(--gold-700)" aria-hidden="true" />;
  if (rank === 2) return <Medal size={size} color="var(--slate-500)" aria-hidden="true" />;
  if (rank === 3) return <Medal size={size} color="#B45309" aria-hidden="true" />;
  return null;
};

/* ------------------------------------------------------------------ loading */

const LeaderboardSkeleton: React.FC = () => (
  <div style={{ display: 'grid', gap: '1.25rem' }} aria-hidden="true">
    <Skeleton height="132px" borderRadius="14px" />
    <div className="lb-stat-grid" style={{ marginBottom: 0 }}>
      <Skeleton height="92px" borderRadius="14px" />
      <Skeleton height="92px" borderRadius="14px" />
      <Skeleton height="92px" borderRadius="14px" />
      <Skeleton height="92px" borderRadius="14px" />
    </div>
    <div className="lb-podium" style={{ marginBottom: 0 }}>
      <Skeleton height="236px" borderRadius="14px" />
      <Skeleton height="264px" borderRadius="14px" />
      <Skeleton height="236px" borderRadius="14px" />
    </div>
    <div className="card" style={{ padding: '1.25rem' }}>
      <Skeleton variant="table" rows={6} />
    </div>
  </div>
);

/* ---------------------------------------------------------------- component */

export const LeaderboardView: React.FC<{
  onViewStudent?: (studentId: string) => void;
  highlightStudentId?: string | null;
}> = ({ onViewStudent, highlightStudentId = null }) => {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setRetrying(true);
    try {
      const res = await api.leaderboard.get();
      setData(res.data ?? (res as any));
    } catch (e: any) {
      setError(e?.message || 'Unable to load the leaderboard.');
    } finally {
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="card" role="alert">
        <div className="card-body" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={20} color="var(--danger-600)" aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <p style={{ color: 'var(--danger-600)', fontWeight: 700, margin: '0 0 0.75rem' }}>
              {error}
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void load()}
              disabled={retrying}
            >
              {retrying ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <LeaderboardSkeleton />;

  /* ---------------------------------------------------- derived presentation */

  const entries: LeaderboardEntry[] = data.entries ?? [];
  const totalPointsAwarded = entries.reduce((sum, e) => sum + (Number(e.totalPoints) || 0), 0);
  const scorers = entries.filter((e) => e.totalPoints > 0);
  const podium = scorers.slice(0, 3);
  const leaderPoints = podium[0]?.totalPoints ?? 0;
  const maxPoints = Math.max(1, leaderPoints);
  const hasStudents = entries.length > 0;
  const hasVerifiedPoints = data.verifiedAchievements > 0;
  const serverScopeNote: string | undefined = (data as any)?.definitions?.scope;

  // Distinct batch names present in the scope (server data, display only).
  const batches: string[] = [];
  for (const e of entries) {
    const b = (e.batchName || '').trim();
    if (b && !batches.includes(b)) batches.push(b);
    if (batches.length >= 8) break;
  }

  // Verified points per achievement category, summed across the scope rows.
  const catIndex = new Map<string, { category: string; points: number; count: number }>();
  for (const e of entries) {
    for (const [cat, pts] of Object.entries(e.categoryPoints ?? {})) {
      let row = catIndex.get(cat);
      if (!row) {
        row = { category: cat, points: 0, count: 0 };
        catIndex.set(cat, row);
      }
      row.points += Number(pts) || 0;
      row.count += Number(e.categoryCounts?.[cat]) || 0;
    }
  }
  const categoryTotals = [...catIndex.values()]
    .filter((c) => c.points > 0 || c.count > 0)
    .sort((a, b) => b.points - a.points || b.count - a.count || a.category.localeCompare(b.category));
  const maxCategoryPoints = Math.max(1, ...categoryTotals.map((c) => c.points));

  const meEntry = data.me ? entries.find((e) => e.studentId === data.me!.studentId) ?? null : null;

  const nameNode = (entry: LeaderboardEntry, className: string) => {
    const label = entry.fullName || entry.registerNumber;
    if (!onViewStudent) return <span className={className}>{label}</span>;
    return (
      <button
        type="button"
        className={`${className} lb-name-btn`}
        onClick={() => onViewStudent(entry.studentId)}
        aria-label={`View ${label}`}
      >
        {label}
      </button>
    );
  };

  const scrollToSelf = () => {
    const node = document.getElementById('lb-self-row');
    if (!node) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    node.focus({ preventScroll: true });
  };

  const showSelfJump =
    data.me?.rank != null && data.me.rank > 10 && entries.some((e) => e.studentId === data.me!.studentId);

  /* ------------------------------------------------------------------ view */

  return (
    <div className="lb-root">
      {/* ---------------------------------------------------------- hero */}
      <section className="lb-hero" aria-labelledby="lb-hero-title">
        <div className="lb-hero-main">
          <div className="lb-hero-icon" aria-hidden="true">
            <Trophy size={26} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 id="lb-hero-title" className="lb-hero-title">
              Achievement Leaderboard
            </h2>
            <p className="lb-hero-sub">
              Recognizing outstanding achievements across KSR College of Engineering
            </p>
            <div className="lb-hero-chips">
              <span className="badge badge-primary lb-chip">
                {SCOPE_ICON[data.scope]}
                {data.scopeLabel}
              </span>
              <span className="badge badge-neutral lb-chip">
                <Users size={14} aria-hidden="true" />
                {data.totalStudents} {data.totalStudents === 1 ? 'student' : 'students'} in scope
              </span>
              {batches.slice(0, 4).map((b) => (
                <span key={b} className="badge badge-neutral lb-chip">
                  {b}
                </span>
              ))}
              {batches.length > 4 && (
                <span className="badge badge-neutral lb-chip">+{batches.length - 4} more batches</span>
              )}
            </div>
          </div>
        </div>
        <p className="lb-hero-note">
          <Info size={15} aria-hidden="true" />
          <span>
            {serverScopeNote ??
              'Everyone active in scope is ranked, 0-point students included. Score = sum of server-verified (Approved) achievement points.'}
          </span>
        </p>
      </section>

      {/* --------------------------------------------------- summary cards */}
      <div className="lb-stat-grid">
        <div className="lb-stat-card" style={{ '--lb-accent': 'var(--primary-600)' } as React.CSSProperties}>
          <span className="lb-stat-icon" aria-hidden="true">
            <Users size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="lb-stat-value">{data.totalStudents}</div>
            <div className="lb-stat-label">Total students</div>
            <div className="lb-stat-foot">{data.scopeLabel} scope</div>
          </div>
        </div>

        <div className="lb-stat-card" style={{ '--lb-accent': 'var(--success-600)' } as React.CSSProperties}>
          <span className="lb-stat-icon" aria-hidden="true">
            <Award size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="lb-stat-value">{data.verifiedAchievements}</div>
            <div className="lb-stat-label">Verified achievements</div>
            <div className="lb-stat-foot">Approved rows only</div>
          </div>
        </div>

        <div className="lb-stat-card" style={{ '--lb-accent': 'var(--gold-600)' } as React.CSSProperties}>
          <span className="lb-stat-icon" aria-hidden="true">
            <Target size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="lb-stat-value">{totalPointsAwarded}</div>
            <div className="lb-stat-label">Total points awarded</div>
            <div className="lb-stat-foot">
              {scorers.length} {scorers.length === 1 ? 'scorer' : 'scorers'} on the board
            </div>
          </div>
        </div>

        <div className="lb-stat-card" style={{ '--lb-accent': 'var(--gold-700)' } as React.CSSProperties}>
          <span className="lb-stat-icon" aria-hidden="true">
            <Crown size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="lb-stat-value lb-stat-value--name">
              {podium[0] ? podium[0].fullName || podium[0].registerNumber : '-'}
            </div>
            <div className="lb-stat-label">Top performer</div>
            <div className="lb-stat-foot">
              {podium[0]
                ? `${podium[0].totalPoints} pts - ${podium[0].departmentName || 'department n/a'}`
                : 'Awaiting verified points'}
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- current user */}
      {data.me && (
        <section className="card lb-me-card" aria-label="Your leaderboard position">
          <div className="lb-me">
            <div className="lb-me-id">
              <div className="lb-rank-circle" aria-hidden="true">
                {data.me.rank ?? '-'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="lb-me-kicker">Your position</div>
                <div className="lb-me-name">
                  {meEntry?.fullName || data.me.registerNumber}
                </div>
                <div className="lb-me-reg">
                  {data.me.registerNumber}
                  {meEntry?.departmentName ? ` - ${meEntry.departmentName}` : ''}
                </div>
              </div>
            </div>

            <div className="lb-me-stats">
              <div className="lb-me-stat">
                <span className="lb-me-stat-label">Your Rank</span>
                <span className="lb-me-stat-value">
                  {data.me.rank ?? '-'}
                  <span className="lb-me-stat-sub"> of {data.totalStudents}</span>
                </span>
              </div>
              <div className="lb-me-stat">
                <span className="lb-me-stat-label">Your Points</span>
                <span className="lb-me-stat-value">{data.me.totalPoints}</span>
              </div>
              <div className="lb-me-stat">
                <span className="lb-me-stat-label">Your Achievements</span>
                <span className="lb-me-stat-value">{data.me.achievementCount}</span>
              </div>
            </div>

            {leaderPoints > 0 && (
              <div className="lb-me-progress">
                <div className="lb-me-progress-head">
                  <span>Your points vs. the leader</span>
                  <span>
                    {data.me.totalPoints} / {leaderPoints}
                  </span>
                </div>
                <div
                  className="progress-track"
                  role="img"
                  aria-label={`Your ${data.me.totalPoints} verified points compared with the leader's ${leaderPoints}`}
                >
                  <div
                    className="progress-fill lb-fill--self"
                    style={{ width: `${Math.max(2, (data.me.totalPoints / leaderPoints) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {showSelfJump && (
              <div className="lb-me-jump">
                <button type="button" className="btn btn-outline btn-sm" onClick={scrollToSelf}>
                  View your row
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- podium */}
      {podium.length > 0 && (
        <section aria-labelledby="lb-podium-title">
          <div className="lb-section-head">
            <h3 id="lb-podium-title" className="lb-section-title">
              <Trophy size={17} aria-hidden="true" />
              {PODIUM_TITLE[data.scope]}
            </h3>
            <p className="lb-section-sub">
              Ranked by verified achievement points, exactly as the server awarded them.
            </p>
          </div>
          <ol className={`lb-podium ${podium.length === 3 ? 'lb-podium--centered' : 'lb-podium--natural'}`}>
            {podium.map((entry, index) => {
              const tier = index === 0 ? 'first' : index === 1 ? 'second' : 'third';
              const isSelf = data.me?.studentId === entry.studentId;
              const isHighlighted = highlightStudentId
                ? entry.studentId === highlightStudentId
                : isSelf;
              return (
                <li
                  key={entry.studentId}
                  className={[
                    'lb-podium-card',
                    `lb-podium-card--${tier}`,
                    isHighlighted ? 'lb-podium-card--self' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className={`lb-podium-rank lb-podium-rank--${tier}`}>{ordinal(entry.rank)}</span>
                  <div className={`lb-podium-medal lb-podium-medal--${tier}`} aria-hidden="true">
                    {tier === 'first' ? <Crown size={24} /> : <Medal size={22} color={MEDAL_COLOR[index]} />}
                  </div>
                  <div className={`lb-avatar lb-avatar--${tier}`} aria-hidden="true">
                    {initialsOf(entry.fullName, entry.registerNumber)}
                  </div>
                  <div className="lb-podium-name">
                    {nameNode(entry, 'lb-podium-name-text')}
                    {isHighlighted && <span className="badge badge-info lb-you-chip">You</span>}
                  </div>
                  <div className="lb-podium-reg">{entry.registerNumber}</div>
                  <div className="lb-podium-meta">
                    {entry.departmentName || 'Department n/a'}
                    {entry.batchName ? ` - ${entry.batchName}` : ''}
                  </div>
                  <div className="lb-podium-points">
                    <strong>{entry.totalPoints}</strong>
                    <span>pts</span>
                  </div>
                  <div className="lb-podium-ach">
                    <Award size={14} aria-hidden="true" />
                    {entry.achievementCount} verified {entry.achievementCount === 1 ? 'achievement' : 'achievements'}
                  </div>
                  <div
                    className="progress-track"
                    role="img"
                    aria-label={`${entry.totalPoints} of ${maxPoints} leader points`}
                    style={{ marginTop: 'auto' }}
                  >
                    <div
                      className="progress-fill lb-fill--podium"
                      style={{
                        width: `${Math.max(3, (entry.totalPoints / maxPoints) * 100)}%`,
                        background: index === 0 ? 'var(--gold-500)' : 'var(--slate-400)',
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* --------------------------------------- empty: nothing verified */}
      {hasStudents && !hasVerifiedPoints && (
        <div style={{ marginBottom: '1.25rem' }}>
          <EmptyState
            icon={<Award size={28} />}
            title="No verified achievements yet"
            description="Achievements appear on this board once a mentor, HOD or administrator verifies them. Until then every student in scope stays at 0 points."
          />
        </div>
      )}

      {/* ----------------------------------------- achievement breakdown */}
      {hasVerifiedPoints && categoryTotals.length > 0 && (
        <section className="card lb-breakdown" aria-labelledby="lb-breakdown-title">
          <div className="lb-section-head">
            <h3 id="lb-breakdown-title" className="lb-section-title">
              <Sparkles size={17} aria-hidden="true" />
              Verified points by category
            </h3>
            <p className="lb-section-sub">
              How the {totalPointsAwarded} verified points in {data.scopeLabel.toLowerCase()} scope are
              distributed across achievement categories.
            </p>
          </div>
          <ul className="lb-cat-list">
            {categoryTotals.map((c) => (
              <li key={c.category} className="lb-cat-row">
                <div className="lb-cat-head">
                  <span className="lb-cat-name">{c.category}</span>
                  <span className="lb-cat-count">
                    {c.count} {c.count === 1 ? 'achievement' : 'achievements'}
                  </span>
                  <span className="lb-cat-points">{c.points} pts</span>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <div
                    className="progress-fill lb-fill--cat"
                    style={{ width: `${Math.max(4, (c.points / maxCategoryPoints) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="lb-footnote">
            <Sparkles size={13} aria-hidden="true" />
            <span>
              Point values come from the institution's achievement point table; this view only sums the
              points the server already awarded on verification.
            </span>
          </p>
        </section>
      )}

      {/* ------------------------------------------------- full ranking */}
      {!hasStudents ? (
        <EmptyState
          icon={<Trophy size={28} />}
          title="No students in scope"
          description="Once students are active in your scope, the leaderboard builds itself from verified achievement points only."
        />
      ) : (
        <section className="lb-table" aria-labelledby="lb-ranking-title">
          <div className="lb-section-head">
            <h3 id="lb-ranking-title" className="lb-section-title">
              <Users size={17} aria-hidden="true" />
              Full ranking
            </h3>
            <p className="lb-section-sub">
              {hasVerifiedPoints
                ? `All ${data.totalStudents} ${data.totalStudents === 1 ? 'student' : 'students'} in scope, ranked by verified points.`
                : 'No verified points yet - every student in scope is listed at 0 points.'}
            </p>
          </div>
          <div className="card lb-table-card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col" className="lb-c-rank">
                      Rank
                    </th>
                    <th scope="col" className="lb-c-student">
                      Student
                    </th>
                    <th scope="col" className="lb-c-dept">
                      Department
                    </th>
                    <th scope="col" className="lb-c-year">
                      Year
                    </th>
                    <th scope="col" className="lb-c-ach">
                      Achievements
                    </th>
                    <th scope="col" className="lb-c-points">
                      Points
                    </th>
                    <th scope="col" className="lb-c-level">
                      Level
                    </th>
                    <th scope="col" className="lb-c-score">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isSelf = data.me?.studentId === entry.studentId;
                    const isHighlighted = highlightStudentId
                      ? entry.studentId === highlightStudentId
                      : isSelf;
                    const level = levelFor(entry);
                    const podiumRow = entry.totalPoints > 0 && entry.rank <= 3;
                    const rowClass = [
                      'lb-row',
                      podiumRow ? `lb-row--${entry.rank}` : '',
                      isHighlighted ? 'lb-row--self' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <tr
                        key={entry.studentId}
                        id={isSelf ? 'lb-self-row' : undefined}
                        className={rowClass}
                        tabIndex={isSelf ? -1 : undefined}
                        aria-current={isHighlighted ? 'true' : undefined}
                      >
                        <td className="lb-c-rank">
                          <span className={`lb-rank-chip lb-rank-chip--${podiumRow ? entry.rank : 'n'}`}>
                            {podiumRow && rankIcon(entry.rank)}
                            <span>{entry.rank}</span>
                          </span>
                        </td>
                        <td className="lb-c-student" data-label="Student">
                          <div className="lb-cell-student">
                            <span className="lb-cell-name">{nameNode(entry, 'lb-cell-name-inner')}</span>
                            <span className="lb-cell-reg">
                              {entry.registerNumber}
                              {isSelf && <span className="badge badge-info lb-you-chip">You</span>}
                            </span>
                          </div>
                        </td>
                        <td className="lb-c-dept" data-label="Department">
                          {entry.departmentName || '-'}
                        </td>
                        <td className="lb-c-year" data-label="Year">
                          {entry.year || '-'}
                        </td>
                        <td className="lb-c-ach" data-label="Achievements">
                          {entry.achievementCount}
                        </td>
                        <td className="lb-c-points" data-label="Points">
                          {entry.totalPoints}
                        </td>
                        <td className="lb-c-level" data-label="Level">
                          <span className={`lb-level ${level.className}`}>{level.label}</span>
                        </td>
                        <td className="lb-c-score">
                          <div
                            className="progress-track"
                            role="img"
                            aria-label={`${entry.totalPoints} of ${maxPoints} leader points`}
                          >
                            <div
                              className="progress-fill"
                              style={{
                                width: `${Math.max(3, (entry.totalPoints / maxPoints) * 100)}%`,
                                background: rankFill(entry),
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="lb-footnote">
              <Sparkles size={13} aria-hidden="true" />
              <span>
                Ranking: total verified points DESC, then verified count DESC, then register number ASC.
                Points are server-awarded on verification only.
              </span>
            </p>
          </div>
        </section>
      )}
    </div>
  );
};
