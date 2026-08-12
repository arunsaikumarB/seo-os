import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { getEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { traceIdMiddleware } from './middleware/traceId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import {
  healthHandler,
  readyHandler,
  versionHandler,
  metricsHandler,
  opsHealthHandler,
  opsQueuesHandler,
  opsPerformanceHandler,
} from './routes/health.js';
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
  // Company/DD3: set CORS_ORIGIN in the file named `.env` (next to package.json).
  // Example: CORS_ORIGIN=http://10.0.12.193:5000  or  CORS_ORIGIN=* (LAN only).
  const corsRaw = env.CORS_ORIGIN.trim();
  const corsAllowAll = corsRaw === '*';
  const corsAllowed = corsAllowAll
    ? []
    : corsRaw
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean);
  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser / same-origin tools (curl, server-to-server) send no Origin
        if (!origin) {
          callback(null, true);
          return;
        }
        const normalized = origin.replace(/\/$/, '');
        if (corsAllowAll || corsAllowed.includes(normalized)) {
          callback(null, true);
          return;
        }
        logger.warn(
          { origin, corsOriginEnv: corsRaw },
          'CORS blocked request Origin — set CORS_ORIGIN on API to this web URL'
        );
        callback(new Error(`CORS blocked for origin ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Org-Id', 'X-Trace-Id'],
    })
  );
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
  app.get('/ops/performance', opsPerformanceHandler);
  app.get('/v1/version', versionHandler);

  app.use('/v1', v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
