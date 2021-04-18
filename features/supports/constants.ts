import path from 'path';

import { developmentSettingFolderName, developmentWikiFolderName } from '../../src/constants/fileNames';

export const sourcePath = path.resolve(__dirname, '..', '..');

export const temporarySettingPath = path.resolve(sourcePath, '..', developmentSettingFolderName)
export const mockWikiPath = path.resolve(sourcePath, '..', developmentWikiFolderName)