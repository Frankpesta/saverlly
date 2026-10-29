import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import zlib from 'node:zlib';

// Fetches a page from the public internet on an admin's behalf (a store's homepage), and nothing
// else: never a private, loopback, link-local or otherwise reserved address, however the URL or
// a redirect spells it. Addresses are checked inside the connection's own DNS lookup, so a
// hostname can't pass the check and then resolve somewhere internal for the real request.

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(network, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d, ::ffff:7f00:1) is refused outright rather than unwrapped.
  // Not as a BlockList subnet: BlockList matches plain IPv4 against that range too.
  if (family === 6 && /^::ffff:/i.test(address)) return false;
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export class PageFetchError extends Error {}

const NOT_PUBLIC = "That address isn't on the public internet";

/** dns.lookup that refuses to hand the connection any address `isAllowed` turns down. */
const checkedLookup = (
  isAllowed: (address: string) => boolean,
): typeof dnsLookup =>
  ((
    hostname: string,
    options: { all?: boolean },
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, '');
      if (!addresses.length || addresses.some((a) => !isAllowed(a.address)))
        return callback(new PageFetchError(NOT_PUBLIC), '');
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  }) as typeof dnsLookup;

export interface PublicPage {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Which resolved addresses and ports may be connected to. Only tests change these, to
   *  reach a local server; everything else gets the public internet on standard ports. */
  isAllowed?: (address: string) => boolean;
  isAllowedPort?: (port: string) => boolean;
}

const isStandardPort = (port: string) =>
  port === '' || port === '80' || port === '443';

// Many storefronts turn away clients that don't look like a browser.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function checkUrl(
  raw: string,
  isAllowed: (address: string) => boolean,
  isAllowedPort: (port: string) => boolean,
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PageFetchError('Not a valid web address');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new PageFetchError('Only web addresses can be fetched');
  if (url.username || url.password)
    throw new PageFetchError('Addresses with a login in them are not fetched');
  if (!isAllowedPort(url.port))
    throw new PageFetchError('Only the standard web ports are fetched');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isAllowed(host)) throw new PageFetchError(NOT_PUBLIC);
  return url;
}

function requestOnce(
  url: URL,
  timeoutMs: number,
  maxBytes: number,
  isAllowed: (address: string) => boolean,
): Promise<PublicPage & { location?: string }> {
  return new Promise<PublicPage & { location?: string }>((done, fail) => {
    // One deadline for the whole exchange; the socket's own timeout only catches silence.
    const deadline = setTimeout(
      () =>
        request.destroy(new PageFetchError('The site took too long to answer')),
      timeoutMs,
    );
    const resolve = (page: PublicPage & { location?: string }) => {
      clearTimeout(deadline);
      done(page);
    };
    const reject = (error: Error) => {
      clearTimeout(deadline);
      fail(error);
    };
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(
      url,
      {
        lookup: checkedLookup(isAllowed),
        timeout: timeoutMs,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.8',
        },
      },
      (response) => {
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(response.headers))
          if (value !== undefined)
            headers[name] = Array.isArray(value) ? value.join(', ') : value;
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && headers.location) {
          response.resume();
          return resolve({
            url: url.href,
            status,
            headers,
            body: '',
            location: headers.location,
          });
        }
        const encoding = (headers['content-encoding'] ?? '').toLowerCase();
        const stream =
          encoding === 'gzip' || encoding === 'x-gzip'
            ? response.pipe(zlib.createGunzip())
            : encoding === 'deflate'
              ? response.pipe(zlib.createInflate())
              : encoding === 'br'
                ? response.pipe(zlib.createBrotliDecompress())
                : response;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          // Enough to recognise a platform; the rest of a large page isn't needed.
          if (size > maxBytes) {
            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
            request.destroy();
            stream.destroy();
            resolve({
              url: url.href,
              status,
              headers,
              body: Buffer.concat(chunks).toString('utf8'),
            });
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () =>
          resolve({
            url: url.href,
            status,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        stream.on('error', (error) =>
          reject(new PageFetchError(error.message)),
        );
      },
    );
    request.on('timeout', () =>
      request.destroy(new PageFetchError('The site took too long to answer')),
    );
    request.on('error', (error) =>
      reject(
        error instanceof PageFetchError
          ? error
          : new PageFetchError(error.message),
      ),
    );
  });
}

/** GETs a public web page, following up to `maxRedirects` redirects, each one re-checked. */
export async function fetchPublicPage(
  raw: string,
  {
    timeoutMs = 8_000,
    maxBytes = 2_000_000,
    maxRedirects = 3,
    isAllowed = isPublicAddress,
    isAllowedPort = isStandardPort,
  }: FetchOptions = {},
): Promise<PublicPage> {
  let url = checkUrl(raw, isAllowed, isAllowedPort);
  for (let hop = 0; ; hop++) {
    const page = await requestOnce(url, timeoutMs, maxBytes, isAllowed);
    if (page.location === undefined) return page;
    if (hop >= maxRedirects)
      throw new PageFetchError('The site redirected too many times');
    url = checkUrl(new URL(page.location, url).href, isAllowed, isAllowedPort);
  }
}
