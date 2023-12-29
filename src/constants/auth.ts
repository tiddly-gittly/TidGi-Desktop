export const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';
export const TIDGI_AUTH_TOKEN_HEADER = 'x-tidgi-auth-token';
export const getTidGiAuthHeaderWithToken = (authToken: string) => `${TIDGI_AUTH_TOKEN_HEADER}-${authToken}`;
export const DEFAULT_USER_NAME = 'TidGi User';
/**
 * Github OAuth Apps TidGi-SignIn Setting in https://github.com/organizations/tiddly-gittly/settings/applications/1326590
 */
export const GITHUB_LOGIN_REDIRECT_PATH = 'http://127.0.0.1:3012/tidgi-auth/github';
export const GITHUB_OAUTH_APP_CLIENT_ID = '7b6e0fc33f4afd71a4bb';
export const GITHUB_OAUTH_APP_CLIENT_SECRET = 'e356c4499e1e38548a44da5301ef42c11ec14173';
const GITHUB_SCOPES = 'user:email,read:user,repo,workflow';
/**
 * Will redirect to `http://127.0.0.1:3012/tidgi-auth/github?code=65xxxxxxx` after login, which is 404, and handled by src/preload/common/authRedirect.ts
 */
export const GITHUB_OAUTH_PATH =
  `https://github.com/login/oauth/authorize?client_id=${GITHUB_OAUTH_APP_CLIENT_ID}&scope=${GITHUB_SCOPES}&redirect_uri=${GITHUB_LOGIN_REDIRECT_PATH}`;
