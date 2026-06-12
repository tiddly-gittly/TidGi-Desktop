import { z } from 'zod';
import type { IPreferences } from '../interface';

export const preferenceConditionOperatorSchema = z.enum([
  'truthy',
  'falsy',
  'equals',
  'notEquals',
  'in',
  'notIn',
]);
export type PreferenceConditionOperator = z.infer<typeof preferenceConditionOperatorSchema>;

export interface IPreferenceCondition {
  type: 'preference';
  key: keyof IPreferences;
  operator?: PreferenceConditionOperator;
  value?: unknown;
}

export interface IAllCondition {
  type: 'all';
  conditions: Condition[];
}

export interface IAnyCondition {
  type: 'any';
  conditions: Condition[];
}

export interface INotCondition {
  type: 'not';
  condition: Condition;
}

export type Condition = IPreferenceCondition | IAllCondition | IAnyCondition | INotCondition;
export type HiddenCondition = boolean | Condition[];

export interface IConditionContext {
  preference?: IPreferences;
  platform?: string;
}

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('preference'),
      key: z.string() as z.ZodType<keyof IPreferences>,
      operator: preferenceConditionOperatorSchema.optional(),
      value: z.unknown().optional(),
    }),
    z.object({
      type: z.literal('all'),
      conditions: z.array(conditionSchema).min(1),
    }),
    z.object({
      type: z.literal('any'),
      conditions: z.array(conditionSchema).min(1),
    }),
    z.object({
      type: z.literal('not'),
      condition: conditionSchema,
    }),
  ])
);

export const hiddenConditionSchema: z.ZodType<HiddenCondition> = z.union([
  z.boolean(),
  z.array(conditionSchema),
]);

function evaluatePreferenceCondition(condition: IPreferenceCondition, context: IConditionContext): boolean {
  const actualValue = context.preference?.[condition.key];
  const operator = condition.operator ?? 'truthy';

  switch (operator) {
    case 'truthy':
      return Boolean(actualValue);
    case 'falsy':
      return !actualValue;
    case 'equals':
      return Object.is(actualValue, condition.value);
    case 'notEquals':
      return !Object.is(actualValue, condition.value);
    case 'in':
      return Array.isArray(condition.value) && condition.value.some(candidate => Object.is(candidate, actualValue));
    case 'notIn':
      return Array.isArray(condition.value) && !condition.value.some(candidate => Object.is(candidate, actualValue));
    default:
      return false;
  }
}

export function evaluateCondition(condition: Condition, context: IConditionContext): boolean {
  switch (condition.type) {
    case 'preference':
      return evaluatePreferenceCondition(condition, context);
    case 'all':
      return condition.conditions.every(entry => evaluateCondition(entry, context));
    case 'any':
      return condition.conditions.some(entry => evaluateCondition(entry, context));
    case 'not':
      return !evaluateCondition(condition.condition, context);
    default:
      return false;
  }
}

export function evaluateHidden(hidden: HiddenCondition | undefined, context: IConditionContext): boolean {
  if (hidden === undefined) return false;
  if (typeof hidden === 'boolean') return hidden;
  return hidden.every(condition => evaluateCondition(condition, context));
}
