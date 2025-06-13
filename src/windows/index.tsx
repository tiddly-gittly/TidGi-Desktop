import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { WindowNames } from '@services/windows/WindowProperties';
import { lazy, useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';

const AboutPage = lazy(() => import('./About'));
const DialogAddWorkspace = lazy(() => import('./AddWorkspace'));
const EditWorkspace = lazy(() => import('./EditWorkspace'));
const Main = lazy(() => import('../pages/Main'));
const DialogNotifications = lazy(() => import('./Notifications'));
const DialogPreferences = lazy(() => import('./Preferences'));
const SpellcheckLanguages = lazy(() => import('./SpellcheckLanguages'));

export function Pages(): React.JSX.Element {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    const windowName = window.meta().windowName;
    const expectedPath = `/${windowName}`;
    // Only set location if it doesn't match the expected path and we're not in the main window
    if (location !== expectedPath && windowName !== WindowNames.main) {
      setLocation(expectedPath);
    }
    // Remove setLocation from dependencies to avoid re-execution
  }, []);
  return (
    <HelmetProvider>
      <Switch>
        <Route path={`/${WindowNames.about}`} component={AboutPage} />
        <Route path={`/${WindowNames.addWorkspace}`} component={DialogAddWorkspace} />
        <Route path={`/${WindowNames.editWorkspace}`} component={EditWorkspace} />
        <Route path={`/${WindowNames.notifications}`} component={DialogNotifications} />
        <Route path={`/${WindowNames.preferences}`} component={DialogPreferences} />
        <Route path={`/${WindowNames.spellcheck}`} component={SpellcheckLanguages} />
        <Route path={`/${WindowNames.main}`} component={Main} nest />
        <Route path='/' component={Main} />
      </Switch>
    </HelmetProvider>
  );
}
