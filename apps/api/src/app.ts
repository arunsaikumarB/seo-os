import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { getEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { traceIdMiddleware } from './middleware/traceId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthHandler, readyHandler, versionHandler, metricsHandler, opsHealthHandler, opsQueuesHandler } from './routes/health.js';
import { v1Router } from './routes/v1/index.js';
import { rateLimit } from './middleware/rateLimit.js';
import { metricsMiddleware } from './middleware/metrics.js';

export function createApp() {
  const env = getEnv();
  const app = express();

  // cross-origin so the Netlify SPA can read API responses (default helmet CORP is same-origin).
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts:
        env.NODE_ENV === 'production' || env.NODE_ENV === 'staging'
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
      frameguard: { action: 'deny' },
      noSniff: true,
      xssFilter: true,
    })
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(traceIdMiddleware);
  app.use(metricsMiddleware);
  app.use('/v1', rateLimit({ windowMs: 60_000, max: 180, keyPrefix: 'v1' }));
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({
        traceId: (req as { traceId?: string }).traceId,
      }),
    }) as express.RequestHandler
  );

  app.get('/health', healthHandler);
  app.get('/ready', readyHandler);
  app.get('/metrics', metricsHandler);
  app.get('/ops/health', opsHealthHandler);
  app.get('/ops/queues', opsQueuesHandler);
  app.get('/v1/version', versionHandler);

  app.use('/v1', v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
