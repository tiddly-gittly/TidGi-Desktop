import SettingsIcon from '@mui/icons-material/Settings';
import UpgradeIcon from '@mui/icons-material/Upgrade';
import { css, styled } from '@mui/material/styles';
import { t } from 'i18next';
import SimpleBar from 'simplebar-react';
import is, { isNot } from 'typescript-styled-is';

import { latestStableUpdateUrl } from '@/constants/urls';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { SortableWorkspaceSelectorList } from '@/pages/Main/WorkspaceIconAndSelector';
import { IconButton as IconButtonRaw, Tooltip } from '@mui/material';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { useUpdaterObservable } from '@services/updater/hooks';
import { IUpdaterStatus } from '@services/updater/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';

const sideBarStyle = css`
  height: 100%;
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
const SidebarRoot = styled('div')`
  ${sideBarStyle}
  width: ${({ theme }) => theme.sidebar.width}px;
  min-width: ${({ theme }) => theme.sidebar.width}px;
  background-color: ${({ theme }) => theme.palette.background.default};
`;
const SidebarWithStyle = styled(SimpleBar)`
  ${sideBarStyle}
  width: ${({ theme }) => theme.sidebar.width}px;
  min-width: ${({ theme }) => theme.sidebar.width}px;
  background-color: ${({ theme }) => theme.palette.background.default};
`;

const SidebarTop = styled('div')<{ $titleBar?: boolean }>`
  overflow-y: scroll;
  &::-webkit-scrollbar {
    width: 0;
  }
  flex: 1;
  width: 100%;
  ${is('$titleBar')`
    padding-top: 0;
  `}
  ${isNot('$titleBar')`
    padding-top: 30px;
  `}
`;
const SideBarEnd = styled('div')`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const IconButton = styled(IconButtonRaw)`
  aspect-ratio: 1;
  overflow: hidden;
  width: 80%;
  color: ${({ theme }) => theme.palette.action.active};
`;

const SidebarContainer = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));
  // use native scroll bar on macOS
  if (platform === 'darwin') {
    return <SidebarRoot>{children}</SidebarRoot>;
  }
  return <SidebarWithStyle>{children}</SidebarWithStyle>;
};

export function SideBar(): React.JSX.Element {
  /** is title bar on. This only take effect after reload, so we don't want to get this preference from observable */
  const titleBar = usePromiseValue<boolean>(async () => await window.service.preference.get('titleBar'), false)!;

  const workspacesList = useWorkspacesListObservable();
  const preferences = usePreferenceObservable();
  const updaterMetaData = useUpdaterObservable();
  if (preferences === undefined) return <div>{t('Loading')}</div>;

  const { showSideBarText, showSideBarIcon } = preferences;

  return (
    <SidebarContainer>
      <SidebarTop $titleBar={titleBar}>
        {workspacesList === undefined
          ? <div>{t('Loading')}</div>
          : <SortableWorkspaceSelectorList showSideBarText={showSideBarText} workspacesList={workspacesList} showSideBarIcon={showSideBarIcon} />}
      </SidebarTop>
      <SideBarEnd>
        {updaterMetaData?.status === IUpdaterStatus.updateAvailable && (
          <IconButton
            id='update-available'
            aria-label={t('SideBar.UpdateAvailable')}
            onClick={async () => {
              await window.service.native.openURI(updaterMetaData.info?.latestReleasePageUrl ?? latestStableUpdateUrl);
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
