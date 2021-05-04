import path from 'path';

import { sourcePath } from '../../src/constants/paths';
import { developmentSettingFolderName, developmentWikiFolderName } from '../../src/constants/fileNames';

export const temporarySettingPath = path.resolve(sourcePath, '..', developmentSettingFolderName);
export const mockWikiPath = path.resolve(sourcePath, '..', developmentWikiFolderName);
