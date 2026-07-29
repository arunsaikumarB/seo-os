/**
 * Pre-import opportunity families — user selects what they're importing so AI
 * can flag unrelated classifications during the study/classify pipeline.
 */
import type { BacklinkTypeId } from './backlink-types.js';
import { getTypeLabel } from './backlink-types.js';

export const IMPORT_TARGET_FAMILIES = [
  {
    id: 'web2_article',
    label: 'Web 2.0 / Blog / Articles',
    description: 'Medium, Blogger, free blogs, article & guest-post sites',
    storageTypes: ['web2', 'guest_post'] as const satisfies readonly BacklinkTypeId[],
  },
  {
    id: 'directory',
    label: 'Directories / Citations / Profiles',
    description: 'Business listings, citations, and profile pages',
    storageTypes: ['directory', 'citation', 'profile'] as const satisfies readonly BacklinkTypeId[],
  },
  {
    id: 'community',
    label: 'Forums / Q&A / Community',
    description: 'Forums, Q&A, Reddit, Quora, social bookmarks',
    storageTypes: [
      'forum',
      'qa_site',
      'social_bookmark',
      'reddit',
      'quora',
      'blog_comment',
    ] as const satisfies readonly BacklinkTypeId[],
  },
  {
    id: 'media',
    label: 'PDF / Image / Video',
    description: 'Document, infographic, video, and podcast submissions',
    storageTypes: ['pdf', 'infographic', 'video', 'podcast'] as const satisfies readonly BacklinkTypeId[],
  },
  {
    id: 'outreach',
    label: 'Outreach / Resource / PR',
    description: 'Resource pages, broken links, niche edits, digital PR, HARO',
    storageTypes: [
      'resource_page',
      'broken_link',
      'niche_edit',
      'brand_mention',
      'unlinked_mention',
      'digital_pr',
      'haro',
      'press_release',
      'case_study',
      'whitepaper',
      'statistics_page',
      'edu',
      'gov',
      'news',
      'sponsorship',
      'event',
      'testimonial',
      'partnership',
      'supplier_link',
    ] as const satisfies readonly BacklinkTypeId[],
  },
] as const;

export type ImportTargetFamilyId = (typeof IMPORT_TARGET_FAMILIES)[number]['id'];

export function isImportTargetFamilyId(value: string): value is ImportTargetFamilyId {
  return IMPORT_TARGET_FAMILIES.some((f) => f.id === value);
}

export function resolveTargetStorageTypes(
  familyIds: readonly string[]
): BacklinkTypeId[] {
  const set = new Set<BacklinkTypeId>();
  for (const id of familyIds) {
    const family = IMPORT_TARGET_FAMILIES.find((f) => f.id === id);
    if (!family) continue;
    for (const t of family.storageTypes) set.add(t);
  }
  return [...set];
}

export function familyLabels(familyIds: readonly string[]): string[] {
  const labels: string[] = [];
  for (const id of familyIds) {
    const label = IMPORT_TARGET_FAMILIES.find((f) => f.id === id)?.label;
    if (label) labels.push(label);
  }
  return labels;
}

/** True when classified storage type is in the user-selected import families. */
export function matchesImportTargets(
  storageType: string,
  targetStorageTypes: readonly string[] | undefined | null
): boolean {
  if (!targetStorageTypes?.length) return true;
  return targetStorageTypes.includes(storageType);
}

export function unrelatedImportReason(
  storageType: string,
  familyIds: readonly string[]
): string {
  const selected = familyLabels(familyIds).join(', ') || 'your selected types';
  return `Unrelated to this import — classified as ${getTypeLabel(storageType)}, you selected ${selected}`;
}
