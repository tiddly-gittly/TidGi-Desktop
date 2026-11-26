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

function readTitle(manager: EntityManager, conversationId: string) {
  return manager.findOneBy(ConversationMetadataFieldEntity, { conversationId, field: 'title' });
}

function titleInput(message: Pick<AgentInstanceMessageEntity, 'content' | 'metadata'>): string {
  // Wiki attachments can be prepended to the persisted message.
  const { content, metadata } = message;
  if (typeof metadata?.wikiContextPrefixLength === 'number') {
    return content.slice(metadata.wikiContextPrefixLength).trim().slice(0, CONVERSATION_TITLE_INPUT_LENGTH);
  }
  if (metadata?.wikiTiddlers && content.startsWith('[Wiki Entry from ')) {
    const end = '\n[End Wiki Entry]\n\n';
    const boundary = content.lastIndexOf(end);
    return boundary < 0 ? '' : content.slice(boundary + end.length).trim().slice(0, CONVERSATION_TITLE_INPUT_LENGTH);
  }
  return content.trim().slice(0, CONVERSATION_TITLE_INPUT_LENGTH);
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

export async function generateConversationTitle(
  dataSource: DataSource,
  externalAPIService: IExternalAPIService,
  conversationId: string,
  originNodeId: string,
  mode: 'initial' | 'regenerate',
): Promise<boolean> {
  const instance = await dataSource.manager.findOneBy(AgentInstanceEntity, { id: conversationId });
  if (!instance || instance.volatile || instance.closed) return false;
  const previous = await readTitle(dataSource.manager, conversationId);
  if (mode === 'initial' && (previous?.eventId !== `metadata:create:${conversationId}` || previous.valueJson !== JSON.stringify(instance.name))) {
    return false;
  }
  const messages = dataSource.getRepository(AgentInstanceMessageEntity).createQueryBuilder('message')
    .leftJoin(ConversationTurnTombstoneEntity, 'deleted', 'deleted.conversationId = message.conversationId AND deleted.turnId = message.turnId')
    .where('message.conversationId = :conversationId AND message.role = :role AND message.hidden = 0', { conversationId, role: 'user' })
    .andWhere("deleted.turnId IS NULL AND trim(message.content) <> ''")
    .select(['message.content', 'message.metadata']).limit(1);
  const readMessage = async (direction: 'ASC' | 'DESC') => {
    const message = await messages.clone().orderBy('message.timestamp', direction).addOrderBy('message.lamportClock', direction)
      .addOrderBy('message.originNodeId', direction).addOrderBy('message.messageId', direction).getOne();
    return message ? titleInput(message) : '';
  };
  const opening = await readMessage('ASC');
  const latest = mode === 'regenerate' ? await readMessage('DESC') : '';
  const input = latest || opening;
  if (!input) return false;

  const aiConfig = await externalAPIService.getAIConfig();
  const context = JSON.stringify(latest && opening && latest !== opening ? { opening, latest } : input);
  const generated = await waitForAIStreamResult(
    `Write a short title for this conversation in the user's language. If both an opening and a latest message are provided, focus on the latest topic. Return only the title, on one line.\n\n${context}`,
    aiConfig,
    externalAPIService,
    { requestTimeoutMs: CONVERSATION_TITLE_REQUEST_TIMEOUT_MS },
  );
  const title = titleLine(generated ?? '') || titleLine(input);

  return withAgentTransaction(dataSource, async manager => {
    const current = await readTitle(manager, conversationId);
    if (current?.eventId !== previous?.eventId || current?.valueJson === JSON.stringify(title)) return false;
    await writeConversationTitle(manager, conversationId, originNodeId, title);
    return true;
  });
}
