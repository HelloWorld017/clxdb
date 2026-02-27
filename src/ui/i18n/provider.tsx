import { createContext, useContext, useMemo } from 'react';
import { CLX_UI_MESSAGES, DEFAULT_CLX_UI_LOCALE } from './messages';
import type { ClxUIMessageCatalog, ClxUIMessageKey } from './messages';
import type { PropsWithChildren } from 'react';

type TranslationPrimitive = string | number | boolean | null | undefined | TranslationPrimitive[];

export type TranslationValues = Record<string, TranslationPrimitive>;
export type ClxUITranslate = (key: ClxUIMessageKey, values?: TranslationValues) => string;

export interface I18nProviderProps extends PropsWithChildren {
  locale?: string;
}

export interface I18nContextValue {
  locale: string;
  t: ClxUITranslate;
}

const normalizeLocale = (locale: string): string => locale.trim().toLowerCase().replace(/_/g, '-');

const resolveSupportedLocale = (locale?: string): string | null => {
  if (!locale) {
    return null;
  }

  const normalized = normalizeLocale(locale);
  if (CLX_UI_MESSAGES[normalized]) {
    return normalized;
  }

  const [language] = normalized.split('-');
  if (language && CLX_UI_MESSAGES[language]) {
    return language;
  }

  return null;
};

const resolveLocale = (locale?: string): string => {
  const preferredLocale = resolveSupportedLocale(locale);
  if (preferredLocale) {
    return preferredLocale;
  }

  for (const browserLocale of navigator.languages) {
    const resolvedLocale = resolveSupportedLocale(browserLocale);
    if (resolvedLocale) {
      return resolvedLocale;
    }
  }

  return DEFAULT_CLX_UI_LOCALE;
};

const interpolate = (template: string, values?: TranslationValues): string => {
  if (!values) {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === null || value === undefined) {
      return `{${key}}`;
    }

    return String(value);
  });
};

const createTranslate =
  (catalog: ClxUIMessageCatalog): ClxUITranslate =>
  (key, values) =>
    interpolate(catalog[key] ?? key, values);

const DEFAULT_CONTEXT_VALUE: I18nContextValue = {
  locale: DEFAULT_CLX_UI_LOCALE,
  t: createTranslate(CLX_UI_MESSAGES[DEFAULT_CLX_UI_LOCALE]),
};

const I18nContext = createContext<I18nContextValue>(DEFAULT_CONTEXT_VALUE);

export const I18nProvider = ({ children, locale }: I18nProviderProps) => {
  const resolvedLocale = useMemo(() => resolveLocale(locale), [locale]);
  const catalog = useMemo(
    () => CLX_UI_MESSAGES[resolvedLocale] ?? CLX_UI_MESSAGES[DEFAULT_CLX_UI_LOCALE],
    [resolvedLocale]
  );
  const t = useMemo(() => createTranslate(catalog), [catalog]);

  const contextValue = useMemo(() => ({ locale: resolvedLocale, t }), [resolvedLocale, t]);

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);

type TranslateComponentProps = {
  children: readonly [ClxUIMessageKey];
} & TranslationValues;

export function _t({ children, ...values }: TranslateComponentProps) {
  const { t } = useI18n();
  const [key] = children;
  return t(key, values);
}
