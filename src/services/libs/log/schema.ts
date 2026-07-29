import { z } from 'zod';

export const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug']);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const logProcessSchema = z.enum(['main', 'git-worker', 'wiki-worker', 'renderer']);
export type LogProcess = z.infer<typeof logProcessSchema>;

export const logScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('global') }),
  z.object({
    kind: z.literal('workspace'),
    workspaceID: z.string().min(1),
    workspaceName: z.string().optional(),
  }),
]);
export type LogScope = z.infer<typeof logScopeSchema>;

export const logContextSchema = z.object({
  process: logProcessSchema,
  scope: logScopeSchema,
  component: z.string().optional(),
  pid: z.number().int().nonnegative().optional(),
});
export type LogContext = z.infer<typeof logContextSchema>;

export const logRecordSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  timestamp: z.iso.datetime(),
  level: logLevelSchema,
  message: z.string(),
  process: logProcessSchema,
  scope: logScopeSchema,
  component: z.string().optional(),
  pid: z.number().int().nonnegative(),
  meta: z.record(z.string(), z.unknown()),
});
export type LogRecord = z.infer<typeof logRecordSchema>;

export const GLOBAL_MAIN_LOG_CONTEXT: LogContext = {
  process: 'main',
  scope: { kind: 'global' },
  component: 'main',
};

export function workspaceLogContext(
  workspaceID: string,
  workspaceName: string | undefined,
  process: LogProcess,
  component?: string,
): LogContext {
  return {
    process,
    scope: { kind: 'workspace', workspaceID, ...(workspaceName === undefined ? {} : { workspaceName }) },
    ...(component === undefined ? {} : { component }),
  };
}
