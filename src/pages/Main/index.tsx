/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import is, { isNot } from 'typescript-styled-is';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet';

import SimpleBar from 'simplebar-react';
import 'simplebar/dist/simplebar.min.css';

import { Typography, Tooltip, IconButton as IconButtonRaw } from '@material-ui/core';
import { Settings as SettingsIcon, Upgrade as UpgradeIcon } from '@material-ui/icons';

import { WindowNames } from '@services/windows/WindowProperties';
import { IUpdaterStatus } from '@services/updater/interface';

import { usePromiseValue } from '@/helpers/useServiceValue';
import { useUpdaterObservable } from '@services/updater/hooks';

import FindInPage from '../../components/FindInPage';
import { latestStableUpdateUrl } from '@/constants/urls';

import { WorkspaceSelector, SortableWorkspaceSelectorList } from '@/components/WorkspaceIconAndSelector';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { CommandPaletteIcon } from '@/components/icon/CommandPaletteSVG';
import { Languages } from '../Preferences/sections/Languages';
import { TiddlyWiki } from '../Preferences/sections/TiddlyWiki';
import { NewUserMessage } from './NewUserMessage';
import { WikiErrorMessages, ViewLoadErrorMessages } from './ErrorMessage';
import { useAutoCreateFirstWorkspace } from './useAutoCreateFirstWorkspace';

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
  color: ${({ theme }) => theme.palette.text.primary};

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

const SidebarTop = styled.div<{ titleBar?: boolean }>`
  overflow-y: scroll;
  &::-webkit-scrollbar {
    width: 0;
  }
  flex: 1;
  width: 100%;
  ${({ titleBar }) =>
    titleBar === true
      ? css`
          padding-top: 0;
        `
      : css`
          padding-top: 30px;
        `}
`;

const IconButton = styled(IconButtonRaw)`
  aspect-ratio: 1;
  overflow: hidden;
  width: 80%;
  color: ${({ theme }) => theme.palette.action.active};
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
  ${is('sidebar')`
    width: calc(100% - ${String(sidebarWidth)}px);
    max-width: calc(100% - ${String(sidebarWidth)}px);
  `}
  ${isNot('sidebar')`
    width: 100%;
    padding-left: 20px;
  `}
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
  const [wikiCreationMessage, wikiCreationMessageSetter] = useState('');
  useAutoCreateFirstWorkspace(workspacesList, wikiCreationMessageSetter);
  const preferences = usePreferenceObservable();
  /** is title bar on. This only take effect after reload, so we don't want to get this preference from observable */
  const titleBar = usePromiseValue<boolean>(() => window.service.preference.get('titleBar'), false)!;

  const activeWorkspaceMetadata = workspacesList
    ?.map((workspace) => ({ active: workspace.active, ...workspace.metadata }))
    ?.find((workspace) => workspace.active);
  const activeWorkspace = workspacesList?.find((workspace) => workspace.active);
  const updaterMetaData = useUpdaterObservable();
  if (preferences === undefined) return <div>{t('Loading')}</div>;

  const { sidebar, themeSource, sidebarShortcutHints } = preferences;
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
            <SidebarTop titleBar={titleBar}>
              {workspacesList === undefined ? (
                <div>{t('Loading')}</div>
              ) : (
                <SortableWorkspaceSelectorList sidebarShortcutHints={sidebarShortcutHints} workspacesList={workspacesList} />
              )}
              <WorkspaceSelector
                id="add"
                index={workspacesList?.length ?? 0}
                showSidebarShortcutHints={sidebarShortcutHints}
                onClick={() => void window.service.window.open(WindowNames.addWorkspace)}
              />
              <WorkspaceSelector
                id="guide"
                index={workspacesList?.length ? workspacesList.length + 1 : 1}
                active={activeWorkspace?.id === undefined}
                showSidebarShortcutHints={sidebarShortcutHints}
                onClick={() => void window.service.workspace.clearActiveWorkspace(activeWorkspace?.id)}
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
                  onClick={async () => await window.service.native.open(updaterMetaData.info?.latestReleasePageUrl ?? latestStableUpdateUrl)}>
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
        <ContentRoot sidebar={sidebar}>
          <FindInPage />
          <InnerContentRoot>
            {activeWorkspace !== undefined && hasError && <WikiErrorMessages activeWorkspace={activeWorkspace} />}
            {Array.isArray(workspacesList) && activeWorkspace !== undefined && workspacesList.length > 0 && hasError && (
              <ViewLoadErrorMessages activeWorkspace={activeWorkspace} activeWorkspaceMetadata={activeWorkspaceMetadata} />
            )}
            {Array.isArray(workspacesList) && workspacesList.length > 0 && activeWorkspaceMetadata?.isLoading === true && (
              <Typography color="textSecondary">{t('Loading')}</Typography>
            )}
            {wikiCreationMessage && <Typography color="textSecondary">{wikiCreationMessage}</Typography>}
            {Array.isArray(workspacesList) && workspacesList.length === 0 && <NewUserMessage sidebar={sidebar} themeSource={themeSource} />}
          </InnerContentRoot>
          <Languages languageSelectorOnly />
          <TiddlyWiki />
        </ContentRoot>
      </Root>
    </OuterRoot>
  );
}
