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
  /** Window service to get main window */
  windowService: Pick<IWindowService, 'get'>;
  /** Workspace ID for context */
  workspaceId?: string;
}

/**
 * Create "Talk with AI" menu items with default agent and other agents submenu
 * This is shared between context menu (page right-click) and workspace menu (workspace icon right-click)
 */
export async function createTalkWithAIMenuItems(
  options: ICreateTalkWithAIMenuItemsOptions,
): Promise<MenuItemConstructorOptions[]> {
  const { agentDefinitionService, selectionText, t, wikiUrl, windowService, workspaceId } = options;

  // Get all agent definitions
  const defaultAgentDefinition = await agentDefinitionService.getAgentDef(); // No parameter = default agent
  const allAgentDefinitions = await agentDefinitionService.getAgentDefs();
  const otherAgentDefinitions = allAgentDefinitions.filter((definition: AgentDefinition) => definition.id !== defaultAgentDefinition?.id);

  const menuItems: MenuItemConstructorOptions[] = [];

  // Add menu item for default agent
  menuItems.push({
    id: 'talk-with-ai',
    label: t('ContextMenu.TalkWithAI'),
    click: async () => {
      const data: IAskAIWithSelectionData = {
        selectionText,
        wikiUrl,
        workspaceId,
        agentDefId: undefined, // Use default agent
      };
      // Send to main window
      const mainWindow = windowService.get(WindowNames.main);
      if (mainWindow !== undefined) {
        mainWindow.webContents.send(WindowChannel.askAIWithSelection, data);
      }
    },
  });

  // Add submenu for other agents if there are any
  if (otherAgentDefinitions.length > 0) {
    menuItems.push({
      id: 'talk-with-ai-more',
      label: t('ContextMenu.TalkWithAIMore'),
      submenu: otherAgentDefinitions.map((agentDefinition: AgentDefinition) => ({
        label: agentDefinition.name,
        click: async () => {
          const data: IAskAIWithSelectionData = {
            selectionText,
            wikiUrl,
            workspaceId,
            agentDefId: agentDefinition.id,
          };
          const mainWindow = windowService.get(WindowNames.main);
          if (mainWindow !== undefined) {
            mainWindow.webContents.send(WindowChannel.askAIWithSelection, data);
          }
        },
      })),
    });
  }

  return menuItems;
}
