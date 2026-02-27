import { en } from './messages/en';
import { ko } from './messages/ko';
import type { ClxUIMessageCatalog } from './messages/en';

export type { ClxUIMessageCatalog, ClxUIMessageKey } from './messages/en';

export const CLX_UI_MESSAGES: Record<string, ClxUIMessageCatalog> & {
  en: ClxUIMessageCatalog;
} = {
  en,
  ko,
};

export const DEFAULT_CLX_UI_LOCALE = 'en' as const;
