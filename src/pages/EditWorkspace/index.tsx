import React, { useState, useEffect } from 'react';
import styled, { css } from 'styled-components';
import { useTranslation } from 'react-i18next';
import ButtonRaw from '@material-ui/core/Button';
import TextFieldRaw from '@material-ui/core/TextField';
import Divider from '@material-ui/core/Divider';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import Autocomplete from '@material-ui/lab/Autocomplete';
import defaultIcon from '../../images/default-icon.png';

import type { ISubWikiPluginContent } from '@services/wiki/update-plugin-content';
import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';
import { usePromiseValue } from '@/helpers/use-service-value';

const Root = styled.div`
  background: #fffff0;
  height: 100vh;
  width: 100vw;
  padding: 20px;
  display: flex;
  flex-direction: column;
`;
const FlexGrow = styled.div`
  flex: 1;
`;
const Button = styled(ButtonRaw)`
  float: right;
  margin-left: 10px;
`;
const TextField = styled(TextFieldRaw)`
  margin-bottom: 30px;
`;
TextField.defaultProps = {
  fullWidth: true,
  margin: 'dense',
  variant: 'outlined',
  InputLabelProps: {
    shrink: true,
  },
};
const AvatarFlex = styled.div`
  display: 'flex';
`;
const AvatarLeft = styled.div`
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 0;
  padding-right: 10px;
`;
const AvatarRight = styled.div`
  flex: 1;
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 10px;
  padding-right: 0;
`;
/**
 * border: theme.palette.type === 'dark' ? 'none': '1px solid rgba(0, 0, 0, 0.12)';
 * */
const Avatar = styled.div<{ transparentBackground?: boolean }>`
  height: 85;
  width: 85;
  background: white;
  border-radius: 4;
  color: #333;
  font-size: 32px;
  line-height: 64px;
  text-align: center;
  font-weight: 500;
  text-transform: uppercase;
  user-select: none;

  overflow: hidden;
  ${({ transparentBackground }) => {
    if (transparentBackground === true) {
      return css`
        background: transparent;
        border: none;
        border-radius: 0;
      `;
    }
  }}
`;
const AvatarPicture = styled.img`
  height: 100%;
  width: 100%;
`;
const ButtonBot = styled(ButtonRaw)`
  margin-top: 10px;
`;
ButtonBot.defaultProps = {
  variant: 'outlined',
  size: 'small',
};
const Caption = styled(Typography)`
  display: block;
`;
Caption.defaultProps = {
  variant: 'caption',
};

const getValidIconPath = (iconPath?: string | null, internetIcon?: string): string => {
  if (typeof iconPath === 'string') {
    return `file:///${iconPath}`;
  }
  if (typeof internetIcon === 'string') {
    return internetIcon;
  }
  return defaultIcon;
};

const { workspaceID } = window.meta as WindowMeta[WindowNames.editWorkspace];

export default function EditWorkspace(): JSX.Element {
  const { t } = useTranslation();
  const fileSystemPaths = usePromiseValue<ISubWikiPluginContent[]>(
    async () => await window.service.wiki.getSubWikiPluginContent(mainWikiToLink),
    [],
  ) as ISubWikiPluginContent[];
  const workspace = usePromiseValue(async () => await window.service.workspace.get(workspaceID as string));
  if (workspace === undefined) {
    return <Root>Error {workspaceID ?? '-'} not exists</Root>;
  }
  const {
    mainWikiToLink,
    isSubWiki,
    name,
    port,
    tagName,
    transparentBackground,
    picturePath,
    hibernateWhenUnused,
    disableAudio,
    disableNotifications,
    homeUrl,
  } = workspace;
  return (
    <Root>
      <FlexGrow>
        <TextField
          id="outlined-full-width"
          label={t('EditWorkspace.Path')}
          error={Boolean(nameError)}
          placeholder="Optional"
          helperText={nameError}
          value={name}
          onChange={(e) => onUpdateForm({ name: e.target.value })}
        />
        {!isSubWiki && (
          <TextField
            id="outlined-full-width"
            label={t('EditWorkspace.Port')}
            helperText={`${t('EditWorkspace.URL')}: ${homeUrl}`}
            error={Boolean(homeUrlError)}
            placeholder="Optional"
            value={port}
            onChange={(event) => onUpdateForm({ port: event.target.value, homeUrl: `http://localhost:${event.target.value}/` })}
          />
        )}
        <Autocomplete
          freeSolo
          options={fileSystemPaths?.map((fileSystemPath) => fileSystemPath.tagName)}
          value={tagName}
          onInputChange={(_, value) => onUpdateForm({ tagName: value })}
          renderInput={(parameters) => <TextField {...parameters} label={t('AddWorkspace.TagName')} helperText={t('AddWorkspace.TagNameHelp')} />}
        />
        <AvatarFlex>
          <AvatarLeft>
            <Avatar transparentBackground={transparentBackground}>
              <AvatarPicture alt="Icon" src={getValidIconPath(picturePath, internetIcon)} />
            </Avatar>
          </AvatarLeft>
          <AvatarRight>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                const options = {
                  properties: ['openFile'],
                  filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'tif', 'bmp', 'dib'] }],
                };
                window.remote.dialog.showOpenDialog(options).then(({ canceled, filePaths }: any) => {
                  if (!canceled && filePaths.length > 0) {
                    onUpdateForm({ picturePath: filePaths[0] });
                  }
                });
              }}>
              {t('EditWorkspace.SelectLocal')}
            </Button>
            <Caption>PNG, JPEG, GIF, TIFF or BMP.</Caption>

            <ButtonBot onClick={() => onUpdateForm({ picturePath: null, internetIcon: null })} disabled={!(picturePath || internetIcon)}>
              {t('EditWorkspace.ResetDefaultIcon')}
            </ButtonBot>
          </AvatarRight>
        </AvatarFlex>
        {!isSubWiki && (
          <List>
            <Divider />
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.HibernateTitle')} secondary={t('EditWorkspace.Hibernate')} />
              <ListItemSecondaryAction>
                <Switch edge="end" color="primary" checked={hibernateWhenUnused} onChange={(e) => onUpdateForm({ hibernateWhenUnused: e.target.checked })} />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.DisableNotificationTitle')} secondary={t('EditWorkspace.DisableNotification')} />
              <ListItemSecondaryAction>
                <Switch edge="end" color="primary" checked={disableNotifications} onChange={(e) => onUpdateForm({ disableNotifications: e.target.checked })} />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.DisableAudioTitle')} secondary={t('EditWorkspace.DisableAudio')} />
              <ListItemSecondaryAction>
                <Switch edge="end" color="primary" checked={disableAudio} onChange={(e) => onUpdateForm({ disableAudio: e.target.checked })} />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        )}
      </FlexGrow>
      <div>
        <Button color="primary" variant="contained" disableElevation onClick={onSave}>
          {t('EditWorkspace.Save')}
        </Button>
        <Button variant="contained" disableElevation onClick={() => window.remote.closeCurrentWindow()}>
          {t('EditWorkspace.Cancel')}
        </Button>
      </div>
    </Root>
  );
}
