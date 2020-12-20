// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'BrowserWin... Remove this comment to see the full error message
import { BrowserWindow } from 'electron';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'sendToAllW... Remove this comment to see the full error message
const sendToAllWindows = (...arguments_) => {
  const wins = BrowserWindow.getAllWindows();
  wins.forEach((win) => {
    (win as any).send(...arguments_);
  });
};
export default sendToAllWindows;
