/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Settings as SettingsIcon, Upgrade as UpgradeIcon } from '@mui/icons-material';
import { t } from 'i18next';
import SimpleBar from 'simplebar-react';
import styled, { css } from 'styled-components';
import is, { isNot } from 'typescript-styled-is';

import { SortableWorkspaceSelectorList, WorkspaceSelectorBase } from '@/components/WorkspaceIconAndSelector';
import { sidebarWidth } from '@/constants/style';
import { latestStableUpdateUrl } from '@/constants/urls';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { IconButton as IconButtonRaw, Tooltip } from '@mui/material';
import { usePagesListObservable } from '@services/pages/hooks';
import { PageType } from '@services/pages/interface';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { useUpdaterObservable } from '@services/updater/hooks';
import { IUpdaterStatus } from '@services/updater/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { useMemo } from 'react';
import { SortablePageSelectorList } from './PageIconAndSelector';

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

const SidebarTop = styled.div<{ $titleBar?: boolean }>`
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
  const noActiveWorkspace = workspacesList?.some((workspace) => workspace.active) === false;
  const noActiveWorkspaceAndPage = noActiveWorkspace && pagesList?.some((page) => page.active) === false;
  // when no active workspace and no active page, the guide page is active in src/pages/index.tsx 's route. so we make sidebar icon active too.
  const pagesListWithProperActiveStatus = useMemo(() =>
    pagesList?.map?.((page) => {
      if (page.type === PageType.guide) {
        // set guide active if no active workspace and page
        return { ...page, active: page.active || noActiveWorkspaceAndPage };
      }
      // active workspace has priority to show, so if a page is also active, don't show it as active because it is hidden
      return { ...page, active: page.active && noActiveWorkspace };
    }), [pagesList, noActiveWorkspaceAndPage, noActiveWorkspace]);
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
        <WorkspaceSelectorBase
          id='add'
          showSideBarIcon={showSideBarIcon}
          index={workspacesList?.length ?? 0}
          showSidebarTexts={showSideBarText}
          onClick={() => void window.service.window.open(WindowNames.addWorkspace)}
        />
        {pagesListWithProperActiveStatus === undefined
          ? <div>{t('Loading')}</div>
          : (
            <SortablePageSelectorList
              showSideBarText={showSideBarText}
              pagesList={pagesListWithProperActiveStatus}
              showSideBarIcon={showSideBarIcon}
            />
          )}
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
