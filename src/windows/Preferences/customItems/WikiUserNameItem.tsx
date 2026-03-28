import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '@/components/ListItem';
import { useUserInfoObservable } from '@services/auth/hooks';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { ListItemVertical, TextField } from '../PreferenceComponents';

export function WikiUserNameItem({ onNeedsRestart }: ICustomItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const userInfo = useUserInfoObservable();

  const [userName, userNameSetter] = useState('');
  useEffect(() => {
    if (userInfo?.userName !== undefined) {
      userNameSetter(userInfo.userName);
    }
  }, [userInfo]);

  const debouncedOnChange = useDebouncedCallback(async (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    await window.service.auth.set('userName', event.target.value);
    onNeedsRestart();
  });

  if (userInfo === undefined) return null;

  return (
    <ListItemVertical>
      <ListItemText primary={t('Preference.WikiMetaData')} secondary={t('Preference.WikiMetaDataDescription')} />
      <TextField
        helperText={t('Preference.DefaultUserNameDetail')}
        fullWidth
        onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          userNameSetter(event.target.value);
          void debouncedOnChange(event);
        }}
        label={t('Preference.DefaultUserName')}
        value={userName}
      />
    </ListItemVertical>
  );
}
