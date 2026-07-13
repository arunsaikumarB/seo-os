import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  applyTemplate,
  createMessage,
  createSequence,
  generateAiMessage,
  getOutreachSummary,
  getSequence,
  getThread,
  listEmailAccounts,
  listSequences,
  listTasks,
  listTemplates,
  listThreads,
  submitMessageForApproval,
} from '../../modules/outreach/outreach.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const createMessageSchema = z.object({
  threadId: z.string().uuid().optional(),
  toEmail: z.string().email(),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  contactId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  tone: z.enum(['professional', 'friendly', 'formal', 'casual', 'persuasive']).optional(),
  scheduledAt: z.string().datetime().optional(),
});

const aiGenerateSchema = z.object({
  type: z.enum([
    'initial',
    'reply',
    'follow_up',
    'negotiation',
    'meeting_request',
    'guest_post',
    'thank_you',
    'subject_line',
  ]),
  tone: z.enum(['professional', 'friendly', 'formal', 'casual', 'persuasive']).optional(),
  toEmail: z.string().email(),
  threadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  context: z.record(z.string()).optional(),
});

export const outreachRouter = Router({ mergeParams: true });

outreachRouter.get('/summary', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getOutreachSummary(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

outreachRouter.get('/threads', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listThreads(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

outreachRouter.get(
  '/threads/:threadId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const thread = await getThread(param(req.params.threadId), param(req.params.projectId));
      if (!thread) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Thread not found');
      res.json({ data: thread });
    } catch (err) {
      next(err);
    }
  }
);

outreachRouter.get('/templates', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listTemplates(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

outreachRouter.post(
  '/templates/:templateId/apply',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const context = z.record(z.string()).parse(req.body?.context ?? {});
      res.json({
        data: await applyTemplate(
          param(req.params.templateId),
          param(req.params.projectId),
          context
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

outreachRouter.get('/sequences', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listSequences(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

outreachRouter.post('/sequences', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1),
        contactId: z.string().uuid().optional(),
        organizationId: z.string().uuid().optional(),
        campaignId: z.string().uuid().optional(),
      })
      .parse(req.body);
    res.json({ data: await createSequence(param(req.params.projectId), body) });
  } catch (err) {
    next(err);
  }
});

outreachRouter.get(
  '/sequences/:sequenceId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const seq = await getSequence(param(req.params.sequenceId), param(req.params.projectId));
      if (!seq) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Sequence not found');
      res.json({ data: seq });
    } catch (err) {
      next(err);
    }
  }
);

outreachRouter.get('/accounts', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listEmailAccounts(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

outreachRouter.get('/tasks', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listTasks(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

outreachRouter.post('/messages', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = createMessageSchema.parse(req.body);
    const { userId } = (req as AuthenticatedRequest).auth;
    res.json({ data: await createMessage(param(req.params.projectId), userId, body) });
  } catch (err) {
    next(err);
  }
});

outreachRouter.post(
  '/messages/ai-generate',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = aiGenerateSchema.parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({ data: await generateAiMessage(param(req.params.projectId), userId, body) });
    } catch (err) {
      next(err);
    }
  }
);

outreachRouter.post(
  '/messages/:messageId/submit',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await submitMessageForApproval(
          param(req.params.messageId),
          param(req.params.projectId),
          userId
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

outreachRouter.post(
  '/messages/:messageId/send',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { enqueueSendMessage } = await import('../../modules/outreach/outreach.service.js');
      res.json({
        data: await enqueueSendMessage(param(req.params.messageId), param(req.params.projectId)),
      });
    } catch (err) {
      next(err);
    }
  }
);

outreachRouter.post(
  '/threads/:threadId/sync',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { getSupabaseAdmin } = await import('../../lib/supabase.js');
      await getSupabaseAdmin()
        .from('email_accounts')
        .update({ last_inbox_sync_at: new Date().toISOString() })
        .eq('workspace_id', param(req.params.projectId))
        .eq('status', 'active');
      res.json({
        data: {
          synced: true,
          threadId: param(req.params.threadId),
          note: 'Inbox sync timestamp updated for connected OAuth/SMTP accounts',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

outreachRouter.post(
  '/messages/:messageId/ai-suggest-reply',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { suggestReplyDraft } = await import('../../modules/integrations/oauth.service.js');
      const { getSupabaseAdmin } = await import('../../lib/supabase.js');
      const { data: msg } = await getSupabaseAdmin()
        .from('outreach_messages')
        .select('subject, body_html')
        .eq('id', param(req.params.messageId))
        .eq('workspace_id', param(req.params.projectId))
        .maybeSingle();
      res.json({
        data: await suggestReplyDraft({
          threadSubject: msg?.subject ?? 'Follow up',
          lastMessageHtml: msg?.body_html ?? '',
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);
