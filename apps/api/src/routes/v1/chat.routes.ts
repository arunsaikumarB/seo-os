import { Router } from 'express';
import { sendChatMessageSchema, createConversationSchema, AppError } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  createConversation,
  getConversationMessages,
  listConversations,
  sendMessage,
  SUGGESTED_PROMPTS,
} from '../../modules/chat/chat.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const chatRouter = Router({ mergeParams: true });

chatRouter.get('/prompts', authMiddleware, requireRole('viewer'), (_req, res) => {
  res.json({ data: SUGGESTED_PROMPTS });
});

chatRouter.get('/conversations', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const conversations = await listConversations(param(req.params.projectId), userId);
    res.json({ data: conversations });
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/conversations', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const parsed = createConversationSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid conversation');
    const { userId } = (req as AuthenticatedRequest).auth;
    const conversation = await createConversation(
      param(req.params.projectId),
      userId,
      parsed.data.title
    );
    res.status(201).json({ data: conversation });
  } catch (err) {
    next(err);
  }
});

chatRouter.get(
  '/conversations/:conversationId/messages',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const messages = await getConversationMessages(
        param(req.params.conversationId),
        param(req.params.projectId)
      );
      res.json({ data: messages });
    } catch (err) {
      next(err);
    }
  }
);

chatRouter.post(
  '/conversations/:conversationId/messages',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const parsed = sendChatMessageSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid message');

      const { userId, orgId } = (req as AuthenticatedRequest).auth;
      const projectId = param(req.params.projectId);
      const conversationId = param(req.params.conversationId);

      if (parsed.data.stream) {
        await sendMessage({
          conversationId,
          workspaceId: projectId,
          orgId,
          userId,
          content: parsed.data.content,
          res,
          stream: true,
        });
        return;
      }

      const result = await sendMessage({
        conversationId,
        workspaceId: projectId,
        orgId,
        userId,
        content: parsed.data.content,
        stream: false,
      });
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);
