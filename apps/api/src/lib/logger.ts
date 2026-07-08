import pino from 'pino';
import { getEnv } from '../config/env.js';

const env = getEnv();

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
