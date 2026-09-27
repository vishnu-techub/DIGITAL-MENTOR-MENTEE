import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck2, GraduationCap, Home } from 'lucide-react';
import { ErrorStateLayout } from '../../components/common/ErrorStateLayout';

interface MentorNotFoundProps {
  onBackToFaculty?: () => void;
  onGoDashboard?: () => void;
  fullPage?: boolean;
}

export const MentorNotFound: React.FC<MentorNotFoundProps> = ({
  onBackToFaculty,
  onGoDashboard,
  fullPage = true,
}) => {
  const navigate = useNavigate();

  const handleBackToFaculty = () => {
    if (onBackToFaculty) {
      onBackToFaculty();
    } else {
      navigate('/faculty');
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
      title="Mentor Not Found"
      message="The requested mentor profile could not be found."
      icon={<GraduationCap size={32} color="#D97706" />}
      primaryAction={{
        label: 'Back to Faculty',
        onClick: handleBackToFaculty,
        icon: <UserCheck2 size={18} />,
      }}
      secondaryAction={{
        label: 'Dashboard',
        onClick: handleDashboard,
        icon: <Home size={18} />,
      }}
      fullPage={fullPage}
    />
  );
};
