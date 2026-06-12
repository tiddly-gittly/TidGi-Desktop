import type { HunspellLanguages } from '@/constants/hunspellLanguages';
import { z } from 'zod';
import type { IPreferences } from '../interface';

/**
 * Zod schemas for IPreferences keys managed by custom item components
 * (not declared as preference-* items in section definitions).
 * Add entries here when a custom component reads/writes preference keys.
 */
export const customPreferenceFieldSchemas = {
  aiGenerateBackupTitleTimeout: z.number(),
  downloadPath: z.string(),
  externalAPIDebug: z.boolean(),
  keyboardShortcuts: z.record(z.string(), z.string()),
  language: z.string(),
  pauseNotifications: z.string().optional(),
  pauseNotificationsBySchedule: z.boolean(),
  pauseNotificationsByScheduleFrom: z.string(),
  pauseNotificationsByScheduleTo: z.string(),
  spellcheckLanguages: z.array(z.string() as z.ZodType<HunspellLanguages>),
  syncDebounceInterval: z.number(),
  tidgiMiniWindow: z.boolean(),
  tidgiMiniWindowAlwaysOnTop: z.boolean(),
  tidgiMiniWindowFixedWorkspaceId: z.string().optional(),
  tidgiMiniWindowShowSidebar: z.boolean(),
  tidgiMiniWindowShowTitleBar: z.boolean(),
  tidgiMiniWindowSyncWorkspaceWithMainWindow: z.boolean(),
} satisfies Partial<Record<keyof IPreferences, z.ZodType>>;
