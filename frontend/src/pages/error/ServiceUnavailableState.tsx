import React from 'react';
import { Database, RotateCcw, Home } from 'lucide-react';
import { ErrorStateLayout } from '../../components/common/ErrorStateLayout';

interface ServiceUnavailableStateProps {
  onRetry?: () => void;
  onGoDashboard?: () => void;
  fullPage?: boolean;
}

export const ServiceUnavailableState: React.FC<ServiceUnavailableStateProps> = ({
  onRetry,
  onGoDashboard,
  fullPage = true,
}) => {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <ErrorStateLayout
      code="503"
      title="Service Temporarily Unavailable"
      message="We're having trouble loading your data. Please try again shortly."
      icon={<Database size={32} color="#D97706" />}
      primaryAction={{
        label: 'Retry',
        onClick: handleRetry,
        icon: <RotateCcw size={18} />,
      }}
      secondaryAction={
        onGoDashboard
          ? {
              label: 'Go to Dashboard',
              onClick: onGoDashboard,
              icon: <Home size={18} />,
            }
          : undefined
      }
      fullPage={fullPage}
    />
  );
};
