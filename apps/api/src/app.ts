import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { getEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { traceIdMiddleware } from './middleware/traceId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthHandler, readyHandler, versionHandler } from './routes/health.js';
import { v1Router } from './routes/v1/index.js';

export function createApp() {
  const env = getEnv();
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(traceIdMiddleware);
  app.use(
    pinoHttp({
      logger,
    }) as express.RequestHandler
  );

  app.get('/health', healthHandler);
  app.get('/ready', readyHandler);
  app.get('/v1/version', versionHandler);

  app.use('/v1', v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
