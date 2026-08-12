import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfigErrorMessage } from '../DesktopAgentChatTab';

describe('configuration error action', () => {
  it('offers a direct link to External API settings', async () => {
    const user = userEvent.setup();
    const openDeepLink = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.service, 'deepLink', {
      configurable: true,
      value: { openDeepLink },
    });
    vi.mocked(window.service.context.get).mockResolvedValue(true);

    render(
      <ConfigErrorMessage
        fallbackMessage='API key for siliconflow not found'
        params={{ provider: 'siliconflow' }}
        translationKey='MissingAPIKeyError'
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Chat.ConfigError.GoToSettings' }));
    await waitFor(() => {
      expect(openDeepLink).toHaveBeenCalledWith('tidgi-test://preferences/externalAPI');
    });
  });
});
