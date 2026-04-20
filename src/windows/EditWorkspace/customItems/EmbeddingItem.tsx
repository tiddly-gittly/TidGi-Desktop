import { Button, LinearProgress, List, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import type { EmbeddingStatus } from '@services/wikiEmbedding/interface';
import { Paper, SectionTitle } from '../../Preferences/PreferenceComponents';
import { useWorkspaceForm } from '../WorkspaceFormContext';

type WorkspaceEmbeddingStatus = Partial<EmbeddingStatus> & {
  totalEmbeddings?: number;
  totalNotes?: number;
};

export function EmbeddingSection({ sectionRef, onNeedsRestart: _onNeedsRestart }: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace } = useWorkspaceForm();
  const workspaceId = workspace.id;

  const [status, setStatus] = useState<WorkspaceEmbeddingStatus>({});
  const [loading, setLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | undefined>(undefined);
  const pollingIntervalReference = useRef<NodeJS.Timeout | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const [embeddingStatus, embeddingStats] = await Promise.all([
        window.service.wikiEmbedding.getEmbeddingStatus(workspaceId),
        window.service.wikiEmbedding.getEmbeddingStats(workspaceId),
      ]);
      setStatus({
        status: embeddingStatus.status,
        error: embeddingStatus.error,
        progress: embeddingStatus.progress,
        totalEmbeddings: embeddingStats.totalEmbeddings,
        totalNotes: embeddingStats.totalNotes,
        lastUpdated: embeddingStatus.lastUpdated,
      });
    } catch (error) {
      setStatus({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [workspaceId]);

  // Poll when generating
  useEffect(() => {
    if (status.status === 'generating' && pollingIntervalReference.current === null) {
      pollingIntervalReference.current = setInterval(() => {
        void loadStatus();
      }, 1000);
    } else if (status.status !== 'generating' && pollingIntervalReference.current) {
      clearInterval(pollingIntervalReference.current);
      pollingIntervalReference.current = null;
    }
    return () => {
      if (pollingIntervalReference.current) {
        clearInterval(pollingIntervalReference.current);
        pollingIntervalReference.current = null;
      }
    };
  }, [status.status]);

  const handleGenerate = async () => {
    try {
      const aiConfig = await window.service.externalAPI.getAIConfig();
      if (!aiConfig.default?.provider && !aiConfig.embedding?.provider) {
        setInfoMessage(t('Preference.SearchEmbeddingNoAIConfigError'));
        return;
      }
      if (!aiConfig.embedding?.model) {
        setInfoMessage(t('Preference.SearchEmbeddingNoEmbeddingModelError'));
        return;
      }
      setInfoMessage(undefined);
      setStatus(previous => ({ ...previous, status: 'generating', progress: { total: 0, completed: 0 } }));
      await window.service.wikiEmbedding.generateEmbeddings(workspaceId, aiConfig, false);
      await loadStatus();
    } catch (error) {
      setStatus(previous => ({ ...previous, status: 'error', error: error instanceof Error ? error.message : String(error) }));
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('Preference.SearchEmbeddingDeleteConfirm', { workspaceName: workspace.name }))) return;
    try {
      await window.service.wikiEmbedding.deleteWorkspaceEmbeddings(workspaceId);
      await loadStatus();
    } catch (error) {
      setInfoMessage(t('Preference.SearchEmbeddingDeleteError', { error: error instanceof Error ? error.message : String(error) }));
    }
  };

  const getStatusText = () => {
    switch (status.status) {
      case 'idle':
        return t('Preference.SearchEmbeddingStatusIdle');
      case 'generating':
        if (status.progress) {
          return t('Preference.SearchEmbeddingStatusGenerating', {
            completed: status.progress.completed,
            total: status.progress.total,
            current: status.progress.current ?? '',
          });
        }
        return t('Preference.SearchEmbeddingStatusGenerating', { completed: 0, total: 0, current: '' });
      case 'completed':
        return t('Preference.SearchEmbeddingStatusCompleted', {
          totalEmbeddings: status.totalEmbeddings ?? 0,
          totalNotes: status.totalNotes ?? 0,
        });
      case 'error':
        return t('Preference.SearchEmbeddingStatusError', { error: status.error ?? 'Unknown error' });
      default:
        return status.status ?? '';
    }
  };

  return (
    <>
      <SectionTitle ref={sectionRef}>{t('Preference.Search')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {loading
            ? (
              <ListItem>
                <ListItemText primary={t('Loading')} />
              </ListItem>
            )
            : (
              <ListItem>
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Typography variant='body2' color='text.secondary'>
                      {getStatusText()}
                    </Typography>
                    <div>
                      <Button
                        size='small'
                        variant='outlined'
                        onClick={handleGenerate}
                        disabled={status.status === 'generating'}
                        style={{ marginRight: 8 }}
                        data-testid={`generate-embeddings-button-${workspaceId}`}
                      >
                        {status.status === 'generating'
                          ? t('Preference.SearchEmbeddingGenerating')
                          : (status.totalEmbeddings ?? 0) > 0
                          ? t('Preference.SearchEmbeddingUpdate')
                          : t('Preference.SearchEmbeddingGenerate')}
                      </Button>
                      {(status.totalEmbeddings ?? 0) > 0 && (
                        <Button
                          size='small'
                          variant='outlined'
                          color='error'
                          onClick={handleDelete}
                          disabled={status.status === 'generating'}
                          data-testid={`delete-embeddings-button-${workspaceId}`}
                        >
                          {t('Preference.SearchEmbeddingDelete')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {status.status === 'generating' && status.progress && status.progress.total > 0 && (
                    <LinearProgress
                      variant='determinate'
                      value={(status.progress.completed / status.progress.total) * 100}
                      style={{ marginTop: 8 }}
                    />
                  )}

                  {status.lastUpdated && status.status !== 'idle' && (
                    <Typography variant='caption' color='text.secondary' style={{ display: 'block', marginTop: 4 }}>
                      {t('Preference.SearchEmbeddingLastUpdated', {
                        time: status.lastUpdated.toLocaleString(),
                      })}
                    </Typography>
                  )}

                  {infoMessage && (
                    <Typography variant='body2' color='error' style={{ marginTop: 8 }}>
                      {infoMessage}
                    </Typography>
                  )}
                </div>
              </ListItem>
            )}
        </List>
      </Paper>
    </>
  );
}
