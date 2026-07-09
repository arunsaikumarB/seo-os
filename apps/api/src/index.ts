import 'dotenv/config';
import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { startJobInfrastructure } from './jobs/index.js';

async function main() {
  const env = getEnv();
  const app = createApp();

  if (env.ENABLE_WORKERS) {
    await startJobInfrastructure();
    logger.info('Background job workers enabled');
  } else {
    logger.info('Background job workers disabled (ENABLE_WORKERS=false)');
  }

  app.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, host: '0.0.0.0', env: env.NODE_ENV }, 'SEO OS API started');
  });
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start API');
  process.exit(1);
});
