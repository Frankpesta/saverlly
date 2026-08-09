import { MockAffiliateAdapter } from './mock-affiliate.adapter';

describe('MockAffiliateAdapter', () => {
  const adapter = new MockAffiliateAdapter();

  describe('fetchConversions', () => {
    it('fabricates a pending conversion for every sub-ID given', async () => {
      const result = await adapter.fetchConversions('program-1', ['sub-a', 'sub-b']);

      expect(result).toHaveLength(2);
      expect(result.every((c) => c.status === 'pending')).toBe(true);
      expect(result.map((c) => c.subId)).toEqual(['sub-a', 'sub-b']);
      expect(new Set(result.map((c) => c.networkReference)).size).toBe(2);
    });

    it('returns an empty array for an empty batch', async () => {
      expect(await adapter.fetchConversions('program-1', [])).toEqual([]);
    });
  });

  describe('checkConversionStatuses', () => {
    it('is deterministic for the same networkReference across repeat calls', async () => {
      const first = await adapter.checkConversionStatuses('program-1', ['MOCKCONV-abc0']);
      const second = await adapter.checkConversionStatuses('program-1', ['MOCKCONV-abc0']);

      expect(first).toEqual(second);
    });

    it('only ever returns confirmed or reversed, never pending', async () => {
      const refs = Array.from({ length: 20 }, (_, i) => `MOCKCONV-${i.toString(16)}`);
      const result = await adapter.checkConversionStatuses('program-1', refs);

      expect(result.every((r) => r.status === 'confirmed' || r.status === 'reversed')).toBe(true);
    });
  });
});
