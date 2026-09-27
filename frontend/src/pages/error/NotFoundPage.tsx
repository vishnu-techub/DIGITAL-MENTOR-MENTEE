import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Home, ArrowLeft } from 'lucide-react';
import { ErrorStateLayout } from '../../components/common/ErrorStateLayout';

interface NotFoundPageProps {
  onGoDashboard?: () => void;
  onGoBack?: () => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onGoDashboard, onGoBack }) => {
  const navigate = useNavigate();

  const handleDashboard = () => {
    if (onGoDashboard) {
      onGoDashboard();
    } else {
      navigate('/');
    }
  };

  const handleBack = () => {
    if (onGoBack) {
      onGoBack();
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <ErrorStateLayout
      code="404"
      title="Page Not Found"
      message="The page you're looking for doesn't exist or may have been moved."
      icon={<Compass size={32} color="#0B2545" />}
      primaryAction={{
        label: 'Go to Dashboard',
        onClick: handleDashboard,
        icon: <Home size={18} />,
      }}
      secondaryAction={{
        label: 'Go Back',
        onClick: handleBack,
        icon: <ArrowLeft size={18} />,
      }}
      fullPage={true}
    />
  );
};
