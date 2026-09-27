import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { StudentDetailsView } from './StudentDetailsView';
import { StudentNotFound } from '../error/StudentNotFound';

export const StudentRouteView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return <StudentNotFound onBackToStudents={() => navigate('/')} onGoDashboard={() => navigate('/')} fullPage={true} />;
  }

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: '1280px', margin: '0 auto' }}>
      <StudentDetailsView
        studentId={id}
        onBack={() => navigate('/')}
      />
    </div>
  );
};
