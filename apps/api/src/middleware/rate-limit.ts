import type { NextFunction, Request, Response } from 'express';
import { redis } from '../lib/redis.js';
import { hashIp } from '../lib/hash.js';
import { HttpError } from './error.js';

export interface RateLimitOptions {
  windowSeconds: number;
  max: number;
  keyPrefix: string;
}

/**
 * Sliding-window-ish rate limit con Redis. Usa INCR + EXPIRE bucket.
 * Para tracking de auth attempts más fino (4 en 10min, 10 en 1h, 20 en 24h)
 * usamos otra estrategia: ver lib/auth-throttle.ts.
 */
export function rateLimit(opts: RateLimitOptions) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const ip = clientIp(req);
    const key = `rl:${opts.keyPrefix}:${hashIp(ip)}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, opts.windowSeconds);
    }
    if (count > opts.max) {
      throw new HttpError(429, 'Too many requests', 'rate_limited');
    }
    next();
  };
}

export function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? '0.0.0.0';
}
