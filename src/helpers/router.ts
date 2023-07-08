/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { BaseLocationHook, navigate, useLocationProperty } from 'wouter/use-location';

const hashLocation = () => window.location.hash.replace(/^#/, '') || '/';

const hashNavigate = (path: string, ...arguments_: any[]) => navigate('#' + path, ...arguments_);

export const useHashLocation: BaseLocationHook = () => {
  const location = useLocationProperty(hashLocation);
  return [location, hashNavigate];
};
