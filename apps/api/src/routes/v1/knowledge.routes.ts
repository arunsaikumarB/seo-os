import { Router } from 'express';
import { uploadDocumentSchema, AppError } from '@seo-os/shared';
import {
  authMiddleware,
  type AuthenticatedRequest,
} from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  deleteDocument,
  getDocument,
  getKnowledgeStats,
  listDocuments,
  reingestDocument,
  uploadDocument,
} from '../../modules/knowledge/document.service.js';
import { searchKnowledge } from '../../modules/knowledge/search.service.js';
import {
  approveMemoryFact,
  createMemoryEntry,
  createMemoryFact,
  listMemory,
} from '../../modules/memory/memory.service.js';
import { createMemoryEntrySchema, createMemoryFactSchema } from '@seo-os/shared';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const knowledgeRouter = Router({ mergeParams: true });

knowledgeRouter.get(
  '/documents',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const docs = await listDocuments(param(req.params.projectId));
      res.json({ data: docs });
    } catch (err) {
      next(err);
    }
  }
);

knowledgeRouter.get(
  '/documents/:documentId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const doc = await getDocument(param(req.params.documentId), param(req.params.projectId));
      if (!doc) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Document not found');
      res.json({ data: doc });
    } catch (err) {
      next(err);
    }
  }
);

knowledgeRouter.post(
  '/documents',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const parsed = uploadDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid document upload');
      }
      const { userId } = (req as AuthenticatedRequest).auth;
      const doc = await uploadDocument(param(req.params.projectId), userId, {
        title: parsed.data.title,
        content: parsed.data.content,
        filename: parsed.data.filename,
        mimeType: parsed.data.mimeType,
      });
      res.status(201).json({ data: doc });
    } catch (err) {
      next(err);
    }
  }
);

knowledgeRouter.delete(
  '/documents/:documentId',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const result = await deleteDocument(param(req.params.documentId), param(req.params.projectId));
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

knowledgeRouter.post(
  '/documents/:documentId/ingest',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const result = await reingestDocument(param(req.params.documentId), param(req.params.projectId));
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

knowledgeRouter.get(
  '/search',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '');
      if (!q) throw new AppError(400, 'VALIDATION_ERROR', 'Query parameter q required');
      const results = await searchKnowledge(param(req.params.projectId), q);
      res.json({ data: results });
    } catch (err) {
      next(err);
    }
  }
);

knowledgeRouter.get(
  '/stats',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const stats = await getKnowledgeStats(param(req.params.projectId));
      res.json({ data: stats });
    } catch (err) {
      next(err);
    }
  }
);

knowledgeRouter.get(
  '/memory',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const memory = await listMemory(param(req.params.projectId));
      res.json({ data: memory });
    } catch (err) {
      next(err);
    }
  }
);

knowledgeRouter.post(
  '/memory/entries',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const parsed = createMemoryEntrySchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid memory entry');
      const { userId } = (req as AuthenticatedRequest).auth;
      const entry = await createMemoryEntry(param(req.params.projectId), userId, parsed.data);
      res.status(201).json({ data: entry });
    } catch (err) {
      next(err);
    }
  }
);

knowledgeRouter.post(
  '/memory/facts',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const parsed = createMemoryFactSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid memory fact');
      const fact = await createMemoryFact(param(req.params.projectId), parsed.data);
      res.status(201).json({ data: fact });
    } catch (err) {
      next(err);
    }
  }
);

knowledgeRouter.post(
  '/memory/facts/:factId/approve',
  authMiddleware,
  requireRole('manager'),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).auth;
      const fact = await approveMemoryFact(
        param(req.params.factId),
        param(req.params.projectId),
        userId
      );
      res.json({ data: fact });
    } catch (err) {
      next(err);
    }
  }
);
