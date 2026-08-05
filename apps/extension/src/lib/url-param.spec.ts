import { appendUrlParam, urlHasParam } from './url-param';

describe('urlHasParam', () => {
  it('returns true when the param is present', () => {
    expect(urlHasParam('https://shop.example.com/cart?irclickid=abc', 'irclickid')).toBe(true);
  });

  it('returns false when the param is absent', () => {
    expect(urlHasParam('https://shop.example.com/cart', 'irclickid')).toBe(false);
  });

  it('returns false for an invalid URL rather than throwing', () => {
    expect(urlHasParam('not-a-url', 'irclickid')).toBe(false);
  });
});

describe('appendUrlParam', () => {
  it('appends a new param to a URL with no query string', () => {
    expect(appendUrlParam('https://shop.example.com/cart', 'aff', 'saverlly-123')).toBe(
      'https://shop.example.com/cart?aff=saverlly-123',
    );
  });

  it('appends alongside existing unrelated params', () => {
    expect(appendUrlParam('https://shop.example.com/cart?ref=email', 'aff', 'saverlly-123')).toBe(
      'https://shop.example.com/cart?ref=email&aff=saverlly-123',
    );
  });

  it('overwrites an existing value for the same key rather than duplicating it', () => {
    const result = appendUrlParam('https://shop.example.com/cart?aff=stale', 'aff', 'fresh');
    expect(result).toBe('https://shop.example.com/cart?aff=fresh');
  });
});
