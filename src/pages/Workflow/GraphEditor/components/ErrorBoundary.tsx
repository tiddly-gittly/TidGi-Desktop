import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}
export class TheGraphErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    // Update state to indicate that an error has occurred
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can log the error or send it to an error reporting service
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Render fallback UI when an error occurs
      return <h1>Something went wrong.</h1>;
    }

    // Render children components if no error occurred
    return this.props.children;
  }
}
