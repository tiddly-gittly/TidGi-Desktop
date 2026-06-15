import { describe, expect, it } from 'vitest';

import { E2EArgsValidationError, validateCucumberArguments } from '../../scripts/validate-cucumber-arguments';

describe('validateCucumberArguments', () => {
  it('allows empty args (full suite)', () => {
    expect(() => validateCucumberArguments([])).not.toThrow();
  });

  it('allows --tags=@smoke (combined form)', () => {
    expect(() => validateCucumberArguments(['--tags=@smoke'])).not.toThrow();
  });

  it('blocks split --tags and value', () => {
    expect(() => validateCucumberArguments(['--tags', '@smoke'])).toThrow(E2EArgsValidationError);
  });

  it('blocks bare positional tag values', () => {
    expect(() => validateCucumberArguments(['@html-wiki'])).toThrow(E2EArgsValidationError);
  });

  it('allows --name filter with spaced title', () => {
    expect(() => validateCucumberArguments(['--name', 'Wiki-search tool usage'])).not.toThrow();
  });

  it('allows --name= combined form', () => {
    expect(() => validateCucumberArguments(['--name=Wiki-search tool usage'])).not.toThrow();
  });

  it('blocks literal -- in forwarded args', () => {
    expect(() => validateCucumberArguments(['--', '--tags=@smoke'])).toThrow(E2EArgsValidationError);
  });

  it('blocks combining --tags and --name', () => {
    expect(() => validateCucumberArguments(['--tags=@html-wiki', '--name', 'HTML workspace git log only shows the managed html file']))
      .toThrow(E2EArgsValidationError);
  });

  it('blocks --tags without @ prefix', () => {
    expect(() => validateCucumberArguments(['--tags=smoke'])).toThrow(E2EArgsValidationError);
  });

  it('blocks unknown options', () => {
    expect(() => validateCucumberArguments(['--foo=bar'])).toThrow(E2EArgsValidationError);
  });

  it('blocks --name without a value', () => {
    expect(() => validateCucumberArguments(['--name'])).toThrow(E2EArgsValidationError);
  });
});
