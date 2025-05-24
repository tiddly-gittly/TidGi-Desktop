// Dialog tab types
export const DialogTabTypes = {
  // Preview mode tabs (right side)
  FLAT: 'flat',
  TREE: 'tree',

  // Edit mode tabs (left side) - separate from preview
  FORM: 'form',
  CODE: 'code', // Monaco editor mode
} as const;

// Type definition for TypeScript type checking
export type DialogTabType = typeof DialogTabTypes[keyof typeof DialogTabTypes];

// Default tabs
export const DEFAULT_PREVIEW_TAB = DialogTabTypes.FLAT;
export const DEFAULT_EDIT_TAB = DialogTabTypes.FORM;

// Preview mode tabs (right side only)
export const PREVIEW_TABS = [DialogTabTypes.FLAT, DialogTabTypes.TREE];

// Edit mode tabs (left side only)
export const EDIT_TABS = [DialogTabTypes.FORM, DialogTabTypes.CODE];
