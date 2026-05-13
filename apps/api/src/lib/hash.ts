import { createHmac, createHash } from 'node:crypto';
import { getEnv } from './env.js';

const env = getEnv();

export function hashUsername(username: string): string {
  return createHmac('sha256', env.USERNAME_HASH_SALT)
    .update(username.toLowerCase())
    .digest('hex');
}

export function hashEmail(email: string): string {
  return createHmac('sha256', env.EMAIL_HASH_SALT)
    .update(email.toLowerCase().trim())
    .digest('hex');
}

export function hashIp(ip: string): string {
  return createHmac('sha256', env.EMAIL_HASH_SALT)
    .update(`ip:${ip}`)
    .digest('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashCode(code: string, username: string): string {
  return createHmac('sha256', env.EMAIL_HASH_SALT)
    .update(`code:${username}:${code}`)
    .digest('hex');
}
