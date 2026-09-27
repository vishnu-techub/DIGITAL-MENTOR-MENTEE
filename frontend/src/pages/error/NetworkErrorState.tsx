import React from 'react';
import { useNavigate } from 'react-router-dom';
import { WifiOff, RotateCcw, Home } from 'lucide-react';
import { ErrorStateLayout } from '../../components/common/ErrorStateLayout';

interface NetworkErrorStateProps {
  onRetry?: () => void;
  onGoDashboard?: () => void;
  fullPage?: boolean;
}

export const NetworkErrorState: React.FC<NetworkErrorStateProps> = ({
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
      title="Unable to Connect"
      message="We couldn't connect to the server. Please check your internet connection and try again."
      icon={<WifiOff size={32} color="#DC2626" />}
      primaryAction={{
        label: 'Retry',
        onClick: handleRetry,
        icon: <RotateCcw size={18} />,
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
