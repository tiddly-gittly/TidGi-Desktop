import { app } from 'electron';
import path from 'path';
import { isDevelopmentOrTest } from './environment';
import { developmentSettingFolderName } from './fileNames';
import { sourcePath } from './paths';

export const SETTINGS_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', developmentSettingFolderName)
  : path.resolve(app.getPath('userData'), 'settings');
