/**
 * Desktop AgentDefinition service implementation: DB-backed definition persistence.
 * memeloop core manages the model, Desktop provides the storage layer.
 */
import { inject, injectable } from 'inversify';
import { pick } from 'lodash';
import type { AgentDefinition, HostAgentToolConfig } from 'memeloop';
import { AGENT_TOOL_LOOP_ID, getBuiltinLoopProfiles, type TiddlerFieldsForAgent, tiddlerToAgentDefinition } from 'memeloop';

import { nanoid } from 'nanoid';
import { DataSource, Repository } from 'typeorm';

import { MEME_LOOP_DATABASE_KEY } from '@/constants/database';
import type { IAgentBrowserService } from '@services/agentBrowser/interface';
import type { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity, AgentInstanceEntity, ScheduledTaskEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { AgentTemplateSource, IAgentDefinitionService } from './interface';

const GENERAL_ASSISTANT_ID = 'memeloop:general-assistant';
const DESKTOP_WIKI_PROFILE_ID = 'memeloop:frontend-ui-ux';
const DESKTOP_GENERAL_ASSISTANT_TOOL_IDS = new Set(['workspacesList', 'wikiSearch', 'wikiOperation']);

export function mergeDesktopGeneralAssistantTools(
  tools: readonly HostAgentToolConfig[] | undefined,
  desktopTools: readonly HostAgentToolConfig[],
): HostAgentToolConfig[] {
  const merged = [...(tools ?? [])];
  const configuredToolIds = new Set(merged.map(tool => tool.toolId));
  for (const tool of desktopTools) {
    if (configuredToolIds.has(tool.toolId)) continue;
    merged.push(tool);
    configuredToolIds.add(tool.toolId);
  }
  return merged;
}

function createDesktopBuiltinAgentDefinitions(): AgentDefinition[] {
  const portableDefinitions = getBuiltinLoopProfiles().map((profile): AgentDefinition => ({
    systemPrompt: '',
    tools: [],
    version: '1',
    ...profile,
  }));
  const desktopWikiTools = portableDefinitions
    .find(definition => definition.id === DESKTOP_WIKI_PROFILE_ID)
    ?.agentTools?.filter(tool => DESKTOP_GENERAL_ASSISTANT_TOOL_IDS.has(tool.toolId)) ?? [];

  return portableDefinitions.map(definition =>
    definition.id === GENERAL_ASSISTANT_ID
      ? {
        ...definition,
        agentTools: mergeDesktopGeneralAssistantTools(definition.agentTools, desktopWikiTools),
      }
      : definition
  );
}

const defaultAgentsList = createDesktopBuiltinAgentDefinitions();

function mergeTextOverride(value: string | null | undefined, fallback: string | undefined): string | undefined {
  return value?.trim() ? value : fallback;
}

function mergeWithDefaultAgent(entity: AgentDefinitionEntity): AgentDefinition {
  const defaultAgent = defaultAgentsList.find(agent => agent.id === entity.id);
  return {
    systemPrompt: '',
    tools: [],
    version: '1',
    ...defaultAgent,
    id: entity.id,
    name: mergeTextOverride(entity.name, defaultAgent?.name) ?? '',
    description: mergeTextOverride(entity.description, defaultAgent?.description) ?? '',
    avatarUrl: mergeTextOverride(entity.avatarUrl, defaultAgent?.avatarUrl),
    agentFrameworkID: mergeTextOverride(entity.agentFrameworkID, defaultAgent?.agentFrameworkID) || AGENT_TOOL_LOOP_ID,
    agentFrameworkConfig: entity.agentFrameworkConfig ?? defaultAgent?.agentFrameworkConfig ?? { prompts: [], plugins: [] },
    modelConfig: entity.modelConfig ?? defaultAgent?.modelConfig,
    agentTools: entity.agentTools ?? defaultAgent?.agentTools,
    heartbeat: entity.heartbeat ?? defaultAgent?.heartbeat,
  };
}

export function shouldRefreshBuiltinDefinition(entity: Pick<AgentDefinitionEntity, 'builtinVersion' | 'isCustomized' | 'createdAt' | 'updatedAt'>): boolean {
  if (entity.isCustomized !== null && entity.isCustomized !== undefined) {
    return !entity.isCustomized;
  }

  // Before builtinVersion/isCustomized existed, Desktop inserted complete
  // bundled definitions. An unchanged row has identical creation/update
  // timestamps; edited legacy rows must be preserved.
  return entity.createdAt.getTime() === entity.updatedAt.getTime();
}

@injectable()
export class AgentDefinitionService implements IAgentDefinitionService {
  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;
  @inject(serviceIdentifier.AgentBrowser)
  private readonly agentBrowserService!: IAgentBrowserService;

  private templateSource: AgentTemplateSource | undefined;

  private dataSource: DataSource | null = null;
  private agentDefRepository: Repository<AgentDefinitionEntity> | null = null;

  public configureTemplateSource(source: AgentTemplateSource): void {
    this.templateSource = source;
  }

  public async initialize(): Promise<void> {
    try {
      await this.databaseService.initializeDatabase(MEME_LOOP_DATABASE_KEY);
      this.dataSource = await this.databaseService.getDatabase(MEME_LOOP_DATABASE_KEY);
      this.agentDefRepository = this.dataSource.getRepository(AgentDefinitionEntity);
      await this.initializeDefaultAgents();
      if (this.agentBrowserService) await this.agentBrowserService.initialize();
    } catch (error) {
      logger.error(`Failed to initialize agent service: ${String(error)}`);
      throw error;
    }
  }

  private async initializeDefaultAgents(): Promise<void> {
    if (!this.agentDefRepository) throw new Error('Agent repositories not initialized');
    try {
      const existingById = new Map(
        (await this.agentDefRepository.find()).map(entity => [entity.id, entity]),
      );
      const entitiesToSave: AgentDefinitionEntity[] = [];

      for (const definition of defaultAgentsList) {
        const existing = existingById.get(definition.id);
        if (existing && !shouldRefreshBuiltinDefinition(existing)) {
          continue;
        }

        const entity = existing ?? this.agentDefRepository.create({ id: definition.id });
        Object.assign(entity, {
          id: definition.id,
          name: definition.name,
          description: definition.description,
          avatarUrl: definition.avatarUrl,
          agentFrameworkID: definition.agentFrameworkID || AGENT_TOOL_LOOP_ID,
          agentFrameworkConfig: definition.agentFrameworkConfig,
          modelConfig: definition.modelConfig,
          agentTools: definition.agentTools,
          heartbeat: definition.heartbeat,
          builtinVersion: definition.version,
          isCustomized: false,
        });
        entitiesToSave.push(entity);
      }

      if (entitiesToSave.length > 0) {
        await this.agentDefRepository.save(entitiesToSave);
        logger.info('Refreshed bundled agent definitions', {
          definitions: entitiesToSave.map(entity => ({
            id: entity.id,
            version: entity.builtinVersion,
          })),
        });
      }
    } catch (error) {
      logger.error(`Failed to initialize default agents: ${String(error)}`);
      throw error;
    }
  }

  private ensureRepositories(): void {
    if (!this.agentDefRepository) throw new Error('Agent repositories not initialized');
  }

  public async createAgentDef(agent: AgentDefinition): Promise<AgentDefinition> {
    this.ensureRepositories();
    if (!agent.id) agent.id = nanoid();
    await this.agentDefRepository!.save(this.agentDefRepository!.create({
      ...agent,
      isCustomized: true,
    }));
    return agent;
  }

  public async updateAgentDef(agent: Partial<AgentDefinition> & { id: string }): Promise<AgentDefinition> {
    this.ensureRepositories();
    const existing = await this.agentDefRepository!.findOne({ where: { id: agent.id } });
    if (!existing) throw new Error(`Agent definition not found: ${agent.id}`);
    Object.assign(
      existing,
      Object.fromEntries(
        Object.entries(pick(agent, ['name', 'description', 'avatarUrl', 'agentFrameworkID', 'agentFrameworkConfig', 'modelConfig', 'agentTools', 'heartbeat']))
          .filter(([, v]) => v !== undefined),
      ),
    );
    existing.isCustomized = true;
    await this.agentDefRepository!.save(existing);
    return existing as unknown as AgentDefinition;
  }

  public async getAgentDefs(): Promise<AgentDefinition[]> {
    this.ensureRepositories();
    return (await this.agentDefRepository!.find()).map(mergeWithDefaultAgent);
  }

  public async getAgentDef(definitionId?: string): Promise<AgentDefinition | undefined> {
    this.ensureRepositories();
    if (!definitionId) {
      const all = await this.getAgentDefs();
      return all.length > 0 ? all[0] : undefined;
    }
    const entity = await this.agentDefRepository!.findOne({ where: { id: definitionId } });
    return entity ? mergeWithDefaultAgent(entity) : undefined;
  }

  public async deleteAgentDef(id: string): Promise<void> {
    this.ensureRepositories();
    if (!id.startsWith('temp-')) throw new Error(`Refusing to delete non-temporary agent definition: ${id}`);
    const instanceRepo = this.dataSource!.getRepository(AgentInstanceEntity);
    const stRepo = this.dataSource!.getRepository(ScheduledTaskEntity);
    for (const inst of await instanceRepo.find({ where: { agentDefId: id } })) await instanceRepo.delete(inst.id);
    await stRepo.delete({ agentDefinitionId: id });
    await this.agentDefRepository!.delete(id);
  }

  public async getAgentTemplates(): Promise<AgentDefinition[]> {
    const templates: AgentDefinition[] = [...defaultAgentsList];

    // Query active wiki workspaces for agent template tiddlers
    try {
      const templateSources = await this.templateSource?.() ?? [];
      for (const { tiddler, workspaceName } of templateSources) {
        const agentDefinition = tiddlerToAgentDefinition(tiddler as TiddlerFieldsForAgent, workspaceName);
        if (agentDefinition) {
          templates.push(agentDefinition);
        }
      }
    } catch {
      // Workspace service not available
    }

    return templates;
  }
}
