import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { MentorNotFound } from '../error/MentorNotFound';
import { NetworkErrorState } from '../error/NetworkErrorState';
import { ServiceUnavailableState } from '../error/ServiceUnavailableState';
import { ServerErrorState } from '../error/ServerErrorState';
import { FacultySkeleton } from '../../components/common/SkeletonLoader';
import { ArrowLeft, Users, Mail, Phone, Building2, Calendar } from 'lucide-react';

export const MentorViewWrapper: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mentor, setMentor] = useState<any>(null);
  const [mentees, setMentees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchMentor = async () => {
    if (!id) {
      setError(new ApiError(404, 'Mentor not found', '/mentor'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getMentees(id);
      if (res.success && res.data) {
        setMentor(res.data.faculty || { id, name: 'Faculty Mentor' });
        setMentees(res.data.mentees || []);
      } else {
        setError(new ApiError(404, 'Mentor not found', `/mentor/${id}`));
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err : new ApiError(500, err?.message, `/mentor/${id}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMentor();
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: '2rem 1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <FacultySkeleton />
      </div>
    );
  }

  if (error) {
    if (error.type === 'MENTOR_NOT_FOUND' || error.statusCode === 404) {
      return (
        <MentorNotFound
          onBackToFaculty={() => navigate('/')}
          onGoDashboard={() => navigate('/')}
          fullPage={true}
        />
      );
    }
    if (error.type === 'NETWORK_ERROR' || error.statusCode === 0) {
      return (
        <NetworkErrorState
          onRetry={fetchMentor}
          onGoDashboard={() => navigate('/')}
          fullPage={true}
        />
      );
    }
    if (error.type === 'SERVICE_UNAVAILABLE' || error.statusCode === 503) {
      return (
        <ServiceUnavailableState
          onRetry={fetchMentor}
          onGoDashboard={() => navigate('/')}
          fullPage={true}
        />
      );
    }
    return (
      <ServerErrorState
        onRetry={fetchMentor}
        onGoDashboard={() => navigate('/')}
        fullPage={true}
      />
    );
  }

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <button
        onClick={() => navigate('/')}
        className="btn btn-secondary"
        style={{ marginBottom: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.75rem',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0B2545', margin: '0 0 0.5rem 0' }}>
          {mentor.name || mentor.fullName || 'Faculty Mentor'}
        </h2>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', color: '#64748B', fontSize: '0.9rem' }}>
          {mentor.department && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Building2 size={16} /> {mentor.department.name || mentor.department}
            </span>
          )}
          {mentor.email && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Mail size={16} /> {mentor.email}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Users size={16} /> {mentees.length} Assigned Mentees
          </span>
        </div>
      </div>
    </div>
  );
};
