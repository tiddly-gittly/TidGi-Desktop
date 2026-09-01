import { AgentChatConfigError } from '@memeloop/react-ui/agent';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleDesktopAgentErrorAction } from '../openAgentRunErrorSettings';

// The package is linked from the Core worktree and therefore owns another React install.
// Keep this Desktop integration test on one React renderer while exercising the real click contract and action handler.
vi.mock('@memeloop/react-ui/agent', () => ({
  AgentChatConfigError: ({ actionLabel, actionId, onAction }: {
    actionLabel?: string;
    actionId?: string;
    onAction?: (actionId?: string) => Promise<void>;
  }) => <button type='button' onClick={() => void onAction?.(actionId)}>{actionLabel}</button>,
}));

describe('Desktop Agent run error settings action', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the missing API key field when the user clicks the localized action', async () => {
    vi.spyOn(window.service.context, 'get').mockResolvedValue(true);
    const service = window.service as unknown as Record<string, unknown>;
    const originalDeepLink = service.deepLink;
    const openDeepLink = vi.fn(async () => undefined);
    service.deepLink = { openDeepLink };
    const presentation = {
      title: 'Configuration required',
      message: 'API key is missing',
      actionLabel: 'Open settings',
      actionId: 'open-agent-run-setting',
      settingTarget: { kind: 'provider' as const, providerId: '0提供方', field: 'apiKey' as const },
    };

    render(
      <AgentChatConfigError
        {...presentation}
        onAction={() => handleDesktopAgentErrorAction(presentation)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

    await waitFor(() => {
      expect(openDeepLink).toHaveBeenCalledWith(
        'tidgi-test://preferences/externalAPI?provider=0%E6%8F%90%E4%BE%9B%E6%96%B9&field=apiKey',
      );
    });
    service.deepLink = originalDeepLink;
  });
});
