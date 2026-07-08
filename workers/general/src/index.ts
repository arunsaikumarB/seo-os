/**
 * Sprint 0: Worker process scaffold.
 * Job handlers wire in when ENABLE_WORKERS=true (Sprint 4+).
 */
import 'dotenv/config';
import pino from 'pino';

const logger = pino({ name: 'worker-general' });
logger.info('Worker scaffold ready — no handlers registered (Sprint 0)');
