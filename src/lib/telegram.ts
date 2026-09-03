// src/lib/telegram.ts
// Telegram Login Widget hash verifier.
//
// Telegram's documented algorithm:
// 1. Sort all fields (except `hash`) alphabetically.
// 2. Build a \n-joined key=value string.
// 3. HMAC-SHA256 of that string using SHA256(TELEGRAM_BOT_TOKEN) as the key.
// 4. Compare the hex digest against the `hash` field from the widget payload.
//
// Reference: https://core.telegram.org/widgets/login#checking-authorization

import { createHash, createHmac, timingSafeEqual } from 'crypto';

export interface TelegramWidgetPayload {
  id: string | number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string | number;
  hash: string;
}

/**
 * Verifies the Telegram Login Widget payload hash.
 *
 * @param payload - The raw payload from the widget callback.
 * @returns `true` if the hash is valid and auth_date is within 24 hours; `false` otherwise.
 * @throws  If TELEGRAM_BOT_TOKEN is not set in the environment.
 */
export function verifyTelegramHash(payload: TelegramWidgetPayload): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  // Check auth_date freshness (24-hour window)
  const authDate = Number(payload.auth_date);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > 86400) {
    return false;
  }

  // Build the check string: all fields except `hash`, sorted, \n-joined
  const { hash, ...rest } = payload;
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key as keyof typeof rest]}`)
    .join('\n');

  // Secret key = SHA256(bot_token) — raw bytes (not hex)
  const secretKey = createHash('sha256').update(botToken).digest();

  // HMAC-SHA256 of the data check string with the secret key
  const expectedHmac = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(expectedHmac, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    // Buffer.from(hash) throws if hash is not valid hex
    return false;
  }
}
