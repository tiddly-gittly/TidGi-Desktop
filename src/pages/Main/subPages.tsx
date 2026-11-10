import { lazy } from 'react';

import Agent from '@/pages/Agent';

/** Async import can't mock in unit test, so re-export here and mock this file. */
export const subPages = {
  Help: lazy(async () => await import('@/pages/Help')),
  Guide: lazy(async () => await import('@/pages/Guide')),
  // Agent is a primary workspace. Keep it in the initial renderer bundle so
  // navigating to it cannot leave the content area waiting on a cold chunk.
  Agent,
};
