import { injectable } from 'inversify';
import { AgentToolRegistration, IAgentTool, IAgentToolRegistry } from './interface';

/**
 * Default implementation of agent tool registry
 */
@injectable()
export class AgentToolRegistry implements IAgentToolRegistry {
  private tools = new Map<string, AgentToolRegistration>();

  /**
   * Register a new tool
   */
  public registerTool(tool: IAgentTool, options?: { tags?: string[]; enabled?: boolean }): void {
    const registration: AgentToolRegistration = {
      tool,
      tags: options?.tags ?? [],
      enabled: options?.enabled ?? true,
    };

    this.tools.set(tool.id, registration);
  }

  /**
   * Get a tool by ID
   */
  public getTool(id: string): IAgentTool | undefined {
    const registration = this.tools.get(id);
    return registration?.enabled === false ? undefined : registration?.tool;
  }

  /**
   * Get all registered tools
   */
  public getAllTools(): IAgentTool[] {
    return Array.from(this.tools.values())
      .filter(reg => reg.enabled !== false)
      .map(reg => reg.tool);
  }

  /**
   * Get tools that match certain criteria
   */
  public getToolsByTag(tag: string): IAgentTool[] {
    return Array.from(this.tools.values())
      .filter(reg => reg.enabled !== false && reg.tags?.includes(tag))
      .map(reg => reg.tool);
  }

  /**
   * Enable or disable a tool
   */
  public setToolEnabled(id: string, enabled: boolean): void {
    const registration = this.tools.get(id);
    if (registration) {
      registration.enabled = enabled;
    }
  }

  /**
   * Unregister a tool
   */
  public unregisterTool(id: string): void {
    this.tools.delete(id);
  }
}
