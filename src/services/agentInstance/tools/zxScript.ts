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
import { registerWorkerBridgeTool } from './workerToolBridge';
import { terminalSessionManager } from '../terminal/sessionManager';

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

const PromptPatternSchema = z.object({
  name: z.string().meta({ title: 'Pattern name', description: 'Optional prompt pattern label' }),
  regex: z.string().meta({ title: 'Regex', description: 'JavaScript regex pattern string (e.g. ">\\s*$")' }),
});

const TerminalExecuteToolSchema = z.object({
  command: z.string().meta({ title: 'command', description: 'Shell command to run' }),
  timeoutMs: z.number().optional(),
  cwd: z.string().optional(),
  waitMode: z.enum(['until-exit', 'until-timeout', 'detached']).optional().default('until-timeout'),
  maxWaitMs: z.number().optional(),
  stream: z.boolean().optional().default(false),
  promptPatterns: z.array(PromptPatternSchema).optional(),
  idleTimeoutMs: z.number().optional(),
});

const TerminalFollowToolSchema = z.object({
  sessionId: z.string().meta({ title: 'sessionId', description: 'Terminal session id' }),
  fromSeq: z.number().optional(),
  untilExit: z.boolean().optional(),
  maxWaitMs: z.number().optional(),
});

const TerminalRespondToolSchema = z.object({
  sessionId: z.string(),
  input: z.string(),
});

const TerminalCancelToolSchema = z.object({
  sessionId: z.string(),
});

const TerminalListToolSchema = z.object({});

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

function safeParseRegExp(regexString: string): RegExp | null {
  try {
    return new RegExp(regexString);
  } catch {
    return null;
  }
}

async function executeTerminalExecute(
  parameters: z.infer<typeof TerminalExecuteToolSchema>,
  defaultTimeoutMs: number,
): Promise<ToolExecutionResult> {
  const {
    command,
    timeoutMs,
    cwd,
    waitMode,
    maxWaitMs,
    stream,
    promptPatterns,
    idleTimeoutMs,
  } = parameters;

  try {
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0] ?? '';
    const cmdArgs = parts.slice(1);
    if (!cmd) return { success: false, error: 'Empty terminal command' };

    const timeout = timeoutMs ?? defaultTimeoutMs;
    const wait = waitMode ?? 'until-timeout';
    const promptRegexes =
      promptPatterns?.map((p) => ({ name: p.name, regex: safeParseRegExp(p.regex) })).filter((x) => x.regex) ??
      [];

    // Add a generic fallback prompt detection if user doesn't specify.
    // This is intentionally permissive for typical shells.
    const genericPattern = { name: 'generic', regex: /[?%]\s*$|>\s*$|:\s*$/m };
    const mergedPatterns = promptRegexes.length ? promptRegexes.map((p) => ({ name: p.name, regex: p.regex! })) : [genericPattern];

    const started = await terminalSessionManager.start({
      command: cmd,
      args: cmdArgs.length ? cmdArgs : undefined,
      cwd,
      promptPatterns: mergedPatterns,
      idleTimeoutMs: Math.min(idleTimeoutMs ?? 15_000, timeout),
    });

    const { sessionId } = started;

    if (wait === 'detached') {
      return { success: true, data: JSON.stringify({ sessionId, status: 'running' }) };
    }

    const follow = await terminalSessionManager.follow(sessionId, {
      fromSeq: 1,
      untilExit: wait === 'until-exit',
      maxWaitMs: maxWaitMs ?? timeout,
    });

    const timedOut = wait === 'until-timeout' && !follow.done;
    if (timedOut) {
      await terminalSessionManager.cancel(sessionId);
    }

    const stdout = follow.chunks.filter((c) => c.stream === 'stdout').map((c) => c.data).join('');
    const stderr = follow.chunks.filter((c) => c.stream === 'stderr').map((c) => c.data).join('');

    return {
      success: true,
      data: JSON.stringify({
        sessionId,
        status: follow.status,
        exitCode: follow.exitCode,
        done: follow.done,
        nextSeq: follow.nextSeq,
        timedOut,
        stdout,
        stderr,
        output: stdout + (stderr ? `\n[stderr]\n${stderr}` : ''),
        chunks: stream ? follow.chunks : [],
      }),
    };
  } catch (error) {
    return { success: false, error: `terminal.execute failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function executeTerminalFollow(
  parameters: z.infer<typeof TerminalFollowToolSchema>,
): Promise<ToolExecutionResult> {
  const { sessionId, fromSeq, untilExit, maxWaitMs } = parameters;
  try {
    const follow = await terminalSessionManager.follow(sessionId, {
      fromSeq: fromSeq ?? 1,
      untilExit: untilExit === true,
      maxWaitMs: maxWaitMs ?? 30_000,
    });
    return { success: true, data: JSON.stringify(follow) };
  } catch (error) {
    return { success: false, error: `terminal.follow failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function executeTerminalRespond(
  parameters: z.infer<typeof TerminalRespondToolSchema>,
): Promise<ToolExecutionResult> {
  const { sessionId, input } = parameters;
  try {
    await terminalSessionManager.respond(sessionId, input);
    return { success: true, data: 'ok' };
  } catch (error) {
    return { success: false, error: `terminal.respond failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function executeTerminalCancel(
  parameters: z.infer<typeof TerminalCancelToolSchema>,
): Promise<ToolExecutionResult> {
  const { sessionId } = parameters;
  try {
    await terminalSessionManager.cancel(sessionId);
    const info = terminalSessionManager.get(sessionId);
    return { success: true, data: JSON.stringify({ sessionId, status: info?.status ?? 'killed' }) };
  } catch (error) {
    return { success: false, error: `terminal.cancel failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function executeTerminalList(): Promise<ToolExecutionResult> {
  try {
    const sessions = await terminalSessionManager.list();
    return { success: true, data: JSON.stringify({ sessions }) };
  } catch (error) {
    return { success: false, error: `terminal.list failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const zxScriptDefinition = registerToolDefinition({
  toolId: 'zxScript',
  displayName: 'ZX Script',
  description: 'Execute zx scripts in wiki worker context for automation',
  configSchema: ZxScriptParameterSchema,
  llmToolSchemas: {
    'zx-script': ZxScriptToolSchema,
    'terminal.execute': TerminalExecuteToolSchema,
    'terminal.follow': TerminalFollowToolSchema,
    'terminal.respond': TerminalRespondToolSchema,
    'terminal.cancel': TerminalCancelToolSchema,
    'terminal.list': TerminalListToolSchema,
  },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext, config }) {
    if (!toolCall || agentFrameworkContext.isCancelled()) return;

    const defaultTimeoutMs = config?.defaultTimeoutMs ?? 30000;

    if (toolCall.toolId === 'zx-script') {
      await executeToolCall('zx-script', executeZxScript);
      return;
    }
    if (toolCall.toolId === 'terminal.execute') {
      await executeToolCall('terminal.execute', (p) => executeTerminalExecute(p, defaultTimeoutMs));
      return;
    }
    if (toolCall.toolId === 'terminal.follow') {
      await executeToolCall('terminal.follow', executeTerminalFollow);
      return;
    }
    if (toolCall.toolId === 'terminal.respond') {
      await executeToolCall('terminal.respond', executeTerminalRespond);
      return;
    }
    if (toolCall.toolId === 'terminal.cancel') {
      await executeToolCall('terminal.cancel', executeTerminalCancel);
      return;
    }
    if (toolCall.toolId === 'terminal.list') {
      // list tool has an empty input schema; ignore parameters.
      await executeToolCall('terminal.list', async () => executeTerminalList());
      return;
    }
  },
});

export const zxScriptTool = zxScriptDefinition.tool;

registerWorkerBridgeTool('zx-script', async (args) => {
  const result = await executeZxScript(args as z.infer<typeof ZxScriptToolSchema>);
  if (result.success) return { result: result.data, metadata: result.metadata };
  return { error: result.error ?? 'zx-script failed' };
});

registerWorkerBridgeTool('terminal.execute', async (args) => {
  const result = await executeTerminalExecute(args as z.infer<typeof TerminalExecuteToolSchema>, 30000);
  if (result.success) return { result: result.data };
  return { error: result.error ?? 'terminal.execute failed' };
});

registerWorkerBridgeTool('terminal.follow', async (args) => {
  const result = await executeTerminalFollow(args as z.infer<typeof TerminalFollowToolSchema>);
  if (result.success) return { result: result.data };
  return { error: result.error ?? 'terminal.follow failed' };
});

registerWorkerBridgeTool('terminal.respond', async (args) => {
  const result = await executeTerminalRespond(args as z.infer<typeof TerminalRespondToolSchema>);
  if (result.success) return { result: result.data };
  return { error: result.error ?? 'terminal.respond failed' };
});

registerWorkerBridgeTool('terminal.cancel', async (args) => {
  const result = await executeTerminalCancel(args as z.infer<typeof TerminalCancelToolSchema>);
  if (result.success) return { result: result.data };
  return { error: result.error ?? 'terminal.cancel failed' };
});

registerWorkerBridgeTool('terminal.list', async () => {
  const result = await executeTerminalList();
  if (result.success) return { result: result.data };
  return { error: result.error ?? 'terminal.list failed' };
});
