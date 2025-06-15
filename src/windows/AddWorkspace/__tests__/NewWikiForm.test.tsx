import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { IGitUserInfos } from '@services/git/interface';
import { SupportedStorageServices } from '@services/types';
import { ISubWikiPluginContent } from '@services/wiki/plugin/subWikiPlugin';
import { IWorkspace } from '@services/workspaces/interface';
import { NewWikiForm } from '../NewWikiForm';
import { IErrorInWhichComponent, IWikiWorkspaceForm } from '../useForm';

// Mock only the hooks we need, not the components
vi.mock('../useNewWiki', () => ({
  useValidateNewWiki: vi.fn(),
}));

// Mock form data helper
const createMockForm = (overrides: Partial<IWikiWorkspaceForm> = {}): IWikiWorkspaceForm => ({
  storageProvider: SupportedStorageServices.local,
  storageProviderSetter: vi.fn(),
  wikiPort: 5212,
  wikiPortSetter: vi.fn(),
  parentFolderLocation: '/test/parent',
  parentFolderLocationSetter: vi.fn(),
  wikiFolderName: 'test-wiki',
  wikiFolderNameSetter: vi.fn(),
  wikiFolderLocation: '/test/parent/test-wiki',
  mainWikiToLink: {
    wikiFolderLocation: '/main/wiki',
    id: 'main-wiki-id',
    port: 5212,
  },
  mainWikiToLinkSetter: vi.fn(),
  mainWikiToLinkIndex: 0,
  mainWorkspaceList: [
    {
      id: 'main-wiki-id',
      name: 'Main Wiki',
      wikiFolderLocation: '/main/wiki',
      port: 5212,
      gitUrl: 'https://example.com/git',
      homeUrl: 'http://localhost:5212',
      metadata: {},
    } as unknown as IWorkspace,
    {
      id: 'second-wiki-id',
      name: 'Second Wiki',
      wikiFolderLocation: '/second/wiki',
      port: 5213,
      gitUrl: 'https://example.com/git2',
      homeUrl: 'http://localhost:5213',
      metadata: {},
    } as unknown as IWorkspace,
  ],
  fileSystemPaths: [
    { tagName: 'TagA', folderName: 'FolderA' } as ISubWikiPluginContent,
    { tagName: 'TagB', folderName: 'FolderB' } as ISubWikiPluginContent,
  ],
  fileSystemPathsSetter: vi.fn(),
  tagName: '',
  tagNameSetter: vi.fn(),
  gitRepoUrl: '',
  gitRepoUrlSetter: vi.fn(),
  gitUserInfo: undefined as IGitUserInfos | undefined,
  workspaceList: [] as IWorkspace[],
  wikiHtmlPath: '',
  wikiHtmlPathSetter: vi.fn(),
  ...overrides,
});

const createMockProps = (overrides: Partial<{
  form: IWikiWorkspaceForm;
  isCreateMainWorkspace: boolean;
  isCreateSyncedWorkspace: boolean;
  errorInWhichComponent: IErrorInWhichComponent;
  errorInWhichComponentSetter: ReturnType<typeof vi.fn>;
}> = {}) => ({
  form: createMockForm(),
  isCreateMainWorkspace: true,
  isCreateSyncedWorkspace: false,
  errorInWhichComponent: {},
  errorInWhichComponentSetter: vi.fn(),
  ...overrides,
});

describe('NewWikiForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper function to render component with default props
  const renderNewWikiForm = (overrides = {}) => {
    const props = createMockProps(overrides);
    return render(<NewWikiForm {...props} />);
  };

  describe('Basic Rendering Tests', () => {
    it('should render main workspace form with basic fields', () => {
      renderNewWikiForm({
        isCreateMainWorkspace: true,
      }); // Check for parent folder input
      expect(screen.getByRole('textbox', { name: 'AddWorkspace.WorkspaceParentFolder' })).toBeInTheDocument();

      // Check for wiki folder name input
      expect(screen.getByRole('textbox', { name: 'AddWorkspace.WorkspaceFolderNameToCreate' })).toBeInTheDocument();

      // Check for choose folder button
      expect(screen.getByRole('button', { name: 'AddWorkspace.Choose' })).toBeInTheDocument();

      // Main workspace should not show sub workspace fields
      expect(screen.queryByRole('combobox', { name: 'AddWorkspace.MainWorkspaceLocation' })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: 'AddWorkspace.TagName' })).not.toBeInTheDocument();
    });

    it('should render sub workspace form with all fields', () => {
      renderNewWikiForm({
        isCreateMainWorkspace: false,
      });
      // Basic fields should be present
      expect(screen.getByRole('textbox', { name: 'AddWorkspace.WorkspaceParentFolder' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'AddWorkspace.WorkspaceFolderNameToCreate' })).toBeInTheDocument();

      // Sub workspace specific fields should be present
      expect(screen.getByRole('combobox', { name: 'AddWorkspace.MainWorkspaceLocation' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'AddWorkspace.TagName' })).toBeInTheDocument();
    });

    it('should display correct initial values', () => {
      const form = createMockForm({
        parentFolderLocation: '/custom/path',
        wikiFolderName: 'my-wiki',
      });

      renderNewWikiForm({
        form,
        isCreateMainWorkspace: false,
      });

      expect(screen.getByDisplayValue('/custom/path')).toBeInTheDocument();
      expect(screen.getByDisplayValue('my-wiki')).toBeInTheDocument();
    });
  });

  describe('User Interaction Tests', () => {
    it('should handle parent folder path input change', async () => {
      const user = userEvent.setup();
      const mockSetter = vi.fn();
      const form = createMockForm({
        parentFolderLocationSetter: mockSetter,
      });

      renderNewWikiForm({ form });

      const input = screen.getByRole('textbox', { name: 'AddWorkspace.WorkspaceParentFolder' });
      await user.clear(input);
      await user.type(input, '/new/path');

      // Check that the setter was called (it gets called for each character)
      expect(mockSetter).toHaveBeenCalled();
      expect(mockSetter.mock.calls.length).toBeGreaterThan(0);
    });

    it('should handle wiki folder name input change', async () => {
      const user = userEvent.setup();
      const mockSetter = vi.fn();
      const form = createMockForm({
        wikiFolderNameSetter: mockSetter,
      });

      renderNewWikiForm({ form });

      const input = screen.getByRole('textbox', { name: 'AddWorkspace.WorkspaceFolderNameToCreate' });
      await user.clear(input);
      await user.type(input, 'new-wiki-name');

      // Check that the setter was called (it gets called for each character)
      expect(mockSetter).toHaveBeenCalled();
      expect(mockSetter.mock.calls.length).toBeGreaterThan(0);
    });

    it('should handle directory picker button click', async () => {
      const user = userEvent.setup();
      const mockSetter = vi.fn();
      const form = createMockForm({
        parentFolderLocationSetter: mockSetter,
      });

      renderNewWikiForm({ form });

      const button = screen.getByRole('button', { name: 'AddWorkspace.Choose' });
      await user.click(button);

      // Should call the setter with empty string first, then with selected path
      expect(mockSetter).toHaveBeenCalledWith('');
      expect(mockSetter).toHaveBeenCalledWith('/test/selected/path');
      expect(window.service.native.pickDirectory).toHaveBeenCalled();
    });

    it('should handle main workspace selection for sub workspace', async () => {
      const user = userEvent.setup();
      const mockSetter = vi.fn();
      const form = createMockForm({
        mainWikiToLinkSetter: mockSetter,
      });

      renderNewWikiForm({
        form,
        isCreateMainWorkspace: false,
      });

      const select = screen.getByRole('combobox', { name: 'AddWorkspace.MainWorkspaceLocation' });
      await user.click(select);

      // Select the second option (Second Wiki)
      const option = screen.getByRole('option', { name: 'Second Wiki' });
      await user.click(option);

      expect(mockSetter).toHaveBeenCalledWith({
        wikiFolderLocation: '/second/wiki',
        port: 5213,
        id: 'second-wiki-id',
      });
    });

    it('should handle tag name input for sub workspace', async () => {
      const user = userEvent.setup();
      const mockSetter = vi.fn();
      const form = createMockForm({
        tagNameSetter: mockSetter,
      });

      renderNewWikiForm({
        form,
        isCreateMainWorkspace: false,
      });

      const tagInput = screen.getByRole('combobox', { name: 'AddWorkspace.TagName' });
      await user.type(tagInput, 'MyTag');

      expect(mockSetter).toHaveBeenCalledWith('MyTag');
    });
  });

  describe('Error State Tests', () => {
    it('should display errors on form fields when provided', () => {
      renderNewWikiForm({
        errorInWhichComponent: {
          parentFolderLocation: true,
          wikiFolderName: true,
        },
      });

      // Check that input fields have error states
      const parentInput = screen.getByRole('textbox', { name: 'AddWorkspace.WorkspaceParentFolder' });
      const wikiNameInput = screen.getByRole('textbox', { name: 'AddWorkspace.WorkspaceFolderNameToCreate' });

      expect(parentInput).toHaveAttribute('aria-invalid', 'true');
      expect(wikiNameInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('should display errors on sub workspace fields when provided', () => {
      renderNewWikiForm({
        isCreateMainWorkspace: false,
        errorInWhichComponent: {
          mainWikiToLink: true,
          tagName: true,
        },
      });

      const mainWikiSelect = screen.getByRole('combobox', { name: 'AddWorkspace.MainWorkspaceLocation' });
      const tagInput = screen.getByRole('combobox', { name: 'AddWorkspace.TagName' });

      expect(mainWikiSelect).toHaveAttribute('aria-invalid', 'true');
      expect(tagInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Props and State Tests', () => {
    it('should render without errors when required props are provided', () => {
      expect(() => {
        renderNewWikiForm();
      }).not.toThrow();
    });

    it('should show helper text for wiki folder location', () => {
      const form = createMockForm({
        wikiFolderLocation: '/test/parent/my-wiki',
      });

      renderNewWikiForm({ form });

      expect(screen.getByText('AddWorkspace.CreateWiki/test/parent/my-wiki')).toBeInTheDocument();
    });

    it('should show helper text for sub workspace linking', () => {
      const form = createMockForm({
        wikiFolderName: 'sub-wiki',
        mainWikiToLink: {
          wikiFolderLocation: '/main/wiki',
          id: 'main-id',
          port: 5212,
        },
      });

      renderNewWikiForm({
        form,
        isCreateMainWorkspace: false,
      });

      // Because the text is rendered with a template literal and newlines, we need to use a regex
      expect(screen.getByText((content, _element) => {
        // The actual text might have whitespace and newlines
        const normalized = content.replace(/\s+/g, ' ').trim();
        return normalized === 'AddWorkspace.SubWorkspaceWillLinkTo /main/wiki/tiddlers/subwiki/sub-wiki';
      })).toBeInTheDocument();
    });
  });
});
