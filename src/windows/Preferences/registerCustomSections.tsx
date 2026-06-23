/**
 * Wires custom section components and custom item components to their definitions.
 * Call once at app startup (before rendering Preferences).
 */
import { sectionById } from '@services/preferences/definitions/registry';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { type ComponentType, lazy, type LazyExoticComponent, Suspense } from 'react';
import { registerCustomComponent } from './customComponentRegistry';
import { DeviceNetworkPanelItem } from './customItems/DeviceNetworkItems';
import { DeveloperDiagPanelItem, DeveloperExternalApiItem, DeveloperMcpVsCodeUrlItem } from './customItems/DeveloperToolsItems';
import { LanguageSelectorItem } from './customItems/LanguageSelectorItem';
import { NotificationHelpTextItem, NotificationTestItem } from './customItems/NotificationItems';
import { NotificationScheduleItem } from './customItems/NotificationScheduleItem';
import { OpenAtLoginItem } from './customItems/OpenAtLoginItem';
import { SpellcheckLanguagesItem } from './customItems/SpellcheckLanguagesItem';
import { SyncAiTimeoutItem, SyncIntervalItem, SyncMoreSettingsItem, SyncTokenFormItem } from './customItems/SyncItems';
import { TidGiMiniWindowAdvancedSettingsItem, TidGiMiniWindowMainToggleItem } from './customItems/TidGiMiniWindowItems';
import { WikiUserNameItem } from './customItems/WikiUserNameItem';
import { WorkspaceGroupsItem } from './customItems/WorkspaceGroupsItem';

// ─── Lazy-loaded section-level custom components (very complex sections) ──
const LazyExternalAPISection = lazy(() => import('./sections/ExternalAPI').then((m) => ({ default: m.ExternalAPI })));
const LazyAIAgentSection = lazy(() => import('./sections/AIAgent').then((m) => ({ default: m.AIAgent })));

function wrapWithSuspense(LazyComponent: LazyExoticComponent<ComponentType<ICustomSectionProps>>): ComponentType<ICustomSectionProps> {
  return function SuspenseWrapper(props: ICustomSectionProps) {
    return (
      <Suspense fallback={<div />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

let registered = false;

export function registerCustomSections(): void {
  if (registered) return;
  registered = true;

  // Section-level custom components (dialogs, tables, polling, etc.)
  const registerSection = (sectionId: string, component: LazyExoticComponent<ComponentType<ICustomSectionProps>>) => {
    const section = sectionById.get(sectionId);
    if (section) {
      section.CustomSectionComponent = wrapWithSuspense(component);
    }
  };
  registerSection('externalAPI', LazyExternalAPISection);
  registerSection('aiAgent', LazyAIAgentSection);

  // Item-level custom components (small self-contained widgets)
  registerCustomComponent('system.openAtLogin', OpenAtLoginItem);
  registerCustomComponent('wiki.userName', WikiUserNameItem);
  registerCustomComponent('languages.selector', LanguageSelectorItem);
  registerCustomComponent('languages.spellcheckLanguages', SpellcheckLanguagesItem);
  registerCustomComponent('developers.diagPanel', DeveloperDiagPanelItem);
  registerCustomComponent('developers.mcpVsCodeUrl', DeveloperMcpVsCodeUrlItem);
  registerCustomComponent('developers.externalApi', DeveloperExternalApiItem);
  registerCustomComponent('network.deviceNetworkPanel', DeviceNetworkPanelItem);
  registerCustomComponent('sync.tokenForm', SyncTokenFormItem);
  registerCustomComponent('sync.interval', SyncIntervalItem);
  registerCustomComponent('sync.aiTimeout', SyncAiTimeoutItem);
  registerCustomComponent('sync.moreSettings', SyncMoreSettingsItem);
  registerCustomComponent('tidgiMiniWindow.mainToggle', TidGiMiniWindowMainToggleItem);
  registerCustomComponent('tidgiMiniWindow.advancedSettings', TidGiMiniWindowAdvancedSettingsItem);
  registerCustomComponent('notifications.schedule', NotificationScheduleItem);
  registerCustomComponent('notifications.test', NotificationTestItem);
  registerCustomComponent('notifications.helpText', NotificationHelpTextItem);
  registerCustomComponent('workspaceGroups.management', WorkspaceGroupsItem);
}
