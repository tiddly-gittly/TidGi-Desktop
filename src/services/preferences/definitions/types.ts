import type { OverridableComponent } from '@mui/material/OverridableComponent';
import type { SvgIconTypeMap } from '@mui/material/SvgIcon';
import { z } from 'zod';
import type { IPreferences } from '../interface';

// ─── Platform condition ──────────────────────────────────────────────

export const platformConditionSchema = z.enum(['darwin', '!darwin', 'win32']);
export type PlatformCondition = z.infer<typeof platformConditionSchema>;

// ─── Item schemas (Zod = single source of truth) ─────────────────────

const definitionBaseSchema = z.object({
  titleKey: z.string(),
  descriptionKey: z.string().optional(),
  ns: z.string().optional(),
  platform: platformConditionSchema.optional(),
});

export const booleanPreferenceItemSchema = definitionBaseSchema.extend({
  type: z.literal('preference-boolean'),
  key: z.string() as z.ZodType<keyof IPreferences>,
  needsRestart: z.boolean().optional(),
  sideEffectId: z.string().optional(),
  zod: z.custom<z.ZodBoolean>(),
});
export type IBooleanPreferenceItem = z.infer<typeof booleanPreferenceItemSchema>;

export const enumPreferenceItemSchema = definitionBaseSchema.extend({
  type: z.literal('preference-enum'),
  key: z.string() as z.ZodType<keyof IPreferences>,
  enumValues: z.array(z.string()),
  enumNames: z.array(z.string()),
  needsRestart: z.boolean().optional(),
  sideEffectId: z.string().optional(),
  zod: z.custom<z.ZodType>(),
});
export type IEnumPreferenceItem = z.infer<typeof enumPreferenceItemSchema>;

export const numberPreferenceItemSchema = definitionBaseSchema.extend({
  type: z.literal('preference-number'),
  key: z.string() as z.ZodType<keyof IPreferences>,
  needsRestart: z.boolean().optional(),
  sideEffectId: z.string().optional(),
  zod: z.custom<z.ZodNumber>(),
});
export type INumberPreferenceItem = z.infer<typeof numberPreferenceItemSchema>;

export const stringPreferenceItemSchema = definitionBaseSchema.extend({
  type: z.literal('preference-string'),
  key: z.string() as z.ZodType<keyof IPreferences>,
  multiline: z.boolean().optional(),
  needsRestart: z.boolean().optional(),
  sideEffectId: z.string().optional(),
  zod: z.custom<z.ZodString | z.ZodOptional<z.ZodString>>(),
});
export type IStringPreferenceItem = z.infer<typeof stringPreferenceItemSchema>;

export const stringArrayPreferenceItemSchema = definitionBaseSchema.extend({
  type: z.literal('preference-string-array'),
  key: z.string() as z.ZodType<keyof IPreferences>,
  needsRestart: z.boolean().optional(),
  sideEffectId: z.string().optional(),
  zod: z.custom<z.ZodType>(),
});
export type IStringArrayPreferenceItem = z.infer<typeof stringArrayPreferenceItemSchema>;

export const actionItemSchema = definitionBaseSchema.extend({
  type: z.literal('action'),
  handler: z.string(),
  args: z.array(z.string()).optional(),
});
export type IActionItem = z.infer<typeof actionItemSchema>;

export const customItemSchema = definitionBaseSchema.extend({
  type: z.literal('custom'),
  componentId: z.string(),
});
export type ICustomItem = z.infer<typeof customItemSchema>;

export const dividerItemSchema = z.object({ type: z.literal('divider') });
export type IDividerItem = z.infer<typeof dividerItemSchema>;

// ─── Union schema ────────────────────────────────────────────────────

export const preferenceItemDefinitionSchema = z.discriminatedUnion('type', [
  booleanPreferenceItemSchema,
  enumPreferenceItemSchema,
  numberPreferenceItemSchema,
  stringPreferenceItemSchema,
  stringArrayPreferenceItemSchema,
  actionItemSchema,
  customItemSchema,
  dividerItemSchema,
]);
export type PreferenceItemDefinition = z.infer<typeof preferenceItemDefinitionSchema>;

// ─── Section schema (serializable data, exportable as JSON Schema) ───

export const sectionDefinitionDataSchema = z.object({
  id: z.string(),
  titleKey: z.string(),
  ns: z.string().optional(),
  hidden: z.boolean().optional(),
  items: z.array(preferenceItemDefinitionSchema),
});
export type ISectionDefinitionData = z.infer<typeof sectionDefinitionDataSchema>;

// ─── Full section definition (data + non-serializable UI fields) ─────

export interface ISectionDefinition extends ISectionDefinitionData {
  Icon: OverridableComponent<SvgIconTypeMap>;
  CustomSectionComponent?: React.ComponentType<ICustomSectionProps>;
}

// ─── Generic section definition for non-preference settings (e.g. workspace) ─

/**
 * A section definition whose items use plain string keys instead of IPreferences keys.
 * Structurally identical to ISectionDefinition at runtime — only the TS key constraint differs.
 * This lets workspace (and future) settings reuse the same renderer and sidebar.
 */
export interface IGenericSectionDefinition {
  id: string;
  titleKey: string;
  ns?: string;
  hidden?: boolean;
  Icon: OverridableComponent<SvgIconTypeMap>;
  CustomSectionComponent?: React.ComponentType<ICustomSectionProps>;
  /** Same union types as PreferenceItemDefinition, but key fields are unconstrained strings */
  items: Array<GenericSettingItemDefinition>;
}

/** Item types that use a generic string key instead of keyof IPreferences */
export interface IGenericBooleanItem {
  type: 'preference-boolean';
  key: string;
  titleKey: string;
  descriptionKey?: string;
  ns?: string;
  platform?: PlatformCondition;
  needsRestart?: boolean;
  sideEffectId?: string;
}
export interface IGenericEnumItem {
  type: 'preference-enum';
  key: string;
  titleKey: string;
  descriptionKey?: string;
  ns?: string;
  platform?: PlatformCondition;
  enumValues: string[];
  enumNames: string[];
  needsRestart?: boolean;
  sideEffectId?: string;
}
export interface IGenericNumberItem {
  type: 'preference-number';
  key: string;
  titleKey: string;
  descriptionKey?: string;
  ns?: string;
  platform?: PlatformCondition;
  needsRestart?: boolean;
  sideEffectId?: string;
}
export interface IGenericStringItem {
  type: 'preference-string';
  key: string;
  titleKey: string;
  descriptionKey?: string;
  ns?: string;
  platform?: PlatformCondition;
  multiline?: boolean;
  needsRestart?: boolean;
  sideEffectId?: string;
}
export type GenericSettingItemDefinition =
  | IGenericBooleanItem
  | IGenericEnumItem
  | IGenericNumberItem
  | IGenericStringItem
  | IActionItem
  | ICustomItem
  | IDividerItem;

// ─── Props ───────────────────────────────────────────────────────────

export interface ICustomItemProps {
  onNeedsRestart: () => void;
}

export interface ICustomSectionProps {
  onNeedsRestart: () => void;
  sectionRef: React.RefObject<HTMLSpanElement | null>;
}
