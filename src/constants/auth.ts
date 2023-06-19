export const APP_ID = '5efdd30e56a87fb76b52809d';
export const APP_DOMAIN = 'https://tiddlygit-desktop.authing.cn';
export const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';
export const TIDGI_AUTH_TOKEN_HEADER = 'x-tidgi-auth-token';
export const getTidGiAuthHeaderWithToken = (authToken: string) => `${TIDGI_AUTH_TOKEN_HEADER}-${authToken}`;
export const DEFAULT_USER_NAME = 'TidGi User';
