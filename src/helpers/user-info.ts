import { requestSetPreference, getPreference } from '../senders';

// @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'Object' is not assignable to par... Remove this comment to see the full error message
export const setGithubUserInfo = (userInfo: Object) => requestSetPreference('github-user-info', userInfo);
export const getGithubUserInfo = () => getPreference<IUserInfo | void>('github-user-info') || undefined;
