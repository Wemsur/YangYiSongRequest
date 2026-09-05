// 音源 Cookie 这类敏感值用 AES-256-GCM 加密存库（CONTEXT.md 第 6 节）。
// 密钥来自环境变量 CREDENTIAL_KEY，按需读取：没用到音源账号功能时不该拦住启动。
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AppError } from './errors.js';

const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const raw = process.env.CREDENTIAL_KEY ?? '';
  if (raw.length < 32) {
    throw new AppError(
      'NO_CREDENTIAL_KEY',
      500,
      '服务器还没配 CREDENTIAL_KEY（至少 32 字符），配置方法见 DEPLOY.md'
    );
  }
  // 派生成固定 32 字节，这样环境变量可以是任意长度的随机串，不必是 64 位 hex
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new AppError('BAD_CIPHERTEXT', 500, '存的凭据坏了，请在后台重新登录一次');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  try {
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // 换过 CREDENTIAL_KEY 之后旧密文一定解不开，给个能看懂的提示
    throw new AppError(
      'BAD_CIPHERTEXT',
      500,
      '凭据解不开，可能是换过 CREDENTIAL_KEY，请重新登录一次'
    );
  }
}

export const hasCredentialKey = (): boolean => (process.env.CREDENTIAL_KEY ?? '').length >= 32;
