import { PreferenceSections } from '@/services/preferences/interface';
import type { AgentRunErrorSettingTarget } from 'memeloop';

/** Map Core's canonical error target to one safe Desktop preferences deep link. */
export function buildAgentRunErrorSettingsDeepLink(
  scheme: 'tidgi' | 'tidgi-test',
  target?: AgentRunErrorSettingTarget,
): string {
  const section = target?.kind === 'runtime'
    ? target.section === 'network'
      ? PreferenceSections.network
      : PreferenceSections.aiAgent
    : PreferenceSections.externalAPI;
  const url = new URL(`${scheme}://preferences/${section}`);
  if (target?.kind === 'provider') {
    url.searchParams.set('provider', target.providerId);
    url.searchParams.set('field', target.field);
  } else if (target?.kind === 'model') {
    url.searchParams.set('provider', target.providerId);
    url.searchParams.set('model', target.modelId);
    url.searchParams.set('field', 'model');
  }
  return url.toString();
}

export async function openAgentRunErrorSettings(target?: AgentRunErrorSettingTarget): Promise<void> {
  const isTestMode = await window.service.context.get('isTest');
  await window.service.deepLink.openDeepLink(
    buildAgentRunErrorSettingsDeepLink(isTestMode ? 'tidgi-test' : 'tidgi', target),
  );
}

/** Shared Desktop shell action: preserve Core's exact target instead of collapsing every error to one settings page. */
export async function handleDesktopAgentErrorAction(presentation: { settingTarget?: AgentRunErrorSettingTarget }): Promise<void> {
  if (presentation.settingTarget === undefined) return;
  await openAgentRunErrorSettings(presentation.settingTarget);
}
