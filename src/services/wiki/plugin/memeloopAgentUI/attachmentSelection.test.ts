import { describe, expect, it } from 'vitest';
import { clearAttachmentSelectionAtRevision, EMPTY_ATTACHMENTS, nextAttachmentSelection } from './attachmentSelection';

describe('TiddlyWiki attachment selection', () => {
  it('commits a mixed drop as one immutable revision', () => {
    const input = [{ workspaceName: 'Wiki', tiddlerTitle: 'One' }];
    const selection = nextAttachmentSelection(EMPTY_ATTACHMENTS, { wikiTiddlers: input });
    input.push({ workspaceName: 'Wiki', tiddlerTitle: 'Mutated later' });
    expect(selection).toEqual({
      revision: 1,
      wikiTiddlers: [{ workspaceName: 'Wiki', tiddlerTitle: 'One' }],
    });
    expect(Object.isFrozen(selection.wikiTiddlers)).toBe(true);
  });

  it('does not clear attachments added while an older send is in flight', () => {
    const sent = nextAttachmentSelection(EMPTY_ATTACHMENTS, {
      wikiTiddlers: [{ workspaceName: 'Wiki', tiddlerTitle: 'Sent' }],
    });
    const addedWhileSending = nextAttachmentSelection(sent, {
      wikiTiddlers: [{ workspaceName: 'Wiki', tiddlerTitle: 'Next' }],
    });
    expect(clearAttachmentSelectionAtRevision(addedWhileSending, sent.revision)).toBe(addedWhileSending);
    expect(clearAttachmentSelectionAtRevision(sent, sent.revision)).toEqual({
      revision: 2,
      wikiTiddlers: [],
    });
  });
});
