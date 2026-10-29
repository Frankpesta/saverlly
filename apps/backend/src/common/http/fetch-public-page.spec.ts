import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import {
  fetchPublicPage,
  isPublicAddress,
  PageFetchError,
} from './fetch-public-page';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'not-an-ip',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700::6810:84e5'])(
    'allows %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe('fetchPublicPage', () => {
  it.each([
    'http://127.0.0.1/',
    'http://localhost/',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://0x7f000001/',
    'http://example.com:8080/',
    'file:///etc/passwd',
    'http://user:pass@example.com/',
    'not a url',
  ])('never fetches %s', async (url) => {
    await expect(fetchPublicPage(url)).rejects.toBeInstanceOf(PageFetchError);
  });

  describe('against a local test server', () => {
    let server: http.Server;
    let origin: string;
    let handler: http.RequestListener;
    // Only tests may reach loopback on a high port; the real policy refuses both (see above).
    const local = {
      isAllowed: (address: string) => address === '127.0.0.1',
      isAllowedPort: () => true,
    };

    beforeAll(async () => {
      server = http.createServer((req, res) => handler(req, res));
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );

    const get = (path: string, options = {}) =>
      fetchPublicPage(`${origin}${path}`, { ...local, ...options });

    it('reads a gzipped page and its headers', async () => {
      handler = (_req, res) => {
        res.writeHead(200, {
          'Content-Encoding': 'gzip',
          'X-ShopId': '42',
        });
        res.end(zlib.gzipSync('<html>cdn.shopify.com</html>'));
      };
      const page = await get('/');
      expect(page.body).toBe('<html>cdn.shopify.com</html>');
      expect(page.headers['x-shopid']).toBe('42');
    });

    it('follows redirects, up to a limit', async () => {
      handler = (req, res) => {
        const hop = Number(req.url!.slice(1)) || 0;
        res.writeHead(302, { Location: `/${hop + 1}` });
        res.end();
      };
      await expect(get('/0', { maxRedirects: 3 })).rejects.toThrow(
        'redirected too many times',
      );
    });

    it('re-checks where a redirect leads', async () => {
      handler = (_req, res) => {
        res.writeHead(302, { Location: 'http://10.0.0.1/' });
        res.end();
      };
      await expect(get('/')).rejects.toThrow("isn't on the public internet");
    });

    it('stops reading a huge page at the size cap', async () => {
      handler = (_req, res) => {
        res.writeHead(200);
        res.end('x'.repeat(50_000));
      };
      expect((await get('/', { maxBytes: 1_000 })).body).toHaveLength(1_000);
    });

    it('gives up on a site that trickles its answer', async () => {
      handler = (_req, res) => {
        res.writeHead(200);
        const timer = setInterval(() => res.write('x'), 50);
        res.on('close', () => clearInterval(timer));
      };
      await expect(get('/', { timeoutMs: 300 })).rejects.toThrow(
        'took too long',
      );
    });
  });
});
