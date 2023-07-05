/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { fixSettingFileWhenError } from '@/helpers/configSetting';
import { logger } from '@services/libs/log';
import settings from 'electron-settings';
import { debounce } from 'lodash';
import { IWorkspace } from './interface';

export const debouncedSetSettingFile = debounce(async (workspaces: Record<string, IWorkspace>) => {
  try {
    await settings.set(`workspaces`, workspaces as any);
  } catch (error) {
    logger.error('Setting file format bad in debouncedSetSettingFile, will try again', { workspaces });
    fixSettingFileWhenError(error as Error);
    await settings.set(`workspaces`, workspaces as any);
  }
}, 500);
