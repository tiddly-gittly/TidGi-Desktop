import { Then } from '@cucumber/cucumber';
import type { ApplicationWorld } from './application';
import { waitForLogMarker } from './wiki';

/**
 * Wait for a git operation to complete by checking for a specific log marker
 * @param marker - The test-id marker to look for in logs (e.g., 'test-id-commit-complete')
 * @param description - Human-readable description of what we're waiting for (just for test readability)
 */
Then('I wait for git operation {string} with description {string} to complete', async function(this: ApplicationWorld, marker: string, description: string) {
  console.log(`Waiting for: ${description}`);
  // Use longer timeout for revert operations as they can take more time
  const timeout = marker.includes('revert') ? 25000 : 15000;
  await waitForLogMarker(marker, `Git operation ${description} did not complete. Marker "${marker}" not found in logs.`, timeout, 'TidGi-');
});
