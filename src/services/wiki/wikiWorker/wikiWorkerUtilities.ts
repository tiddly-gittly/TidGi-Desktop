export function authTokenIsProvided(providedToken: string | undefined): providedToken is string {
  return typeof providedToken === 'string' && providedToken.length > 0;
}
