import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import FolderIcon from '@mui/icons-material/Folder';
import { Box, Chip, Divider, List } from '@mui/material';

import { ListItem, ListItemText } from '@/components/ListItem';
import { useUserInfoObservable } from '@services/auth/hooks';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { ListItemVertical, Paper, SectionTitle, TextField } from '../PreferenceComponents';

function LocalWikiSyncStatus(): React.JSX.Element {
  const { t } = useTranslation();
  const workspaces = useWorkspacesListObservable();
  const [registeredIds, setRegisteredIds] = useState<string[]>([]);

  useEffect(() => {
    void window.service.memeloopNode.getRegisteredWikis().then(setRegisteredIds).catch(() => {});
  }, []);

  const wikiWorkspaces = workspaces?.filter((w) => isWikiWorkspace(w) && !w.isSubWiki) ?? [];
  if (wikiWorkspaces.length === 0) return <></>;

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 2, pt: 1.5 }}>
        <FolderIcon sx={{ fontSize: '1.1em', color: 'text.secondary' }} />
        <ListItemText primary={t('Preference.WikiSync.LocalWikis')} />
      </Box>
      <Paper elevation={0}>
        <List dense disablePadding>
          {wikiWorkspaces.map((ws) => {
            const registered = registeredIds.includes(ws.id);
            return (
              <Box key={ws.id}>
                <ListItem
                  secondaryAction={
                    registered
                      ? <Chip label={t('Preference.WikiSync.MobileSyncActive')} color="success" size="small" variant="outlined" />
                      : <Chip label={t('Preference.WikiSync.MobileSyncInactive')} size="small" variant="outlined" />
                  }
                >
                  <ListItemText
                    primary={ws.name || ws.id}
                    secondary={isWikiWorkspace(ws) ? ws.wikiFolderLocation : undefined}
                  />
                </ListItem>
                <Divider component="li" />
              </Box>
            );
          })}
        </List>
      </Paper>
    </>
  );
}

export function TiddlyWiki(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation();

  const userInfo = useUserInfoObservable();

  const [userName, userNameSetter] = useState('');
  useEffect(() => {
    if (userInfo?.userName !== undefined) {
      userNameSetter(userInfo.userName);
    }
  }, [userInfo]);
  const userNameTextFieldOnChange = useDebouncedCallback(async (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    await window.service.auth.set('userName', event.target.value);
    props.onNeedsRestart?.();
  });
  return (
    <>
      <SectionTitle ref={props.sectionRef}>{t('Preference.TiddlyWiki')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {userInfo === undefined ? <ListItemVertical>{t('Loading')}</ListItemVertical> : (
            <ListItemVertical>
              <ListItemText primary={t('Preference.WikiMetaData')} secondary={t('Preference.WikiMetaDataDescription')} />
              <TextField
                helperText={t('Preference.DefaultUserNameDetail')}
                fullWidth
                onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                  userNameSetter(event.target.value);
                  void userNameTextFieldOnChange(event);
                }}
                label={t('Preference.DefaultUserName')}
                value={userName}
              />
            </ListItemVertical>
          )}
        </List>
      </Paper>
      <LocalWikiSyncStatus />
    </>
  );
}
