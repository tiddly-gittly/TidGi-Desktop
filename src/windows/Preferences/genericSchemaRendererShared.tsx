import { Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { kebabCase } from 'lodash';

import type { PlatformCondition } from '@services/preferences/definitions/types';

export function matchesPlatform(condition: PlatformCondition | undefined, platform: string | undefined): boolean {
  if (condition === undefined || platform === undefined) return true;
  if (condition === 'darwin') return platform === 'darwin';
  if (condition === '!darwin') return platform !== 'darwin';
  if (condition === 'win32') return platform === 'win32';
  return true;
}

export function toKebabCase(value: string): string {
  return kebabCase(value);
}

export const SearchSectionLabel = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 4px;
`;
