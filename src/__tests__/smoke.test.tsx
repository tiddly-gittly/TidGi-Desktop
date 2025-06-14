import { Box } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

// Test component using Material-UI to ensure works on each dep upgrade
const TestComponent: React.FC = () => {
  return (
    <Box data-testid='test-component' sx={{ padding: 2 }}>
      Hello Material-UI with Vitest!
    </Box>
  );
};

describe('Material-UI Integration Test', () => {
  it('renders Material-UI Box component', () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('test-component')).toBeInTheDocument();
    expect(screen.getByText('Hello Material-UI with Vitest!')).toBeInTheDocument();
  });

  it('should work with vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
