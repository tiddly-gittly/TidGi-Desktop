/**
 * Load the full main process only for regular application launches.
 *
 * Keeping this decision separate and dependency-free makes it harder for an
 * installer-event regression to pull databases and application services back
 * into the time-limited Squirrel startup path.
 */
export async function bootstrapMainProcess(
  isSquirrelEvent: boolean,
  loadMainApplication: () => Promise<unknown>,
): Promise<void> {
  if (!isSquirrelEvent) {
    await loadMainApplication();
  }
}
