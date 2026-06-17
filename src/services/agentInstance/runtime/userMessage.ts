import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { app } from 'electron';
import * as fs from 'fs-extra';
import { nanoid } from 'nanoid';
import * as path from 'path';

import type { ChatMessage } from 'memeloop';
import { createChatMessage } from 'memeloop';

export type AgentUserContent = {
  text: string;
  file?: File;
  wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }>;
};

export async function createMemeLoopUserMessage(input: {
  agentId: string;
  content: AgentUserContent;
  messageId?: string;
  beforeCommitMap?: Record<string, { wikiFolderLocation: string; commitHash: string }>;
}): Promise<ChatMessage> {
  const messageId = input.messageId ?? nanoid();
  const metadata: Record<string, unknown> = {};

  const fileMetadata = await persistFileAttachment(input.agentId, messageId, input.content.file);
  if (fileMetadata) {
    metadata.file = fileMetadata;
  }

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
      (tiddler) => `[Wiki Tiddler: ${tiddler.tiddlerTitle} (${tiddler.workspaceName})]\n${tiddler.renderedContent}\n[End of tiddler: ${tiddler.tiddlerTitle}]`,
    );
    messageContent = `${tiddlerBlocks.join('\n\n')}\n\n${messageContent}`;
  }

  return createChatMessage({
    messageId,
    conversationId: input.agentId,
    role: 'user',
    content: messageContent,
    originNodeId: 'tidgi-desktop',
    contentType: 'text/plain',
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    duration: undefined,
  });
}

async function persistFileAttachment(agentId: string, messageId: string, file?: File): Promise<Record<string, unknown> | undefined> {
  if (!file) return undefined;

  const fileObject = file as unknown as { path?: string; name?: string; buffer?: ArrayBuffer };
  try {
    if ((fileObject.path || fileObject.buffer) && app) {
      const storageDirectory = path.join(app.getPath('userData'), 'agent_attachments', agentId);
      await fs.ensureDir(storageDirectory);

      const extension = path.extname(fileObject.name || fileObject.path || '') || '.bin';
      const newPath = path.join(storageDirectory, `${messageId}${extension}`);

      if (fileObject.path) {
        await fs.copy(fileObject.path, newPath);
      } else if (fileObject.buffer) {
        await fs.writeFile(newPath, Buffer.from(fileObject.buffer));
      }

      return {
        path: newPath,
        originalPath: fileObject.path,
        name: fileObject.name,
        savedAt: new Date(),
      };
    }
  } catch (error) {
    logger.error('Failed to persist MemeLoop attachment', { error, messageId });
  }

  if (fileObject.path || fileObject.name) {
    return {
      path: fileObject.path,
      name: fileObject.name,
    };
  }
  return undefined;
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
