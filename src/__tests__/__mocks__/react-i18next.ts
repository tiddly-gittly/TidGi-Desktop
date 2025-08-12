import { vi } from 'vitest';

export const useTranslation = () => ({
  t: (key: string, defaultValue?: string) => defaultValue || key,
  i18n: {
    changeLanguage: vi.fn(),
  },
});
export const getI18n = () => ({
  t: (key: string, defaultValue?: string) => defaultValue || key,
  changeLanguage: vi.fn(),
});
export const Trans = ({ children }: { children: any }) => children;
