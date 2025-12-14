/**
 * Tests for PromptTree component
 */
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { IPrompt } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { PromptTree } from '../PromptTree';

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>
    {children}
  </ThemeProvider>
);

describe('PromptTree', () => {
  it('should hide children when parent is disabled', () => {
    const prompts: IPrompt[] = [
      {
        id: 'disabled-parent',
        caption: 'Disabled Parent',
        enabled: false,
        children: [
          {
            id: 'child-should-not-show',
            caption: 'Child Should Not Show',
            enabled: true,
            text: 'invisible',
          },
        ],
      },
      {
        id: 'enabled-parent',
        caption: 'Enabled Parent',
        enabled: true,
        children: [
          {
            id: 'child-should-show',
            caption: 'Child Should Show',
            enabled: true,
            text: 'visible',
          },
        ],
      },
    ];

    render(
      <TestWrapper>
        <PromptTree prompts={prompts} />
      </TestWrapper>,
    );

    expect(screen.queryByText('Disabled Parent')).not.toBeInTheDocument();
    expect(screen.queryByText('Child Should Not Show')).not.toBeInTheDocument();
    expect(screen.getByText('Enabled Parent')).toBeInTheDocument();
    expect(screen.getByText('Child Should Show')).toBeInTheDocument();
  });
});
