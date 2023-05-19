import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';

import { List } from '@material-ui/core';

import type { ISectionProps } from '../useSections';
import { useUserInfoObservable } from '@services/auth/hooks';
import { ListItemText, ListItemVertical, Paper, SectionTitle, TextField } from '../PreferenceComponents';

export function TiddlyWiki(props: Partial<ISectionProps>): JSX.Element {
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
    props?.requestRestartCountDown?.();
  });
  return (
    <>
      <SectionTitle ref={props.sections?.wiki?.ref}>{t('Preference.TiddlyWiki')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {userInfo === undefined ? (
            <ListItemVertical>{t('Loading')}</ListItemVertical>
          ) : (
            <ListItemVertical>
              <ListItemText primary={t('Preference.WikiMetaData')} secondary={t('Preference.WikiMetaDataDescription')} />
              <TextField
                helperText={t('Preference.DefaultUserNameDetail')}
                fullWidth
                onChange={(event) => {
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
    </>
  );
}
