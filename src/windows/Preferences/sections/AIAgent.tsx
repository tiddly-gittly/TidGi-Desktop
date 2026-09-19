import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, List, ListItemButton } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { MEME_LOOP_DATABASE_KEY } from '@/constants/database';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { Paper, SectionTitle } from '../PreferenceComponents';
import { ScheduledTasksPreferences } from './components/ScheduledTasksPreferences';

interface AgentDatabaseRecoveryService {
  deleteDatabase: (key: string) => Promise<void>;
}

export async function clearAgentDatabase(
  databaseService: AgentDatabaseRecoveryService,
  onNeedsRestart: () => void,
): Promise<void> {
  await databaseService.deleteDatabase(MEME_LOOP_DATABASE_KEY);
  onNeedsRestart();
}

export function AIAgent(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation('agent');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentInfo, setAgentInfo] = useState<{ exists: boolean; size?: number; path?: string }>({ exists: false });
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const info = await window.service.database.getDatabaseInfo(MEME_LOOP_DATABASE_KEY);
        const path = await window.service.database.getDatabasePath(MEME_LOOP_DATABASE_KEY);
        setAgentInfo({ ...info, path });
      } catch (error) {
        void window.service.native.log(
          'error',
          'AIAgent: fetch agent database info failed',
          {
            function: 'AIAgent.fetchInfo',
            error,
          },
        );
      }
    };
    void fetchInfo();
  }, []);

  return (
    <>
      <SectionTitle ref={props.sectionRef}>{t('Preference.AIAgent')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          <ListItem>
            <ListItemText
              primary={t('Preference.AIAgentDescription')}
              secondary={t('Preference.AIAgentDescriptionDetail')}
            />
          </ListItem>
          <ListItemButton
            onClick={async () => {
              if (agentInfo.path) {
                try {
                  await window.service.native.openPath(agentInfo.path, true);
                } catch (error) {
                  void window.service.native.log(
                    'error',
                    'AIAgent: open database folder failed',
                    {
                      function: 'AIAgent.openDatabaseFolder',
                      error,
                      path: agentInfo.path,
                    },
                  );
                }
              }
            }}
          >
            <ListItemText
              primary={t('Preference.OpenDatabaseFolder')}
              secondary={agentInfo.path || t('Unknown', { ns: 'translation' })}
            />
            <ChevronRightIcon color='action' />
          </ListItemButton>
          <ListItemButton
            onClick={() => {
              setDeleteDialogOpen(true);
            }}
          >
            <ListItemText
              primary={t('Preference.DeleteAgentDatabase')}
              secondary={t('Preference.AgentDatabaseDescription', {
                size: agentInfo.size ? (agentInfo.size / 1024 / 1024).toFixed(2) + ' MB' : t('Unknown', { ns: 'translation' }),
              })}
            />
          </ListItemButton>
        </List>
        <ScheduledTasksPreferences />
      </Paper>
      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
        }}
      >
        <DialogTitle>{t('Preference.ConfirmDelete', { ns: 'translation' })}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('Preference.ConfirmDeleteAgentDatabase')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
            }}
          >
            {t('Cancel', { ns: 'translation' })}
          </Button>
          <Button
            onClick={async () => {
              try {
                await clearAgentDatabase(window.service.database, props.onNeedsRestart);
                setDeleteDialogOpen(false);
                // Refresh info after deletion
                const info = await window.service.database.getDatabaseInfo(MEME_LOOP_DATABASE_KEY);
                const path = await window.service.database.getDatabasePath(MEME_LOOP_DATABASE_KEY);
                setAgentInfo({ ...info, path });
              } catch (error) {
                void window.service.native.log(
                  'error',
                  'AIAgent: delete agent database failed',
                  {
                    function: 'AIAgent.handleDelete',
                    error,
                  },
                );
              }
            }}
            color='error'
          >
            {t('Delete', { ns: 'translation' })}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
