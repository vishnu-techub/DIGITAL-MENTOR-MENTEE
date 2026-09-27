import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';
import { ErrorStateLayout } from '../../components/common/ErrorStateLayout';

interface AccessDeniedStateProps {
  onGoDashboard?: () => void;
  onGoBack?: () => void;
  fullPage?: boolean;
}

export const AccessDeniedState: React.FC<AccessDeniedStateProps> = ({
  onGoDashboard,
  onGoBack,
  fullPage = true,
}) => {
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
      code="403"
      title="Access Denied"
      message="You don't have permission to access this page."
      icon={<ShieldAlert size={32} color="#DC2626" />}
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
      fullPage={fullPage}
    />
  );
};
