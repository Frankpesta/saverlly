import { decodeNativeMessage, encodeNativeMessage } from './native-messaging-protocol';

describe('native messaging protocol framing', () => {
  it('round-trips a simple object', () => {
    const encoded = encodeNativeMessage({ type: 'device-token', token: 'abc123' });
    const decoded = decodeNativeMessage(encoded);
    expect(decoded).toEqual({ message: { type: 'device-token', token: 'abc123' }, bytesConsumed: encoded.length });
  });

  it('prefixes with exactly a 4-byte little-endian length', () => {
    const encoded = encodeNativeMessage({ a: 1 });
    const json = JSON.stringify({ a: 1 });
    expect(encoded.readUInt32LE(0)).toBe(Buffer.byteLength(json, 'utf8'));
    expect(encoded.subarray(4).toString('utf8')).toBe(json);
  });

  it('returns null when fewer than 4 header bytes are buffered', () => {
    expect(decodeNativeMessage(Buffer.from([1, 2]))).toBeNull();
  });

  it('returns null when the body is not fully buffered yet (partial read)', () => {
    const full = encodeNativeMessage({ hello: 'world' });
    const partial = full.subarray(0, full.length - 2);
    expect(decodeNativeMessage(partial)).toBeNull();
  });

  it('reports bytesConsumed so a caller can slice off a second buffered message', () => {
    const first = encodeNativeMessage({ n: 1 });
    const second = encodeNativeMessage({ n: 2 });
    const combined = Buffer.concat([first, second]);

    const firstDecoded = decodeNativeMessage(combined);
    expect(firstDecoded?.message).toEqual({ n: 1 });
    expect(firstDecoded?.bytesConsumed).toBe(first.length);

    const secondDecoded = decodeNativeMessage(combined.subarray(firstDecoded!.bytesConsumed));
    expect(secondDecoded?.message).toEqual({ n: 2 });
  });

  it('round-trips unicode payloads correctly (multi-byte UTF-8 length must match)', () => {
    const encoded = encodeNativeMessage({ label: 'kiosk-🔑-emoji' });
    expect(decodeNativeMessage(encoded)?.message).toEqual({ label: 'kiosk-🔑-emoji' });
  });
});
