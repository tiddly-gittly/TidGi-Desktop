import { Skeleton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';

import type { PlatformCondition } from '@services/preferences/definitions/types';

export function matchesPlatform(condition: PlatformCondition | undefined, platform: string | undefined): boolean {
  if (condition === undefined || platform === undefined) return true;
  if (condition === 'darwin') return platform === 'darwin';
  if (condition === '!darwin') return platform !== 'darwin';
  if (condition === 'win32') return platform === 'win32';
  return true;
}

export function toKebabCase(value: string): string {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export const SearchSectionLabel = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 4px;
`;

export function DeferredSectionSkeleton({ sectionRef }: { sectionRef?: React.RefObject<HTMLSpanElement | null> }): React.JSX.Element {
  return (
    <>
      <span ref={sectionRef} style={{ display: 'block', height: 0, overflow: 'hidden' }} />
      <Skeleton variant='text' width={160} height={20} sx={{ mb: 1, mt: 2 }} />
      <Skeleton variant='rounded' height={56} sx={{ mb: 0.5 }} />
      <Skeleton variant='rounded' height={56} sx={{ mb: 0.5 }} />
      <Skeleton variant='rounded' height={56} sx={{ mb: 2 }} />
    </>
  );
}

export const INITIAL_GENERIC_SECTION_COUNT = 3;
export const IS_TEST_ENV = process.env.NODE_ENV === 'test';
