import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { getEnv } from '../../config/env.js';
import { localSignIn, localSignUp } from '../../modules/auth/local-auth.service.js';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const signUpSchema = credentialsSchema.extend({
  fullName: z.string().min(1).max(200),
});

function requireLocalAuthMode() {
  const env = getEnv();
  if (env.AUTH_MODE !== 'local') {
    throw new AppError(
      503,
      'AUTH_MODE_SUPABASE',
      'Local auth API is disabled. Set AUTH_MODE=local on the API to use these endpoints (default remains supabase).'
    );
  }
}

export const authRouter = Router();

authRouter.get('/mode', (_req, res) => {
  const env = getEnv();
  res.json({
    data: {
      authMode: env.AUTH_MODE,
      dataMode: env.DATA_MODE,
      localAuthEnabled: env.AUTH_MODE === 'local',
      pgDataEnabled: env.DATA_MODE === 'pg',
    },
  });
});

authRouter.post('/signup', async (req, res, next) => {
  try {
    requireLocalAuthMode();
    const body = signUpSchema.parse(req.body);
    const result = await localSignUp(body);
    res.status(201).json({
      data: {
        access_token: result.accessToken,
        token_type: 'bearer',
        user: result.user,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    requireLocalAuthMode();
    const body = credentialsSchema.parse(req.body);
    const result = await localSignIn(body);
    res.json({
      data: {
        access_token: result.accessToken,
        token_type: 'bearer',
        user: result.user,
      },
    });
  } catch (err) {
    next(err);
  }
});
