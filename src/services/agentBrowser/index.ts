import { inject, injectable } from 'inversify';
import { pick } from 'lodash';

import { DataSource, Equal, Not, Repository } from 'typeorm';

import { TEMP_TAB_ID_PREFIX } from '@/pages/Agent/constants/tab';
import { TabCloseDirection } from '@/pages/Agent/store/tabStore/types';
import { logger } from '@services/libs/log';
import { nanoid } from 'nanoid';
import { BehaviorSubject } from 'rxjs';
import { ITab, TabItem, TabState, TabType } from '../../pages/Agent/types/tab';
import { IDatabaseService } from '../database/interface';
import { AgentBrowserTabEntity } from '../database/schema/agentBrowser';
import serviceIdentifier from '../serviceIdentifier';
import { IAgentBrowserService } from './interface';

const MAX_CLOSED_TABS = 10;

@injectable()
export class AgentBrowserService implements IAgentBrowserService {
  /**
   * Observable stream of tabs data that can be used by UI components
   */
  public tabs$ = new BehaviorSubject<TabItem[]>([]);

  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  private dataSource: DataSource | null = null;
  private tabRepository: Repository<AgentBrowserTabEntity> | null = null;

  /**
   * Update the tabs$ BehaviorSubject with the latest tabs from the database
   * This method is called after any operation that modifies tabs
   */
  public async updateTabsObservable(): Promise<void> {
    const tabs = await this.getAllTabs();
    this.tabs$.next(tabs);
  }

  /**
   * Initialize the service on application startup
   */
  public async initialize(): Promise<void> {
    try {
      // Get repositories
      this.dataSource = await this.databaseService.getDatabase('agent');
      this.tabRepository = this.dataSource.getRepository(AgentBrowserTabEntity);
      logger.debug('Agent browser repository initialized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize agent browser service: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Ensure repository is initialized
   */
  private ensureRepositories(): void {
    if (!this.tabRepository) {
      throw new Error('Agent browser repository not initialized');
    }
  }

  /**
   * Convert database entity to TabItem
   */
  private entityToTabItem(entity: AgentBrowserTabEntity): TabItem {
    const baseTab: ITab = {
      id: entity.id,
      type: entity.tabType,
      title: entity.title,
      state: entity.state,
      isPinned: entity.isPinned,
      createdAt: new Date(entity.created).getTime(),
      updatedAt: new Date(entity.modified).getTime(),
    };

    // Add type-specific data from the data JSON field
    const data = entity.data || {};

    switch (entity.tabType) {
      case TabType.WEB:
        return {
          ...baseTab,
          type: TabType.WEB,
          url: data.url as string || 'about:blank',
          favicon: data.favicon as string | undefined,
        };
      case TabType.CHAT:
        return {
          ...baseTab,
          type: TabType.CHAT,
          agentId: data.agentId as string | undefined,
          agentDefId: data.agentDefId as string | undefined,
        };
      case TabType.NEW_TAB:
        return {
          ...baseTab,
          type: TabType.NEW_TAB,
          favorites: data.favorites as Array<{
            id: string;
            title: string;
            url: string;
            favicon?: string;
          }> || [],
        };
      case TabType.SPLIT_VIEW:
        return {
          ...baseTab,
          type: TabType.SPLIT_VIEW,
          childTabs: data.childTabs as TabItem[] || [],
          splitRatio: data.splitRatio as number || 50,
        };
      default:
        return baseTab as TabItem;
    }
  }

  /**
   * Convert TabItem to database entity
   */
  private tabItemToEntity(tab: TabItem, position?: number): AgentBrowserTabEntity {
    const entity = new AgentBrowserTabEntity();
    entity.id = tab.id || nanoid();
    entity.tabType = tab.type;
    entity.title = tab.title;
    entity.state = tab.state;
    entity.isPinned = tab.isPinned;
    entity.position = position ?? 0;
    entity.opened = true; // New tabs are always opened by default

    // Extract type-specific data into the data JSON field
    switch (tab.type) {
      case TabType.WEB: {
        const webTab = tab as { url: string; favicon?: string };
        entity.data = {
          url: webTab.url,
          favicon: webTab.favicon,
        };
        break;
      }
      case TabType.CHAT: {
        const chatTab = tab as { agentId?: string; agentDefId?: string };
        entity.data = {
          agentId: chatTab.agentId,
          agentDefId: chatTab.agentDefId,
        };
        break;
      }
      case TabType.NEW_TAB: {
        const newTab = tab as { favorites?: Array<{ id: string; title: string; url: string; favicon?: string }> };
        entity.data = {
          favorites: newTab.favorites || [],
        };
        break;
      }
      case TabType.SPLIT_VIEW: {
        const splitViewTab = tab as { childTabs: TabItem[]; splitRatio: number };
        entity.data = {
          childTabs: splitViewTab.childTabs || [],
          splitRatio: splitViewTab.splitRatio || 50,
        };
        break;
      }
    }

    return entity;
  }

  /**
   * Get all open tabs
   */
  public async getAllTabs(): Promise<TabItem[]> {
    this.ensureRepositories();

    try {
      // Get all open tabs ordered by position
      const entities = await this.tabRepository!.find({
        where: { opened: true },
        order: { position: 'ASC' },
      });

      // Convert entities to TabItems
      return entities.map(entity => this.entityToTabItem(entity));
    } catch (error) {
      logger.error(`Failed to get tabs: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get active tab ID
   */
  public async getActiveTabId(): Promise<string | null> {
    this.ensureRepositories();

    try {
      // Find tab with active state among opened tabs
      const activeTab = await this.tabRepository!.findOne({
        where: { state: TabState.ACTIVE, opened: true },
      });

      return activeTab?.id || null;
    } catch (error) {
      logger.error(`Failed to get active tab: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Set active tab
   */
  public async setActiveTab(tabId: string): Promise<void> {
    this.ensureRepositories();

    try {
      // Check if tab exists and is open
      const tabToActivate = await this.tabRepository!.findOne({
        where: { id: tabId, opened: true },
      });

      // If tab doesn't exist or isn't open, log and return
      if (!tabToActivate) {
        logger.warn(`Cannot activate tab ${tabId}: tab not found or not open`);
        return;
      }

      // Set all open tabs to inactive
      await this.tabRepository!.update({ opened: true }, { state: TabState.INACTIVE });

      // Set the specified tab to active
      await this.tabRepository!.update({ id: tabId, opened: true }, { state: TabState.ACTIVE });
      await this.updateTabsObservable();

      logger.debug(`Activated tab ${tabId}`);
    } catch (error) {
      logger.error(`Failed to set active tab: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Add new tab
   */
  public async addTab(tab: TabItem, position?: number): Promise<TabItem> {
    this.ensureRepositories();

    try {
      // Check if this is a temporary tab, ignore it because temporary tabs only exists on frontend.
      const isTemporary = tab.id.startsWith(TEMP_TAB_ID_PREFIX);
      if (isTemporary) {
        return tab;
      }

      // If adding an active tab, deactivate all other tabs
      if (tab.state === TabState.ACTIVE) {
        await this.tabRepository!.update({ opened: true }, { state: TabState.INACTIVE });
      }

      // Find the highest position for insertion if not specified
      let finalPosition = position;
      if (finalPosition === undefined) {
        const lastTab = await this.tabRepository!.findOne({
          where: { opened: true },
          order: { position: 'DESC' },
        });
        finalPosition = lastTab ? lastTab.position + 1 : 0;
      }

      // Convert tab to entity and save
      const entity = this.tabItemToEntity(tab, finalPosition);
      await this.tabRepository!.save(entity);

      // Get the saved tab
      const savedTab = this.entityToTabItem(entity);
      await this.updateTabsObservable();

      return savedTab;
    } catch (error) {
      logger.error(`Failed to add tab: ${error as Error}`);
      throw error;
    }
  }

  /**
   * Update tab data
   */
  public async updateTab(tabId: string, data: Partial<TabItem>): Promise<void> {
    this.ensureRepositories();

    try {
      // Get existing tab (only open tabs can be updated)
      const existingTab = await this.tabRepository!.findOne({
        where: { id: tabId, opened: true },
      });

      if (!existingTab) {
        throw new Error(`Tab not found: ${tabId}`);
      }

      // Handle changing state to active
      if (data.state === TabState.ACTIVE) {
        await this.tabRepository!.update({ opened: true }, { state: TabState.INACTIVE });
      }

      // Update base tab properties
      const baseProperties = pick(data, ['title', 'state', 'isPinned']);
      Object.assign(existingTab, baseProperties);

      // Update type-specific data in the data JSON field
      if (existingTab.data === undefined) {
        existingTab.data = {};
      }

      switch (existingTab.tabType) {
        case TabType.WEB: {
          const webData = pick(data, ['url', 'favicon']);
          Object.assign(existingTab.data, webData);
          break;
        }
        case TabType.CHAT: {
          const chatData = pick(data, ['agentId', 'agentDefId']);
          Object.assign(existingTab.data, chatData);
          break;
        }
        case TabType.NEW_TAB: {
          const newTabData = pick(data, ['favorites']);
          Object.assign(existingTab.data, newTabData);
          break;
        }
        case TabType.SPLIT_VIEW: {
          const splitViewData = pick(data, ['childTabs', 'splitRatio']);
          Object.assign(existingTab.data, splitViewData);
          break;
        }
      }

      await this.tabRepository!.save(existingTab);
      await this.updateTabsObservable();
    } catch (error) {
      logger.error(`Failed to update tab: ${error as Error}`);
      throw error;
    }
  }

  /**
   * Close tab by ID
   */
  public async closeTab(tabId: string): Promise<void> {
    this.ensureRepositories();

    try {
      const tabToClose = await this.tabRepository!.findOne({
        where: { id: tabId, opened: true },
      });
      if (!tabToClose) {
        return;
      }

      // Special handling for temporary tabs - if it's a temp tab, we might want to fully delete it, because it is a mistake that save it to the db.
      const isTemporaryTab = tabId.startsWith(TEMP_TAB_ID_PREFIX);

      /** New tab when closed, delete it from the database, because it could be created via new tab button at any time, not much value */
      const isNewTab = tabToClose.tabType === TabType.NEW_TAB;

      const isSplitView = tabToClose.tabType === TabType.SPLIT_VIEW;
      const isEmptySplitView = isSplitView &&
        tabToClose.data &&
        Array.isArray(tabToClose.data.childTabs) &&
        tabToClose.data.childTabs.length === 0;

      if (isTemporaryTab || isNewTab || isEmptySplitView) {
        // For tabs that are easy to create, useless for closed-tab-history, like NEW_TAB type, or empty split views, we just remove them completely
        const tabTypeLog = isTemporaryTab ? 'temporary' : isNewTab ? 'new tab' : 'empty split view';
        logger.debug(`Removing tab: ${tabId} (${tabTypeLog})`);
        await this.tabRepository!.remove(tabToClose);
      } else {
        // For regular tabs, mark as closed and keep in history
        tabToClose.opened = false;
        tabToClose.closedAt = new Date();
        await this.tabRepository!.save(tabToClose);

        // If the closed tab was active, make another tab active
        if (tabToClose.state === TabState.ACTIVE) {
          tabToClose.state = TabState.INACTIVE;
          await this.tabRepository!.save(tabToClose);
          // Try to activate another open tab
          const nextTab = await this.tabRepository!.findOne({
            where: { opened: true },
            order: { position: 'ASC' },
          });

          if (nextTab) {
            await this.tabRepository!.update({ id: nextTab.id }, { state: TabState.ACTIVE });
          }
        }
      }

      // Reindex positions to ensure consistency for open tabs
      await this.reindexTabPositions();
      await this.updateTabsObservable();
    } catch (error) {
      logger.error(`Failed to close tab: ${error instanceof Error ? `${error.message} ${error.stack}` : String(error)}`);
      throw error;
    }
  }

  /**
   * Close multiple tabs based on direction
   */
  public async closeTabs(direction: TabCloseDirection, fromTabId: string): Promise<void> {
    this.ensureRepositories();

    try {
      // Get reference tab
      const referenceTab = await this.tabRepository!.findOne({
        where: { id: fromTabId, opened: true },
      });

      if (!referenceTab) {
        return;
      }

      // Get all open tabs ordered by position
      const allTabs = await this.tabRepository!.find({
        where: { opened: true },
        order: { position: 'ASC' },
      });

      // Find index of reference tab
      const referenceIndex = allTabs.findIndex(tab => tab.id === fromTabId);
      if (referenceIndex === -1) return;

      // Determine tabs to close based on direction
      const tabsToClose: AgentBrowserTabEntity[] = [];

      allTabs.forEach((tab, index) => {
        // Never close pinned tabs
        if (tab.isPinned) {
          return;
        }

        switch (direction) {
          case 'above':
            if (index < referenceIndex) {
              tabsToClose.push(tab);
            }
            break;
          case 'below':
            if (index > referenceIndex) {
              tabsToClose.push(tab);
            }
            break;
          case 'other':
            if (index !== referenceIndex) {
              tabsToClose.push(tab);
            }
            break;
        }
      });

      // Close each tab
      for (const tab of tabsToClose) {
        await this.closeTab(tab.id);
      }
    } catch (error) {
      logger.error(`Failed to close tabs: ${error as Error}`);
      throw error;
    }
  }

  /**
   * Pin or unpin tab
   */
  public async pinTab(tabId: string, isPinned: boolean): Promise<void> {
    this.ensureRepositories();

    try {
      await this.tabRepository!.update({ id: tabId, opened: true }, { isPinned });
      await this.reindexTabPositions();
      await this.updateTabsObservable();
    } catch (error) {
      logger.error(`Failed to pin tab: ${error as Error}`);
      throw error;
    }
  }

  /**
   * Get closed tabs
   */
  public async getClosedTabs(limit = MAX_CLOSED_TABS): Promise<TabItem[]> {
    this.ensureRepositories();

    try {
      const closedTabs = await this.tabRepository!.find({
        where: { opened: false },
        order: { closedAt: 'DESC' },
        take: limit,
      });

      return closedTabs.map(entity => this.entityToTabItem(entity));
    } catch (error) {
      logger.error(`Failed to get closed tabs: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Restore the most recently closed tab
   */
  public async restoreClosedTab(): Promise<TabItem | null> {
    this.ensureRepositories();

    try {
      // Get most recently closed tab
      const closedTab = await this.tabRepository!.findOne({
        where: { opened: false },
        order: { closedAt: 'DESC' },
      });

      if (!closedTab) {
        return null;
      }

      // Reopen the tab by setting opened flag to true
      closedTab.opened = true;
      closedTab.closedAt = undefined; // Clear the closed timestamp
      closedTab.state = TabState.ACTIVE; // Make the tab active

      // Deactivate all other tabs
      await this.tabRepository!.update(
        { id: Not(Equal(closedTab.id)), opened: true },
        { state: TabState.INACTIVE },
      );

      // Save the reopened tab
      await this.tabRepository!.save(closedTab);

      // Reindex positions
      await this.reindexTabPositions();
      await this.updateTabsObservable();

      // Return the restored tab item
      return this.entityToTabItem(closedTab);
    } catch (error) {
      logger.error(`Failed to restore closed tab: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Reindex tab positions to ensure consistency
   * Pinned tabs come first, followed by unpinned tabs
   */
  private async reindexTabPositions(): Promise<void> {
    try {
      // Get only open tabs
      const allTabs = await this.tabRepository!.find({
        where: { opened: true },
      });

      // Separate pinned and unpinned tabs
      const pinnedTabs = allTabs.filter(tab => tab.isPinned);
      const unpinnedTabs = allTabs.filter(tab => !tab.isPinned);

      // Update positions
      let position = 0;

      // Update pinned tabs first
      for (const tab of pinnedTabs) {
        tab.position = position++;
      }

      // Then update unpinned tabs
      for (const tab of unpinnedTabs) {
        tab.position = position++;
      }

      // Save all tabs
      await this.tabRepository!.save([...pinnedTabs, ...unpinnedTabs]);

      // Note: We don't need to update tabs$ here because this is a private method,
      // and all public methods that call this already update tabs$ afterwards
    } catch (error) {
      logger.error(`Failed to reindex tab positions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
