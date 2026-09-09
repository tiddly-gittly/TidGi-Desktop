import { createInstance, type i18n } from 'i18next';
import agentEnglish from '../../../../../localization/locales/en/agent.json';
import agentFrench from '../../../../../localization/locales/fr/agent.json';
import agentJapanese from '../../../../../localization/locales/ja/agent.json';
import agentRussian from '../../../../../localization/locales/ru/agent.json';
import agentSimplifiedChinese from '../../../../../localization/locales/zh-Hans/agent.json';
import agentTraditionalChinese from '../../../../../localization/locales/zh-Hant/agent.json';

/**
 * A Wiki renderer is a separate WebContents and does not inherit the Desktop
 * renderer's react-i18next provider. Keep an isolated, resource-only instance
 * for structured AgentRunError messages; it performs no filesystem or IPC
 * loading and is synchronously ready before the first TiddlyWiki widget root.
 */
export const wikiAgentI18n: i18n = createInstance();

void wikiAgentI18n.init({
  defaultNS: 'agent',
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
  resources: {
    en: { agent: agentEnglish },
    fr: { agent: agentFrench },
    ja: { agent: agentJapanese },
    ru: { agent: agentRussian },
    'zh-Hans': { agent: agentSimplifiedChinese },
    'zh-Hant': { agent: agentTraditionalChinese },
  },
});
