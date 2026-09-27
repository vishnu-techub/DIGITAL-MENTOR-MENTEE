import React from 'react';
import { Skeleton } from './Skeleton';

/**
 * 1. Dashboard Skeleton Loader
 */
export const DashboardSkeleton: React.FC = () => {
  return (
    <div style={{ padding: '0.5rem 0', animation: 'fadeIn 0.2s ease-out' }}>
      {/* Welcome Banner */}
      <Skeleton height="140px" borderRadius="16px" style={{ marginBottom: '1.5rem', backgroundColor: '#E2E8F0' }} />

      {/* KPI Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.75rem',
        }}
      >
        <Skeleton variant="card" height="110px" borderRadius="14px" />
        <Skeleton variant="card" height="110px" borderRadius="14px" />
        <Skeleton variant="card" height="110px" borderRadius="14px" />
        <Skeleton variant="card" height="110px" borderRadius="14px" />
      </div>

      {/* Tables / Activity Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
          <Skeleton height="24px" width="45%" style={{ marginBottom: '1rem' }} />
          <Skeleton variant="table" rows={4} />
        </div>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
          <Skeleton height="24px" width="45%" style={{ marginBottom: '1rem' }} />
          <Skeleton variant="table" rows={4} />
        </div>
      </div>
    </div>
  );
};

/**
 * 2. Students Directory Skeleton
 */
export const StudentsSkeleton: React.FC = () => {
  return (
    <div style={{ padding: '0.5rem 0', animation: 'fadeIn 0.2s ease-out' }}>
      {/* Header & Filter Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <Skeleton height="36px" width="220px" borderRadius="8px" />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Skeleton height="38px" width="180px" borderRadius="8px" />
          <Skeleton height="38px" width="120px" borderRadius="8px" />
        </div>
      </div>

      {/* Table Container */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '1rem', overflow: 'hidden' }}>
        <Skeleton variant="table" rows={8} />
      </div>
    </div>
  );
};

/**
 * 3. Faculty Directory Skeleton
 */
export const FacultySkeleton: React.FC = () => {
  return (
    <div style={{ padding: '0.5rem 0', animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <Skeleton height="36px" width="200px" borderRadius="8px" />
        <Skeleton height="38px" width="150px" borderRadius="8px" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              padding: '1.5rem',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
              <Skeleton variant="circular" width="48px" height="48px" />
              <div style={{ flex: 1 }}>
                <Skeleton height="18px" width="70%" style={{ marginBottom: '6px' }} />
                <Skeleton height="14px" width="40%" />
              </div>
            </div>
            <Skeleton height="14px" width="90%" style={{ marginBottom: '8px' }} />
            <Skeleton height="14px" width="60%" style={{ marginBottom: '1rem' }} />
            <Skeleton height="32px" width="100%" borderRadius="8px" />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 4. Student Profile Skeleton
 */
export const StudentProfileSkeleton: React.FC = () => {
  return (
    <div style={{ padding: '0.5rem 0', animation: 'fadeIn 0.2s ease-out' }}>
      {/* Profile Header Dossier Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.75rem',
          border: '1px solid #E2E8F0',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '1.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Skeleton variant="circular" width="80px" height="80px" />
        <div style={{ flex: 1, minWidth: '220px' }}>
          <Skeleton height="28px" width="40%" style={{ marginBottom: '8px' }} />
          <Skeleton height="16px" width="60%" style={{ marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Skeleton height="22px" width="90px" borderRadius="12px" />
            <Skeleton height="22px" width="90px" borderRadius="12px" />
          </div>
        </div>
      </div>

      {/* Navigation Tabs Placeholder */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '4px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height="36px" width="110px" borderRadius="8px" />
        ))}
      </div>

      {/* Detail Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
          <Skeleton height="20px" width="50%" style={{ marginBottom: '1rem' }} />
          <Skeleton height="14px" width="90%" style={{ marginBottom: '8px' }} />
          <Skeleton height="14px" width="75%" style={{ marginBottom: '8px' }} />
          <Skeleton height="14px" width="85%" />
        </div>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
          <Skeleton height="20px" width="50%" style={{ marginBottom: '1rem' }} />
          <Skeleton height="14px" width="80%" style={{ marginBottom: '8px' }} />
          <Skeleton height="14px" width="70%" style={{ marginBottom: '8px' }} />
          <Skeleton height="14px" width="60%" />
        </div>
      </div>
    </div>
  );
};

/**
 * 5. Counselling Records Skeleton
 */
export const CounsellingSkeleton: React.FC = () => {
  return (
    <div style={{ padding: '0.5rem 0', animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <Skeleton height="30px" width="220px" borderRadius="8px" />
        <Skeleton height="36px" width="160px" borderRadius="8px" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              padding: '1.25rem',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <Skeleton height="20px" width="160px" borderRadius="4px" />
              <Skeleton height="16px" width="100px" />
            </div>
            <Skeleton height="14px" width="90%" style={{ marginBottom: '6px' }} />
            <Skeleton height="14px" width="70%" />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 6. Academic Details / Arrears Ledger Skeleton
 */
export const AcademicSkeleton: React.FC = () => {
  return (
    <div style={{ padding: '0.5rem 0', animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <Skeleton height="30px" width="240px" borderRadius="8px" />
        <Skeleton height="36px" width="140px" borderRadius="8px" />
      </div>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '1rem' }}>
        <Skeleton variant="table" rows={8} />
      </div>
    </div>
  );
};

/**
 * 7. Documents & Certificates Skeleton
 */
export const DocumentsSkeleton: React.FC = () => {
  return (
    <div style={{ padding: '0.5rem 0', animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <Skeleton height="30px" width="200px" borderRadius="8px" />
        <Skeleton height="38px" width="160px" borderRadius="8px" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              padding: '1.25rem',
              border: '1px solid #E2E8F0',
            }}
          >
            <Skeleton height="120px" borderRadius="8px" style={{ marginBottom: '0.75rem' }} />
            <Skeleton height="18px" width="75%" style={{ marginBottom: '6px' }} />
            <Skeleton height="14px" width="50%" />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 8. Reports Skeleton
 */
export const ReportsSkeleton: React.FC = () => {
  return (
    <div style={{ padding: '0.5rem 0', animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <Skeleton height="32px" width="220px" borderRadius="8px" />
        <Skeleton height="38px" width="140px" borderRadius="8px" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <Skeleton height="220px" borderRadius="14px" />
        <Skeleton height="220px" borderRadius="14px" />
      </div>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '1rem' }}>
        <Skeleton variant="table" rows={5} />
      </div>
    </div>
  );
};
