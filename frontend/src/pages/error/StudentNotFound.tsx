import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UserX, Users, Home } from 'lucide-react';
import { ErrorStateLayout } from '../../components/common/ErrorStateLayout';

interface StudentNotFoundProps {
  onBackToStudents?: () => void;
  onGoDashboard?: () => void;
  fullPage?: boolean;
}

export const StudentNotFound: React.FC<StudentNotFoundProps> = ({
  onBackToStudents,
  onGoDashboard,
  fullPage = true,
}) => {
  const navigate = useNavigate();

  const handleBackToStudents = () => {
    if (onBackToStudents) {
      onBackToStudents();
    } else {
      navigate('/students');
    }
  };

  const handleDashboard = () => {
    if (onGoDashboard) {
      onGoDashboard();
    } else {
      navigate('/');
    }
  };

  return (
    <ErrorStateLayout
      title="Student Not Found"
      message="The requested student profile could not be found."
      icon={<UserX size={32} color="#DC2626" />}
      primaryAction={{
        label: 'Back to Students',
        onClick: handleBackToStudents,
        icon: <Users size={18} />,
      }}
      secondaryAction={{
        label: 'Go to Dashboard',
        onClick: handleDashboard,
        icon: <Home size={18} />,
      }}
      fullPage={fullPage}
    />
  );
};
