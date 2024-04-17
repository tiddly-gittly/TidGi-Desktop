/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { DefaultTheme, styled } from 'styled-components';
import is, { isNot } from 'typescript-styled-is';
import { Route, Switch } from 'wouter';

import { PageType } from '@services/pages/interface';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { Guide } from '../Guide';
import { Help } from '../Help';
import { WikiBackground } from '../WikiBackground';
import FindInPage from './FindInPage';
import { SideBar } from './Sidebar';
import { useInitialPage } from './useInitialPage';

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

const ContentRoot = styled.div<{ $sidebar: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;

  padding-right: 20px;
  ${is('$sidebar')`
    width: calc(100% - ${({ theme }: { theme: DefaultTheme }) => theme.sidebar.width}px);
    max-width: calc(100% - ${({ theme }: { theme: DefaultTheme }) => theme.sidebar.width}px);
  `}
  ${isNot('$sidebar')`
    width: 100%;
    padding-left: 20px;
  `}
  height: 100%;
`;

const windowName = window.meta().windowName;

export default function Main(): JSX.Element {
  const { t } = useTranslation();
  useInitialPage();
  const preferences = usePreferenceObservable();
  if (preferences === undefined) return <div>{t('Loading')}</div>;
  const { sidebar, sidebarOnMenubar } = preferences;
  const showSidebar = windowName === WindowNames.menuBar ? sidebarOnMenubar : sidebar;
  return (
    <OuterRoot>
      <div id='test' data-usage='For spectron automating testing' />
      <Helmet>
        <title>{t('Menu.TidGi')}</title>
      </Helmet>
      <Root>
        {showSidebar && <SideBar />}
        <ContentRoot $sidebar={showSidebar}>
          <FindInPage />
          <Switch>
            <Route path={`/${WindowNames.main}/${PageType.wiki}/:id/`} component={WikiBackground} />
            <Route path={`/${WindowNames.main}/${PageType.guide}/`} component={Guide} />
            <Route path={`/${WindowNames.main}/${PageType.help}/`} component={Help} />
            <Route path={`/${WindowNames.main}`} component={Guide} />
            <Route component={Guide} />
          </Switch>
        </ContentRoot>
      </Root>
    </OuterRoot>
  );
}
