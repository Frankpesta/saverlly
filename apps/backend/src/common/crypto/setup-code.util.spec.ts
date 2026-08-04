import { generateSetupCode } from './setup-code.util';

describe('generateSetupCode', () => {
  it('generates an 8-character code', () => {
    expect(generateSetupCode()).toHaveLength(8);
  });

  it('only uses unambiguous characters (no 0/O/1/I/L)', () => {
    const code = generateSetupCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  });

  it('generates different codes across calls (not a fixed value)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateSetupCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
