import { ConfigService } from '@nestjs/config';
import { AffiliateAdapterRegistryService } from './affiliate-adapter-registry.service';
import { MockAffiliateAdapter } from './mock-affiliate.adapter';

it.each(['production', 'development', 'test'])(
  'never silently substitutes mocks for a real network in %s',
  (environment) => {
    const config = {
      get: (key: string) => (key === 'NODE_ENV' ? environment : 'true'),
    } as ConfigService;
    const registry = new AffiliateAdapterRegistryService(
      new MockAffiliateAdapter(),
      config,
    );
    expect(registry.getAdapter('Impact')).toBeNull();
    expect(() => registry.requireAdapter('Impact')).toThrow('Network approval');
    expect(!!registry.getAdapter('Mock')).toBe(environment !== 'production');
  },
);
