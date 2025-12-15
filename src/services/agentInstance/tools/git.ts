/**
 * Git Tool
 * Provides git log search (message/file/date range) and file content retrieval for commits.
 */
import { container } from '@services/container';
import type { IGitLogOptions, IGitService } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { z } from 'zod/v4';
import { registerToolDefinition, type ToolExecutionResult } from './defineTool';

export const GitToolParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({
      title: t('Schema.Common.ToolListPosition.TargetIdTitle'),
      description: t('Schema.Common.ToolListPosition.TargetId'),
    }),
    position: z.enum(['before', 'after', 'child']).default('child').meta({
      title: t('Schema.Common.ToolListPosition.PositionTitle'),
      description: t('Schema.Common.ToolListPosition.Position'),
    }),
  }).optional().meta({
    title: t('Schema.Common.ToolListPositionTitle'),
    description: t('Schema.Common.ToolListPosition.Description'),
  }),
}).meta({
  title: t('Schema.Git.Title'),
  description: t('Schema.Git.Description'),
});

export type GitToolParameter = z.infer<typeof GitToolParameterSchema>;

export function getGitToolParameterSchema() {
  return GitToolParameterSchema;
}

const GitLogToolSchema = z.object({
  workspaceName: z.string().meta({
    title: t('Schema.Git.Tool.Parameters.workspaceName.Title'),
    description: t('Schema.Git.Tool.Parameters.workspaceName.Description'),
  }),
  searchMode: z.enum(['message', 'file', 'dateRange', 'none']).default('message').meta({
    title: t('Schema.Git.Tool.Parameters.searchMode.Title'),
    description: t('Schema.Git.Tool.Parameters.searchMode.Description'),
  }),
  searchQuery: z.string().optional().meta({
    title: t('Schema.Git.Tool.Parameters.searchQuery.Title'),
    description: t('Schema.Git.Tool.Parameters.searchQuery.Description'),
  }),
  filePath: z.string().optional().meta({
    title: t('Schema.Git.Tool.Parameters.filePath.Title'),
    description: t('Schema.Git.Tool.Parameters.filePath.Description'),
  }),
  since: z.string().optional().meta({
    title: t('Schema.Git.Tool.Parameters.since.Title'),
    description: t('Schema.Git.Tool.Parameters.since.Description'),
  }),
  until: z.string().optional().meta({
    title: t('Schema.Git.Tool.Parameters.until.Title'),
    description: t('Schema.Git.Tool.Parameters.until.Description'),
  }),
  page: z.number().int().positive().default(1).meta({
    title: t('Schema.Git.Tool.Parameters.page.Title'),
    description: t('Schema.Git.Tool.Parameters.page.Description'),
  }),
  pageSize: z.number().int().positive().default(20).meta({
    title: t('Schema.Git.Tool.Parameters.pageSize.Title'),
    description: t('Schema.Git.Tool.Parameters.pageSize.Description'),
  }),
}).meta({
  title: 'git-log',
  description: 'Search git commits by message, file path, or date range',
  examples: [
    {
      workspaceName: 'My Wiki',
      searchMode: 'message',
      searchQuery: 'fix bug',
      page: 1,
      pageSize: 10,
    },
    {
      workspaceName: 'My Wiki',
      searchMode: 'file',
      filePath: 'tiddlers/Index.tid',
      page: 1,
      pageSize: 10,
    },
    {
      workspaceName: 'My Wiki',
      searchMode: 'dateRange',
      since: '2024-01-01T00:00:00Z',
      until: '2024-12-31T23:59:59Z',
    },
  ],
});

type GitLogParameters = z.infer<typeof GitLogToolSchema>;

const GitReadFileToolSchema = z.object({
  workspaceName: z.string().meta({
    title: t('Schema.Git.Tool.Parameters.workspaceName.Title'),
    description: t('Schema.Git.Tool.Parameters.workspaceName.Description'),
  }),
  commitHash: z.string().meta({
    title: t('Schema.Git.Tool.Parameters.commitHash.Title'),
    description: t('Schema.Git.Tool.Parameters.commitHash.Description'),
  }),
  filePath: z.string().meta({
    title: t('Schema.Git.Tool.Parameters.filePath.Title'),
    description: t('Schema.Git.Tool.Parameters.filePath.Description'),
  }),
  maxLines: z.number().int().positive().default(500).meta({
    title: t('Schema.Git.Tool.Parameters.maxLines.Title'),
    description: t('Schema.Git.Tool.Parameters.maxLines.Description'),
  }),
}).meta({
  title: 'git-read-file',
  description: 'Read a specific file content from a given commit',
  examples: [
    {
      workspaceName: 'My Wiki',
      commitHash: 'abc123',
      filePath: 'tiddlers/Index.tid',
      maxLines: 200,
    },
  ],
});

type GitReadFileParameters = z.infer<typeof GitReadFileToolSchema>;

type ResolveWorkspaceResult =
  | { success: true; workspaceID: string; wikiFolderLocation: string; workspaceName: string }
  | { success: false; error: string };

async function resolveWorkspace(workspaceName: string): Promise<ResolveWorkspaceResult> {
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const workspaces = await workspaceService.getWorkspacesAsList();
  const target = workspaces.find((ws) => ws.name === workspaceName || ws.id === workspaceName);
  if (!target || !isWikiWorkspace(target)) {
    return {
      success: false,
      error: i18n.t('Tool.Git.Error.WorkspaceNotFound', { workspaceName }),
    };
  }
  return { success: true, workspaceID: target.id, wikiFolderLocation: target.wikiFolderLocation, workspaceName: target.name };
}

async function executeGitLog(parameters: GitLogParameters): Promise<ToolExecutionResult> {
  const resolved = await resolveWorkspace(parameters.workspaceName);
  if (!resolved.success) {
    throw new Error(resolved.error);
  }
  const { workspaceID, wikiFolderLocation, workspaceName } = resolved;

  const gitService = container.get<IGitService>(serviceIdentifier.Git);
  const options: IGitLogOptions = {
    searchMode: parameters.searchMode,
    searchQuery: parameters.searchQuery,
    filePath: parameters.filePath,
    since: parameters.since,
    until: parameters.until,
    page: parameters.page,
    pageSize: parameters.pageSize,
  };

  logger.debug('Executing git log search', { workspaceID, options });
  const result = await gitService.getGitLog(wikiFolderLocation, options);

  return {
    success: true,
    data: JSON.stringify({
      workspaceID,
      workspaceName,
      totalCount: result.totalCount,
      currentBranch: result.currentBranch,
      entries: result.entries,
    }),
    metadata: { workspaceID, workspaceName, searchMode: parameters.searchMode, page: parameters.page, pageSize: parameters.pageSize },
  };
}

async function executeGitReadFile(parameters: GitReadFileParameters): Promise<ToolExecutionResult> {
  const resolved = await resolveWorkspace(parameters.workspaceName);
  if (!resolved.success) {
    throw new Error(resolved.error);
  }
  const { workspaceID, wikiFolderLocation, workspaceName } = resolved;

  const gitService = container.get<IGitService>(serviceIdentifier.Git);
  logger.debug('Reading file from commit', { workspaceID, filePath: parameters.filePath, commitHash: parameters.commitHash });

  const fileResult = await gitService.getFileContent(
    wikiFolderLocation,
    parameters.commitHash,
    parameters.filePath,
    parameters.maxLines,
  );

  return {
    success: true,
    data: JSON.stringify({
      workspaceID,
      workspaceName,
      commitHash: parameters.commitHash,
      filePath: parameters.filePath,
      content: fileResult.content,
      isTruncated: fileResult.isTruncated,
    }),
    metadata: { workspaceID, workspaceName, commitHash: parameters.commitHash, filePath: parameters.filePath },
  };
}

const gitToolDefinition = registerToolDefinition({
  toolId: 'git',
  displayName: t('Schema.Git.Title'),
  description: t('Schema.Git.Description'),
  configSchema: GitToolParameterSchema,
  llmToolSchemas: {
    'git-log': GitLogToolSchema,
    'git-read-file': GitReadFileToolSchema,
  },

  onProcessPrompts({ config, injectToolList, toolConfig }) {
    const toolListPosition = config.toolListPosition;
    if (!toolListPosition?.targetId) return;

    injectToolList({
      targetId: toolListPosition.targetId,
      position: toolListPosition.position || 'child',
      caption: 'Git Tools',
    });

    logger.debug('Git tool list injected', { targetId: toolListPosition.targetId, toolId: toolConfig.id });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall) return;
    if (agentFrameworkContext.isCancelled()) return;

    if (toolCall.toolId === 'git-log') {
      await executeToolCall('git-log', executeGitLog);
      return;
    }

    if (toolCall.toolId === 'git-read-file') {
      await executeToolCall('git-read-file', executeGitReadFile);
    }
  },
});

export const gitTool = gitToolDefinition.tool;
