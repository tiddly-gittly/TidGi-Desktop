import { describe, expect, it } from 'vitest';
import { isLoopbackOpenAIBaseURL, normalizeOpenAIBaseURL } from '../openAIBaseURL';

describe('OpenAI base URL handling', () => {
  it('normalizes only an empty path to /v1', () => {
    expect(normalizeOpenAIBaseURL('https://models.example.test')).toBe('https://models.example.test/v1');
    expect(normalizeOpenAIBaseURL('https://models.example.test/v1/')).toBe('https://models.example.test/v1');
    expect(normalizeOpenAIBaseURL('https://models.example.test/custom/')).toBe('https://models.example.test/custom');
  });

  it('recognizes actual loopback hosts without trusting hostname substrings', () => {
    expect(isLoopbackOpenAIBaseURL('http://localhost:11434/v1')).toBe(true);
    expect(isLoopbackOpenAIBaseURL('http://127.0.0.1:15121/v1')).toBe(true);
    expect(isLoopbackOpenAIBaseURL('http://127.42.0.1/v1')).toBe(true);
    expect(isLoopbackOpenAIBaseURL('http://[::1]:15121/v1')).toBe(true);
    expect(isLoopbackOpenAIBaseURL('https://localhost.attacker.example/v1')).toBe(false);
    expect(isLoopbackOpenAIBaseURL('not a URL')).toBe(false);
  });
});
