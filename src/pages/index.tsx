/* eslint-disable @typescript-eslint/promise-function-async */
import { WindowNames } from '@services/windows/WindowProperties';
import { lazy, useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';

const AboutPage = lazy(() => import('./About'));
const DialogAddWorkspace = lazy(() => import('./AddWorkspace').then((module) => ({ default: module.AddWorkspace })));
const EditWorkspace = lazy(() => import('./EditWorkspace'));
const Main = lazy(() => import('./Main'));
const DialogNotifications = lazy(() => import('./Notifications'));
const DialogPreferences = lazy(() => import('./Preferences'));
const SpellcheckLanguages = lazy(() => import('./SpellcheckLanguages'));

export function Pages(): JSX.Element {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(`/${window.meta.windowName}`);
  }, [setLocation]);
  return (
    <Switch>
      <Route path={`/${WindowNames.about}`} component={AboutPage} />
      <Route path={`/${WindowNames.addWorkspace}`} component={DialogAddWorkspace} />
      <Route path={`/${WindowNames.editWorkspace}`} component={EditWorkspace} />
      <Route path={`/${WindowNames.notifications}`} component={DialogNotifications} />
      <Route path={`/${WindowNames.preferences}`} component={DialogPreferences} />
      <Route path={`/${WindowNames.spellcheck}`} component={SpellcheckLanguages} />
      <Route path={`/${WindowNames.main}/:any*/:any*`} component={Main} />
      <Route component={Main} />
    </Switch>
  );
}
