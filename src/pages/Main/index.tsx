import React from 'react';
import arrayMove from 'array-move';
import styled, { css } from 'styled-components';
import { AsyncReturnType } from 'type-fest';

import SimpleBar from 'simplebar-react';
import 'simplebar/dist/simplebar.min.css';

import Button from '@material-ui/core/Button';
import IconButtonRaw from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';

import NotificationsIcon from '@material-ui/icons/Notifications';
import NotificationsPausedIcon from '@material-ui/icons/NotificationsPaused';
import SettingsIcon from '@material-ui/icons/Settings';

import { WindowNames } from '@services/windows/WindowProperties';

import { usePromiseValue } from '@/helpers/use-service-value';

import WorkspaceSelector from './WorkspaceSelector';
import FindInPage from '../../components/FindInPage';
import FakeTitleBar from './fake-title-bar';
import DraggableRegion from './DraggableRegion';

import arrowWhite from '@/images/arrow-white.png';
import arrowBlack from '@/images/arrow-black.png';
import { SortableContainer, SortableItem } from './SortableWorkspaceSelector';
import { IWorkspace } from '@services/workspaces/interface';

const OuterRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
`;

const Root = styled.div`
  display: flex;
  flex-direction: row;
  flex: 1;
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

const sideBarStyle = css`
  height: 100%;
  width: 68;
  border-right: 1px solid rgba(0, 0, 0, 0.2);
  background-color: #fffff0;
  -webkit-app-region: drag;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 10px;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
`;
const SidebarRoot = styled.div`
  ${sideBarStyle}
`;
const SidebarWithStyle = styled(SimpleBar)`
  ${sideBarStyle}
`;

const SidebarTop = styled.div<{ fullscreen?: boolean }>`
  flex: 1;
  /** // TODO: darwin theme  */
  /* padding-top-window-remote-get-platform-darwin-theme-spacing-3: 0; */
  ${({ fullscreen }) => fullscreen === true && `padding-top: 0;`}
`;

const IconButton = styled(IconButtonRaw)``;

const InnerContentRoot = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
`;

const ContentRoot = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const Arrow = styled.div<{ image: string }>`
  height: 202;
  width: 150;
  position: absolute;
  top: 50;
  left: 72;

  background-image: url(${({ image }) => image});
  background-size: 150px 202px;
`;

const Avatar = styled.div`
  display: inline-block;
  height: 32;
  width: 32;
  /** // TODO: dark theme  */
  /* background: theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black; */
  border-radius: 4;
  /** // TODO: dark theme  */
  /* color: theme.palette.getContrastText(theme.palette.type === 'dark' ? theme.palette.common.white: theme.palette.common.black); */
  line-height: 32px;
  text-align: center;
  font-weight: 500;
  text-transform: uppercase;
  margin-left: 10px;
  margin-right: 10px;
  /** // TODO: dark theme  */
  /* border: theme.palette.type === 'dark' ? 'none' : 1px solid rgba(0, 0, 0, 0.12); */
`;

const Tip2Text = styled.span`
  display: inline-block;
  font-size: 18px;
  /** // TODO: dark theme  */
  /* color: theme.palette.type === 'dark' ? theme.palette.common.white : theme.palette.common.black; */
`;

const Tip = styled.div`
  position: absolute;
  top: 112;
  left: 180;
  user-select: none;
`;

const Tip2 = styled.div`
  user-select: none;
`;

const End = styled.div`
  display: flex;
  flex-direction: column;
`;

const HelperTextsList = styled.ul`
  margin-top: 0;
  margin-bottom: 1.5rem;
`;

const SidebarContainer = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const platform = usePromiseValue(async () => (await window.service.context.get('platform')) as string);
  // use native scroll bar on macOS
  if (platform === 'darwin') {
    return <SidebarRoot>{children}</SidebarRoot>;
  }
  return <SidebarWithStyle>{children}</SidebarWithStyle>;
};

export default function Main(): JSX.Element {
  // TODO: make workspacesList observable
  const workspacesList = usePromiseValue(
    window.service.workspace.getWorkspacesAsList,
    [] as AsyncReturnType<typeof window.service.workspace.getWorkspacesAsList>,
  )!;
  const attachToMenubar = usePromiseValue(async () => (await window.service.preference.get('attachToMenubar')) as boolean);
  const titleBar = usePromiseValue(async () => (await window.service.preference.get('titleBar')) as boolean);
  const sidebar = usePromiseValue(async () => (await window.service.preference.get('sidebar')) as boolean);
  const pauseNotifications = usePromiseValue(async () => (await window.service.preference.get('pauseNotifications')) as string);
  const themeSource = usePromiseValue(async () => (await window.service.preference.get('themeSource')) as 'system' | 'light' | 'dark');
  const isFullScreen = usePromiseValue(window.service.window.isFullScreen);
  const mainWorkspaceMetaData = usePromiseValue(async () => {
    const activeWorkspace = await window.service.workspace.getActiveWorkspace();
    if (activeWorkspace !== undefined) {
      const metadata = await window.service.workspace.getMetaData(activeWorkspace.id);
      return metadata;
    }
    return { didFailLoadErrorMessage: 'No ActiveWorkspace' };
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  }, {} as AsyncReturnType<typeof window.service.workspace.getMetaData>);
  const requestReload = async (): Promise<void> => await window.service.window.reload(window.meta.windowName);

  return (
    <OuterRoot>
      {workspacesList.length > 0 && <DraggableRegion />}
      <Root>
        {sidebar === true && (
          <SidebarContainer>
            <SidebarTop fullscreen={isFullScreen === true || titleBar || attachToMenubar}>
              <SortableContainer
                distance={10}
                onSortEnd={async ({ oldIndex, newIndex }) => {
                  if (oldIndex === newIndex) return;

                  const newWorkspacesList = arrayMove(workspacesList, oldIndex, newIndex);
                  const newWorkspaces: Record<string, IWorkspace> = {};
                  newWorkspacesList.forEach((workspace, index) => {
                    newWorkspaces[workspace.id] = workspace;
                    newWorkspaces[workspace.id].order = index;
                  });

                  await window.service.workspace.setWorkspaces(newWorkspaces);
                }}>
                {workspacesList.map((workspace, index) => (
                  <SortableItem key={`item-${workspace.id}`} index={index} value={{ index: index, workspace }} />
                ))}
              </SortableContainer>
              <WorkspaceSelector id="add" onClick={async () => await window.service.window.open(WindowNames.addWorkspace)} />
            </SidebarTop>
              <End>
                <IconButton aria-label="Notifications" onClick={async () => await window.service.window.open(WindowNames.notifications)}>
                  {typeof pauseNotifications === 'string' && pauseNotifications.length > 0 ? <NotificationsPausedIcon /> : <NotificationsIcon />}
                </IconButton>
                {attachToMenubar === true && (
                  <IconButton aria-label="Preferences" onClick={async () => await window.service.window.open(WindowNames.preferences)}>
                    <SettingsIcon />
                  </IconButton>
                )}
              </End>
          </SidebarContainer>
        )}
        <ContentRoot>
          <FindInPage />
          <InnerContentRoot>
            {workspacesList.length > 0 && mainWorkspaceMetaData?.didFailLoadErrorMessage && mainWorkspaceMetaData?.isLoading === false && (
              <div>
                <Typography align="left" variant="h5">
                  Wiki is not started or not loaded
                </Typography>
                <Typography align="left" variant="body2">
                  {mainWorkspaceMetaData.didFailLoadErrorMessage}
                </Typography>

                <br />
                <Typography align="left" variant="body2">
                  <>
                    Try:
                    <HelperTextsList>
                      <li>
                        Click{' '}
                        <b onClick={requestReload} onKeyPress={requestReload} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
                          Reload
                        </b>{' '}
                        button below or press <b>CMD_or_Ctrl + R</b> to reload the page.
                      </li>
                      <li>
                        Check the{' '}
                        <b
                          onClick={async () => await window.service.native.open((await window.service.context.get('LOG_FOLDER')) as string, true)}
                          onKeyPress={async () => await window.service.native.open((await window.service.context.get('LOG_FOLDER')) as string, true)}
                          role="button"
                          tabIndex={0}
                          style={{ cursor: 'pointer' }}>
                          Log Folder
                        </b>{' '}
                        to see what happened.
                      </li>
                      <li>Backup your file, remove workspace and recreate one.</li>
                    </HelperTextsList>
                  </>
                </Typography>

                <Button variant="outlined" onClick={requestReload}>
                  Reload
                </Button>
              </div>
            )}
            {workspacesList.length > 0 && mainWorkspaceMetaData?.isLoading && <Typography color="textSecondary">Loading..</Typography>}
            {workspacesList.length === 0 && (
              <div>
                {sidebar === true ? (
                  <>
                    <Arrow image={themeSource === 'dark' ? arrowWhite : arrowBlack} />
                    <Tip>
                      <Tip2Text>Click</Tip2Text>
                      <Avatar>+</Avatar>
                      <Tip2Text>to get started!</Tip2Text>
                    </Tip>
                  </>
                ) : (
                  <Tip2>
                    <Tip2Text>
                      <span>Click </span>
                      <strong>Workspaces &gt; Add Workspace</strong>
                      <span> to get started!</span>
                    </Tip2Text>
                  </Tip2>
                )}
              </div>
            )}
          </InnerContentRoot>
        </ContentRoot>
      </Root>
    </OuterRoot>
  );
}
