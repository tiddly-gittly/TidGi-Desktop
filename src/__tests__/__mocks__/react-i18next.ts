import { vi } from 'vitest';

interface TranslationOptions {
  ns?: string;
  defaultValue?: string;
}

export const useTranslation = () => ({
  t: (key: string, options?: string | TranslationOptions) => {
    if (typeof options === 'string') return options;
    if (typeof options === 'object' && options?.defaultValue) return options.defaultValue;
    return key;
  },
  i18n: {
    changeLanguage: vi.fn(),
  },
});
export const getI18n = () => ({
  t: (key: string, options?: string | TranslationOptions) => {
    if (typeof options === 'string') return options;
    if (typeof options === 'object' && options?.defaultValue) return options.defaultValue;
    return key;
  },
  changeLanguage: vi.fn(),
});
export const Trans = ({ children }: { children: React.ReactNode }) => children;
