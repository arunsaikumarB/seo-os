/**
 * Playwright worker scaffold — backlink verification jobs (Sprint 7+).
 */
import 'dotenv/config';
import pino from 'pino';

const logger = pino({ name: 'worker-playwright' });
logger.info('Playwright worker scaffold ready — no handlers registered (Sprint 0)');
