import { describe, expect, it } from 'vitest';
import {
  IMPORT_TARGET_FAMILIES,
  matchesImportTargets,
  resolveTargetStorageTypes,
  unrelatedImportReason,
} from '../src/import-targets.js';

describe('import-targets', () => {
  it('resolves web2 family to web2 + guest_post storage types', () => {
    const types = resolveTargetStorageTypes(['web2_article']);
    expect(types).toContain('web2');
    expect(types).toContain('guest_post');
    expect(types).not.toContain('directory');
  });

  it('matches and rejects against selected families', () => {
    const types = resolveTargetStorageTypes(['directory']);
    expect(matchesImportTargets('directory', types)).toBe(true);
    expect(matchesImportTargets('web2', types)).toBe(false);
    expect(matchesImportTargets('web2', [])).toBe(true);
  });

  it('builds a clear unrelated reason', () => {
    const reason = unrelatedImportReason('directory', ['web2_article']);
    expect(reason).toMatch(/Unrelated/i);
    expect(reason).toMatch(/Web 2\.0/i);
    expect(IMPORT_TARGET_FAMILIES.length).toBe(5);
  });
});
