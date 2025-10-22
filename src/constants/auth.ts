export const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';
export const TIDGI_AUTH_TOKEN_HEADER = 'x-tidgi-auth-token';
export const getTidGiAuthHeaderWithToken = (authToken: string) => `${TIDGI_AUTH_TOKEN_HEADER}-${authToken}`;
export const DEFAULT_USER_NAME = 'TidGi User';
