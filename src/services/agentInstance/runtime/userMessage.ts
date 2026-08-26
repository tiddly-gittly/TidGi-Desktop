import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { nanoid } from 'nanoid';

import type { AgentCommittedAttachment, PendingLocalChatMessage } from 'memeloop';

export type AgentUserContent = {
  text: string;
  attachment?: AgentCommittedAttachment;
  wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }>;
};

export async function createMemeLoopUserMessage(input: {
  agentId: string;
  content: AgentUserContent;
  originNodeId: string;
  messageId?: string;
  beforeCommitMap?: Record<string, { wikiFolderLocation: string; commitHash: string }>;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<PendingLocalChatMessage> {
  const messageId = input.messageId ?? nanoid();
  const metadata: Record<string, unknown> = { ...input.metadata };

  const wikiTiddlersMetadata = await loadWikiTiddlerAttachments(messageId, input.content.wikiTiddlers);
  if (wikiTiddlersMetadata.length > 0) {
    metadata.wikiTiddlers = wikiTiddlersMetadata;
  }

  if (input.beforeCommitMap && Object.keys(input.beforeCommitMap).length > 0) {
    metadata.beforeCommitMap = input.beforeCommitMap;
  }

  // Inject wiki tiddler content into the message text
  let messageContent = input.content.text;
  if (wikiTiddlersMetadata.length > 0) {
    const tiddlerBlocks = wikiTiddlersMetadata.map(
      (tiddler) => `[Wiki Entry from ${tiddler.workspaceName}: ${tiddler.tiddlerTitle}]\n${tiddler.renderedContent}\n[End Wiki Entry]`,
    );
    messageContent = `${tiddlerBlocks.join('\n\n')}\n\n${messageContent}`;
  }

  return {
    messageId,
    turnId: messageId,
    content: messageContent,
    originNodeId: input.originNodeId,
    timestamp: Date.now(),
    contentType: 'text/plain',
    ...(input.content.attachment === undefined ? {} : { attachments: [input.content.attachment.reference] }),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

async function loadWikiTiddlerAttachments(
  messageId: string,
  wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }>,
): Promise<Array<{ workspaceId: string; workspaceName: string; tiddlerTitle: string; renderedContent: string }>> {
  if (!wikiTiddlers || wikiTiddlers.length === 0) return [];

  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const workspaces = await workspaceService.getWorkspacesAsList();
  const attachments: Array<{ workspaceId: string; workspaceName: string; tiddlerTitle: string; renderedContent: string }> = [];

  for (const tiddler of wikiTiddlers) {
    const workspace = workspaces.find(item => item.name === tiddler.workspaceName);
    if (!workspace) {
      logger.warn('Workspace not found for MemeLoop wiki attachment', { workspaceName: tiddler.workspaceName, messageId });
      continue;
    }

    try {
      const htmlResponse = await wikiService.callWikiIpcServerRoute(workspace.id, 'getTiddlerHtml', tiddler.tiddlerTitle);
      if (htmlResponse?.statusCode === 200 && typeof htmlResponse.data === 'string' && htmlResponse.data.length > 0) {
        attachments.push({
          workspaceId: workspace.id,
          workspaceName: tiddler.workspaceName,
          tiddlerTitle: tiddler.tiddlerTitle,
          renderedContent: htmlResponse.data,
        });
        continue;
      }

      const rawTiddler = await wikiService.wikiOperationInServer(
        WikiChannel.getTiddler,
        workspace.id,
        [tiddler.tiddlerTitle],
      );
      if (rawTiddler && typeof rawTiddler === 'object') {
        const text = (rawTiddler as { text?: string }).text ?? '';
        attachments.push({
          workspaceId: workspace.id,
          workspaceName: tiddler.workspaceName,
          tiddlerTitle: tiddler.tiddlerTitle,
          renderedContent: text,
        });
      }
    } catch (error) {
      logger.error('Failed to load MemeLoop wiki attachment', { error, messageId, tiddler });
    }
  }

  return attachments;
}
