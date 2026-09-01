import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const directory = resolve(process.cwd(), 'src/services/wiki/plugin/memeloopAgentUI');
const read = (name: string) => readFileSync(resolve(directory, name), 'utf8');

describe('MemeLoop TiddlyWiki plugin integration contract', () => {
  it('mounts the same shared widget in the full view and narrow sidebar tab', () => {
    expect(read('chat-view.tid')).toContain('<$memeloopAgentChat mode="full" />');
    expect(read('sidebar-tab.tid')).toContain('<$memeloopAgentChat mode="sidebar" />');
    const source = read('components.tsx');
    expect(source).toContain('AgentSessionProvider');
    expect(source).toContain('AgentChatShell');
    expect(source).toContain('useAgentSessionChatAdapter');
    expect(source).toContain('ConversationTimelineWindowController');
    expect(source).toContain('DEFAULT_RESIDENT_MESSAGE_LIMIT');
    expect(source).toContain('DEFAULT_RESIDENT_CONTENT_BYTE_LIMIT');
    expect(source).toContain('key={target.conversationId}');
  });

  it('does not regress to the former unbounded plugin-owned pager', () => {
    const source = read('components.tsx');
    for (
      const forbidden of [
        'INITIAL_PAGE_SIZE',
        'PAGE_SIZE = 100',
        'RESIDENT_LIMIT = 240',
        'limit: 99',
        'limit: 100',
        'getAgentMessagePage(',
        'boundedResidentMessages(',
      ]
    ) expect(source).not.toContain(forbidden);
  });

  it('declares container-query narrow layout and atomic TiddlyWiki drops', () => {
    const styles = read('styles.tid');
    expect(styles).toContain('container-type: inline-size');
    expect(styles).toContain('@container memeloop-chat');
    expect(styles).toMatch(/\.memeloop-tw-chat--sidebar\s*{[^}]*max-width:\s*30rem/s);
    expect(styles).toContain('@media (pointer: coarse)');
    expect(styles).toContain('[dir="rtl"]');
    expect(read('components.tsx')).toContain('onAttachmentsSelect={selectAttachments}');
    expect(read('components.tsx')).toContain('resolveDroppedWikiTiddlers={drop => resolveTiddlyWikiDrop');
    expect(read('dropPayload.ts')).toContain('rejects the whole');
  });

  it('composes shared major Agent features through a replaceable host boundary', () => {
    const source = read('components.tsx');
    expect(source).toContain('useExecutionTargets');
    expect(source).toContain('createDesktopFileAttachmentSource');
    expect(source).toContain('localizeAgentRunError');
    expect(source).toContain('deleteTurn: targets.deleteTurn');
    expect(source).toContain('retryTurn: targets.retryTurn');
    expect(source).not.toContain('createDesktopAttachmentMapper');
    expect(source).not.toContain("targets.activeExecutionTargetId === 'local'");
    expect(source).toContain('PromptTree');
    expect(source).toContain('createDesktopPromptPreviewController');
    expect(source).toContain('ScheduledWakeupEditor');
    expect(source).toContain('hostAdapter: injectedHostAdapter');
    expect(source).toContain('extractAgentRunError');
    expect(source).toContain('onErrorAction');
    const host = read('hostAdapter.ts');
    expect(host).toContain('export interface WikiAgentHostAdapter');
    expect(host).toContain('definition: AgentDefinition');
    expect(host).toContain('selection: AgentModelConfig');
    expect(host).toContain('route: ProviderModelRoute');
    expect(host).toContain('Promise<AgentSessionTarget>');
    expect(source).toContain('activeExecutionTarget: targets.activeExecutionTarget');
    expect(host).toContain('MAX_AGENT_DEFINITIONS = 128');
    expect(host).toContain('MAX_MODEL_OPTIONS = 512');
  });

  it('propagates Wiki language direction and palette mode into the shared UI theme', () => {
    const source = read('components.tsx');
    expect(source).toContain('ThemeProvider');
    expect(source).toContain("getTiddlerText('$:/language'");
    expect(source).toContain("getTiddlerText('$:/palette'");
    expect(source).toContain("palette?.fields['color-scheme']");
    expect(source).toContain('dir={direction}');
    expect(source).toContain('refresh(changedTiddlers');
    expect(source).toContain('this.refreshSelf()');
  });
});
