import { combineReducers } from 'redux';

import { ADD_WORKSPACE_CREATE_WIKI_MESSAGE, ADD_WORKSPACE_UPDATE_FORM } from '../../constants/actions';

const wikiCreationMessage = (state = '', action) => {
  switch (action.type) {
    case ADD_WORKSPACE_CREATE_WIKI_MESSAGE:
      return action.value;
    default:
      return state;
  }
};

const defaultForm = {
  name: '',
  homeUrl: '',
  picturePath: null,
};
const form = (state = defaultForm, action) => {
  switch (action.type) {
    case ADD_WORKSPACE_UPDATE_FORM:
      return { ...state, ...action.changes };
    default:
      return state;
  }
};

export default combineReducers({
  wikiCreationMessage,
  form,
});
