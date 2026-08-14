import { generatePassword } from './password-generator.util';

describe('generatePassword', () => {
  it('produces a 16-character password from the unambiguous charset', () => {
    const password = generatePassword();
    expect(password).toHaveLength(16);
    expect(password).toMatch(/^[A-HJKMNP-Za-hjkmnp-z2-9!@#$%^&*]{16}$/);
  });

  it('never collides across 100 calls', () => {
    const passwords = new Set(
      Array.from({ length: 100 }, () => generatePassword()),
    );
    expect(passwords.size).toBe(100);
  });
});
