import { Dispatch, useEffect } from 'react';
import { GraphQLClient } from 'graphql-hooks';
import { usePromiseValueAndSetter } from '@/helpers/useServiceValue';

export function useConfigGithubGraphQLClient(accessToken: string | undefined, graphqlClient: GraphQLClient): void {
  useEffect(() => {
    if (accessToken !== undefined) {
      graphqlClient.setHeader('Authorization', `bearer ${accessToken}`);
    } else if (accessToken === undefined) {
      // if user or login button changed the token, we use latest token
      Object.keys(graphqlClient.headers).map((key) => graphqlClient.removeHeader(key));
    }
  }, [accessToken, graphqlClient]);
}

export const getGithubToken = async (): Promise<string | undefined> => await window.service.auth.get('github-token');
export const setGithubToken = async (token: string | undefined): Promise<void> => await window.service.auth.set('github-token', token);

export function useGithubTokenSetter(): [string | undefined, Dispatch<string | undefined>] {
  return usePromiseValueAndSetter(getGithubToken, setGithubToken);
}
