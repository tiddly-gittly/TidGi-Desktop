import { lazy } from 'react';

/** Async import can't mock in unit test, so re-export here and mock this file. */
export const subPages = {
  Help: lazy(async () => await import('@/pages/Help')),
  Guide: lazy(async () => await import('@/pages/Guide')),
  Agent: lazy(async () => await import('@/pages/Agent')),
  AddWorkspace: lazy(async () => await import('@/windows/AddWorkspace')),
};
