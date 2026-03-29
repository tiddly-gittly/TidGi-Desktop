import { Tooltip } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import defaultIcon from '../../../images/default-icon.png';

import { ListItem, ListItemText } from '@/components/ListItem';
import { wikiPictureExtensions } from '@/constants/fileNames';
import { ListItemVertical, TextField } from '../../Preferences/PreferenceComponents';
import { Avatar, AvatarFlex, AvatarLeft, AvatarPicture, AvatarRight, PictureButton } from '../styles';
import { useWorkspaceForm } from '../WorkspaceFormContext';

const getValidIconPath = (iconPath?: string | null): string => {
  if (typeof iconPath === 'string') {
    return `file:///${iconPath}`;
  }
  return defaultIcon;
};

export function WorkspaceNameItem(): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  return (
    <ListItemVertical>
      <ListItemText primary={t('EditWorkspace.Name')} secondary={t('EditWorkspace.NameDescription')} />
      <TextField
        fullWidth
        placeholder='Optional'
        value={workspace.name ?? ''}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          workspaceSetter({ ...workspace, name: event.target.value });
        }}
      />
    </ListItemVertical>
  );
}

export function WorkspaceAvatarItem(): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const { picturePath } = workspace;
  return (
    <ListItem>
      <AvatarFlex>
        <AvatarLeft>
          <Avatar transparentBackground={false}>
            <AvatarPicture alt='Icon' src={getValidIconPath(picturePath)} />
          </Avatar>
        </AvatarLeft>
        <AvatarRight>
          <Tooltip title={wikiPictureExtensions.join(', ')} placement='top'>
            <PictureButton
              variant='outlined'
              size='small'
              onClick={async () => {
                const filePaths = await window.service.native.pickFile([{ name: 'Images', extensions: wikiPictureExtensions }]);
                if (filePaths.length > 0) {
                  workspaceSetter({ ...workspace, picturePath: filePaths[0] });
                }
              }}
            >
              {t('EditWorkspace.SelectLocal')}
            </PictureButton>
          </Tooltip>
          <Tooltip title={t('EditWorkspace.NoRevert') ?? ''} placement='bottom'>
            <PictureButton
              onClick={() => {
                workspaceSetter({ ...workspace, picturePath: null });
              }}
              disabled={!picturePath}
            >
              {t('EditWorkspace.ResetDefaultIcon')}
            </PictureButton>
          </Tooltip>
        </AvatarRight>
      </AvatarFlex>
    </ListItem>
  );
}
