import { BrowserWindow } from 'electron';
// @ts-expect-error ts-migrate(7019) FIXME: Rest parameter 'arguments_' implicitly has an 'any... Remove this comment to see the full error message
const sendToAllWindows = (...arguments_) => {
  const wins = BrowserWindow.getAllWindows();
  wins.forEach((win) => {
    (win as any).send(...arguments_);
  });
};
export default sendToAllWindows;
