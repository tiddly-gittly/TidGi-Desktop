import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  language: 'en-US',
  scheduledTaskEditor: vi.fn<(properties: Record<string, unknown>) => void>(),
  translate: (key: string, parameters?: { agentName?: string; returnObjects?: boolean }) =>
    key === 'EditAgent.ScheduleCronLocale' && parameters?.returnObjects
      ? { cronDescriptionText: 'fr' }
      : parameters?.agentName
      ? `${key}:${parameters.agentName}`
      : key,
}));

vi.mock('@memeloop/react-ui/agent/scheduling', () => ({
  ScheduledTaskEditor: (properties: Record<string, unknown>) => {
    mocks.scheduledTaskEditor(properties);
    return null;
  },
}));

vi.mock('@/pages/Agent/adapters/DesktopScheduledTaskClient', () => ({
  createDesktopScheduledTaskClient: () => ({ kind: 'test-client' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: mocks.language, resolvedLanguage: mocks.language },
    t: mocks.translate,
  }),
}));

import { ScheduledWakeupEditor } from '../ScheduledWakeupEditor';

const mutableService = window.service as unknown as Record<string, unknown>;
const originalAgentInstance = mutableService.agentInstance;
const originalDeviceNetwork = mutableService.deviceNetwork;

const agentDefinition = { id: 'definition-1', name: 'Assistant' } as never;

describe('ScheduledWakeupEditor durable conversation binding', () => {
  beforeEach(() => {
    mocks.language = 'en-US';
    mocks.scheduledTaskEditor.mockClear();
  });

  afterEach(() => {
    mutableService.agentInstance = originalAgentInstance;
    mutableService.deviceNetwork = originalDeviceNetwork;
    vi.restoreAllMocks();
  });

  it('fails closed when the secure device identity is unavailable', async () => {
    mutableService.deviceNetwork = undefined;
    mutableService.agentInstance = {};

    render(<ScheduledWakeupEditor agentDefinition={agentDefinition} />);

    expect(screen.getByText('EditAgent.ScheduleIdentityLoading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('EditAgent.ScheduleIdentityError')).toBeInTheDocument());
    expect(mocks.scheduledTaskEditor).not.toHaveBeenCalled();
  });

  it('guides the user to a durable conversation and never schedules a volatile preview', async () => {
    mutableService.deviceNetwork = {
      getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'peer-local' }),
      listDevices: vi.fn().mockResolvedValue([]),
    };
    mutableService.agentInstance = {
      getAgentConversationListPage: vi.fn().mockResolvedValue({
        reset: false,
        items: [],
        revision: '1',
        total: 0,
        hasMoreBefore: false,
        hasMoreAfter: false,
      }),
    };

    render(<ScheduledWakeupEditor agentDefinition={agentDefinition} />);

    await waitFor(() => expect(screen.getByText('EditAgent.ScheduleConversationRequired')).toBeInTheDocument());
    expect(mocks.scheduledTaskEditor).not.toHaveBeenCalled();
  });

  it('binds the shared editor to a durable conversation, authenticated PeerId, and host locale', async () => {
    mocks.language = 'fr-FR';
    mutableService.deviceNetwork = {
      getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'peer-local' }),
      listDevices: vi.fn().mockResolvedValue([{
        displayName: 'Remote Mac',
        peerId: 'peer-remote',
        reachability: { state: 'online' },
        trusted: true,
      }, {
        displayName: 'Unpaired CLI',
        peerId: 'peer-unpaired',
        reachability: { state: 'online' },
        trusted: false,
      }]),
    };
    mutableService.agentInstance = {
      getAgentConversationListPage: vi.fn().mockResolvedValue({
        reset: false,
        items: [{
          conversationId: 'durable-conversation',
          title: 'Durable chat',
          definitionId: 'definition-1',
          lastMessagePreview: '',
          lastMessageTimestamp: 1,
          messageCount: 1,
          originNodeId: 'peer-local',
          originClock: 1,
          isUserInitiated: true,
        }],
        revision: '1',
        total: 1,
        hasMoreBefore: false,
        hasMoreAfter: false,
      }),
    };

    render(<ScheduledWakeupEditor agentDefinition={agentDefinition} />);

    await waitFor(() => {
      expect(mocks.scheduledTaskEditor).toHaveBeenCalled();
    });
    const properties = mocks.scheduledTaskEditor.mock.calls.at(-1)?.[0];
    expect(properties).toMatchObject({
      agentInstanceId: 'durable-conversation',
      customLocale: expect.objectContaining({ cronDescriptionText: 'fr' }),
      dateLocale: 'fr-FR',
      executionTargets: [
        { id: 'peer-local', label: 'Chat.ExecutionTarget.ThisDevice' },
        { disabled: false, id: 'peer-remote', label: 'Remote Mac' },
      ],
      localNodeId: 'peer-local',
      locale: 'en',
    });
    const labels = properties?.labels as { defaultTaskName?: (name: string) => string; defaultMessage?: string } | undefined;
    expect(labels?.defaultTaskName?.('Assistant')).toBe('EditAgent.ScheduleDefaultTaskName:Assistant');
    expect(labels?.defaultMessage).toBe('EditAgent.ScheduleMessagePlaceholder');
  });
});
