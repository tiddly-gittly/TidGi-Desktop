// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IFileInfo, ITiddlerFields, ITiddlyWiki, Syncer, Tiddler } from 'tiddlywiki';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IpcServerRoutes } from '../ipcServerRoutes';

const require = createRequire(import.meta.url);
const { TiddlyWiki } = require('tiddlywiki') as { TiddlyWiki: () => ITiddlyWiki };
let directory: string | undefined;
let instance: ITiddlyWiki | undefined;

afterEach(async () => {
  const syncer = instance?.syncer as (Syncer & { taskTimerId: ReturnType<typeof setTimeout> | undefined }) | undefined;
  clearTimeout(syncer?.taskTimerId);
  vi.restoreAllMocks();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('real core syncer filesystem acknowledgement', () => {
  it('acknowledges exact disk contents before the next window can save or delete the same title', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'tidgi-save-ack-fixture-'));
    await writeFile(path.join(directory, 'tiddlywiki.info'), JSON.stringify({ plugins: ['tiddlywiki/filesystem'] }));
    instance = TiddlyWiki();
    instance.boot.argv = [directory];
    await new Promise<void>(resolve => {
      instance!.boot.boot(resolve);
    });
    if (!instance.syncadaptor || !instance.syncer) throw new Error('Fixture filesystem plugin failed to initialize');
    const routes = new IpcServerRoutes();
    routes.setWikiInstance(instance);
    const fields: ITiddlerFields = { title: 'save-ack-fixture', type: 'text/vnd.tiddlywiki', text: 'Only synthetic fixture content.' };
    const originalSave = instance.syncadaptor.saveTiddler.bind(instance.syncadaptor);
    const diskWritten = Promise.withResolvers<() => void>();
    let holdFirstCallback = true;
    vi.spyOn(instance.syncadaptor, 'saveTiddler').mockImplementation((
      tiddler: Tiddler,
      callback: (error: Error | null | string, adaptorInfo?: IFileInfo | null, revision?: string) => void,
      options?: { tiddlerInfo?: Record<string, unknown> },
    ) => {
      originalSave(tiddler, (error: Error | null | string, adaptorInfo?: IFileInfo | null, revision?: string) => {
        if (tiddler.fields.title === fields.title && holdFirstCallback) {
          holdFirstCallback = false;
          diskWritten.resolve(() => {
            callback(error, adaptorInfo, revision);
          });
        } else callback(error, adaptorInfo, revision);
      }, options);
    });
    let acknowledged = false;
    const saving = routes.putTiddler(fields.title, fields).then(response => {
      acknowledged = true;
      return response;
    });
    const releaseCallback = await diskWritten.promise;
    const secondFields = { ...fields, text: 'The second window edit.' };
    const secondSave = routes.putTiddler(fields.title, secondFields);
    expect(acknowledged).toBe(false);
    const savedText = await readFile(path.join(directory, 'tiddlers', 'save-ack-fixture.tid'), 'utf8');
    expect(savedText).toContain(fields.text);
    expect(instance.wiki.getTiddler(fields.title)?.fields.text).toBe(fields.text);
    releaseCallback();
    expect((await saving).statusCode).toBe(204);
    expect((await secondSave).statusCode).toBe(204);
    expect(await readFile(path.join(directory, 'tiddlers', 'save-ack-fixture.tid'), 'utf8')).toContain(secondFields.text);
    await routes.deleteTiddler(fields.title);
    await expect(readFile(path.join(directory, 'tiddlers', 'save-ack-fixture.tid'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(instance.syncer.isDirty()).toBe(false);
  });
});
