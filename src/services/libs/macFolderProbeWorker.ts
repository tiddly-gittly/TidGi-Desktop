import { opendir } from 'node:fs/promises';
import { serializeError } from 'serialize-error';

const port = process.parentPort;
const folder = process.env.TIDGI_ACCESS_CHECK_DIRECTORY;
if (folder === undefined) throw new Error('Missing folder for the access check');

void opendir(folder)
  .then((directory) => directory.close())
  .then(() => {
    port.postMessage(null);
  }, (error: unknown) => {
    port.postMessage(serializeError(error));
  });
