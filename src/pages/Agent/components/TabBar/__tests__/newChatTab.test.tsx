import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type TabItem as TabData, TabState, TabType } from '../../../types/tab';
import { TabItem } from '../TabItem';
import { TabListDropdown } from '../TabListDropdown';

const { addTab, selectTab, state } = vi.hoisted(() => ({ addTab: vi.fn(), selectTab: vi.fn(), state: { tabs: [] as TabData[] } }));
vi.mock('../../../store/tabStore', () => ({
  useTabStore: () => ({ tabs: state.tabs, hasClosedTabs: () => false, activeTabId: null, addTab, setActiveTab: selectTab, closeTab: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.tabs = [];
  // Global autocomplete mocks replace body listeners; portals need real React event delegation.
  document.body.addEventListener = EventTarget.prototype.addEventListener;
  document.body.removeEventListener = EventTarget.prototype.removeEventListener;
  addTab.mockResolvedValue({ id: 'new-chat', type: TabType.CHAT });
  Object.defineProperty(window, 'service', {
    value: { agentInstance: { listScheduledTasks: vi.fn().mockResolvedValue([]) }, native: { log: vi.fn() } },
  });
});

describe('new chat tab entry points', () => {
  it('starts the default assistant from the vertical plus without choosing an assistant', async () => {
    const view = render(<TabItem tab={{ id: 'new-tab-button', title: 'New chat', type: TabType.NEW_TAB }} isActive={false} isNewTabButton onClick={selectTab} />);
    fireEvent.click(view.container.querySelector('[data-tab-id="new-tab-button"]')!);
    await waitFor(() => {
      expect(addTab).toHaveBeenCalledWith(TabType.CHAT, { agentDefId: 'memeloop:general-assistant' });
    });
    expect(selectTab).not.toHaveBeenCalled();
  });

  it('starts the default assistant from the compact header plus', async () => {
    render(<TabListDropdown />);
    fireEvent.click(screen.getByTestId('new-tab-button'));
    await waitFor(() => {
      expect(addTab).toHaveBeenCalledWith(TabType.CHAT, { agentDefId: 'memeloop:general-assistant' });
    });
  });
  it('keeps assistant management available separately from new chat', async () => {
    render(<TabListDropdown />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('tab-list-button'));
    await user.click(await screen.findByTestId('tab-list-agent-management'));
    await waitFor(() => {
      expect(addTab).toHaveBeenCalledWith(TabType.NEW_TAB);
    });
  });
  it('edits a chat definition from the compact tab dropdown', async () => {
    state.tabs = [{ id: 'chat', type: TabType.CHAT, title: 'Chat', agentDefId: 'custom-assistant', state: TabState.ACTIVE, isPinned: false, createdAt: 1, updatedAt: 1 }];
    render(<TabListDropdown />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('tab-list-button'));
    fireEvent.contextMenu(await screen.findByTestId('tab-list-item-chat'));
    await user.click(await screen.findByTestId('edit-definition-menu-item'));
    await waitFor(() => {
      expect(addTab).toHaveBeenCalledWith(TabType.EDIT_AGENT_DEFINITION, { agentDefId: 'custom-assistant' });
    });
  });
});
