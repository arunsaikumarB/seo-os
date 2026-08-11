import pino from 'pino';

// Do not call getEnv()/Zod here — this module may load before dotenv finishes.
const nodeEnv = process.env.NODE_ENV ?? 'development';

export const logger = pino({
  level: nodeEnv === 'production' ? 'info' : 'debug',
  transport:
    nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
