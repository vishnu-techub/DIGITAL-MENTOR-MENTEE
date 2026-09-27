import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';
import { ErrorStateLayout } from './ErrorStateLayout';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Only log technical errors in development console
    if (import.meta.env.DEV) {
      console.error('[KSRCE React ErrorBoundary caught an error]:', error, errorInfo);
    }
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null });
    // In case resetting local boundary state is enough or trigger soft refresh
    window.location.reload();
  };

  handleDashboard = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorStateLayout
          title="Something Went Wrong"
          message="An unexpected error occurred."
          icon={<AlertOctagon size={32} color="#DC2626" />}
          primaryAction={{
            label: 'Try Again',
            onClick: this.handleTryAgain,
            icon: <RotateCcw size={18} />,
          }}
          secondaryAction={{
            label: 'Dashboard',
            onClick: this.handleDashboard,
            icon: <Home size={18} />,
          }}
          fullPage={true}
        />
      );
    }

    return this.props.children;
  }
}
