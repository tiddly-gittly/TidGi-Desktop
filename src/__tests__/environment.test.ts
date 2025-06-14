/**
 * Simple example tests to verify that the test configuration is working correctly
 */
import { describe, expect, test, vi } from 'vitest';

describe('Environment Verification', () => {
  test('Basic Vitest functionality works', () => {
    expect(1 + 1).toBe(2);
  });

  test('TypeScript support works', () => {
    const message: string = 'Hello, TidGi!';
    expect(message).toBe('Hello, TidGi!');
  });

  test('Vitest mock functionality works', () => {
    const mockFunction = vi.fn();
    mockFunction('test');
    expect(mockFunction).toHaveBeenCalledWith('test');
  });

  test('reflect-metadata decorator support', () => {
    // Verify that reflect-metadata is loaded
    expect(Reflect.getMetadata).toBeDefined();
  });

  test('Environment variables are set correctly', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
