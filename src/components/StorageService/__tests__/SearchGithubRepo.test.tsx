import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IUserInfos } from '@services/auth/interface';
import SearchGithubRepo from '../SearchGithubRepo';

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();

vi.mock('graphql-hooks', () => ({
  ClientContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
  GraphQLClient: class {
    setHeader() {}
  },
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

describe('SearchGithubRepo', () => {
  let userInfoSubject: BehaviorSubject<IUserInfos | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();

    userInfoSubject = new BehaviorSubject<IUserInfos | undefined>({
      userName: 'Test User',
      'github-token': 'test-token',
      'github-userName': 'test-user',
    });

    Object.defineProperty(window.observables.auth, 'userInfo$', {
      value: userInfoSubject.asObservable(),
      writable: true,
      configurable: true,
    });

    mockUseMutation.mockReturnValue([vi.fn()]);
    mockUseQuery.mockReturnValue({
      loading: false,
      error: undefined,
      refetch: vi.fn(),
      data: {
        repositoryOwner: { id: 'owner-1' },
        search: {
          repositoryCount: 2,
          edges: [
            { node: { name: 'first-repo', url: 'https://github.com/test-user/first-repo' } },
            { node: { name: 'clicked-repo', url: 'https://github.com/test-user/clicked-repo' } },
          ],
        },
      },
    });
  });

  it('does not auto-select the first repository when results load', async () => {
    const githubWikiUrlSetter = vi.fn();

    render(
      <SearchGithubRepo
        githubWikiUrl=''
        githubWikiUrlSetter={githubWikiUrlSetter}
        isCreateMainWorkspace
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('first-repo')).toBeInTheDocument();
      expect(screen.getByText('clicked-repo')).toBeInTheDocument();
    });

    expect(githubWikiUrlSetter).not.toHaveBeenCalled();
  });

  it('selects exactly the repository the user clicked', async () => {
    const user = userEvent.setup();
    const githubWikiUrlSetter = vi.fn();
    const wikiFolderNameSetter = vi.fn();

    render(
      <SearchGithubRepo
        githubWikiUrl=''
        githubWikiUrlSetter={githubWikiUrlSetter}
        wikiFolderNameSetter={wikiFolderNameSetter}
        isCreateMainWorkspace
      />,
    );

    const clickedRepo = await screen.findByText('clicked-repo');
    await user.click(clickedRepo);

    expect(githubWikiUrlSetter).toHaveBeenCalledWith('https://github.com/test-user/clicked-repo');
    expect(wikiFolderNameSetter).toHaveBeenCalledWith('clicked-repo');
  });
});
