/**
 * tidgi-shared — Shared service interfaces and IPC descriptors for TidGi plugins.
 *
 * This package re-exports all TidGi Desktop service interface types, IPC descriptors,
 * and shared constants so that external TiddlyWiki plugins and projects can reference
 * them without depending on the full TidGi-Desktop codebase.
 */

// ── Constants ──────────────────────────────────────────────────────────────────
export * from '@/constants/channels';
export * from '@/constants/pageTypes';
export * from '@/constants/wikiCreation';
export * from '@/constants/auth';

// ── Shared Service Types ───────────────────────────────────────────────────────
export * from '@services/types';
export { default as serviceIdentifier } from '@services/serviceIdentifier';

// ── Service Interfaces ─────────────────────────────────────────────────────────
// Each re-export includes the interface, IPC descriptor, and associated types.

export * from '@services/agentBrowser/interface';
export * from '@services/agentDefinition/interface';
export * from '@services/agentInstance/interface';
export * from '@services/auth/interface';
export * from '@services/context/interface';
export * from '@services/database/interface';
export * from '@services/deepLink/interface';
export * from '@services/externalAPI/interface';
export * from '@services/git/interface';
export * from '@services/gitServer/interface';
export * from '@services/menu/interface';
export * from '@services/native/interface';
export * from '@services/notifications/interface';
export * from '@services/preferences/interface';
export * from '@services/sync/interface';
export * from '@services/systemPreferences/interface';
export * from '@services/theme/interface';
export * from '@services/updater/interface';
export * from '@services/view/interface';
export * from '@services/wiki/interface';
export * from '@services/wikiEmbedding/interface';
export * from '@services/wikiGitWorkspace/interface';
export * from '@services/windows/interface';
export * from '@services/workspaces/interface';
export * from '@services/workspacesView/interface';

// ── Window Properties (widely referenced) ──────────────────────────────────────
export * from '@services/windows/WindowProperties';
