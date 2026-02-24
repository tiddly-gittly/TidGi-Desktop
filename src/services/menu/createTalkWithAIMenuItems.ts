import { IAskAIWithSelectionData, WindowChannel } from '@/constants/channels';
import type { AgentDefinition, IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { MenuItemConstructorOptions } from 'electron';
import type { TFunction } from 'i18next';

interface ICreateTalkWithAIMenuItemsOptions {
  /** Agent definition service to get available agents */
  agentDefinitionService: Pick<IAgentDefinitionService, 'getAgentDef' | 'getAgentDefs'>;
  /** Selected text to send to AI (empty string if none) */
  selectionText: string;
  /** Translation function */
  t: TFunction;
  /** Wiki URL for context */
  wikiUrl?: string;
  /** Window service to get main window. Only used when onTrigger is not provided (main-process path). */
  windowService: Pick<IWindowService, 'get'>;
  /** Workspace ID for context */
  workspaceId?: string;
  /**
   * Optional callback invoked instead of the default IPC-send when the click handler runs in the renderer process.
   * When provided, windowService.get() is never called, which avoids the non-serialisable BrowserWindow issue.
   */
  onTrigger?: (data: IAskAIWithSelectionData) => void;
}

/**
 * Create "Talk with AI" menu items with default agent and other agents submenu
 * This is shared between context menu (page right-click) and workspace menu (workspace icon right-click)
 */
export async function createTalkWithAIMenuItems(
  options: ICreateTalkWithAIMenuItemsOptions,
): Promise<MenuItemConstructorOptions[]> {
  const { agentDefinitionService, selectionText, t, wikiUrl, windowService, workspaceId, onTrigger } = options;

  // Get all agent definitions
  const defaultAgentDefinition = await agentDefinitionService.getAgentDef(); // No parameter = default agent
  const allAgentDefinitions = await agentDefinitionService.getAgentDefs();
  const otherAgentDefinitions = allAgentDefinitions.filter((definition: AgentDefinition) => definition.id !== defaultAgentDefinition?.id);

  const menuItems: MenuItemConstructorOptions[] = [];

  const sendData = (data: IAskAIWithSelectionData): void => {
    if (onTrigger) {
      // Renderer-side path: delegate to the provided callback (avoids non-serialisable BrowserWindow via IPC).
      onTrigger(data);
    } else {
      // Main-process path: send to the main window renderer via webContents.
      const mainWindow = windowService.get(WindowNames.main);
      if (mainWindow !== undefined) {
        mainWindow.webContents.send(WindowChannel.askAIWithSelection, data);
      }
    }
  };

  // Add menu item for default agent
  menuItems.push({
    id: 'talk-with-ai',
    label: t('ContextMenu.TalkWithAI'),
    click: () => {
      const data: IAskAIWithSelectionData = {
        selectionText,
        wikiUrl,
        workspaceId,
        agentDefId: undefined, // Use default agent
      };
      sendData(data);
    },
  });

  // Add submenu for other agents if there are any
  if (otherAgentDefinitions.length > 0) {
    menuItems.push({
      id: 'talk-with-ai-more',
      label: t('ContextMenu.TalkWithAIMore'),
      submenu: otherAgentDefinitions.map((agentDefinition: AgentDefinition) => ({
        label: agentDefinition.name,
        click: () => {
          const data: IAskAIWithSelectionData = {
            selectionText,
            wikiUrl,
            workspaceId,
            agentDefId: agentDefinition.id,
          };
          sendData(data);
        },
      })),
    });
  }

  return menuItems;
}
