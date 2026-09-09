import { app, net } from 'electron';
import { inject, injectable } from 'inversify';
import { randomUUID } from 'node:crypto';

import type { IAnalyticsSecretSettings, IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { AnalyticsEventName, IAnalyticsEventProperties, IAnalyticsService } from './interface';
import { sanitizeErrorMessage } from './utilities';

export { sanitizeErrorMessage };

const ANALYTICS_SETTINGS_KEY = 'analyticsSecrets';
const DEFAULT_TIMEOUT_MS = 15_000;

@injectable()
export class AnalyticsService implements IAnalyticsService {
  private readonly queuedEvents: Array<{ eventName: AnalyticsEventName; properties?: IAnalyticsEventProperties }> = [];
  private readonly maxQueuedEvents = 100;
  private flushInFlight: Promise<void> | undefined;

  constructor(
    @inject(serviceIdentifier.Database) private readonly databaseService: IDatabaseService,
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
    app.on('browser-window-focus', () => {
      void this.flushQueue();
    });
  }

  public async track(eventName: AnalyticsEventName, properties?: IAnalyticsEventProperties): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      return;
    }

    const sanitizedProperties = this.sanitizeProperties(properties);
    const sent = await this.sendEvent(eventName, sanitizedProperties);
    if (!sent) {
      this.enqueueEvent(eventName, sanitizedProperties);
    }
  }

  public async trackPluginEvent(pluginId: string, eventName: string, properties?: IAnalyticsEventProperties): Promise<void> {
    const slugPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
    if (!slugPattern.test(pluginId) || !slugPattern.test(eventName)) {
      logger.warn('Invalid plugin event name format', { pluginId, eventName });
      return;
    }
    const sanitizedProperties = this.sanitizeProperties(properties);
    await this.track(`plugin.${pluginId}.${eventName}`, sanitizedProperties);
  }

  public async isEnabled(): Promise<boolean> {
    const enabled = await this.preferenceService.get('analyticsEnabled');
    if (!enabled) {
      return false;
    }

    const [analyticsHost, analyticsHostname, analyticsSiteId] = await Promise.all([
      this.preferenceService.get('analyticsHost'),
      this.preferenceService.get('analyticsHostname'),
      this.preferenceService.get('analyticsSiteId'),
    ]);
    return Boolean(analyticsHost?.trim() && analyticsHostname?.trim() && analyticsSiteId?.trim());
  }

  public async clearPendingEvents(): Promise<void> {
    this.queuedEvents.length = 0;
  }

  public async trackAppLaunch(): Promise<void> {
    const retentionProperties = await this.getRetentionProperties();
    void this.track('app.launched', {
      platform: process.platform,
      version: app.getVersion(),
      ...retentionProperties,
    });
  }

  public trackError(error: Error, source: string): void {
    void this.track('error.unhandled', {
      errorName: error.name || 'Error',
      errorMessage: sanitizeErrorMessage(error),
      errorSource: source,
    });
  }

  public async getRetentionProperties(): Promise<IAnalyticsEventProperties | undefined> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      return undefined;
    }

    const secrets = this.getAnalyticsSecrets();
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
    this.databaseService.setSetting(ANALYTICS_SETTINGS_KEY, nextSecrets);
    await this.databaseService.immediatelyStoreSettingsToFile();

    return {
      firstLaunchDate,
      isFirstLaunch,
      ...(daysSinceLastLaunch !== undefined ? { daysSinceLastLaunch } : {}),
    } satisfies IAnalyticsEventProperties;
  }

  private getAnalyticsSecrets(): IAnalyticsSecretSettings {
    const rawSettings = this.databaseService.getSetting(ANALYTICS_SETTINGS_KEY);
    return (rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings))
      ? rawSettings
      : {};
  }

  private sanitizeProperties(properties?: IAnalyticsEventProperties): Record<string, string | number | boolean> | undefined {
    if (!properties) {
      return undefined;
    }

    const sanitizedEntries = Object.entries(properties).filter(([, value]) => {
      if (typeof value === 'string') {
        // Filter out strings that look like absolute paths, URLs, or emails
        if (/^\/(?:home|Users|tmp|var|etc|opt)\//.test(value)) return false;
        if (/^[A-Za-z]:\\/.test(value)) return false;
        if (/^https?:\/\//.test(value)) return false;
        if (value.includes('@') && value.includes('.')) return false;
      }
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    });

    if (sanitizedEntries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(sanitizedEntries) as Record<string, string | number | boolean>;
  }

  private getOrCreateDeviceId(): string {
    const secrets = this.getAnalyticsSecrets();
    if (secrets.deviceId) {
      return secrets.deviceId;
    }
    const newId = randomUUID();
    this.databaseService.setSetting(ANALYTICS_SETTINGS_KEY, { ...secrets, deviceId: newId });
    void this.databaseService.immediatelyStoreSettingsToFile();
    return newId;
  }

  private getAnalyticsTrackUrl(analyticsHost: string): string {
    const normalizedHost = analyticsHost.trim().replace(/\/+$/, '');
    return normalizedHost.endsWith('/api') ? `${normalizedHost}/track` : `${normalizedHost}/api/track`;
  }

  private async buildPayload(
    eventName: AnalyticsEventName,
    properties?: Record<string, string | number | boolean>,
  ): Promise<{ site_id: string; type: 'custom_event'; event_name: AnalyticsEventName; properties?: string; hostname: string; pathname: string; user_id?: string } | undefined> {
    const [analyticsHost, analyticsHostname, analyticsSiteId] = await Promise.all([
      this.preferenceService.get('analyticsHost'),
      this.preferenceService.get('analyticsHostname'),
      this.preferenceService.get('analyticsSiteId'),
    ]);
    if (!analyticsHost.trim() || !analyticsHostname.trim() || !analyticsSiteId.trim()) {
      return undefined;
    }
    return {
      site_id: analyticsSiteId.trim(),
      type: 'custom_event',
      event_name: eventName,
      properties: properties ? JSON.stringify(properties) : JSON.stringify({}),
      hostname: analyticsHostname.trim(),
      pathname: '/desktop',
      user_id: this.getOrCreateDeviceId(),
    };
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
        // Use Electron's net.fetch so the request goes through the Chromium
        // network stack with a proper browser User-Agent, avoiding bot detection.
        const response = await net.fetch(this.getAnalyticsTrackUrl(analyticsHost), {
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
      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug('Analytics event timed out', { eventName });
      } else {
        logger.debug('Analytics event delivery failed', { eventName, error });
      }
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
        const sent = await this.sendEvent(nextEvent.eventName, this.sanitizeProperties(nextEvent.properties));
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
