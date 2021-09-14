import 'source-map-support/register';
import { expose } from 'threads/worker';
import { fork } from 'child_process';
import { tmpdir } from 'os';
import { mkdtemp, writeFile } from 'fs-extra';
import path from 'path';

async function executeZxScript({ fileContent, fileName }: { fileContent: string; fileName: string }): Promise<string> {
  const temporaryDirectory = await mkdtemp(`${tmpdir()}${path.sep}`);
  const temporaryScriptFile = path.join(temporaryDirectory, fileName);
  await writeFile(temporaryScriptFile, fileContent);
  const execution = fork('zx', [temporaryScriptFile]);

  return await new Promise<string>((resolve, reject) => {
    execution.on('close', function (code) {
      resolve(`child process exited with code ${String(code)}`);
    });
  });
}

const zxWorker = { executeZxScript };
export type ZxWorker = typeof zxWorker;
expose(zxWorker);
