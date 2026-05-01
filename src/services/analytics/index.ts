import { app } from 'electron';
import { inject, injectable } from 'inversify';
import { randomUUID } from 'node:crypto';

import { container } from '@services/container';
import type { IDatabaseService, ISettingFile } from '@services/database/interface';
import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { AnalyticsEventName, BuiltInAnalyticsEventName, IAnalyticsEventProperties, IAnalyticsService, PluginAnalyticsEventName } from './interface';

interface IAnalyticsSecretSettings {
  deviceFirstLaunchDate?: string;
  deviceLastLaunchDate?: string;
  /**
   * Stable random UUID generated once on first launch and persisted forever.
   * Used as Rybbit `user_id` so events from the same installation are always
   * grouped under the same user regardless of IP or User-Agent changes.
   */
  deviceId?: string;
}

interface ITrackPayload {
  site_id: string;
  type: 'custom_event';
  event_name: AnalyticsEventName;
  properties?: Record<string, string | number | boolean>;
  hostname: string;
  pathname: string;
  /** Stable per-installation UUID — maps to Rybbit identified_user_id */
  user_id?: string;
}

const ANALYTICS_SETTINGS_KEY = 'analyticsSecrets';
const ANALYTICS_PATHNAME = '/desktop';
const DEFAULT_TIMEOUT_MS = 5000;
const ERROR_MESSAGE_MAX_LENGTH = 100;

/**
 * Extract a privacy-safe summary from an Error for analytics.
 * Strips file paths and truncates, keeping only the error name and the beginning of the message.
 */
export function sanitizeErrorMessage(error: Error): string {
  const firstLine = (error.stack ?? error.message ?? '').split('\n')[0] ?? '';
  // Remove " at function (path)" or " at path" patterns that appear in stack traces
  let cleaned = firstLine.replace(/\s+at\s+.*$/i, '');
  // Remove standalone parenthesized paths like (file:///path) or (I:\path) anywhere in the line
  cleaned = cleaned.replace(/\s*\([^)]*(?:file:\/\/|[a-zA-Z]:\\|\/)[^)]*\)/g, '');
  return cleaned.trim().slice(0, ERROR_MESSAGE_MAX_LENGTH);
}

const allowedPropertiesByEvent: Record<BuiltInAnalyticsEventName, ReadonlySet<string>> = {
  'app.launched': new Set(['platform', 'version', 'firstLaunchDate', 'daysSinceLastLaunch', 'isFirstLaunch']),
  'deep_link.opened': new Set(['resolvedWorkspace', 'fromPendingQueue']),
  'error.report_requested': new Set(['errorName', 'errorMessage']),
  'error.unhandled': new Set(['errorName', 'errorMessage', 'errorSource']),
  'preferences.analytics_updated': new Set(['field', 'enabled']),
  'settings.opened': new Set(['window']),
  'sync.completed': new Set(['storage', 'commitOnly', 'hasChanges', 'force']),
  'sync.failed': new Set(['storage', 'reason', 'commitOnly', 'force']),
  'sync.triggered': new Set(['storage', 'commitOnly', 'force']),
  'theme.changed': new Set(['themeSource', 'darkMode']),
  'updater.check_failed': new Set(['allowPrerelease']),
  'updater.check_started': new Set(['allowPrerelease']),
  'updater.update_available': new Set(['allowPrerelease']),
  'updater.update_not_available': new Set(['allowPrerelease']),
  'workspace.activated': new Set(['isSubWiki']),
  'workspace.created': new Set(['isSubWiki', 'hasGitUrl']),
  'workspace.opened_in_new_window': new Set(['isSubWiki']),
};

const pluginAnalyticsEventPattern = /^plugin\.[a-z0-9]+(?:[-_][a-z0-9]+)*\.[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const pluginEventNamePattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const pluginPropertyKeyPattern = /^[a-z][a-z0-9_]{0,39}$/;
const maxPluginStringLength = 120;

@injectable()
export class AnalyticsService implements IAnalyticsService {
  private readonly queuedEvents: Array<{ eventName: AnalyticsEventName; properties?: IAnalyticsEventProperties }> = [];
  private readonly maxQueuedEvents = 100;
  private flushInFlight: Promise<void> | undefined;

  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
    app.on('browser-window-focus', () => {
      void this.flushQueue();
    });
  }

  public async track(eventName: AnalyticsEventName, properties?: IAnalyticsEventProperties): Promise<void> {
    if (!this.isTrackableEventName(eventName)) {
      logger.warn('Analytics event rejected because eventName is invalid or unsupported', {
        eventName,
        function: 'track',
      });
      return;
    }

    const enabled = await this.isEnabled();
    if (!enabled) {
      return;
    }

    const sanitizedProperties = this.sanitizePropertiesForEvent(eventName, properties);
    const sent = await this.sendEvent(eventName, sanitizedProperties);
    if (!sent) {
      this.enqueueEvent(eventName, sanitizedProperties);
    }
  }

  public async trackPluginEvent(pluginId: string, eventName: string, properties?: IAnalyticsEventProperties): Promise<void> {
    const normalizedPluginId = this.normalizePluginSegment(pluginId);
    const normalizedEventName = this.normalizePluginSegment(eventName);
    if (!normalizedPluginId || !normalizedEventName) {
      logger.warn('Plugin analytics event rejected because pluginId or eventName is invalid', {
        function: 'trackPluginEvent',
      });
      return;
    }

    const sanitizedProperties = this.sanitizePluginProperties(properties);
    await this.track(
      this.makePluginEventName(normalizedPluginId, normalizedEventName),
      sanitizedProperties,
    );
  }

  public async isEnabled(): Promise<boolean> {
    const enabled = await this.preferenceService.get('analyticsEnabled');
    if (!enabled) {
      return false;
    }

    const analyticsHost = await this.preferenceService.get('analyticsHost');
    const analyticsSiteId = await this.preferenceService.get('analyticsSiteId');
    const analyticsApiKey = await this.preferenceService.get('analyticsApiKey');
    return Boolean(analyticsHost.trim() && analyticsSiteId.trim() && analyticsApiKey.trim());
  }

  public async clearPendingEvents(): Promise<void> {
    this.queuedEvents.length = 0;
  }

  public async getRetentionProperties(): Promise<IAnalyticsEventProperties | undefined> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      return undefined;
    }

    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const secrets = this.getAnalyticsSecrets(databaseService);
    const now = new Date();
    const todayDate = now.toISOString().slice(0, 10);

    const isFirstLaunch = !secrets.deviceFirstLaunchDate;
    const firstLaunchDate = secrets.deviceFirstLaunchDate ?? todayDate;

    let daysSinceLastLaunch: number | undefined;
    if (secrets.deviceLastLaunchDate) {
      const lastDate = new Date(secrets.deviceLastLaunchDate);
      daysSinceLastLaunch = Math.floor((now.getTime() - lastDate.getTime()) / 86_400_000);
    }

    const nextSecrets: IAnalyticsSecretSettings = {
      ...secrets,
      deviceFirstLaunchDate: firstLaunchDate,
      deviceLastLaunchDate: todayDate,
    };
    databaseService.setSetting(ANALYTICS_SETTINGS_KEY as keyof ISettingFile, nextSecrets as never);
    await databaseService.immediatelyStoreSettingsToFile();

    return {
      firstLaunchDate,
      isFirstLaunch,
      ...(daysSinceLastLaunch !== undefined ? { daysSinceLastLaunch } : {}),
    } satisfies IAnalyticsEventProperties;
  }

  private getAnalyticsSecrets(databaseService: IDatabaseService): IAnalyticsSecretSettings {
    const rawSettings = databaseService.getSetting(ANALYTICS_SETTINGS_KEY as keyof ISettingFile) as unknown;
    return (rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings))
      ? (rawSettings as IAnalyticsSecretSettings)
      : {};
  }

  private sanitizeProperties(properties?: IAnalyticsEventProperties): Record<string, string | number | boolean> | undefined {
    if (!properties) {
      return undefined;
    }

    const sanitizedEntries = Object.entries(properties).filter(([, value]) => (
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ));

    if (sanitizedEntries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(sanitizedEntries) as Record<string, string | number | boolean>;
  }

  private sanitizePropertiesForEvent(eventName: AnalyticsEventName, properties?: IAnalyticsEventProperties): Record<string, string | number | boolean> | undefined {
    if (eventName.startsWith('plugin.')) {
      return this.sanitizePluginProperties(properties);
    }

    const sanitized = this.sanitizeProperties(properties);
    if (!sanitized) {
      return undefined;
    }

    const allowedProperties = allowedPropertiesByEvent[eventName as BuiltInAnalyticsEventName];
    const filteredEntries = Object.entries(sanitized).filter(([key]) => allowedProperties.has(key));
    if (filteredEntries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(filteredEntries) as Record<string, string | number | boolean>;
  }

  private isTrackableEventName(eventName: string): eventName is AnalyticsEventName {
    return this.isBuiltInAnalyticsEventName(eventName) || pluginAnalyticsEventPattern.test(eventName);
  }

  private isBuiltInAnalyticsEventName(eventName: string): eventName is BuiltInAnalyticsEventName {
    return Object.hasOwn(allowedPropertiesByEvent, eventName);
  }

  private sanitizePluginProperties(properties?: IAnalyticsEventProperties): Record<string, string | number | boolean> | undefined {
    const sanitized = this.sanitizeProperties(properties);
    if (!sanitized) {
      return undefined;
    }

    const filteredEntries = Object.entries(sanitized)
      .filter(([key]) => pluginPropertyKeyPattern.test(key))
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return [key, value.slice(0, maxPluginStringLength)] as const;
        }
        return [key, value] as const;
      });

    if (filteredEntries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(filteredEntries) as Record<string, string | number | boolean>;
  }

  private normalizePluginSegment(segment: string): string | undefined {
    const normalized = segment.trim().toLowerCase();
    if (!pluginEventNamePattern.test(normalized)) {
      return undefined;
    }
    return normalized;
  }

  /**
   * Construct a PluginAnalyticsEventName from already-validated segments.
   * Callers must guarantee segments pass normalizePluginSegment first.
   */
  private makePluginEventName(pluginId: string, eventName: string): PluginAnalyticsEventName {
    return `plugin.${pluginId}.${eventName}`;
  }

  private buildPayload(eventName: AnalyticsEventName, properties?: Record<string, string | number | boolean>): Promise<ITrackPayload | undefined> {
    return Promise.all([
      this.preferenceService.get('analyticsHost'),
      this.preferenceService.get('analyticsSiteId'),
    ]).then(([analyticsHost, analyticsSiteId]) => {
      if (!analyticsHost.trim() || !analyticsSiteId.trim()) {
        return undefined;
      }

      const deviceId = this.getOrCreateDeviceId();

      return {
        site_id: analyticsSiteId.trim(),
        type: 'custom_event',
        event_name: eventName,
        properties,
        hostname: this.getAnalyticsHostname(analyticsHost),
        pathname: ANALYTICS_PATHNAME,
        user_id: deviceId,
      };
    });
  }

  /**
   * Return the persisted device UUID, creating and storing it on first call.
   * Stored alongside other analytics secrets so it survives app updates.
   */
  private getOrCreateDeviceId(): string {
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const secrets = this.getAnalyticsSecrets(databaseService);
    if (secrets.deviceId) {
      return secrets.deviceId;
    }
    const newId = randomUUID();
    databaseService.setSetting(ANALYTICS_SETTINGS_KEY as keyof ISettingFile, { ...secrets, deviceId: newId } as never);
    void databaseService.immediatelyStoreSettingsToFile();
    return newId;
  }

  private getAnalyticsTrackUrl(analyticsHost: string): string {
    const normalizedHost = analyticsHost.trim().replace(/\/+$/, '');
    return normalizedHost.endsWith('/api') ? `${normalizedHost}/track` : `${normalizedHost}/api/track`;
  }

  private getAnalyticsHostname(analyticsHost: string): string {
    try {
      return new URL(analyticsHost).hostname;
    } catch {
      return 'desktop.tidgi';
    }
  }

  private async sendEvent(eventName: AnalyticsEventName, properties?: Record<string, string | number | boolean>): Promise<boolean> {
    try {
      const [analyticsHost, payload] = await Promise.all([
        this.preferenceService.get('analyticsHost'),
        this.buildPayload(eventName, properties),
      ]);
      if (!payload) {
        return false;
      }

      const abortController = new AbortController();
      const timeoutHandle = setTimeout(() => {
        abortController.abort();
      }, DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(this.getAnalyticsTrackUrl(analyticsHost), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });

        if (!response.ok) {
          logger.warn('Analytics event rejected by server', { eventName, status: response.status });
          return false;
        }

        return true;
      } finally {
        clearTimeout(timeoutHandle);
      }
    } catch (error) {
      logger.debug('Analytics event delivery failed', { eventName, error });
      return false;
    }
  }

  private enqueueEvent(eventName: AnalyticsEventName, properties?: Record<string, string | number | boolean>): void {
    this.queuedEvents.push({ eventName, properties });
    if (this.queuedEvents.length > this.maxQueuedEvents) {
      this.queuedEvents.shift();
    }
  }

  private async flushQueue(): Promise<void> {
    if (this.flushInFlight) {
      return this.flushInFlight;
    }

    this.flushInFlight = (async () => {
      while (this.queuedEvents.length > 0) {
        const nextEvent = this.queuedEvents[0];
        const sent = await this.sendEvent(nextEvent.eventName, this.sanitizePropertiesForEvent(nextEvent.eventName, nextEvent.properties));
        if (!sent) {
          break;
        }
        this.queuedEvents.shift();
      }
    })().finally(() => {
      this.flushInFlight = undefined;
    });

    await this.flushInFlight;
  }
}
