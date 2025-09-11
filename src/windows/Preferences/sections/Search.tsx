import { Button, LinearProgress, List, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ShowInfoSnackbarOptions } from '@/components/InfoSnackbar';
import { ListItem, ListItemText } from '@/components/ListItem';
import { PageType } from '@/constants/pageTypes';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

interface SearchProps extends ISectionProps {
  showInfoSnackbar: (options: ShowInfoSnackbarOptions) => void;
}

interface WorkspaceEmbeddingStatus {
  workspaceId: string;
  workspaceName: string;
  status: 'idle' | 'generating' | 'completed' | 'error';
  progress?: {
    total: number;
    completed: number;
    current?: string;
  };
  error?: string;
  totalEmbeddings?: number;
  totalNotes?: number;
  lastUpdated?: Date;
}

export function Search(props: SearchProps): React.JSX.Element {
  const { sections, requestRestartCountDown, showInfoSnackbar } = props;
  const { t } = useTranslation();
  const [embeddingStatuses, setEmbeddingStatuses] = useState<WorkspaceEmbeddingStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [workspaceStatuses, setWorkspaceStatuses] = useState<WorkspaceEmbeddingStatus[]>([]);
  const pollingIntervalReference = useRef<NodeJS.Timeout | null>(null);

  const workspaces = usePromiseValue(async () => {
    const allWorkspaces = await window.service.workspace.getWorkspacesAsList();
    // Filter to only show wiki-type workspaces
    return allWorkspaces.filter(workspace => workspace.pageType === null || workspace.pageType === undefined || workspace.pageType === PageType.wiki);
  });

  // Load embedding status for all workspaces
  useEffect(() => {
    const loadWorkspaceStatuses = async () => {
      if (!workspaces) return;

      setLoading(true);
      const statuses: WorkspaceEmbeddingStatus[] = [];

      for (const workspace of workspaces) {
        try {
          const [embeddingStatus, embeddingStats] = await Promise.all([
            window.service.wikiEmbedding.getEmbeddingStatus(workspace.id),
            window.service.wikiEmbedding.getEmbeddingStats(workspace.id),
          ]);

          statuses.push({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            status: embeddingStatus.status,
            progress: embeddingStatus.progress,
            error: embeddingStatus.error,
            totalEmbeddings: embeddingStats.totalEmbeddings,
            totalNotes: embeddingStats.totalNotes,
            lastUpdated: embeddingStatus.lastUpdated,
          });
        } catch (error) {
          console.error(`Failed to load embedding status for workspace ${workspace.name}:`, error);
          statuses.push({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      setWorkspaceStatuses(statuses);
      setLoading(false);
    };

    void loadWorkspaceStatuses();
  }, [workspaces]);

  // Poll for updates when there's an active generation
  useEffect(() => {
    const hasActiveGeneration = workspaceStatuses.some(ws => ws.status === 'generating');

    if (hasActiveGeneration && pollingIntervalReference.current === null) {
      pollingIntervalReference.current = setInterval(async () => {
        const updatedStatuses = await Promise.all(
          workspaceStatuses.map(async (ws) => {
            if (ws.status === 'generating') {
              try {
                const [embeddingStatus, embeddingStats] = await Promise.all([
                  window.service.wikiEmbedding.getEmbeddingStatus(ws.workspaceId),
                  window.service.wikiEmbedding.getEmbeddingStats(ws.workspaceId),
                ]);

                return {
                  ...ws,
                  status: embeddingStatus.status,
                  progress: embeddingStatus.progress,
                  error: embeddingStatus.error,
                  totalEmbeddings: embeddingStats.totalEmbeddings,
                  totalNotes: embeddingStats.totalNotes,
                  lastUpdated: embeddingStatus.lastUpdated,
                };
              } catch (error) {
                console.error(`Failed to update status for workspace ${ws.workspaceName}:`, error);
                return ws;
              }
            }
            return ws;
          }),
        );

        setWorkspaceStatuses(updatedStatuses);
      }, 1000); // Poll every second
    } else if (!hasActiveGeneration && pollingIntervalReference.current) {
      clearInterval(pollingIntervalReference.current);
      pollingIntervalReference.current = null;
    }

    return () => {
      if (pollingIntervalReference.current) {
        clearInterval(pollingIntervalReference.current);
        pollingIntervalReference.current = null;
      }
    };
  }, [workspaceStatuses]);

  const handleGenerateEmbeddings = async (workspaceId: string, workspaceName: string) => {
    try {
      // Get AI config from external API service
      const aiConfig = await window.service.externalAPI.getAIConfig();

      if (!aiConfig.api.provider) {
        showInfoSnackbar({
          message: t('Preference.SearchEmbeddingNoAIConfigError'),
          severity: 'error',
        });
        // Scroll to external API section
        sections.externalAPI?.ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      // Check if embeddingModel is configured, otherwise use regular model
      if (!aiConfig.api.embeddingModel) {
        showInfoSnackbar({
          message: t('Preference.SearchEmbeddingNoEmbeddingModelError'),
          severity: 'warning',
        });
        // Scroll to external API section
        sections.externalAPI?.ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      // Create embedding config using aiConfig directly
      const embeddingAiConfig = aiConfig;

      // Update status immediately
      setWorkspaceStatuses(previous =>
        previous.map(workspace =>
          workspace.workspaceId === workspaceId
            ? { ...workspace, status: 'generating' as const, progress: { total: 0, completed: 0 } }
            : workspace
        )
      );

      // Start embedding generation
      await window.service.wikiEmbedding.generateEmbeddings(workspaceId, embeddingAiConfig, false);

      // Reload status after completion
      const [embeddingStatus, embeddingStats] = await Promise.all([
        window.service.wikiEmbedding.getEmbeddingStatus(workspaceId),
        window.service.wikiEmbedding.getEmbeddingStats(workspaceId),
      ]);

      setWorkspaceStatuses(previous =>
        previous.map(ws =>
          ws.workspaceId === workspaceId
            ? {
              ...ws,
              status: embeddingStatus.status,
              progress: embeddingStatus.progress,
              error: embeddingStatus.error,
              totalEmbeddings: embeddingStats.totalEmbeddings,
              totalNotes: embeddingStats.totalNotes,
              lastUpdated: embeddingStatus.lastUpdated,
            }
            : ws
        )
      );
    } catch (error) {
      console.error(`Failed to generate embeddings for ${workspaceName}:`, error);
      setWorkspaceStatuses(previous =>
        previous.map(ws =>
          ws.workspaceId === workspaceId
            ? {
              ...ws,
              status: 'error' as const,
              error: error instanceof Error ? error.message : String(error),
            }
            : ws
        )
      );
    }
  };

  const handleDeleteEmbeddings = async (workspaceId: string, workspaceName: string) => {
    try {
      if (!confirm(t('Preference.SearchEmbeddingDeleteConfirm', { workspaceName }))) {
        return;
      }

      await window.service.wikiEmbedding.deleteWorkspaceEmbeddings(workspaceId);

      // Reload status
      const embeddingStatus = await window.service.wikiEmbedding.getEmbeddingStatus(workspaceId);
      const embeddingStats = await window.service.wikiEmbedding.getEmbeddingStats(workspaceId);

      setWorkspaceStatuses(previous =>
        previous.map(ws =>
          ws.workspaceId === workspaceId
            ? {
              ...ws,
              status: embeddingStatus.status,
              progress: embeddingStatus.progress,
              error: embeddingStatus.error,
              totalEmbeddings: embeddingStats.totalEmbeddings,
              totalNotes: embeddingStats.totalNotes,
              lastUpdated: embeddingStatus.lastUpdated,
            }
            : ws
        )
      );
    } catch (error) {
      console.error(`Failed to delete embeddings for ${workspaceName}:`, error);
      showInfoSnackbar({
        message: t('Preference.SearchEmbeddingDeleteError', { error: error instanceof Error ? error.message : String(error) }),
        severity: 'error',
      });
    }
  };

  const getStatusText = (status: WorkspaceEmbeddingStatus) => {
    switch (status.status) {
      case 'idle':
        return t('Preference.SearchEmbeddingStatusIdle');
      case 'generating':
        if (status.progress) {
          return t('Preference.SearchEmbeddingStatusGenerating', {
            completed: status.progress.completed,
            total: status.progress.total,
            current: status.progress.current || '',
          });
        }
        return t('Preference.SearchEmbeddingStatusGenerating', { completed: 0, total: 0, current: '' });
      case 'completed':
        return t('Preference.SearchEmbeddingStatusCompleted', {
          totalEmbeddings: status.totalEmbeddings || 0,
          totalNotes: status.totalNotes || 0,
        });
      case 'error':
        return t('Preference.SearchEmbeddingStatusError', { error: status.error || 'Unknown error' });
      default:
        return status.status;
    }
  };

  return (
    <>
      <SectionTitle ref={props.sections.search.ref}>{t('Preference.Search')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {loading
            ? (
              <ListItem>
                <ListItemText primary={t('Loading')} />
              </ListItem>
            )
            : workspaceStatuses.length === 0
            ? (
              <ListItem>
                <ListItemText primary={t('Preference.SearchNoWorkspaces')} />
              </ListItem>
            )
            : (
              workspaceStatuses.map((workspace) => (
                <ListItem key={workspace.workspaceId}>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Typography variant='subtitle2' fontWeight='medium'>
                        {workspace.workspaceName}
                      </Typography>
                      <div>
                        <Button
                          size='small'
                          variant='outlined'
                          onClick={() => handleGenerateEmbeddings(workspace.workspaceId, workspace.workspaceName)}
                          disabled={workspace.status === 'generating'}
                          style={{ marginRight: 8 }}
                        >
                          {workspace.status === 'generating'
                            ? t('Preference.SearchEmbeddingGenerating')
                            : workspace.totalEmbeddings && workspace.totalEmbeddings > 0
                            ? t('Preference.SearchEmbeddingUpdate')
                            : t('Preference.SearchEmbeddingGenerate')}
                        </Button>
                        {workspace.totalEmbeddings && workspace.totalEmbeddings > 0 && (
                          <Button
                            size='small'
                            variant='outlined'
                            color='error'
                            onClick={() => handleDeleteEmbeddings(workspace.workspaceId, workspace.workspaceName)}
                            disabled={workspace.status === 'generating'}
                          >
                            {t('Preference.SearchEmbeddingDelete')}
                          </Button>
                        )}
                      </div>
                    </div>

                    <Typography variant='body2' color='text.secondary'>
                      {getStatusText(workspace)}
                    </Typography>

                    {workspace.status === 'generating' && workspace.progress && workspace.progress.total > 0 && (
                      <LinearProgress
                        variant='determinate'
                        value={(workspace.progress.completed / workspace.progress.total) * 100}
                        style={{ marginTop: 8 }}
                      />
                    )}

                    {workspace.lastUpdated && workspace.status !== 'idle' && (
                      <Typography variant='caption' color='text.secondary' style={{ display: 'block', marginTop: 4 }}>
                        {t('Preference.SearchEmbeddingLastUpdated', {
                          time: workspace.lastUpdated.toLocaleString(),
                        })}
                      </Typography>
                    )}
                  </div>
                </ListItem>
              ))
            )}
        </List>
      </Paper>
    </>
  );
}
