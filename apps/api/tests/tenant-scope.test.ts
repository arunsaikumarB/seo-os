import { describe, expect, it } from 'vitest';
import { AppError } from '@seo-os/shared';
import { workspaceOrGlobalFilter } from '../src/lib/tenant-scope.js';

describe('workspaceOrGlobalFilter', () => {
  it('keeps the global catalog and one workspace', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(workspaceOrGlobalFilter(id)).toBe(`workspace_id.is.null,workspace_id.eq.${id}`);
  });

  it('rejects a non-uuid so it cannot change the filter', () => {
    expect(() => workspaceOrGlobalFilter('workspace_id.eq.other')).toThrow(AppError);
  });
});
