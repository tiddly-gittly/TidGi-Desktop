/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { fixSettingFileWhenError } from '@/helpers/configSetting';
import { logger } from '@services/libs/log';
import settings from 'electron-settings';
import { debounce } from 'lodash';
import { IPage } from './interface';

export const debouncedSetSettingFile = debounce(async (pages: Record<string, IPage>) => {
  try {
    await settings.set(`pages`, pages as any);
  } catch (error) {
    logger.error('Setting file format bad in debouncedSetSettingFile, will try again', { pages });
    fixSettingFileWhenError(error as Error);
    await settings.set(`pages`, pages as any);
  }
  // set to 800 instead of 500 to fix data race with src/services/workspaces/debouncedSetSettingFile.ts, when switch from wiki workspace to page, both will write to same file, and one will overwrite another
}, 800);
