import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';
import { MockAnalyticsServer } from '../supports/mockAnalytics';
import type { ApplicationWorld } from './application';

/**
 * Poll for all expected analytics events to arrive.
 * Retries with short intervals until all events are found or max attempts exhausted.
 */
async function pollForEvents(
  server: MockAnalyticsServer,
  expectedEvents: Array<Record<string, string>>,
  maxAttempts = 20,
  intervalMs = 100,
): Promise<ReturnType<MockAnalyticsServer['getEvents']>> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const events = server.getEvents();
    const allFound = expectedEvents.every(expected => {
      const eventName = expected.event_name;
      if (!eventName) return false;
      return events.some(event => event.event_name === eventName);
    });
    if (allFound) {
      return events;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return server.getEvents();
}

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
  this.launchEnvOverrides.TIDGI_ANALYTICS_HOSTNAME = 'test-hostname';
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
 * Supports table format with event names and optional property checks.
 */
Then('I should see analytics events:', async function(this: ApplicationWorld, dataTable: { hashes: () => Array<Record<string, string>> }) {
  const mockAnalyticsServer = (this as unknown as Record<string, unknown>).mockAnalyticsServer as MockAnalyticsServer | undefined;
  if (!mockAnalyticsServer) {
    throw new Error('Mock analytics server is not started. Call "I start mock analytics server" first.');
  }

  // Poll for analytics events to arrive instead of a fixed 500ms wait
  const events = await pollForEvents(mockAnalyticsServer, dataTable.hashes());
  const expectedEvents = dataTable.hashes();

  for (const expected of expectedEvents) {
    const eventName = expected.event_name;
    if (!eventName) {
      throw new Error('Missing "event_name" column in analytics events table');
    }

    const matchingEvents = events.filter(event => event.event_name === eventName);
    assert(matchingEvents.length >= 1, `Expected analytics event "${eventName}" to be received, but got ${events.map(event => event.event_name).join(', ') || 'none'}`);

    // Check optional properties
    const matchedEvent = matchingEvents[0];
    // Parse properties JSON string (analytics service serializes for Rybbit compatibility)
    let eventProperties: Record<string, unknown> = {};
    if (typeof matchedEvent.properties === 'string') {
      try {
        eventProperties = JSON.parse(matchedEvent.properties) as Record<string, unknown>;
      } catch {
        // ignore parse errors — properties will be empty
      }
    }
    for (const [key, value] of Object.entries(expected)) {
      if (key === 'event_name' || !value) continue;

      const actualValue = eventProperties[key];
      const expectedValue = value;

      // Support special matchers
      if (expectedValue === '*exists*') {
        assert(actualValue !== undefined, `Expected property "${key}" to exist on event "${eventName}"`);
      } else if (expectedValue === '*boolean*') {
        assert(typeof actualValue === 'boolean', `Expected property "${key}" to be a boolean on event "${eventName}"`);
      } else if (expectedValue === '*number*') {
        assert(typeof actualValue === 'number', `Expected property "${key}" to be a number on event "${eventName}"`);
      } else if (expectedValue === '*string*') {
        assert(typeof actualValue === 'string', `Expected property "${key}" to be a string on event "${eventName}"`);
      } else if (expectedValue.startsWith('*contains:')) {
        const substring = expectedValue.slice(10, -1);
        assert(String(actualValue).includes(substring), `Expected property "${key}" to contain "${substring}" on event "${eventName}"`);
      } else {
        assert(String(actualValue) === expectedValue, `Expected property "${key}" to be "${expectedValue}" on event "${eventName}", but got "${String(actualValue)}"`);
      }
    }
  }
});
