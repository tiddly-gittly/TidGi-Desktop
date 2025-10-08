import { vi } from 'vitest';

interface TranslationOptions {
  ns?: string;
  defaultValue?: string;
  [key: string]: unknown;
}

/**
 * Simple template string interpolation for testing
 * Replaces {{key}} with values from options object
 */
function interpolateTemplate(template: string, options?: TranslationOptions): string {
  if (!options) return template;

  let result = template;
  Object.entries(options).forEach(([key, value]) => {
    if (key !== 'ns' && key !== 'defaultValue') {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(placeholder, String(value));
    }
  });

  return result;
}

export const useTranslation = () => ({
  t: (key: string, options?: string | TranslationOptions) => {
    if (typeof options === 'string') return options;
    if (typeof options === 'object' && options?.defaultValue) return options.defaultValue;

    // Return the key with interpolated values for testing
    return interpolateTemplate(key, options as TranslationOptions);
  },
  i18n: {
    changeLanguage: vi.fn(),
  },
});
export const getI18n = () => ({
  t: (key: string, options?: string | TranslationOptions) => {
    if (typeof options === 'string') return options;
    if (typeof options === 'object' && options?.defaultValue) return options.defaultValue;

    // Return the key with interpolated values for testing
    return interpolateTemplate(key, options as TranslationOptions);
  },
  changeLanguage: vi.fn(),
});
export const Trans = ({ children }: { children: React.ReactNode }) => children;
