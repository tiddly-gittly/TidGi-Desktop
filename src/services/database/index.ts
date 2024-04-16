/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import settings from 'electron-settings';
import fs from 'fs-extra';
import { injectable } from 'inversify';
import { debounce } from 'lodash';
import * as rotateFs from 'rotating-file-stream';

import { DEBOUNCE_SAVE_SETTING_BACKUP_FILE, DEBOUNCE_SAVE_SETTING_FILE } from '@/constants/parameters';
import { logger } from '@services/libs/log';
import { ensureSettingFolderExist, fixSettingFileWhenError } from './configSetting';
import { IDatabaseService, ISettingFile } from './interface';

@injectable()
export class DatabaseService implements IDatabaseService {
  async initializeForApp(): Promise<void> {
    // init config
    try {
      ensureSettingFolderExist();
      this.settingBackupStream = rotateFs.createStream(`${settings.file()}.bak`, {
        size: '10M',
        interval: '1d',
        maxFiles: 3,
      });
    } catch (error) {
      logger.error(`DatabaseService.initializeForApp error when initializing setting backup file: ${(error as Error).message}`);
    }
  }

  private settingFileContent: ISettingFile = settings.getSync() as unknown as ISettingFile || {};
  private settingBackupStream: rotateFs.RotatingFileStream | undefined;

  public setSetting<K extends keyof ISettingFile>(key: K, value: ISettingFile[K]) {
    this.settingFileContent[key] = value;
    void this.debouncedStoreSettingsToFile();
    // make infrequent backup of setting file, preventing re-install/upgrade from corrupting the file.
    void this.debouncedStoreSettingsToBackupFile();
  }

  public setSettingImmediately<K extends keyof ISettingFile>(key: K, value: ISettingFile[K]) {
    this.settingFileContent[key] = value;
    void this.debouncedStoreSettingsToFile();
  }

  public getSetting<K extends keyof ISettingFile>(key: K): ISettingFile[K] | undefined {
    return this.settingFileContent[key];
  }

  private readonly debouncedStoreSettingsToFile = debounce(this.immediatelyStoreSettingsToFile.bind(this), DEBOUNCE_SAVE_SETTING_FILE);
  private readonly debouncedStoreSettingsToBackupFile = debounce(this.immediatelyStoreSettingsToBackupFile.bind(this), DEBOUNCE_SAVE_SETTING_BACKUP_FILE);
  private storeSettingsToFileLock = false;

  public immediatelyStoreSettingsToBackupFile() {
    this.settingBackupStream?.write?.(JSON.stringify(this.settingFileContent) + '\n', 'utf8');
  }

  public async immediatelyStoreSettingsToFile() {
    /* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
    try {
      logger.debug('Saving settings to file start', { function: 'immediatelyStoreSettingsToFile', storeSettingsToFileLock: this.storeSettingsToFileLock });
      if (this.storeSettingsToFileLock) return;
      this.storeSettingsToFileLock = true;
      await settings.set(this.settingFileContent as any);
    } catch (error) {
      logger.error('Setting file format bad in debouncedSetSettingFile, will try force writing', { error, settingFileContent: JSON.stringify(this.settingFileContent) });
      ensureSettingFolderExist();
      fixSettingFileWhenError(error as Error);
      fs.writeJSONSync(settings.file(), this.settingFileContent);
    } finally {
      this.storeSettingsToFileLock = false;
      logger.debug('Saving settings to file done', { function: 'immediatelyStoreSettingsToFile' });
    }
  }
}
