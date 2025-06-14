import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import { IGitUserInfos } from '@services/git/interface';
import { SupportedStorageServices } from '@services/types';
import { ISubWikiPluginContent } from '@services/wiki/plugin/subWikiPlugin';
import { IWorkspace } from '@services/workspaces/interface';
import { beforeEach, describe, expect, Mock, test, vi } from 'vitest';
import { NewWikiForm } from '../NewWikiForm';
import { IErrorInWhichComponent, IWikiWorkspaceForm } from '../useForm';

// Type definitions for mock components
interface MockComponentProps {
  children: React.ReactNode;
}

interface MockInputProps {
  label?: string;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  error?: boolean;
}

interface MockSelectProps {
  children: React.ReactNode;
  label?: string;
  value?: string | number;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

interface MockButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

interface MockAutocompleteProps {
  value?: string;
  onInputChange?: (event: React.SyntheticEvent, value: string) => void;
  renderInput?: (parameters: { value?: string; onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void }) => React.ReactNode;
}

interface MockTypographyProps {
  children: React.ReactNode;
}

interface MockMenuItemProps {
  children: React.ReactNode;
  value?: string | number;
}

// Mock the hooks
vi.mock('../useNewWiki', () => ({
  useValidateNewWiki: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock FormComponents with clean implementations
vi.mock('../FormComponents', () => ({
  CreateContainer: ({ children }: MockComponentProps) => <div data-testid='create-container'>{children}</div>,
  LocationPickerContainer: ({ children }: MockComponentProps) => <div data-testid='location-picker-container'>{children}</div>,
  LocationPickerInput: ({ label, value, onChange, error }: MockInputProps) => (
    <div data-testid='location-picker-input'>
      <label>{label}</label>
      <input
        value={value || ''}
        onChange={onChange}
        data-error={error}
      />
    </div>
  ),
  LocationPickerButton: ({ children, onClick }: MockButtonProps) => (
    <button data-testid='location-picker-button' onClick={onClick}>
      {children}
    </button>
  ),
  SoftLinkToMainWikiSelect: ({ children, label, value, onChange }: MockSelectProps) => (
    <div data-testid='soft-link-select'>
      <label>{label}</label>
      <select value={value} onChange={onChange}>
        {children}
      </select>
    </div>
  ),
  SubWikiTagAutoComplete: ({ value, onInputChange, renderInput }: MockAutocompleteProps) => {
    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onInputChange?.(event, event.target.value);
    };
    return (
      <div data-testid='tag-autocomplete'>
        {renderInput?.({
          value,
          onChange: handleInputChange,
        })}
      </div>
    );
  },
}));

// Mock Material-UI
vi.mock('@mui/material', () => ({
  Typography: ({ children }: MockTypographyProps) => <span>{children}</span>,
  MenuItem: ({ children, value }: MockMenuItemProps) => <option value={value}>{children}</option>,
}));

// Simple mock form
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
    } as IWorkspace,
  ],
  fileSystemPaths: [
    { tagName: 'TagA', folderName: 'FolderA' } as ISubWikiPluginContent,
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

interface IMockProps {
  form: IWikiWorkspaceForm;
  isCreateMainWorkspace: boolean;
  isCreateSyncedWorkspace: boolean;
  errorInWhichComponent: IErrorInWhichComponent;
  errorInWhichComponentSetter: Mock;
}

const createMockProps = (overrides: Partial<IMockProps> = {}): IMockProps => ({
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
    // Mock window.service.native for testing - using simple any type to avoid IPC proxy type conflicts
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      service: {
        native: {
          pickDirectory: vi.fn().mockResolvedValue(['/test/path']),
        },
      },
    };
  });

  describe('Basic Rendering Tests', () => {
    test('should render basic elements for main workspace form', () => {
      const props = createMockProps({
        isCreateMainWorkspace: true,
      });

      render(<NewWikiForm {...props} />);

      expect(screen.getByText('AddWorkspace.WorkspaceParentFolder')).toBeInTheDocument();
      expect(screen.getByText('AddWorkspace.WorkspaceFolderNameToCreate')).toBeInTheDocument();
      expect(screen.getByText('AddWorkspace.Choose')).toBeInTheDocument();

      // Main workspace should not show sub workspace related fields
      expect(screen.queryByText('AddWorkspace.MainWorkspaceLocation')).not.toBeInTheDocument();
      expect(screen.queryByText('AddWorkspace.TagName')).not.toBeInTheDocument();
    });

    test('should render complete elements for sub workspace form', () => {
      const props = createMockProps({
        isCreateMainWorkspace: false,
      });

      render(<NewWikiForm {...props} />);

      expect(screen.getByText('AddWorkspace.WorkspaceParentFolder')).toBeInTheDocument();
      expect(screen.getByText('AddWorkspace.WorkspaceFolderNameToCreate')).toBeInTheDocument();
      expect(screen.getByText('AddWorkspace.MainWorkspaceLocation')).toBeInTheDocument();
      expect(screen.getByText('AddWorkspace.TagName')).toBeInTheDocument();
    });

    test('should display correct form field values', () => {
      const form = createMockForm({
        parentFolderLocation: '/custom/path',
        wikiFolderName: 'my-wiki',
      });

      const props = createMockProps({
        form,
        isCreateMainWorkspace: false,
      });

      render(<NewWikiForm {...props} />);

      expect(screen.getByDisplayValue('/custom/path')).toBeInTheDocument();
      expect(screen.getByDisplayValue('my-wiki')).toBeInTheDocument();
    });
  });

  describe('User Interaction Tests', () => {
    test('should handle parent folder path input change', () => {
      const mockSetter = vi.fn();
      const form = createMockForm({
        parentFolderLocationSetter: mockSetter,
      });

      const props = createMockProps({ form });

      render(<NewWikiForm {...props} />);

      const input = screen.getByDisplayValue('/test/parent');
      fireEvent.change(input, { target: { value: '/new/path' } });

      expect(mockSetter).toHaveBeenCalledWith('/new/path');
    });

    test('should handle wiki folder name input change', () => {
      const mockSetter = vi.fn();
      const form = createMockForm({
        wikiFolderNameSetter: mockSetter,
      });

      const props = createMockProps({ form });

      render(<NewWikiForm {...props} />);

      const input = screen.getByDisplayValue('test-wiki');
      fireEvent.change(input, { target: { value: 'new-wiki-name' } });

      expect(mockSetter).toHaveBeenCalledWith('new-wiki-name');
    });
  });

  describe('Conditional Rendering Tests', () => {
    test('should not show sub workspace fields in main workspace mode', () => {
      const props = createMockProps({
        isCreateMainWorkspace: true,
      });

      render(<NewWikiForm {...props} />);

      expect(screen.queryByText('AddWorkspace.MainWorkspaceLocation')).not.toBeInTheDocument();
      expect(screen.queryByText('AddWorkspace.TagName')).not.toBeInTheDocument();
    });

    test('should show all fields in sub workspace mode', () => {
      const props = createMockProps({
        isCreateMainWorkspace: false,
      });

      render(<NewWikiForm {...props} />);

      expect(screen.getByText('AddWorkspace.WorkspaceParentFolder')).toBeInTheDocument();
      expect(screen.getByText('AddWorkspace.WorkspaceFolderNameToCreate')).toBeInTheDocument();
      expect(screen.getByText('AddWorkspace.MainWorkspaceLocation')).toBeInTheDocument();
      expect(screen.getByText('AddWorkspace.TagName')).toBeInTheDocument();
    });
  });
});
