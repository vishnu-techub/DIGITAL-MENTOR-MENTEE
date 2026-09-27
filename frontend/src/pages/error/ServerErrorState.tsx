import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ServerCrash, RotateCcw, Home } from 'lucide-react';
import { ErrorStateLayout } from '../../components/common/ErrorStateLayout';

interface ServerErrorStateProps {
  onRetry?: () => void;
  onGoDashboard?: () => void;
  fullPage?: boolean;
}

export const ServerErrorState: React.FC<ServerErrorStateProps> = ({
  onRetry,
  onGoDashboard,
  fullPage = true,
}) => {
  const navigate = useNavigate();

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
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
      code="500"
      title="Something Went Wrong"
      message="Something went wrong on our side. Please try again later."
      icon={<ServerCrash size={32} color="#DC2626" />}
      primaryAction={{
        label: 'Retry',
        onClick: handleRetry,
        icon: <RotateCcw size={18} />,
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
