import { AnalyticsChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';

export type BuiltInAnalyticsEventName =
  | 'analytics.disclosure_responded'
  | 'app.launched'
  | 'deep_link.opened'
  | 'error.report_requested'
  | 'error.unhandled'
  | 'settings.opened'
  | 'tiddler.created'
  | 'workspace.created'
  | 'workspace.activated'
  | 'workspace.opened_in_new_window'
  | 'workspace.group.created'
  | 'workspace.group.deleted'
  | 'workspace.moved_to_group'
  | 'workspace.moved_out_of_group'
  | 'preferences.analytics_updated'
  | 'sync.triggered'
  | 'sync.completed'
  | 'sync.failed'
  | 'theme.changed'
  | 'updater.check_started'
  | 'updater.update_available'
  | 'updater.update_not_available'
  | 'updater.check_failed';

export type PluginAnalyticsEventName = `plugin.${string}.${string}`;

export type AnalyticsEventName = BuiltInAnalyticsEventName | PluginAnalyticsEventName;

export interface IAnalyticsEventProperties {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Privacy-safe analytics service for tracking coarse-grained app usage.
 * Only tracks high-level events with no PII or content.
 */
export interface IAnalyticsService {
  /**
   * Track a privacy-safe event. No-ops if analytics disabled or misconfigured.
   * @param eventName Event name following taxonomy (e.g., 'app.launched', 'workspace.created')
   * @param properties Optional properties (only primitives, no PII/content)
   */
  track(eventName: AnalyticsEventName, properties?: IAnalyticsEventProperties): Promise<void>;

  /**
   * Track a coarse plugin-defined event through a guarded API intended for renderer code
   * and TiddlyWiki plugins. The final event name is emitted as `plugin.<pluginId>.<eventName>`.
   * This exists so plugin authors do not need to depend on TidGi core event taxonomy.
   */
  trackPluginEvent(pluginId: string, eventName: string, properties?: IAnalyticsEventProperties): Promise<void>;

  /**
   * Check if analytics is currently enabled and properly configured
   */
  isEnabled(): Promise<boolean>;

  /**
   * Drop any unsent queued events without changing preferences.
   */
  clearPendingEvents(): Promise<void>;

  /**
   * Compute and persist device-level retention properties for the current launch.
   * Returns properties to attach to 'app.launched', or undefined if disabled.
   */
  getRetentionProperties(): Promise<IAnalyticsEventProperties | undefined>;

  /**
   * Check whether the analytics disclosure dialog should be shown.
   * Returns true if the user has never seen the current version of the disclosure
   * (or any disclosure at all).
   */
  shouldShowDisclosure(): Promise<boolean>;

  /**
   * Record that the user has seen the current analytics disclosure version,
   * so it won't be shown again on subsequent launches.
   */
  recordDisclosureVersion(): Promise<void>;

  /**
   * Show the analytics disclosure dialog if it hasn't been shown yet
   * (or if a newer disclosure version requires re-confirmation).
   * Skips in test environments.
   */
  showDisclosureIfNeeded(): Promise<void>;

  /**
   * Track the app.launched event with retention properties.
   */
  trackAppLaunch(): Promise<void>;

  /**
   * Track an unhandled error event with sanitized error info.
   * @param error The error to track
   * @param source The source of the error (e.g., 'app_ready', 'unhandled')
   */
  trackError(error: Error, source: string): void;
}

export const AnalyticsServiceIPCDescriptor = {
  channel: AnalyticsChannel.name,
  properties: {
    clearPendingEvents: ProxyPropertyType.Function,
    track: ProxyPropertyType.Function,
    trackPluginEvent: ProxyPropertyType.Function,
    isEnabled: ProxyPropertyType.Function,
    shouldShowDisclosure: ProxyPropertyType.Function,
    recordDisclosureVersion: ProxyPropertyType.Function,
  },
};
