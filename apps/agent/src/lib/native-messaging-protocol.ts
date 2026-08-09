// Chrome's Native Messaging stdio protocol: each message is a 4-byte little-endian length
// prefix followed by that many bytes of UTF-8 JSON. This only needs implementing on the
// native-host (agent) side — the extension side is already handled internally by Chrome's
// own chrome.runtime.connectNative()/port API, which never exposes this framing to JS.
const LENGTH_PREFIX_BYTES = 4;

export function encodeNativeMessage(payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(LENGTH_PREFIX_BYTES);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

export interface DecodedNativeMessage {
  message: unknown;
  bytesConsumed: number;
}

/** Decodes one length-prefixed message from the start of buf, or null if not enough bytes are buffered yet. */
export function decodeNativeMessage(buf: Buffer): DecodedNativeMessage | null {
  if (buf.length < LENGTH_PREFIX_BYTES) {
    return null;
  }
  const length = buf.readUInt32LE(0);
  const totalBytes = LENGTH_PREFIX_BYTES + length;
  if (buf.length < totalBytes) {
    return null;
  }
  const json = buf.subarray(LENGTH_PREFIX_BYTES, totalBytes).toString('utf8');
  return { message: JSON.parse(json), bytesConsumed: totalBytes };
}
