import { describe, expect, it } from 'vitest';
import { defaultPreferences } from '../../defaultPreferences';
import { type Condition, evaluateCondition, evaluateHidden } from '../conditions';

describe('preference conditions', () => {
  it('supports preference truthy/falsy checks in hidden arrays', () => {
    expect(evaluateHidden([
      { type: 'preference', key: 'mcpServerRequireToken', operator: 'falsy' },
    ], {
      preference: { ...defaultPreferences, mcpServerRequireToken: false },
    })).toBe(true);

    expect(evaluateHidden([
      { type: 'preference', key: 'mcpServerRequireToken', operator: 'falsy' },
    ], {
      preference: { ...defaultPreferences, mcpServerRequireToken: true },
    })).toBe(false);
  });

  it('supports recursive any/all/not composition for future conditions', () => {
    const condition: Condition = {
      type: 'all',
      conditions: [
        { type: 'preference', key: 'mcpServerEnabled', operator: 'truthy' },
        {
          type: 'any',
          conditions: [
            { type: 'preference', key: 'mcpServerRequireToken', operator: 'falsy' },
            {
              type: 'not',
              condition: { type: 'preference', key: 'mcpServerToken', operator: 'equals', value: '' },
            },
          ],
        },
      ],
    };

    expect(evaluateCondition(condition, {
      preference: {
        ...defaultPreferences,
        mcpServerEnabled: true,
        mcpServerRequireToken: true,
        mcpServerToken: 'token',
      },
    })).toBe(true);

    expect(evaluateCondition(condition, {
      preference: {
        ...defaultPreferences,
        mcpServerEnabled: true,
        mcpServerRequireToken: true,
        mcpServerToken: '',
      },
    })).toBe(false);
  });
});
