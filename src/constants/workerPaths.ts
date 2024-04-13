/**
 * Paths that can be used in worker. Without electron.
 */
import path from 'path';
import { isWorkerDevelopmentOrTest } from './isWorkerDevelopment';

export const PACKAGE_PATH_BASE = isWorkerDevelopmentOrTest
  ? path.resolve(__dirname, '..', '..', 'node_modules')
  : path.resolve(process.resourcesPath, 'node_modules');
// const sourcePath = path.resolve(__dirname, '..');
// const WEBPACK_MAIN_THREAD_DIST_PATH = isWorkerDevelopmentOrTest
//   ? path.resolve(sourcePath, '..', '.webpack', 'main')
//   : path.resolve(process.resourcesPath, '.webpack', 'main');
// // Path to native_modules
// export const NATIVE_MODULES_PATH = path.resolve(WEBPACK_MAIN_THREAD_DIST_PATH, 'native_modules');
