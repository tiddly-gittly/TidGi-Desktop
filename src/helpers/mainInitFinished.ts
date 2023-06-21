import { MainChannel } from '@/constants/channels';
import { ipcMain } from 'electron';

let commonInitFinished = false;
// event may emit before first `whenCommonInitFinished()` is called.
ipcMain.once(MainChannel.commonInitFinished, () => {
  commonInitFinished = true;
});
/**
 * Make sure some logic only run after window and services are truly ready
 */
export const whenCommonInitFinished = async (): Promise<void> => {
  if (commonInitFinished) {
    await Promise.resolve();
    return;
  }
  await new Promise<void>((resolve) => {
    ipcMain.once(MainChannel.commonInitFinished, () => {
      commonInitFinished = true;
      resolve();
    });
  });
};
