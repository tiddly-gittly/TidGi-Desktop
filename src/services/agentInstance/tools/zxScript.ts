/**
 * ZX Script Tool — executes zx scripts in the wiki worker context.
 * Uses the existing NativeService.executeZxScript$ infrastructure.
 */
import { container } from '@services/container';
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { firstValueFrom, toArray } from 'rxjs';
import { z } from 'zod/v4';
import { registerToolDefinition, type ToolExecutionResult } from './defineTool';

export const ZxScriptParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  toolResultDuration: z.number().optional().default(1).meta({ title: 'Tool result duration', description: 'Rounds this result stays in context' }),
  defaultTimeoutMs: z.number().optional().default(30000).meta({ title: 'Default timeout (ms)', description: 'Default execution timeout for scripts' }),
}).meta({ title: 'ZX Script Config', description: 'Configuration for zx script execution tool' });

export type ZxScriptParameter = z.infer<typeof ZxScriptParameterSchema>;

const ZxScriptToolSchema = z.object({
  workspaceName: z.string().meta({ title: 'Workspace name', description: 'Wiki workspace name or ID (scripts execute in the context of this workspace)' }),
  script: z.string().meta({
    title: 'Script content',
    description: 'The zx script to execute. Can use $tw context and standard zx APIs (e.g., $`command`, fetch, fs).',
  }),
  fileName: z.string().optional().default('agent-script.mjs').meta({ title: 'File name', description: 'Virtual filename for the script' }),
}).meta({
  title: 'zx-script',
  description:
    'Execute a zx script in the wiki worker context. The script can access the TiddlyWiki $tw object and standard zx APIs. Use this for automation tasks like file operations, shell commands, or data processing. Requires user approval.',
  examples: [
    { workspaceName: 'My Wiki', script: 'const titles = $tw.wiki.getTiddlers();\nconsole.log(`Total tiddlers: ${titles.length}`);' },
  ],
});

async function executeZxScript(parameters: z.infer<typeof ZxScriptToolSchema>): Promise<ToolExecutionResult> {
  const { workspaceName, script, fileName = 'agent-script.mjs' } = parameters;
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);

  const workspaces = await workspaceService.getWorkspacesAsList();
  const target = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);
  if (!target) {
    return { success: false, error: `Workspace "${workspaceName}" not found. Available: ${workspaces.map(w => w.name).join(', ')}` };
  }

  logger.info('Executing zx script via agent tool', { workspaceName, fileName, scriptLength: script.length });

  try {
    // executeZxScript$ takes (IZxFileInput, workspaceID?) and returns Observable<string>
    // Each emitted string is a line of output
    const output$ = nativeService.executeZxScript$({ fileContent: script, fileName }, target.id);
    // Collect all output lines
    const outputLines = await firstValueFrom(output$.pipe(toArray()));
    const output = outputLines.join('\n').trim();

    return {
      success: true,
      data: output || '(script completed with no output)',
      metadata: { workspaceName },
    };
  } catch (error) {
    return { success: false, error: `Script execution failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const zxScriptDefinition = registerToolDefinition({
  toolId: 'zxScript',
  displayName: 'ZX Script',
  description: 'Execute zx scripts in wiki worker context for automation',
  configSchema: ZxScriptParameterSchema,
  llmToolSchemas: { 'zx-script': ZxScriptToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'zx-script') return;
    if (agentFrameworkContext.isCancelled()) return;
    await executeToolCall('zx-script', executeZxScript);
  },
});

export const zxScriptTool = zxScriptDefinition.tool;
