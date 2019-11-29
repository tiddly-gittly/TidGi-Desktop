import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';

import CssBaseline from '@material-ui/core/CssBaseline';

import 'typeface-roboto/index.css';

import store from './state';

import About from './components/about';
import AddWorkspace from './components/add-workspace';
import AppWrapper from './components/app-wrapper';
import Auth from './components/auth';
import CodeInjection from './components/code-injection';
import EditWorkspace from './components/edit-workspace';
import LicenseRegistration from './components/license-registration';
import Main from './components/main';
import OpenUrlWith from './components/open-url-with';
import Preferences from './components/preferences';
import Notifications from './components/notifications';

import getWorkspacesAsList from './helpers/get-workspaces-as-list';

const { webFrame } = window.require('electron');

webFrame.setVisualZoomLevelLimits(1, 1);
webFrame.setLayoutZoomLevelLimits(0, 0);

const runApp = () => {
  let App;
  switch (window.mode) {
    case 'preferences': {
      App = Preferences;
      break;
    }
    case 'edit-workspace': {
      App = EditWorkspace;
      break;
    }
    case 'open-url-with': {
      App = OpenUrlWith;
      break;
    }
    case 'code-injection': {
      App = CodeInjection;
      break;
    }
    case 'auth': {
      App = Auth;
      break;
    }
    case 'about': {
      App = About;
      break;
    }
    case 'add-workspace': {
      App = AddWorkspace;
      break;
    }
    case 'license-registration': {
      App = LicenseRegistration;
      break;
    }
    case 'notifications': {
      App = Notifications;
      break;
    }
    default: {
      App = Main;
    }
  }

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
    const editWorkspaceId = window.require('electron').remote.getGlobal('editWorkspaceId');
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
    const codeInjectionType = window.require('electron').remote.getGlobal('codeInjectionType');
    document.title = `Edit ${codeInjectionType.toUpperCase()} Code Injection`;
  } else if (window.mode === 'code-injection') {
    document.title = 'Sign in';
  } else if (window.mode === 'notifications') {
    document.title = 'Notifications';
  } else {
    document.title = 'Singlebox';
  }

  ReactDOM.render(
    <Provider store={store}>
      <AppWrapper>
        <CssBaseline />
        <App />
      </AppWrapper>
    </Provider>,
    document.getElementById('app'),
  );
};

runApp();
