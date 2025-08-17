import fs from 'fs';
import path from 'path';

export function getPackedAppPath(): string {
  const platform = process.platform;
  const outputDirectory = path.join(process.cwd(), 'out');

  // Define possible app paths based on platform
  const possiblePaths: string[] = [];

  switch (platform) {
    case 'win32':
      possiblePaths.push(
        path.join(outputDirectory, 'TidGi-win32-x64', 'tidgi.exe'),
        path.join(outputDirectory, 'TidGi-win32-arm64', 'tidgi.exe'),
        path.join(outputDirectory, 'TidGi-win32-ia32', 'tidgi.exe'),
      );
      break;
    case 'darwin':
      possiblePaths.push(
        path.join(outputDirectory, 'TidGi-darwin-x64', 'TidGi.app', 'Contents', 'MacOS', 'TidGi'),
        path.join(outputDirectory, 'TidGi-darwin-arm64', 'TidGi.app', 'Contents', 'MacOS', 'TidGi'),
      );
      break;
    case 'linux':
      possiblePaths.push(
        path.join(outputDirectory, 'TidGi-linux-x64', 'tidgi'),
        path.join(outputDirectory, 'TidGi-linux-arm64', 'tidgi'),
      );
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  // Find the first existing executable
  for (const appPath of possiblePaths) {
    if (fs.existsSync(appPath)) {
      return appPath;
    }
  }

  throw new Error(
    `TidGi executable not found. Checked paths:\n${possiblePaths.join('\n')}\n\nYou should run \`pnpm run package:dev\` before running the tests to ensure the app is built.`,
  );
}

// E2E logs paths used by tests
export const logsDirectory = path.resolve(process.cwd(), 'userData-test', 'logs');
export const screenshotsDirectory = path.resolve(logsDirectory, 'screenshots');
