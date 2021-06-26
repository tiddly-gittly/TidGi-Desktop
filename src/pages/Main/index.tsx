import React, { useCallback } from 'react';
import styled, { css } from 'styled-components';
import { useTranslation, Trans } from 'react-i18next';
import { Helmet } from 'react-helmet';
import { AsyncReturnType } from 'type-fest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

import SimpleBar from 'simplebar-react';
import 'simplebar/dist/simplebar.min.css';

import Button from '@material-ui/core/Button';
import IconButtonRaw from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';

import NotificationsIcon from '@material-ui/icons/Notifications';
import NotificationsPausedIcon from '@material-ui/icons/NotificationsPaused';
import SettingsIcon from '@material-ui/icons/Settings';

import { WindowNames } from '@services/windows/WindowProperties';

import { usePromiseValue } from '@/helpers/useServiceValue';

import WorkspaceSelector from './WorkspaceSelector';
import FindInPage from '../../components/FindInPage';

import arrowWhite from '@/images/arrow-white.png';
import arrowBlack from '@/images/arrow-black.png';
import { SortableWorkspaceSelector } from './SortableWorkspaceSelector';
import { IWorkspace } from '@services/workspaces/interface';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { usePreferenceObservable } from '@services/preferences/hooks';

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
  background-color: ${({ theme }) => theme.palette.background.default};

  .simplebar-content {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
`;

const sideBarStyle = css`
  height: 100%;
  width: 68px;
  background-color: ${({ theme }) => theme.palette.background.default};
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
  ${({ fullscreen }) =>
    fullscreen === true
      ? css`
          padding-top: 0;
        `
      : css`
          padding-top: 30px;
        `}
`;

const IconButton = styled(IconButtonRaw)`
  aspect-ratio: 1;
  width: 80%;
`;

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
  height: 202px;
  width: 150px;
  position: absolute;
  top: 50px;
  left: 72px;

  background-image: url(${({ image }) => image});
  background-size: 150px 202px;
`;

const Avatar = styled.div`
  display: inline-block;
  height: 32px;
  width: 32px;
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

const TipWithSidebar = styled.div`
  position: absolute;
  top: 112px;
  left: 180px;
  user-select: none;
`;

const TipWithoutSidebar = styled.div`
  user-select: none;
`;

const SideBarEnd = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const HelperTextsList = styled.ul`
  margin-top: 0;
  margin-bottom: 1.5rem;
`;

const SidebarContainer = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  // use native scroll bar on macOS
  if (platform === 'darwin') {
    return <SidebarRoot>{children}</SidebarRoot>;
  }
  return <SidebarWithStyle>{children}</SidebarWithStyle>;
};

export default function Main(): JSX.Element {
  const { t } = useTranslation();
  const workspacesList = useWorkspacesListObservable();
  const preferences = usePreferenceObservable();
  const isFullScreen = usePromiseValue<boolean | undefined>(window.service.window.isFullScreen, false)!;

  const mainWorkspaceMetaData = usePromiseValue(async () => {
    const activeWorkspace = await window.service.workspace.getActiveWorkspace();
    if (activeWorkspace !== undefined) {
      const metadata = await window.service.workspace.getMetaData(activeWorkspace.id);
      return metadata;
    }
    return { didFailLoadErrorMessage: 'No ActiveWorkspace' };
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  }, {} as AsyncReturnType<typeof window.service.workspace.getMetaData>);
  const requestReload = useCallback(async (): Promise<void> => await window.service.window.reload(window.meta.windowName), []);

  const workspaceIDs = workspacesList?.map((workspace) => workspace.id) ?? [];
  if (preferences === undefined) return <div>Loading...</div>;
  const { attachToMenubar, titleBar, sidebar, pauseNotifications, themeSource, sidebarShortcutHints } = preferences;
  return (
    <OuterRoot>
      <div id="test" data-usage="For spectron automating testing" />
      <Helmet>
        <title>{t('Menu.TiddlyGit')}</title>
      </Helmet>
      <Root>
        {sidebar && (
          <SidebarContainer>
            <SidebarTop fullscreen={isFullScreen || titleBar || attachToMenubar}>
              {workspacesList === undefined ? (
                <div>Loading...</div>
              ) : (
                <DndContext
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={async ({ active, over }) => {
                    if (over === null || active.id === over.id) return;
                    const oldIndex = workspaceIDs.indexOf(active.id);
                    const newIndex = workspaceIDs.indexOf(over.id);

                    const newWorkspacesList = arrayMove(workspacesList, oldIndex, newIndex);
                    const newWorkspaces: Record<string, IWorkspace> = {};
                    newWorkspacesList.forEach((workspace, index) => {
                      newWorkspaces[workspace.id] = workspace;
                      newWorkspaces[workspace.id].order = index;
                    });

                    await window.service.workspace.setWorkspaces(newWorkspaces);
                  }}>
                  <SortableContext items={workspaceIDs} strategy={verticalListSortingStrategy}>
                    {workspacesList
                      .sort((a, b) => a.order - b.order)
                      .map((workspace, index) => (
                        <SortableWorkspaceSelector
                          key={`item-${workspace.id}`}
                          index={index}
                          workspace={workspace}
                          showSidebarShortcutHints={sidebarShortcutHints}
                        />
                      ))}
                  </SortableContext>
                </DndContext>
              )}
              <WorkspaceSelector
                id="add"
                index={workspacesList?.length ?? 0}
                showSidebarShortcutHints={sidebarShortcutHints}
                onClick={() => void window.service.window.open(WindowNames.addWorkspace)}
              />
            </SidebarTop>
            <SideBarEnd>
              <IconButton
                id="open-notification-settings-button"
                aria-label={t('Preference.Notifications')}
                onClick={async () => await window.service.window.open(WindowNames.notifications)}>
                {typeof pauseNotifications === 'string' && pauseNotifications.length > 0 ? <NotificationsPausedIcon /> : <NotificationsIcon />}
              </IconButton>
              <IconButton
                id="open-preferences-button"
                aria-label={t('ContextMenu.Preferences')}
                onClick={async () => await window.service.window.open(WindowNames.preferences)}>
                <SettingsIcon />
              </IconButton>
            </SideBarEnd>
          </SidebarContainer>
        )}
        <ContentRoot>
          <FindInPage />
          <InnerContentRoot>
            {Array.isArray(workspacesList) &&
              workspacesList.length > 0 &&
              typeof mainWorkspaceMetaData?.didFailLoadErrorMessage === 'string' &&
              mainWorkspaceMetaData?.didFailLoadErrorMessage.length > 0 &&
              mainWorkspaceMetaData?.isLoading === false && (
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
                            onClick={async () => await window.service.native.open(await window.service.context.get('LOG_FOLDER'), true)}
                            onKeyPress={async () => await window.service.native.open(await window.service.context.get('LOG_FOLDER'), true)}
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
            {Array.isArray(workspacesList) && workspacesList.length > 0 && mainWorkspaceMetaData?.isLoading && (
              <Typography color="textSecondary">Loading..</Typography>
            )}
            {Array.isArray(workspacesList) && workspacesList.length === 0 && (
              <div>
                {sidebar ? (
                  <>
                    <Arrow image={themeSource === 'dark' ? arrowWhite : arrowBlack} />
                    <TipWithSidebar id="new-user-tip">
                      <Trans t={t} i18nKey="AddWorkspace.MainPageTipWithSidebar">
                        <Tip2Text>Click</Tip2Text>
                        <Avatar>+</Avatar>
                        <Tip2Text>to get started!</Tip2Text>
                      </Trans>
                    </TipWithSidebar>
                  </>
                ) : (
                  <TipWithoutSidebar id="new-user-tip">
                    <Tip2Text>
                      <Trans t={t} i18nKey="AddWorkspace.MainPageTipWithoutSidebar">
                        <span>Click </span>
                        <strong>Workspaces &gt; Add Workspace</strong>
                        <span> to get started!</span>
                      </Trans>
                    </Tip2Text>
                  </TipWithoutSidebar>
                )}
              </div>
            )}
          </InnerContentRoot>
        </ContentRoot>
      </Root>
    </OuterRoot>
  );
}
