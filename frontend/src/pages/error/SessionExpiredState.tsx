import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, LogIn, Home } from 'lucide-react';
import { ErrorStateLayout } from '../../components/common/ErrorStateLayout';
import { useAuth } from '../../context/AuthContext';

interface SessionExpiredStateProps {
  onLoginAgain?: () => void;
  fullPage?: boolean;
}

export const SessionExpiredState: React.FC<SessionExpiredStateProps> = ({
  onLoginAgain,
  fullPage = true,
}) => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLoginAgain = () => {
    logout();
    if (onLoginAgain) {
      onLoginAgain();
    } else {
      navigate('/login');
    }
  };

  return (
    <ErrorStateLayout
      code="401"
      title="Session Expired"
      message="Your authentication session has expired or is invalid. Please log in again to securely continue."
      icon={<Clock size={32} color="#D97706" />}
      primaryAction={{
        label: 'Login Again',
        onClick: handleLoginAgain,
        icon: <LogIn size={16} />,
      }}
      secondaryAction={{
        label: 'Go to Login',
        onClick: () => {
          logout();
          navigate('/login');
        },
        icon: <Home size={16} />,
      }}
      fullPage={fullPage}
    />
  );
};
