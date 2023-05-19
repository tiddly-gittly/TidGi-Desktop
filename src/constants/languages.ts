import { LOCALIZATION_FOLDER } from '@/constants/paths';
import fs from 'fs-extra';
import path from 'path';

export const supportedLanguagesMap = fs.readJsonSync(path.join(LOCALIZATION_FOLDER, 'supportedLanguages.json')) as Record<string, string>;
export const tiddlywikiLanguagesMap = fs.readJsonSync(path.join(LOCALIZATION_FOLDER, 'tiddlywikiLanguages.json')) as Record<string, string | undefined>;

export const supportedLanguagesKNames = Object.keys(supportedLanguagesMap);
