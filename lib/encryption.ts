import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_SECRET_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_SECRET_KEY environment variable is not set');
  }
  return crypto.createHash('sha256').update(key).digest();
}

export function decrypt(encryptedText: string): string {
  try {
    const iv = Buffer.from(encryptedText.slice(0, IV_LENGTH * 2), 'hex');
    const tag = Buffer.from(encryptedText.slice(IV_LENGTH * 2, (IV_LENGTH + TAG_LENGTH) * 2), 'hex');
    const encrypted = encryptedText.slice((IV_LENGTH + TAG_LENGTH) * 2);

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    throw new Error('Failed to decrypt token');
  }
}
