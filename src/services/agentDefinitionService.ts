/**
 * Desktop AgentDefinition service: DB-backed definition persistence and IPC bridge.
 * memeloop core manages the model, Desktop provides the storage layer.
 */
import { inject, injectable } from 'inversify';
import { pick } from 'lodash';
import { getBuiltinAgentDefinitions, tiddlerToAgentDefinition, type TiddlerFieldsForAgent } from 'memeloop';
import { WikiChannel } from '@/constants/channels';
import type { AgentDefinition, IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';

export type { AgentDefinition, AgentHeartbeatConfig, AgentToolConfig, IAgentDefinitionService, ToolCallingMatch } from '@services/agentDefinition/interface';
export { AgentDefinitionServiceIPCDescriptor } from '@services/agentDefinition/interface';

// ── Service implementation ─────────────────────────────────────────

import { nanoid } from 'nanoid';
import { DataSource, Repository } from 'typeorm';

import type { IAgentBrowserService } from '@services/agentBrowser/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity, AgentInstanceEntity, ScheduledTaskEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';

const defaultAgentsList = getBuiltinAgentDefinitions() as unknown as AgentDefinition[];

function mergeTextOverride(value: string | null | undefined, fallback: string | undefined): string | undefined {
  return value?.trim() ? value : fallback;
}

function mergeWithDefaultAgent(entity: AgentDefinitionEntity): AgentDefinition {
  const defaultAgent = defaultAgentsList.find(agent => agent.id === entity.id);
  return {
    id: entity.id,
    name: mergeTextOverride(entity.name, defaultAgent?.name),
    description: mergeTextOverride(entity.description, defaultAgent?.description),
    avatarUrl: mergeTextOverride(entity.avatarUrl, defaultAgent?.avatarUrl),
    agentFrameworkID: mergeTextOverride(entity.agentFrameworkID, defaultAgent?.agentFrameworkID),
    agentFrameworkConfig: entity.agentFrameworkConfig ?? defaultAgent?.agentFrameworkConfig ?? {},
    aiApiConfig: entity.aiApiConfig ?? defaultAgent?.aiApiConfig,
    agentTools: entity.agentTools ?? defaultAgent?.agentTools,
    heartbeat: entity.heartbeat ?? defaultAgent?.heartbeat,
  };
}

@injectable()
export class AgentDefinitionService implements IAgentDefinitionService {
  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;
  @inject(serviceIdentifier.AgentBrowser)
  private readonly agentBrowserService!: IAgentBrowserService;

  private dataSource: DataSource | null = null;
  private agentDefRepository: Repository<AgentDefinitionEntity> | null = null;

  public async initialize(): Promise<void> {
    try {
      await this.databaseService.initializeDatabase('agent');
      this.dataSource = await this.databaseService.getDatabase('agent');
      this.agentDefRepository = this.dataSource.getRepository(AgentDefinitionEntity);
      await this.initializeDefaultAgentsIfEmpty();
      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
      if (agentInstanceService) await agentInstanceService.initialize();
      if (this.agentBrowserService) await this.agentBrowserService.initialize();
    } catch (error) {
      logger.error(`Failed to initialize agent service: ${error}`);
      throw error;
    }
  }

  private async initializeDefaultAgentsIfEmpty(): Promise<void> {
    if (!this.agentDefRepository) throw new Error('Agent repositories not initialized');
    try {
      const existingCount = await this.agentDefRepository.count();
      if (existingCount === 0) {
        const entities = defaultAgentsList.map(d => this.agentDefRepository!.create({
          id: d.id, name: d.name, description: d.description, avatarUrl: d.avatarUrl,
          agentFrameworkID: d.agentFrameworkID, agentFrameworkConfig: d.agentFrameworkConfig,
          aiApiConfig: d.aiApiConfig, agentTools: d.agentTools, heartbeat: d.heartbeat,
        }));
        await this.agentDefRepository.save(entities);
      }
    } catch (error) {
      logger.error(`Failed to initialize default agents: ${error}`);
      throw error;
    }
  }

  private ensureRepositories(): void { if (!this.agentDefRepository) throw new Error('Agent repositories not initialized'); }

  public async createAgentDef(agent: AgentDefinition): Promise<AgentDefinition> {
    this.ensureRepositories();
    if (!agent.id) agent.id = nanoid();
    await this.agentDefRepository!.save(this.agentDefRepository!.create({ ...agent }));
    return agent;
  }

  public async updateAgentDef(agent: Partial<AgentDefinition> & { id: string }): Promise<AgentDefinition> {
    this.ensureRepositories();
    const existing = await this.agentDefRepository!.findOne({ where: { id: agent.id } });
    if (!existing) throw new Error(`Agent definition not found: ${agent.id}`);
    Object.assign(existing, Object.fromEntries(
      Object.entries(pick(agent, ['name', 'description', 'avatarUrl', 'agentFrameworkID', 'agentFrameworkConfig', 'aiApiConfig', 'heartbeat']))
        .filter(([, v]) => v !== undefined),
    ));
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
    const ais = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    for (const inst of await instanceRepo.find({ where: { agentDefId: id } })) await ais.deleteAgent(inst.id);
    await stRepo.delete({ agentDefinitionId: id });
    await this.agentDefRepository!.delete(id);
  }

  public async getAgentTemplates(): Promise<AgentDefinition[]> {
    const templates: AgentDefinition[] = [...defaultAgentsList];

    // Query active wiki workspaces for agent template tiddlers
    try {
      const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      const workspaces = await workspaceService.getWorkspacesAsList();
      const activeMain = workspaces.filter((ws) => isWikiWorkspace(ws) && ws.active && !ws.isSubWiki);

      for (const workspace of activeMain) {
        try {
          const tiddlers = await wikiService.wikiOperationInServer(
            WikiChannel.getTiddlersAsJson, workspace.id, ['[tag[$:/tags/AI/Template]]'],
          ) as unknown[];
          if (Array.isArray(tiddlers)) {
            for (const tiddler of tiddlers) {
              const agentDef = tiddlerToAgentDefinition(tiddler as unknown as TiddlerFieldsForAgent, workspace.name);
              if (agentDef) {
                templates.push(agentDef as unknown as AgentDefinition);
              }
            }
          }
        } catch {
          // Skip workspaces that fail to respond
        }
      }
    } catch {
      // Workspace service not available
    }

    return templates;
  }
}
