import { formatDate } from './payout-processed';

describe('formatDate', () => {
  it('formats in UTC regardless of the host timezone, even right at a UTC midnight boundary', () => {
    // 11:45pm UTC. In a positive-offset host timezone (e.g. UTC+1 or later), naive local-
    // timezone formatting would roll this forward to Mar 15. It must stay Mar 14.
    expect(formatDate('2026-03-14T23:45:00.000Z')).toBe('Mar 14, 2026');
    // 00:15am UTC. In a negative-offset host timezone (e.g. US Pacific), naive
    // local-timezone formatting would roll this back to Mar 13. It must stay Mar 14.
    expect(formatDate('2026-03-14T00:15:00.000Z')).toBe('Mar 14, 2026');
  });
});
