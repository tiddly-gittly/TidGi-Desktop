/**
 * Desktop AgentDefinition service implementation: DB-backed definition persistence.
 * memeloop core manages the model, Desktop provides the storage layer.
 */
import { inject, injectable } from 'inversify';
import { pick } from 'lodash';
import type { AgentDefinition, HostAgentToolConfig } from 'memeloop';
import { getBuiltinLoopProfiles, type TiddlerFieldsForAgent, tiddlerToAgentDefinition } from 'memeloop';

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
  const merged: HostAgentToolConfig[] = [];
  const toolIndex = new Map<string, number>();
  for (const tool of [...desktopTools, ...(tools ?? [])]) {
    const configuredIndex = toolIndex.get(tool.toolId);
    if (configuredIndex === undefined) {
      toolIndex.set(tool.toolId, merged.length);
      merged.push(tool);
    } else {
      // A host/user configured declaration wins without changing the stable
      // Desktop overlay order used by the prompt editor.
      merged[configuredIndex] = tool;
    }
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

function projectAgentDefinition(entity: AgentDefinitionEntity): AgentDefinition {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    systemPrompt: entity.systemPrompt,
    tools: [...entity.tools],
    version: entity.version,
    ...(entity.avatarUrl === undefined ? {} : { avatarUrl: entity.avatarUrl }),
    ...(entity.agentFrameworkID === undefined ? {} : { agentFrameworkID: entity.agentFrameworkID }),
    ...(entity.agentFrameworkConfig === undefined ? {} : { agentFrameworkConfig: entity.agentFrameworkConfig }),
    ...(entity.modelConfig === undefined ? {} : { modelConfig: entity.modelConfig }),
    ...(entity.agentTools === undefined ? {} : { agentTools: entity.agentTools }),
    ...(entity.heartbeat === undefined ? {} : { heartbeat: entity.heartbeat }),
  };
}

export function shouldRefreshBuiltinDefinition(entity: Pick<AgentDefinitionEntity, 'isCustomized'>): boolean {
  return !entity.isCustomized;
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
          systemPrompt: definition.systemPrompt,
          tools: definition.tools,
          version: definition.version,
          avatarUrl: definition.avatarUrl,
          agentFrameworkID: definition.agentFrameworkID,
          agentFrameworkConfig: definition.agentFrameworkConfig,
          modelConfig: definition.modelConfig,
          agentTools: definition.agentTools,
          heartbeat: definition.heartbeat,
          isCustomized: false,
        });
        entitiesToSave.push(entity);
      }

      if (entitiesToSave.length > 0) {
        await this.agentDefRepository.save(entitiesToSave);
        logger.info('Refreshed bundled agent definitions', {
          definitions: entitiesToSave.map(entity => ({
            id: entity.id,
            version: entity.version,
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
    return projectAgentDefinition(existing);
  }

  public async getAgentDefs(): Promise<AgentDefinition[]> {
    this.ensureRepositories();
    return (await this.agentDefRepository!.find()).map(projectAgentDefinition);
  }

  public async getAgentDef(definitionId?: string): Promise<AgentDefinition | undefined> {
    this.ensureRepositories();
    if (!definitionId) {
      const all = await this.getAgentDefs();
      return all.length > 0 ? all[0] : undefined;
    }
    const entity = await this.agentDefRepository!.findOne({ where: { id: definitionId } });
    return entity ? projectAgentDefinition(entity) : undefined;
  }

  public async deleteAgentDef(id: string): Promise<void> {
    this.ensureRepositories();
    if (!id.startsWith('temp-')) throw new Error(`Refusing to delete non-temporary agent definition: ${id}`);
    await this.dataSource!.transaction(async manager => {
      const instanceCount = await manager.getRepository(AgentInstanceEntity).count({ where: { agentDefId: id } });
      if (instanceCount > 0) {
        throw new Error(`Refusing to delete referenced temporary agent definition: ${id}`);
      }
      await manager.getRepository(ScheduledTaskEntity).delete({ agentDefinitionId: id });
      await manager.getRepository(AgentDefinitionEntity).delete(id);
    });
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
