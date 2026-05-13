import { pino } from 'pino';
import { getEnv } from './env.js';

const env = getEnv();

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.pin',
  'req.body.code',
  'req.body.password',
  'req.body.recoveryPhrase',
  'req.body.ciphertext',
  'req.body.encPrivBlob',
  'req.body.pinVerifier',
  'req.body.signature',
  'req.body.ephemeralPub',
  'req.body.email',
  'res.headers["set-cookie"]',
  'identityPub',
  'signingPub',
  'pinSalt',
  'pinVerifier',
  'verifierSalt',
  'emailHash',
  'usernameHash',
  '*.pin',
  '*.password',
  '*.email',
  '*.recoveryPhrase',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  base: { service: 'cifra-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
