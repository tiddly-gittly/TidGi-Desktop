import { Helmet } from '@dr.pogodin/react-helmet';
import { styled } from '@mui/material/styles';
import { lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Switch } from 'wouter';

import { PageType } from '@/constants/pageTypes';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import FindInPage from './FindInPage';
import { SideBar } from './Sidebar';
import { useInitialPage } from './useInitialPage';

import { subPages } from './subPages';

const WikiBackground = lazy(() => import('../WikiBackground'));

const OuterRoot = styled('div')`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
`;

const Root = styled('div')`
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

const ContentRoot = styled('div')<{ $sidebar: boolean }>(
  ({ theme, $sidebar }) => `
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  
  ${
    $sidebar
      ? `
    width: calc(100% - ${theme.sidebar.width}px);
    max-width: calc(100% - ${theme.sidebar.width}px);
  `
      : `
    width: 100%;
  `
  }
`,
);

export default function Main(): React.JSX.Element {
  const { t } = useTranslation();
  useInitialPage();
  const windowName = window.meta().windowName;
  const preferences = usePreferenceObservable();
  const isTidgiMiniWindow = windowName === WindowNames.tidgiMiniWindow;
  const showSidebar = (isTidgiMiniWindow ? preferences?.tidgiMiniWindowShowSidebar : preferences?.sidebar) ?? true;
  return (
    <OuterRoot>
      <Helmet>
        <title>{t('Menu.TidGi')}{isTidgiMiniWindow ? ` - ${t('Menu.TidGiMiniWindow')}` : ''}</title>
      </Helmet>
      <Root data-windowname={windowName} data-showsidebar={showSidebar}>
        {showSidebar && <SideBar />}
        <ContentRoot $sidebar={showSidebar}>
          <FindInPage />
          <Switch>
            <Route path={`/${PageType.wiki}/:id/`} component={WikiBackground} />
            <Route path={`/${PageType.agent}`} component={subPages.Agent} />
            <Route path={`/${PageType.guide}`} component={subPages.Guide} />
            <Route path={`/${PageType.help}`} component={subPages.Help} />
            <Route path='/' component={subPages.Guide} />
            <Route component={subPages.Guide} />
          </Switch>
        </ContentRoot>
      </Root>
    </OuterRoot>
  );
}
