import React, { useCallback } from 'react';
import styled, { css } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet';
import { DndContext, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

import SimpleBar from 'simplebar-react';
import 'simplebar/dist/simplebar.min.css';

import { Typography, Tooltip, IconButton as IconButtonRaw } from '@material-ui/core';
import { Settings as SettingsIcon, Upgrade as UpgradeIcon } from '@material-ui/icons';

import { WindowNames } from '@services/windows/WindowProperties';
import { IUpdaterStatus } from '@services/updater/interface';

import { usePromiseValue } from '@/helpers/useServiceValue';
import { useUpdaterObservable } from '@services/updater/hooks';

import WorkspaceSelector from './WorkspaceSelector';
import FindInPage from '../../components/FindInPage';
import { latestUpdateUrl } from '@/constants/urls';

import { SortableWorkspaceSelector } from './SortableWorkspaceSelector';
import { IWorkspace } from '@services/workspaces/interface';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { CommandPaletteIcon } from '@/components/icon/CommandPaletteSVG';
import { Languages } from '../Preferences/sections/Languages';
import { NewUserMessage } from './NewUserMessage';
import { WikiErrorMessages, ViewLoadErrorMessages } from './ErrorMessage';

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

const sidebarWidth = 68;
const sideBarStyle = css`
  height: 100%;
  width: ${sidebarWidth}px;
  min-width: ${sidebarWidth}px;
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
  overflow-y: scroll;
  &::-webkit-scrollbar {
    width: 0;
  }
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px;
  width: 100%;
  height: 100%;
`;

const ContentRoot = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;

  padding-right: 20px;
  width: calc(100% - ${sidebarWidth}px);
  max-width: calc(100% - ${sidebarWidth}px);
  height: 100%;
`;

const SideBarEnd = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
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
  const activeWorkspace = workspacesList?.find((workspace) => workspace.active);
  const updaterMetaData = useUpdaterObservable();
  if (preferences === undefined) return <div>{t('Loading')}</div>;

  const { attachToMenubar, titleBar, sidebar, themeSource, sidebarShortcutHints } = preferences;
  const hasError =
    typeof activeWorkspaceMetadata?.didFailLoadErrorMessage === 'string' &&
    activeWorkspaceMetadata?.didFailLoadErrorMessage.length > 0 &&
    activeWorkspaceMetadata?.isLoading === false;
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
              {updaterMetaData?.status === IUpdaterStatus.updateAvailable && (
                <IconButton
                  id="update-available"
                  aria-label={t('SideBar.UpdateAvailable')}
                  onClick={async () => await window.service.native.open(latestUpdateUrl)}>
                  <Tooltip title={<span>{t('SideBar.UpdateAvailable')}</span>} placement="top">
                    <UpgradeIcon />
                  </Tooltip>
                </IconButton>
              )}
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
            {activeWorkspace !== undefined && hasError && <WikiErrorMessages activeWorkspace={activeWorkspace} />}
            {Array.isArray(workspacesList) && activeWorkspace !== undefined && workspacesList.length > 0 && hasError && (
              <ViewLoadErrorMessages activeWorkspace={activeWorkspace} activeWorkspaceMetadata={activeWorkspaceMetadata} />
            )}
            {Array.isArray(workspacesList) && workspacesList.length > 0 && activeWorkspaceMetadata?.isLoading && (
              <Typography color="textSecondary">{t('Loading')}</Typography>
            )}
            {Array.isArray(workspacesList) && workspacesList.length === 0 && <NewUserMessage sidebar={sidebar} themeSource={themeSource} />}
          </InnerContentRoot>
          <Languages languageSelectorOnly />
        </ContentRoot>
      </Root>
    </OuterRoot>
  );
}
