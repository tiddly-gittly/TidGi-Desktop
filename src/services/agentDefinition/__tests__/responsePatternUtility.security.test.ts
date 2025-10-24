import { describe, expect, it } from 'vitest';
import { matchToolCalling } from '../responsePatternUtility';

/**
 * Security tests for agent response parsing
 * These tests verify that malicious AI responses cannot execute arbitrary code
 */
describe('Agent Response Parsing Security', () => {
  describe('Dangerous pattern detection', () => {
    it('should reject parameters with require() calls', () => {
      const responseText = `
<tool_use name="malicious-tool">
{
  test: require('child_process').execSync('whoami')
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      // The dangerous code should not be executed, fallback to string
      expect(result.parameters).toEqual({
        input: expect.stringContaining('require'),
      });
    });

    it('should reject parameters with process.binding', () => {
      const responseText = `
<tool_use name="malicious-tool">
{
  exploit: process.binding('spawn_sync').spawn({file:'/usr/bin/whoami'})
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters).toEqual({
        input: expect.stringContaining('process.binding'),
      });
    });

    it('should reject parameters with eval()', () => {
      const responseText = `
<tool_use name="malicious-tool">
{
  code: eval('malicious code here')
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters).toEqual({
        input: expect.stringContaining('eval'),
      });
    });

    it('should reject parameters with Function constructor', () => {
      const responseText = `
<tool_use name="malicious-tool">
{
  fn: new Function('return process')()
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters).toEqual({
        input: expect.stringContaining('Function'),
      });
    });

    it('should reject parameters with constructor access', () => {
      const responseText = `
<tool_use name="malicious-tool">
{
  hack: ({}).__proto__.constructor('return process')()
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters).toEqual({
        input: expect.stringContaining('constructor'),
      });
    });

    it('should reject parameters with global object access', () => {
      const responseText = `
<tool_use name="malicious-tool">
{
  test: global.process.exit(1)
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters).toEqual({
        input: expect.stringContaining('global'),
      });
    });

    it('should reject parameters with __dirname or __filename', () => {
      const responseText = `
<tool_use name="malicious-tool">
{
  path: __dirname + '/sensitive-file.txt'
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters).toEqual({
        input: expect.stringContaining('__dirname'),
      });
    });
  });

  describe('Length limits', () => {
    it('should handle very long parameter strings safely', () => {
      const longString = 'a'.repeat(15000);
      const responseText = `
<tool_use name="test-tool">
{
  data: "${longString}"
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      // Should be parsed as JSON (safe path)
      if (result.parameters?.data) {
        expect(typeof result.parameters.data).toBe('string');
      }
    });

    it('should truncate fallback input to prevent DoS', () => {
      const longNonJson = 'not json '.repeat(200);
      const responseText = `
<tool_use name="test-tool">
${longNonJson}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      if (result.parameters?.input && typeof result.parameters.input === 'string') {
        expect(result.parameters.input.length).toBeLessThanOrEqual(1000);
      }
    });
  });

  describe('Safe parsing paths', () => {
    it('should safely parse valid JSON', () => {
      const responseText = `
<tool_use name="safe-tool">
{
  "name": "test",
  "value": 123,
  "nested": {"key": "value"}
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters).toEqual({
        name: 'test',
        value: 123,
        nested: { key: 'value' },
      });
    });

    it('should safely parse JavaScript object literals via regex conversion', () => {
      const responseText = `
<tool_use name="safe-tool">
{ key: "value", number: 42 }
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters?.key).toBe('value');
      expect(result.parameters?.number).toBe(42);
    });
  });

  describe('Prompt injection scenarios', () => {
    it('should handle AI trying to inject code via parameters', () => {
      const responseText = `
<tool_use name="wiki-search">
{
  "query": "normal query",
  "filter": "[tag[test]]"
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      // Should parse safely as JSON
      expect(result.parameters?.query).toBe('normal query');
      expect(result.parameters?.filter).toBe('[tag[test]]');
    });

    it('should handle nested malicious code in valid JSON', () => {
      const responseText = `
<tool_use name="test-tool">
{
  "normal": "value",
  "nested": {
    "attack": "'; require('fs').readFileSync('/etc/passwd'); '"
  }
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      // Should parse as JSON, making the attack string just data
      expect(result.parameters?.normal).toBe('value');
      expect(result.parameters?.nested).toEqual({
        attack: "'; require('fs').readFileSync('/etc/passwd'); '",
      });
    });
  });

  describe('Edge cases and robustness', () => {
    it('should handle empty parameters', () => {
      const responseText = `
<tool_use name="test-tool">
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters).toEqual({});
    });

    it('should handle whitespace-only parameters', () => {
      const responseText = `
<tool_use name="test-tool">
   
   
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters).toEqual({});
    });

    it('should handle special characters in string values safely', () => {
      const responseText = `
<tool_use name="test-tool">
{
  "text": "Contains 'quotes' and \\"escapes\\" and symbols @#$%"
}
</tool_use>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.parameters?.text).toContain('quotes');
      expect(result.parameters?.text).toContain('escapes');
    });
  });
});
