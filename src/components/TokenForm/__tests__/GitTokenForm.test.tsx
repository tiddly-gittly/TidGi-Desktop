import type { IUserInfos } from '@services/auth/interface';
import { SupportedStorageServices } from '@services/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitTokenForm } from '../GitTokenForm';

// Mock the hooks
vi.mock('../gitTokenHooks', () => ({
  useAuth: vi.fn(() => [vi.fn(), vi.fn()]),
  useGetGithubUserInfoOnLoad: vi.fn(),
}));

describe('GitTokenForm', () => {
  let userInfoSubject: BehaviorSubject<IUserInfos | undefined>;

  beforeEach(() => {
    // Create a fresh observable for each test
    userInfoSubject = new BehaviorSubject<IUserInfos | undefined>({
      userName: '',
      'github-token': '',
      'github-userName': '',
      'github-email': '',
      'github-branch': 'main',
    });

    // Override the window.observables.auth.userInfo$
    Object.defineProperty(window.observables.auth, 'userInfo$', {
      value: userInfoSubject.asObservable(),
      writable: true,
      configurable: true,
    });
  });

  it('should display initial userInfo values in the form', async () => {
    userInfoSubject.next({
      userName: 'TestUser',
      'github-token': 'test-token-123',
      'github-userName': 'githubUser',
      'github-email': 'test@example.com',
      'github-branch': 'develop',
    });

    render(<GitTokenForm storageService={SupportedStorageServices.github} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });

    // Check that the values are displayed
    const inputs = screen.getAllByRole('textbox');
    expect((inputs[0] as HTMLInputElement).value).toBe('test-token-123');
    expect((inputs[1] as HTMLInputElement).value).toBe('githubUser');
    expect((inputs[2] as HTMLInputElement).value).toBe('test@example.com');
    expect((inputs[3] as HTMLInputElement).value).toBe('develop');
  });

  it('should update form when userInfo changes after OAuth login (BUG TEST)', async () => {
    // Start with empty userInfo (before OAuth)
    userInfoSubject.next({
      userName: '',
      'github-token': '',
      'github-userName': '',
      'github-email': '',
      'github-branch': 'main',
    });

    render(<GitTokenForm storageService={SupportedStorageServices.github} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });

    // Verify initial empty state
    const inputs = screen.getAllByRole('textbox');
    expect((inputs[0] as HTMLInputElement).value).toBe('');
    expect((inputs[1] as HTMLInputElement).value).toBe('');
    expect((inputs[2] as HTMLInputElement).value).toBe('');

    // Simulate OAuth callback - userInfo gets updated with token and user data
    // Wrap in act to acknowledge state update
    await waitFor(() => {
      userInfoSubject.next({
        userName: 'TestUser',
        'github-token': 'oauth-token-xyz',
        'github-userName': 'githubOAuthUser',
        'github-email': 'oauth@example.com',
        'github-branch': 'main',
      });
    });

    // The form should update to show the new values
    await waitFor(() => {
      const updatedInputs = screen.getAllByRole('textbox');
      expect((updatedInputs[0] as HTMLInputElement).value).toBe('oauth-token-xyz');
      expect((updatedInputs[1] as HTMLInputElement).value).toBe('githubOAuthUser');
      expect((updatedInputs[2] as HTMLInputElement).value).toBe('oauth@example.com');
    });
  });

  it('should call auth.set when user types in input fields', async () => {
    const user = userEvent.setup();
    const setSpy = vi.spyOn(window.service.auth, 'set');

    render(<GitTokenForm storageService={SupportedStorageServices.github} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });

    const inputs = screen.getAllByRole('textbox');

    // Type in token input - userEvent.type() fires onChange for each character
    await user.type(inputs[0], 'new-token');

    // Wait for debounced call (500ms) and check that it was called with the last character
    // Since debounce fires after each keystroke, we just verify the function was called
    await waitFor(() => {
      expect(setSpy).toHaveBeenCalled();
    }, { timeout: 1000 });

    // Verify it was eventually called with a value containing our input
    expect(setSpy).toHaveBeenCalledWith('github-token', expect.any(String));
  });

  it('should update form when userInfo is overwritten', async () => {
    // Start with initial userInfo
    userInfoSubject.next({
      userName: '',
      'github-token': 'initial-token',
      'github-userName': 'initial-username',
      'github-email': 'initial@example.com',
      'github-branch': 'main',
    });

    render(<GitTokenForm storageService={SupportedStorageServices.github} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });

    // Verify initial values
    let inputs = screen.getAllByRole('textbox');
    expect((inputs[0] as HTMLInputElement).value).toBe('initial-token');
    expect((inputs[1] as HTMLInputElement).value).toBe('initial-username');

    // Simulate OAuth update with new values
    // Wrap in waitFor to handle the state update
    await waitFor(() => {
      userInfoSubject.next({
        userName: '',
        'github-token': 'oauth-token',
        'github-userName': 'oauth-username',
        'github-email': 'oauth@example.com',
        'github-branch': 'main',
      });
    });

    // The form should update with OAuth values since userInfo is the source of truth
    await waitFor(() => {
      inputs = screen.getAllByRole('textbox');
      expect((inputs[0] as HTMLInputElement).value).toBe('oauth-token');
      expect((inputs[1] as HTMLInputElement).value).toBe('oauth-username');
      expect((inputs[2] as HTMLInputElement).value).toBe('oauth@example.com');
    });
  });
});
