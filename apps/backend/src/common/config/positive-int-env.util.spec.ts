import { parsePositiveIntEnv } from './positive-int-env.util';

describe('parsePositiveIntEnv', () => {
  it('parses a valid positive numeric string', () => {
    expect(parsePositiveIntEnv('90', 30)).toBe(90);
  });

  it('falls back when the value is missing', () => {
    expect(parsePositiveIntEnv(undefined, 30)).toBe(30);
  });

  it('falls back when the value is non-numeric', () => {
    expect(parsePositiveIntEnv('abc', 30)).toBe(30);
  });

  it('falls back when the value is zero', () => {
    expect(parsePositiveIntEnv('0', 30)).toBe(30);
  });

  it('falls back when the value is negative', () => {
    expect(parsePositiveIntEnv('-5', 30)).toBe(30);
  });

  it('falls back when the value is non-finite', () => {
    expect(parsePositiveIntEnv('Infinity', 30)).toBe(30);
  });
});
