// @vitest-environment node
import { WikiChannel } from '@/constants/channels';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IFileInfo, ITiddlerFields, ITiddlyWiki, Syncer, Tiddler } from 'tiddlywiki';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WikiOperationsInWikiWorker } from '../../wikiOperations/executor/wikiOperationInServer';
import { scanFolderTiddlers } from '../folderTiddlerLoader';
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
  it('filters actual mounted child files before limit and excludes siblings even when tags disagree', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'tidgi-child-filter-fixture-'));
    await writeFile(path.join(directory, 'tiddlywiki.info'), '{}');
    const calendar = path.join(directory, 'Calendar');
    const sibling = path.join(directory, 'Calendar-other');
    const nestedSibling = path.join(calendar, 'nested-sibling');
    for (const folder of [calendar, sibling, nestedSibling]) await mkdir(folder, { recursive: true });
    const notes = [
      { folder: sibling, title: 'A sibling', tags: 'Calendar' },
      { folder: nestedSibling, title: 'B nested sibling', tags: 'Calendar' },
      { folder: calendar, title: 'C calendar', tags: 'UnrelatedTag' },
      { folder: calendar, title: 'D calendar', tags: 'UnrelatedTag' },
    ];
    for (const note of notes) await writeFile(path.join(note.folder, note.title + '.tid'), 'title: ' + note.title + '\ntags: ' + note.tags + '\n\nfixture');
    instance = TiddlyWiki();
    instance.boot.argv = [directory];
    await new Promise<void>(resolve => {
      instance!.boot.boot(resolve);
    });
    for (const folder of [calendar, sibling]) {
      for (const file of scanFolderTiddlers(instance, folder).files) {
        for (const tiddler of file.tiddlers) {
          instance.boot.files[tiddler.title] = { filepath: file.filepath!, type: file.type ?? 'application/x-tiddler', hasMetaFile: false, isEditableFile: true };
        }
        instance.wiki.addTiddlers(file.tiddlers);
      }
    }
    const operations = new WikiOperationsInWikiWorker();
    operations.setWikiInstance(instance);
    const scope = { wikiFolderLocation: calendar, excludedWikiFolderLocations: [sibling, nestedSibling] };
    for (const filter of ['[!is[system]sort[title]limit[1]]', '[all[tiddlers]sort[title]limit[1]]']) {
      expect(await operations.wikiOperation(WikiChannel.runFilter, filter, scope)).toEqual(['C calendar']);
    }
    expect(await operations.wikiOperation(WikiChannel.runFilter, '[tag[UnrelatedTag]sort[title]]', scope)).toEqual(['C calendar', 'D calendar']);
    expect(await operations.wikiOperation(WikiChannel.runFilter, '[[A sibling]]', scope)).toEqual([]);
    expect(await operations.wikiOperation(WikiChannel.runFilter, '[title=Broken]', scope)).toEqual([expect.stringContaining('Filter error:')]);
    expect(await operations.wikiOperation(WikiChannel.runFilter, '[tag[Calendar]sort[title]]')).toEqual(['A sibling', 'B nested sibling']);
  });

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
