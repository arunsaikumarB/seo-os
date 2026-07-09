import type { PaginationMeta } from '@seo-os/shared';

export interface PaginatedQuery {
  limit?: number;
  cursor?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export function parsePagination(query: Record<string, unknown>): PaginatedQuery {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
  const sort = typeof query.sort === 'string' ? query.sort : 'score';
  const order = query.order === 'asc' ? 'asc' : 'desc';
  return { limit, cursor, sort, order };
}

export function buildPaginationMeta<T extends { id: string }>(
  items: T[],
  limit: number
): { items: T[]; pagination: PaginationMeta } {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return {
    items: page,
    pagination: {
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      prevCursor: null,
      limit,
      hasMore,
    },
  };
}
