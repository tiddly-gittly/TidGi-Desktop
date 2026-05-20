import { app, net } from 'electron';
import { inject, injectable } from 'inversify';
import { randomUUID } from 'node:crypto';

import { container } from '@services/container';
import type { IDatabaseService, ISettingFile } from '@services/database/interface';
import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { AnalyticsEventName, IAnalyticsEventProperties, IAnalyticsService } from './interface';
import { sanitizeErrorMessage } from './utilities';

export { sanitizeErrorMessage };

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
  /** Rybbit requires properties as a JSON-serialized string, not a plain object */
  properties?: string;
  hostname: string;
  pathname: string;
  /** Stable per-installation UUID — maps to Rybbit identified_user_id */
  user_id?: string;
}

const ANALYTICS_SETTINGS_KEY = 'analyticsSecrets';
const ANALYTICS_PATHNAME = '/desktop';
const DEFAULT_TIMEOUT_MS = 15_000;

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
    return Boolean(analyticsHost.trim() && analyticsHostname.trim() && analyticsSiteId.trim());
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
