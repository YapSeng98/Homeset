const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

// Web Crypto exists in browsers and Node; core avoids depending on DOM or Node typings.
const webCrypto = (globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }).crypto;

export function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  webCrypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const createId = (prefix: string): string => `${prefix}_${randomString(10)}`;
