/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable unicorn/no-null */
import React from 'react';
import styled, { css } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet';
import {
  Tooltip,
  Button as ButtonRaw,
  TextField as TextFieldRaw,
  Divider,
  List as ListRaw,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  Typography,
} from '@material-ui/core';
import { Autocomplete } from '@material-ui/lab';
import defaultIcon from '../../images/default-icon.png';

import type { ISubWikiPluginContent } from '@services/wiki/plugin/subWikiPlugin';
import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { useWorkspaceObservable } from '@services/workspaces/hooks';
import { useForm } from './useForm';
import { IWorkspace } from '@services/workspaces/interface';

import { useRestartSnackbar } from '@/components/RestartSnackbar';

const Root = styled.div`
  height: 100%;
  width: 100%;
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
  margin-bottom: 10px;
`;
TextField.defaultProps = {
  fullWidth: true,
  margin: 'dense',
  size: 'small',
  variant: 'filled',
  InputLabelProps: {
    shrink: true,
  },
};
const AvatarFlex = styled.div`
  display: flex;
`;
const AvatarLeft = styled.div`
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 0;
  padding-right: 10px;
`;
const AvatarRight = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: flex-start;
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 10px;
  padding-right: 0;
`;
/**
 * border: theme.palette.type === 'dark' ? 'none': '1px solid rgba(0, 0, 0, 0.12)';
 * */
const Avatar = styled.div<{ transparentBackground?: boolean }>`
  height: 85px;
  width: 85px;
  border-radius: 4px;
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
const PictureButton = styled(ButtonRaw)``;
PictureButton.defaultProps = {
  variant: 'outlined',
  size: 'small',
};
const Caption = styled(Typography)`
  display: block;
`;
Caption.defaultProps = {
  variant: 'caption',
};
const List = styled(ListRaw)`
  & > li > div {
    padding-top: 0;
    padding-bottom: 0;
  }
`;

const getValidIconPath = (iconPath?: string | null): string => {
  if (typeof iconPath === 'string') {
    return `file:///${iconPath}`;
  }
  return defaultIcon;
};

const workspaceID = (window.meta as WindowMeta[WindowNames.editWorkspace]).workspaceID as string;
const wikiPictureExtensions = ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'tif', 'bmp', 'dib'];

export default function EditWorkspace(): JSX.Element {
  const { t } = useTranslation();
  const originalWorkspace = useWorkspaceObservable(workspaceID);
  const [workspace, workspaceSetter, onSave] = useForm(originalWorkspace);
  const {
    mainWikiToLink,
    isSubWiki,
    name,
    port,
    order,
    userName,
    tagName,
    transparentBackground,
    picturePath,
    hibernateWhenUnused,
    disableAudio,
    disableNotifications,
    homeUrl,
  } = (workspace ?? {}) as unknown as IWorkspace;
  const fileSystemPaths = usePromiseValue<ISubWikiPluginContent[]>(
    async () => (mainWikiToLink ? await window.service.wiki.getSubWikiPluginContent(mainWikiToLink) : []),
    [],
    [mainWikiToLink],
  ) as ISubWikiPluginContent[];
  const fallbackUserName = usePromiseValue<string>(async () => (await window.service.auth.get('userName')) as string, '');

  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar();

  if (workspaceID === undefined) {
    return <Root>Error {workspaceID ?? '-'} not exists</Root>;
  }
  if (workspace === undefined) {
    return <Root>{t('Loading')}</Root>;
  }
  return (
    <Root>
      <div id="test" data-usage="For spectron automating testing" />
      {RestartSnackbar}
      <Helmet>
        <title>
          {t('WorkspaceSelector.EditWorkspace')} {String(order ?? 1)} {name}
        </title>
      </Helmet>
      <FlexGrow>
        <TextField
          id="outlined-full-width"
          label={t('EditWorkspace.Path')}
          helperText={t('EditWorkspace.PathDescription')}
          placeholder="Optional"
          value={name}
          onChange={(event) => workspaceSetter({ ...workspace, name: event.target.value })}
        />
        <TextField
          helperText={t('AddWorkspace.WorkspaceUserNameDetail')}
          fullWidth
          onChange={(event) => {
            workspaceSetter({ ...workspace, userName: event.target.value });
            requestRestartCountDown();
          }}
          label={t('AddWorkspace.WorkspaceUserName')}
          placeholder={fallbackUserName}
          value={userName}
        />
        {!isSubWiki && (
          <TextField
            id="outlined-full-width"
            label={t('EditWorkspace.Port')}
            helperText={`${t('EditWorkspace.URL')}: ${homeUrl}`}
            placeholder="Optional"
            value={port}
            onChange={(event) => {
              if (!Number.isNaN(Number.parseInt(event.target.value))) {
                workspaceSetter({ ...workspace, port: Number(event.target.value), homeUrl: `http://localhost:${event.target.value}/` });
              }
            }}
          />
        )}
        {isSubWiki && (
          <Autocomplete
            freeSolo
            options={fileSystemPaths?.map((fileSystemPath) => fileSystemPath.tagName)}
            value={tagName}
            onInputChange={(_, value) => workspaceSetter({ ...workspace, tagName: value })}
            renderInput={(parameters) => <TextField {...parameters} label={t('AddWorkspace.TagName')} helperText={t('AddWorkspace.TagNameHelp')} />}
          />
        )}
        <AvatarFlex>
          <AvatarLeft>
            <Avatar transparentBackground={transparentBackground}>
              <AvatarPicture alt="Icon" src={getValidIconPath(picturePath)} />
            </Avatar>
          </AvatarLeft>
          <AvatarRight>
            <Tooltip title={wikiPictureExtensions.join(', ')} placement="top">
              <PictureButton
                variant="outlined"
                size="small"
                onClick={async () => {
                  const filePaths = await window.service.native.pickFile([{ name: 'Images', extensions: wikiPictureExtensions }]);
                  if (filePaths.length > 0) {
                    await window.service.workspace.update(workspaceID, { picturePath: filePaths[0] });
                  }
                }}>
                {t('EditWorkspace.SelectLocal')}
              </PictureButton>
            </Tooltip>

            <Tooltip title={t('EditWorkspace.NoRevert') ?? ''} placement="bottom">
              <PictureButton onClick={() => workspaceSetter({ ...workspace, picturePath: null })} disabled={!picturePath}>
                {t('EditWorkspace.ResetDefaultIcon')}
              </PictureButton>
            </Tooltip>
          </AvatarRight>
        </AvatarFlex>
        {!isSubWiki && (
          <List>
            <Divider />
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.HibernateTitle')} secondary={t('EditWorkspace.Hibernate')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={hibernateWhenUnused}
                  onChange={(event) => workspaceSetter({ ...workspace, hibernateWhenUnused: event.target.checked })}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.DisableNotificationTitle')} secondary={t('EditWorkspace.DisableNotification')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={disableNotifications}
                  onChange={(event) => workspaceSetter({ ...workspace, disableNotifications: event.target.checked })}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.DisableAudioTitle')} secondary={t('EditWorkspace.DisableAudio')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={disableAudio}
                  onChange={(event) => workspaceSetter({ ...workspace, disableAudio: event.target.checked })}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        )}
      </FlexGrow>
      <div>
        <Button
          color="primary"
          variant="contained"
          disableElevation
          onClick={async () => {
            await onSave();
            await window.remote.closeCurrentWindow();
          }}>
          {t('EditWorkspace.Save')}
        </Button>
        <Button variant="contained" disableElevation onClick={() => void window.remote.closeCurrentWindow()}>
          {t('EditWorkspace.Cancel')}
        </Button>
      </div>
    </Root>
  );
}
