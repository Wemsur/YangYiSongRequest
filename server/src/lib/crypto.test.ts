import { afterEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, hasCredentialKey } from './crypto.js';

const KEY = 'test-key-至少三十二个字符-0123456789abcdef';

afterEach(() => {
  delete process.env.CREDENTIAL_KEY;
});

describe('凭据加解密', () => {
  it('转一圈能还原，且每次密文都不同（随机 iv）', () => {
    process.env.CREDENTIAL_KEY = KEY;
    const plain = 'MUSIC_U=abc123; __csrf=xyz';
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plain);
    expect(decryptSecret(b)).toBe(plain);
  });

  it('换了密钥就解不开，并给出能看懂的提示', () => {
    process.env.CREDENTIAL_KEY = KEY;
    const payload = encryptSecret('MUSIC_U=abc123');
    process.env.CREDENTIAL_KEY = `${KEY}-换了一个`;
    expect(() => decryptSecret(payload)).toThrow(/CREDENTIAL_KEY/);
  });

  it('没配密钥时报错而不是静默用默认值', () => {
    expect(hasCredentialKey()).toBe(false);
    expect(() => encryptSecret('x')).toThrow(/CREDENTIAL_KEY/);
  });

  it('密文被截断也不会崩', () => {
    process.env.CREDENTIAL_KEY = KEY;
    expect(() => decryptSecret('dG9vLXNob3J0')).toThrow(/坏了|解不开/);
  });
});
