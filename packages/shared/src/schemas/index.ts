import { z } from 'zod';
import { ORG_ROLES, WORKSPACE_STATUSES } from '../constants/index.js';

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  industry: z.string().max(100).optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(2).max(100),
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i, 'Invalid domain'),
  url: z.string().url().optional(),
  industry: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(WORKSPACE_STATUSES).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(ORG_ROLES),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  timezone: z.string().max(50).optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  industry: z.string().max(100).optional(),
});

export const uploadDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(25_000_000),
  filename: z.string().max(255).optional(),
  mimeType: z
    .enum(['text/plain', 'text/markdown', 'application/json'])
    .default('text/plain'),
});

export const createMemoryEntrySchema = z.object({
  tier: z.enum(['episodic', 'brand', 'project', 'conversation', 'prompt']).default('episodic'),
  content: z.string().min(1).max(5000),
  metadata: z.record(z.unknown()).optional(),
});

export const createMemoryFactSchema = z.object({
  factType: z.enum(['semantic', 'brand', 'project', 'approved_prompt']).default('semantic'),
  content: z.string().min(1).max(5000),
});

export const sendChatMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  stream: z.boolean().optional().default(true),
});

export const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
