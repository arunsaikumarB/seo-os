import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import {
  BACKLINK_CATEGORIES,
  type BacklinkOpportunity,
  scoreBadgeClass,
  formatType,
} from '@/components/backlink-builder/types';
import { Search, Filter } from 'lucide-react';

export function BacklinkExplorerPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [minScore, setMinScore] = useState('');
  const [search, setSearch] = useState('');

  const types = useQuery({
    queryKey: ['backlink-types', category],
    queryFn: () => {
      const q = category ? `?category=${category}` : '';
      return request<{ data: Array<{ id: string; display_name: string; category: string }> }>(
        `/v1/projects/${projectId}/backlink-builder/types${q}`
      );
    },
    enabled: !!projectId,
  });

  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (type) params.set('type', type);
  if (minScore) params.set('minScore', minScore);
  if (search) params.set('search', search);

  const opportunities = useQuery({
    queryKey: ['backlink-explorer', projectId, category, type, minScore, search],
    queryFn: () =>
      request<{ data: BacklinkOpportunity[] }>(
        `/v1/projects/${projectId}/backlink-builder/opportunities?${params.toString()}`
      ),
    enabled: !!projectId,
  });

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Opportunity Explorer"
        subtitle="Browse, filter, and score backlink opportunities across all 26 types."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setType('');
            }}
          >
            <option value="">All categories</option>
            {BACKLINK_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {(types.data?.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.display_name}</option>
            ))}
          </select>
          <Input
            type="number"
            placeholder="Min score"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            min={0}
            max={100}
          />
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search title or domain"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {(opportunities.data?.data ?? []).map((opp) => (
          <Card key={opp.id} className="transition-all hover:shadow-md hover:-translate-y-0.5">
            <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <Link
                  to={`/projects/${projectId}/backlink-builder/opportunities/${opp.id}`}
                  className="font-medium hover:underline"
                >
                  {opp.title}
                </Link>
                <div className="flex flex-wrap gap-1">
                  <Badge className="text-[10px] capitalize">{formatType(opp.opportunity_type)}</Badge>
                  {opp.backlink_category && (
                    <Badge className="text-[10px] border-muted-foreground/30">
                      {opp.backlink_category.replace(/_/g, ' ')}
                    </Badge>
                  )}
                  {opp.queue_status && (
                    <Badge className="text-[10px] border-muted-foreground/30">
                      {opp.queue_status.replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>
                {(opp.ai_suggestion ?? opp.ai_recommendation) && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {opp.ai_suggestion ?? opp.ai_recommendation}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={scoreBadgeClass(opp.score)}>Score {opp.score}</Badge>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/projects/${projectId}/backlink-builder/opportunities/${opp.id}`}>
                    Details
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {(opportunities.data?.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No opportunities match your filters.
          </p>
        )}
      </div>
    </div>
  );
}
