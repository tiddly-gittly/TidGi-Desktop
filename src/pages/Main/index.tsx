import React, { useCallback } from 'react';
import styled, { css } from 'styled-components';
import { useTranslation, Trans } from 'react-i18next';
import { Helmet } from 'react-helmet';
import { AsyncReturnType } from 'type-fest';
import { DndContext, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

import SimpleBar from 'simplebar-react';
import 'simplebar/dist/simplebar.min.css';

import { Button, Typography, Tooltip, IconButton as IconButtonRaw } from '@material-ui/core';
import { Notifications as NotificationsIcon, NotificationsPaused as NotificationsPausedIcon, Settings as SettingsIcon } from '@material-ui/icons';

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
import { CommandPaletteIcon } from '@/components/icon/CommandPaletteSVG';
import { Languages } from '../Preferences/sections/Languages';

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
  &::-webkit-scrollbar {
    width: 0;
  }
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

const AddWorkspaceGuideInfoContainer = styled.div`
  cursor: pointer;
`;

const SideBarEnd = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const HelperTextsList = styled.ul`
  margin-top: 0;
  margin-bottom: 1.5rem;
  max-width: 70vw;
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
  const requestReload = useCallback(async (): Promise<void> => {
    await window.service.window.reload(window.meta.windowName);
  }, []);

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const workspaceIDs = workspacesList?.map((workspace) => workspace.id) ?? [];
  const activeWorkspaceMetadata = workspacesList
    ?.map((workspace) => ({ active: workspace.active, ...workspace.metadata }))
    ?.find((workspace) => workspace.active);
  if (preferences === undefined) return <div>{t('Loading')}</div>;

  // DEBUG: console
  console.log(`activeWorkspaceMetadata`, activeWorkspaceMetadata);
  const { attachToMenubar, titleBar, sidebar, pauseNotifications, themeSource, sidebarShortcutHints } = preferences;
  return (
    <OuterRoot>
      <div id="test" data-usage="For spectron automating testing" />
      <Helmet>
        <title>{t('Menu.TidGi')}</title>
      </Helmet>
      <Root>
        {sidebar && (
          <SidebarContainer>
            <SidebarTop fullscreen={isFullScreen || titleBar || attachToMenubar}>
              {workspacesList === undefined ? (
                <div>{t('Loading')}</div>
              ) : (
                <DndContext
                  sensors={dndSensors}
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
              {(workspacesList?.length ?? 0) > 0 && (
                <>
                  <IconButton
                    id="open-command-palette-button"
                    aria-label={t('SideBar.CommandPalette')}
                    onClick={async () => await window.service.wiki.requestWikiSendActionMessage('open-command-palette')}>
                    <Tooltip title={<span>{t('SideBar.CommandPalette')}</span>} placement="top">
                      <CommandPaletteIcon />
                    </Tooltip>
                  </IconButton>
                </>
              )}
              <IconButton
                id="open-notification-settings-button"
                aria-label={t('SideBar.Notifications')}
                onClick={async () => await window.service.window.open(WindowNames.notifications)}>
                <Tooltip title={<span>{t('SideBar.Notifications')}</span>} placement="top">
                  {typeof pauseNotifications === 'string' && pauseNotifications.length > 0 ? <NotificationsPausedIcon /> : <NotificationsIcon />}
                </Tooltip>
              </IconButton>
              <IconButton
                id="open-preferences-button"
                aria-label={t('SideBar.Preferences')}
                onClick={async () => await window.service.window.open(WindowNames.preferences)}>
                <Tooltip title={<span>{t('SideBar.Preferences')}</span>} placement="top">
                  <SettingsIcon />
                </Tooltip>
              </IconButton>
            </SideBarEnd>
          </SidebarContainer>
        )}
        <ContentRoot>
          <FindInPage />
          <InnerContentRoot>
            {Array.isArray(workspacesList) &&
              workspacesList.length > 0 &&
              typeof activeWorkspaceMetadata?.didFailLoadErrorMessage === 'string' &&
              activeWorkspaceMetadata?.didFailLoadErrorMessage.length > 0 &&
              activeWorkspaceMetadata?.isLoading === false && (
                <div>
                  <Typography align="left" variant="h5">
                    {t('AddWorkspace.WikiNotStarted')}
                  </Typography>
                  <Typography align="left" variant="body2">
                    {activeWorkspaceMetadata.didFailLoadErrorMessage}
                  </Typography>

                  <br />
                  <Trans t={t} i18nKey="AddWorkspace.MainPageReloadTip">
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
                  </Trans>

                  <Button variant="outlined" onClick={requestReload}>
                    {t('AddWorkspace.Reload')}
                  </Button>
                </div>
              )}
            {Array.isArray(workspacesList) && workspacesList.length > 0 && activeWorkspaceMetadata?.isLoading && (
              <Typography color="textSecondary">{t('Loading')}</Typography>
            )}
            {Array.isArray(workspacesList) && workspacesList.length === 0 && (
              <AddWorkspaceGuideInfoContainer onClick={async () => await window.service.window.open(WindowNames.addWorkspace)}>
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
                        <span>Or </span>
                        <strong>Click Here</strong>
                        <span> to get started!</span>
                      </Trans>
                    </Tip2Text>
                  </TipWithoutSidebar>
                )}
              </AddWorkspaceGuideInfoContainer>
            )}
          </InnerContentRoot>
          <Languages languageSelectorOnly />
        </ContentRoot>
      </Root>
    </OuterRoot>
  );
}
