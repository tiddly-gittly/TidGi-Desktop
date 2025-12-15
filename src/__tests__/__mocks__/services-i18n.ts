/**
 * Mock for @services/libs/i18n
 */
import { vi } from 'vitest';

export const i18n = {
  t: vi.fn((key: string) => {
    // Return the key itself as fallback
    return key;
  }),
  changeLanguage: vi.fn(),
  language: 'en',
};

export const placeholder = {
  t: (key: string) => key,
};
