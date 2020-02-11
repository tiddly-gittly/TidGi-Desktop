import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';

import CssBaseline from '@material-ui/core/CssBaseline';

import 'typeface-roboto/index.css';

import store from './state';

import AppWrapper from './components/app-wrapper';

import getWorkspacesAsList from './helpers/get-workspaces-as-list';

const About = React.lazy(() => import('./components/about'));
const AddWorkspace = React.lazy(() => import('./components/add-workspace'));
const Auth = React.lazy(() => import('./components/auth'));
const CodeInjection = React.lazy(() => import('./components/code-injection'));
const CustomUserAgent = React.lazy(() => import('./components/custom-user-agent'));
const DisplayMedia = React.lazy(() => import('./components/display-media'));
const EditWorkspace = React.lazy(() => import('./components/edit-workspace'));
const GoToUrl = React.lazy(() => import('./components/go-to-url'));
const LicenseRegistration = React.lazy(() => import('./components/license-registration'));
const Main = React.lazy(() => import('./components/main'));
const Notifications = React.lazy(() => import('./components/notifications'));
const OpenUrlWith = React.lazy(() => import('./components/open-url-with'));
const Preferences = React.lazy(() => import('./components/preferences'));

const App = () => {
  switch (window.mode) {
    case 'about': return <About />;
    case 'add-workspace': return <AddWorkspace />;
    case 'auth': return <Auth />;
    case 'code-injection': return <CodeInjection />;
    case 'custom-user-agent': return <CustomUserAgent />;
    case 'display-media': return <DisplayMedia />;
    case 'edit-workspace': return <EditWorkspace />;
    case 'go-to-url': return <GoToUrl />;
    case 'license-registration': return <LicenseRegistration />;
    case 'notifications': return <Notifications />;
    case 'open-url-with': return <OpenUrlWith />;
    case 'preferences': return <Preferences />;
    default: return <Main />;
  }
};

const runApp = () => {
  Promise.resolve()
    .then(() => {
      const { webFrame, remote } = window.require('electron');
      webFrame.setVisualZoomLevelLimits(1, 1);
      webFrame.setLayoutZoomLevelLimits(0, 0);
      if (window.mode === 'about') {
        document.title = 'About';
      } else if (window.mode === 'license-registration') {
        document.title = 'License Registration';
      } else if (window.mode === 'add-workspace') {
        document.title = 'Add Workspace';
      } else if (window.mode === 'preferences') {
        document.title = 'Preferences';
      } else if (window.mode === 'edit-workspace') {
        const { workspaces } = store.getState();
        const workspaceList = getWorkspacesAsList(workspaces);
        const editWorkspaceId = remote.getGlobal('editWorkspaceId');
        const workspace = workspaces[editWorkspaceId];
        workspaceList.some((item, index) => {
          if (item.id === editWorkspaceId) {
            workspace.order = index;
            return true;
          }
          return false;
        });
        document.title = workspace.name ? `Edit Workspace ${workspace.order + 1} "${workspace.name}"` : `Edit Workspace ${workspace.order + 1}`;
      } else if (window.mode === 'open-url-with') {
        document.title = 'Open Link With';
      } else if (window.mode === 'code-injection') {
        const codeInjectionType = remote.getGlobal('codeInjectionType');
        document.title = `Edit ${codeInjectionType.toUpperCase()} Code Injection`;
      } else if (window.mode === 'code-injection') {
        document.title = 'Sign in';
      } else if (window.mode === 'notifications') {
        document.title = 'Notifications';
      } else if (window.mode === 'display-media') {
        document.title = 'Share your Screen';
      } else if (window.mode === 'custom-user-agent') {
        document.title = 'Edit Custom User Agent';
      } else if (window.mode === 'go-to-url') {
        document.title = 'Go to URL';
      } else {
        document.title = 'Singlebox';
      }
    });

  ReactDOM.render(
    <Provider store={store}>
      <AppWrapper>
        <CssBaseline />
        <React.Suspense fallback={<div />}>
          <App />
        </React.Suspense>
      </AppWrapper>
    </Provider>,
    document.getElementById('app'),
  );
};

runApp();
