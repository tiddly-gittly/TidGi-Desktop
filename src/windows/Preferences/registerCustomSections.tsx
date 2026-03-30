/**
 * Wires custom section components and custom item components to their definitions.
 * Call once at app startup (before rendering Preferences).
 */
import { sectionById } from '@services/preferences/definitions/registry';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { type ComponentType, lazy, type LazyExoticComponent, Suspense } from 'react';
import { registerCustomComponent } from './customComponentRegistry';
import { LanguageSelectorItem } from './customItems/LanguageSelectorItem';
import { NotificationHelpTextItem, NotificationTestItem } from './customItems/NotificationItems';
import { NotificationScheduleItem } from './customItems/NotificationScheduleItem';
import { OpenAtLoginItem } from './customItems/OpenAtLoginItem';
import { SpellcheckLanguagesItem } from './customItems/SpellcheckLanguagesItem';
import { WikiUserNameItem } from './customItems/WikiUserNameItem';

// ─── Lazy-loaded section-level custom components (very complex sections) ──
const LazyExternalAPISection = lazy(() => import('./sections/ExternalAPI').then((m) => ({ default: m.ExternalAPI })));
const LazyAIAgentSection = lazy(() => import('./sections/AIAgent').then((m) => ({ default: m.AIAgent })));
const LazySearchSection = lazy(() => import('./sections/Search').then((m) => ({ default: m.Search })));
const LazyDeveloperToolsSection = lazy(() => import('./sections/DeveloperTools').then((m) => ({ default: m.DeveloperTools })));
const LazySyncSection = lazy(() => import('./sections/Sync').then((m) => ({ default: m.Sync })));
const LazyTidGiMiniWindowSection = lazy(() => import('./sections/TidGiMiniWindow').then((m) => ({ default: m.TidGiMiniWindow })));

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
  registerSection('search', LazySearchSection);
  registerSection('developers', LazyDeveloperToolsSection);
  registerSection('sync', LazySyncSection);
  registerSection('tidgiMiniWindow', LazyTidGiMiniWindowSection);

  // Item-level custom components (small self-contained widgets)
  registerCustomComponent('system.openAtLogin', OpenAtLoginItem);
  registerCustomComponent('wiki.userName', WikiUserNameItem);
  registerCustomComponent('languages.selector', LanguageSelectorItem);
  registerCustomComponent('languages.spellcheckLanguages', SpellcheckLanguagesItem);
  registerCustomComponent('notifications.schedule', NotificationScheduleItem);
  registerCustomComponent('notifications.test', NotificationTestItem);
  registerCustomComponent('notifications.helpText', NotificationHelpTextItem);
}
