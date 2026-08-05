import { detectStepDown } from './step-down-check';

describe('detectStepDown', () => {
  it('detects a known competing affiliate cookie', () => {
    const cookies = [{ name: 'irclickid' }];
    expect(detectStepDown(cookies, 'https://shop.example.com/checkout')).toBe(true);
  });

  it('is case-insensitive on cookie names', () => {
    const cookies = [{ name: 'CJEVENT' }];
    expect(detectStepDown(cookies, 'https://shop.example.com/checkout')).toBe(true);
  });

  it('returns false when no competing signal is present', () => {
    const cookies = [{ name: 'session_id' }, { name: 'cart_token' }];
    expect(detectStepDown(cookies, 'https://shop.example.com/checkout')).toBe(false);
  });

  it('detects a known competing affiliate URL param', () => {
    const cookies: { name: string }[] = [];
    expect(detectStepDown(cookies, 'https://shop.example.com/checkout?sscid=abc123')).toBe(true);
  });

  it('does not treat our own tracking param as a competing signal', () => {
    const cookies: { name: string }[] = [];
    // sscid is in the known list — simulate it being *our own* param for this merchant.
    expect(detectStepDown(cookies, 'https://shop.example.com/checkout?sscid=ours', 'sscid')).toBe(false);
  });

  it('returns false for a malformed URL rather than throwing', () => {
    expect(detectStepDown([], 'not-a-url')).toBe(false);
  });
});
