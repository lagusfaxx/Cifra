import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { getEnv } from './lib/env.js';
import { logger } from './lib/logger.js';
import { healthRouter } from './routes/health.js';
import { signupRouter } from './routes/signup.js';
import { loginRouter } from './routes/login.js';
import { recoverRouter } from './routes/recover.js';
import { passkeyRouter } from './routes/passkey.js';
import { usersRouter } from './routes/users.js';
import { messagesRouter } from './routes/messages.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

export function createApp(): Express {
  const env = getEnv();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    })
  );

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 86400,
    })
  );

  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '256kb' }));

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: {
        req(req) {
          return { method: req.method, url: req.url };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    })
  );

  app.use(healthRouter);
  app.use(signupRouter);
  app.use(loginRouter);
  app.use(recoverRouter);
  app.use(passkeyRouter);
  app.use(usersRouter);
  app.use(messagesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
