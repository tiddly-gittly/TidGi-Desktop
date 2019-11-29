import {
  applyMiddleware,
  combineReducers,
  createStore,
} from 'redux';
import thunkMiddleware from 'redux-thunk';

import addWorkspace from './add-workspace/reducers';
import auth from './auth/reducers';
import codeInjection from './code-injection/reducers';
import editWorkspace from './edit-workspace/reducers';
import findInPage from './find-in-page/reducers';
import general from './general/reducers';
import licenseRegistration from './license-registration/reducers';
import notifications from './notifications/reducers';
import preferences from './preferences/reducers';
import systemPreferences from './system-preferences/reducers';
import workspaces from './workspaces/reducers';

import loadListeners from '../listeners';

const rootReducer = combineReducers({
  addWorkspace,
  auth,
  codeInjection,
  editWorkspace,
  findInPage,
  general,
  licenseRegistration,
  notifications,
  preferences,
  systemPreferences,
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
