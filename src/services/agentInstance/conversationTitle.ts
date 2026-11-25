import { CONVERSATION_TITLE_INPUT_LENGTH, CONVERSATION_TITLE_LENGTH, CONVERSATION_TITLE_REQUEST_TIMEOUT_MS } from '@/constants/agentStorage';
import { withAgentTransaction } from '@services/database/agentTransaction';
import { AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { ConversationMetadataFieldEntity, ConversationTurnTombstoneEntity } from '@services/database/schema/conversationEvent';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { waitForAIStreamResult } from '@services/externalAPI/waitForAIStreamResult';
import type { DataSource, EntityManager } from 'typeorm';
import { appendLocalConversationEventsInTransaction } from './conversationEventStore';

const titleCharacters = new Intl.Segmenter();

function titleLine(value: string): string {
  const line = value.trim().split(/\r?\n/, 1)[0].trim().replace(/^["“「]+|["”」]+$/g, '');
  const characters = Array.from(titleCharacters.segment(line), item => item.segment);
  return characters.length > CONVERSATION_TITLE_LENGTH ? `${characters.slice(0, CONVERSATION_TITLE_LENGTH - 1).join('')}…` : line;
}

async function hasInitialTitle(manager: EntityManager, conversationId: string): Promise<boolean> {
  const instance = await manager.findOneBy(AgentInstanceEntity, { id: conversationId });
  if (!instance || instance.volatile || instance.closed) return false;
  const title = await manager.findOneBy(ConversationMetadataFieldEntity, { conversationId, field: 'title' });
  return title?.eventId === `metadata:create:${conversationId}` && title.valueJson === JSON.stringify(instance.name);
}

export async function writeConversationTitle(
  manager: EntityManager,
  conversationId: string,
  originNodeId: string,
  title: string,
): Promise<void> {
  await appendLocalConversationEventsInTransaction(manager, [{
    kind: 'metadataPatch',
    eventId: `metadata:title:${crypto.randomUUID()}`,
    conversationId,
    originNodeId,
    timestamp: Date.now(),
    patch: { title },
  }]);
}

export async function titleConversationFromOpeningMessage(
  dataSource: DataSource,
  externalAPIService: IExternalAPIService,
  conversationId: string,
  originNodeId: string,
): Promise<boolean> {
  if (!await hasInitialTitle(dataSource.manager, conversationId)) return false;
  const opening = await dataSource.getRepository(AgentInstanceMessageEntity).createQueryBuilder('message')
    .leftJoin(ConversationTurnTombstoneEntity, 'deleted', 'deleted.conversationId = message.conversationId AND deleted.turnId = message.turnId')
    .where('message.conversationId = :conversationId AND message.role = :role AND message.hidden = 0', { conversationId, role: 'user' })
    .andWhere("deleted.turnId IS NULL AND trim(message.content) <> ''")
    .orderBy('message.timestamp', 'ASC').addOrderBy('message.lamportClock', 'ASC')
    .addOrderBy('message.originNodeId', 'ASC').addOrderBy('message.messageId', 'ASC')
    .select(['message.content', 'message.metadata']).limit(1).getOne();
  if (!opening) return false;
  // Active wiki attachments are prepended to the persisted user message. Name the chat from the user's own text.
  const attachmentEnd = '\n[End Wiki Entry]\n\n';
  const attachmentEndIndex = opening.content.lastIndexOf(attachmentEnd);
  const prefixLength = opening.metadata?.wikiContextPrefixLength;
  const openingText = typeof prefixLength === 'number'
    ? opening.content.slice(prefixLength)
    : opening.metadata?.wikiTiddlers && opening.content.startsWith('[Wiki Entry from ')
    ? attachmentEndIndex < 0 ? '' : opening.content.slice(attachmentEndIndex + attachmentEnd.length)
    : opening.content;
  const input = openingText.trim().slice(0, CONVERSATION_TITLE_INPUT_LENGTH);
  if (!input) return false;

  const aiConfig = await externalAPIService.getAIConfig();
  const generated = await waitForAIStreamResult(
    `Write a short conversation title in the same language as the user's opening message. Return only the title, on one line.\n\n${JSON.stringify(input)}`,
    aiConfig,
    externalAPIService,
    { requestTimeoutMs: CONVERSATION_TITLE_REQUEST_TIMEOUT_MS },
  );
  const title = titleLine(generated ?? '') || titleLine(input);

  return withAgentTransaction(dataSource, async manager => {
    if (!await hasInitialTitle(manager, conversationId)) return false;
    await writeConversationTitle(manager, conversationId, originNodeId, title);
    return true;
  });
}
