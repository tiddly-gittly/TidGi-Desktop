import { Box } from '@mui/material';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Simple test component for initial testing
const TestComponent: React.FC = () => {
  return <Box data-testid='test-component'>Hello Jest!</Box>;
};

describe('Simple Test', () => {
  it('renders test component', () => {
    render(<TestComponent />);
    expect(screen.getByTestId('test-component')).toBeInTheDocument();
    expect(screen.getByText('Hello Jest!')).toBeInTheDocument();
  });

  it('should work with jest', () => {
    expect(1 + 1).toBe(2);
  });
});
