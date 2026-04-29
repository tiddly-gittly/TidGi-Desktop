import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';
import { MockAnalyticsServer } from '../supports/mockAnalytics';
import type { ApplicationWorld } from './application';

/**
 * Start a mock analytics server and configure the app to use it.
 * This should be called before launching the app.
 */
Given('I start mock analytics server', async function(this: ApplicationWorld) {
  const mockAnalyticsServer = new MockAnalyticsServer();
  await mockAnalyticsServer.start();
  // Store on world for later access
  (this as unknown as Record<string, unknown>).mockAnalyticsServer = mockAnalyticsServer;

  // Configure app to use mock analytics server via launch env overrides
  // The app reads these and sets them as default preferences
  this.launchEnvOverrides.TIDGI_ANALYTICS_HOST = mockAnalyticsServer.baseUrl;
  this.launchEnvOverrides.TIDGI_ANALYTICS_SITE_ID = 'test-site-id';
  this.launchEnvOverrides.TIDGI_ANALYTICS_API_KEY = 'test-api-key';
});

/**
 * Reset the mock analytics server events.
 */
When('I reset mock analytics events', async function(this: ApplicationWorld) {
  const mockAnalyticsServer = (this as unknown as Record<string, unknown>).mockAnalyticsServer as MockAnalyticsServer | undefined;
  if (!mockAnalyticsServer) {
    throw new Error('Mock analytics server is not started. Call "I start mock analytics server" first.');
  }
  mockAnalyticsServer.clearEvents();
});

/**
 * Verify that specific analytics events were received by the mock server.
 * Polls with a timeout to tolerate fire-and-forget event delivery.
 */
Then('I should see analytics events:', async function(this: ApplicationWorld, dataTable: { hashes: () => Array<Record<string, string>> }) {
  const mockAnalyticsServer = (this as unknown as Record<string, unknown>).mockAnalyticsServer as MockAnalyticsServer | undefined;
  if (!mockAnalyticsServer) {
    throw new Error('Mock analytics server is not started. Call "I start mock analytics server" first.');
  }

  const expectedEvents = dataTable.hashes();
  const pollIntervalMs = 200;
  const maxWaitMs = 3000;
  const startTime = Date.now();

  while (true) {
    const events = mockAnalyticsServer.getEvents();
    let allFound = true;

    for (const expected of expectedEvents) {
      const eventName = expected.event_name;
      if (!eventName) {
        throw new Error('Missing "event_name" column in analytics events table');
      }

      const matchingEvents = events.filter(event => event.event_name === eventName);
      if (matchingEvents.length === 0) {
        allFound = false;
        break;
      }

      // Check optional properties
      const matchedEvent = matchingEvents[0];
      for (const [key, value] of Object.entries(expected)) {
        if (key === 'event_name' || !value) continue;

        const actualValue = matchedEvent.properties?.[key];
        const expectedValue = value;

        if (expectedValue === '*exists*') {
          if (actualValue === undefined) {
            allFound = false;
            break;
          }
        } else if (expectedValue === '*boolean*') {
          if (typeof actualValue !== 'boolean') {
            allFound = false;
            break;
          }
        } else if (expectedValue === '*number*') {
          if (typeof actualValue !== 'number') {
            allFound = false;
            break;
          }
        } else if (expectedValue === '*string*') {
          if (typeof actualValue !== 'string') {
            allFound = false;
            break;
          }
        } else if (expectedValue.startsWith('*contains:')) {
          const substring = expectedValue.slice(10, -1);
          if (!String(actualValue).includes(substring)) {
            allFound = false;
            break;
          }
        } else if (String(actualValue) !== expectedValue) {
          allFound = false;
          break;
        }
      }
      if (!allFound) break;
    }

    if (allFound) {
      return;
    }

    if (Date.now() - startTime >= maxWaitMs) {
      const events = mockAnalyticsServer.getEvents();
      for (const expected of expectedEvents) {
        const eventName = expected.event_name;
        const matchingEvents = events.filter(event => event.event_name === eventName);
        assert(matchingEvents.length >= 1, `Expected analytics event "${eventName}" to be received, but got ${events.map(event => event.event_name).join(', ') || 'none'}`);
      }
      return;
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
});
