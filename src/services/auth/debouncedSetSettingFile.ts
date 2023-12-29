/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { fixSettingFileWhenError } from '@/helpers/configSetting';
import { logger } from '@services/libs/log';
import settings from 'electron-settings';
import { debounce } from 'lodash';
import { IUserInfos } from './interface';

export const debouncedSetSettingFile = debounce(async (userInfos: IUserInfos) => {
  try {
    await settings.set(`userInfos`, userInfos as any);
  } catch (error) {
    logger.error('Setting file format bad in debouncedSetSettingFile, will try again', { userInfos });
    fixSettingFileWhenError(error as Error);
    await settings.set(`userInfos`, userInfos as any);
  }
}, 500);
