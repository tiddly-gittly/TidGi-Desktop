import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentSwitcher } from '../AgentSwitcher';

describe('AgentSwitcher', () => {
  it('uses native disabled button semantics while an agent response is active', () => {
    render(
      <AgentSwitcher
        currentAgentDefId='memeloop:general-assistant'
        disabled
        onSwitch={vi.fn()}
      />,
    );

    const switcher = screen.getByTestId('agent-switcher-button');
    expect(switcher.tagName).toBe('BUTTON');
    expect(switcher).toBeDisabled();
  });

  it('keeps bundled profiles available while the persisted definitions are loading', async () => {
    render(
      <AgentSwitcher
        currentAgentDefId='memeloop:general-assistant'
        onSwitch={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('agent-switcher-button'));

    expect(await screen.findByTestId('agent-switcher-option-memeloop:code-assistant')).toBeVisible();
  });
});
