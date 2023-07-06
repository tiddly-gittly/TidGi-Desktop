/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Settings as SettingsIcon, Upgrade as UpgradeIcon } from '@material-ui/icons';
import { t } from 'i18next';
import SimpleBar from 'simplebar-react';
import styled, { css } from 'styled-components';

import { CommandPaletteIcon } from '@/components/icon/CommandPaletteSVG';
import { SortableWorkspaceSelectorList, WorkspaceSelector } from '@/components/WorkspaceIconAndSelector';
import { sidebarWidth } from '@/constants/style';
import { latestStableUpdateUrl } from '@/constants/urls';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { IconButton as IconButtonRaw, Tooltip } from '@material-ui/core';
import { usePagesListObservable } from '@services/pages/hooks';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { useUpdaterObservable } from '@services/updater/hooks';
import { IUpdaterStatus } from '@services/updater/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';

const SideBarEnd = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

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

const SidebarContainer = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  // use native scroll bar on macOS
  if (platform === 'darwin') {
    return <SidebarRoot>{children}</SidebarRoot>;
  }
  return <SidebarWithStyle>{children}</SidebarWithStyle>;
};

export function SideBar(): JSX.Element {
  /** is title bar on. This only take effect after reload, so we don't want to get this preference from observable */
  const titleBar = usePromiseValue<boolean>(async () => await window.service.preference.get('titleBar'), false)!;

  const workspacesList = useWorkspacesListObservable();
  const pagesList = usePagesListObservable();
  const activeWorkspace = workspacesList?.find((workspace) => workspace.active);
  const preferences = usePreferenceObservable();
  const updaterMetaData = useUpdaterObservable();
  if (preferences === undefined) return <div>{t('Loading')}</div>;

  const { sidebarShortcutHints, hideSideBarIcon } = preferences;

  return (
    <SidebarContainer>
      <SidebarTop titleBar={titleBar}>
        {workspacesList === undefined
          ? <div>{t('Loading')}</div>
          : <SortableWorkspaceSelectorList sidebarShortcutHints={sidebarShortcutHints} workspacesList={workspacesList} hideSideBarIcon={hideSideBarIcon} />}
        <WorkspaceSelector
          id='add'
          hideSideBarIcon={hideSideBarIcon}
          index={workspacesList?.length ?? 0}
          showSidebarShortcutHints={sidebarShortcutHints}
          onClick={() => void window.service.window.open(WindowNames.addWorkspace)}
        />
      </SidebarTop>
      <SideBarEnd>
        {updaterMetaData?.status === IUpdaterStatus.updateAvailable && (
          <IconButton
            id='update-available'
            aria-label={t('SideBar.UpdateAvailable')}
            onClick={async () => {
              await window.service.native.open(updaterMetaData.info?.latestReleasePageUrl ?? latestStableUpdateUrl);
            }}
          >
            <Tooltip title={<span>{t('SideBar.UpdateAvailable')}</span>} placement='top'>
              <UpgradeIcon />
            </Tooltip>
          </IconButton>
        )}
        <IconButton
          id='open-preferences-button'
          aria-label={t('SideBar.Preferences')}
          onClick={async () => {
            await window.service.window.open(WindowNames.preferences);
          }}
        >
          <Tooltip title={<span>{t('SideBar.Preferences')}</span>} placement='top'>
            <SettingsIcon />
          </Tooltip>
        </IconButton>
      </SideBarEnd>
    </SidebarContainer>
  );
}
