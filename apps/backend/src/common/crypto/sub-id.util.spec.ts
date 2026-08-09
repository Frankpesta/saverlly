import { generateSubId } from './sub-id.util';

describe('generateSubId', () => {
  it('produces a hex string with no embedded structure to decode', () => {
    const subId = generateSubId();
    expect(subId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is different on every call', () => {
    expect(generateSubId()).not.toBe(generateSubId());
  });
});
