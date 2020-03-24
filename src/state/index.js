import {
  applyMiddleware,
  combineReducers,
  createStore,
} from 'redux';
import thunkMiddleware from 'redux-thunk';

import dialogAddWorkspace from './dialog-add-workspace/reducers';
import dialogAuth from './dialog-auth/reducers';
import dialogCodeInjection from './dialog-code-injection/reducers';
import dialogCustomUserAgent from './dialog-custom-user-agent/reducers';
import dialogEditWorkspace from './dialog-edit-workspace/reducers';
import dialogGoToUrl from './dialog-go-to-url/reducers';
import dialogLicenseRegistration from './dialog-license-registration/reducers';
import dialogProxy from './dialog-proxy/reducers';
import dialogSpellcheckLanguages from './dialog-spellcheck-languages/reducers';
import findInPage from './find-in-page/reducers';
import general from './general/reducers';
import notifications from './notifications/reducers';
import preferences from './preferences/reducers';
import systemPreferences from './system-preferences/reducers';
import updater from './updater/reducers';
import workspaces from './workspaces/reducers';


import loadListeners from '../listeners';

const rootReducer = combineReducers({
  dialogAddWorkspace,
  dialogAuth,
  dialogCodeInjection,
  dialogCustomUserAgent,
  dialogEditWorkspace,
  dialogGoToUrl,
  dialogLicenseRegistration,
  dialogProxy,
  dialogSpellcheckLanguages,
  findInPage,
  general,
  notifications,
  preferences,
  systemPreferences,
  updater,
  workspaces,
});

const configureStore = (initialState) => createStore(
  rootReducer,
  initialState,
  applyMiddleware(thunkMiddleware),
);

// init store
const store = configureStore();

loadListeners(store);

export default store;
