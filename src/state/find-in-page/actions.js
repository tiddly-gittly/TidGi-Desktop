import {
  CLOSE_FIND_IN_PAGE,
  OPEN_FIND_IN_PAGE,
  UPDATE_FIND_IN_PAGE_TEXT,
  UPDATE_FIND_IN_PAGE_MATCHES,
} from '../../constants/actions';

export const closeFindInPage = () => ({
  type: CLOSE_FIND_IN_PAGE,
});

export const openFindInPage = () => ({
  type: OPEN_FIND_IN_PAGE,
});

export const updateFindInPageText = (text) => ({
  type: UPDATE_FIND_IN_PAGE_TEXT,
  text,
});

export const updateFindInPageMatches = (activeMatch, matches) => ({
  type: UPDATE_FIND_IN_PAGE_MATCHES,
  activeMatch,
  matches,
});
