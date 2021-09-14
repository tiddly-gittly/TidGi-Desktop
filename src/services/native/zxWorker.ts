import 'source-map-support/register';
import { expose } from 'threads/worker';
import { fork } from 'child_process';
import { tmpdir } from 'os';
import { mkdtemp, writeFile } from 'fs-extra';
import path from 'path';
import { Observable } from 'rxjs';
import intercept from 'intercept-stdout';
import { IZxWorkerMessage, ZxWorkerControlActions } from './interface';

function executeZxScript({ fileContent, fileName }: { fileContent: string; fileName: string }): Observable<IZxWorkerMessage> {
  return new Observable<IZxWorkerMessage>((observer) => {
    observer.next({ type: 'control', actions: ZxWorkerControlActions.start });
    intercept(
      (newStdOut: string) => {
        observer.next({ type: 'stdout', message: newStdOut });
      },
      (newStdError: string) => {
        observer.next({ type: 'stderr', message: newStdError });
      },
    );

    void (async function executeZxScriptIIFE() {
      try {
        const temporaryDirectory = await mkdtemp(`${tmpdir()}${path.sep}`);
        const temporaryScriptFile = path.join(temporaryDirectory, fileName);
        await writeFile(temporaryScriptFile, fileContent);
        const execution = fork('node_modules/zx/zx.mjs', [temporaryScriptFile], { silent: true });

        execution.on('close', function (code) {
          observer.next({ type: 'control', actions: ZxWorkerControlActions.ended, message: `child process exited with code ${String(code)}` });
        });
        execution.stdout?.on('data', (stdout: string) => {
          console.log(stdout);
          observer.next({ type: 'stdout', message: `child process stdout ${stdout}` });
        });
      } catch (error) {
        const message = `Tiddlywiki booted failed with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
        observer.next({ type: 'control', actions: ZxWorkerControlActions.error, message });
        throw new Error(message);
      }
    })();
  });
}

const zxWorker = { executeZxScript };
export type ZxWorker = typeof zxWorker;
expose(zxWorker);
