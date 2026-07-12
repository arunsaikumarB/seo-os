import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition } from '@/components/demo/page-transition';
import { EmptyState } from '@/components/demo/empty-state';
import { useApi } from '@/hooks/use-api';
import { useDemoMode } from '@/hooks/use-demo-mode';
import {
  DEMO_CHAT_PROMPTS,
  DEMO_PROJECTS,
  DEMO_KB_DOCUMENTS,
  DEMO_OPPORTUNITIES,
} from '@/demo/data';

type SearchHit = {
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

export function SearchPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { request } = useApi();
  const { isDemoMode } = useDemoMode();
  const [query, setQuery] = useState('');

  const knowledge = useQuery({
    queryKey: ['search-kb', projectId],
    queryFn: () =>
      request<{ data: Array<{ title: string; chunk_count?: number; status?: string }> }>(
        `/v1/projects/${projectId}/knowledge/documents`
      ),
    enabled: !!projectId && !isDemoMode,
  });

  const opportunities = useQuery({
    queryKey: ['search-opps', projectId],
    queryFn: () =>
      request<{
        data: { items?: Array<{ title?: string; domain?: string; score?: number }> } | Array<{
          title?: string;
          domain?: string;
          score?: number;
        }>;
      }>(`/v1/projects/${projectId}/backlink-builder/opportunities?limit=50`),
    enabled: !!projectId && !isDemoMode,
  });

  const campaigns = useQuery({
    queryKey: ['search-campaigns', projectId],
    queryFn: () =>
      request<{ data: Array<{ id: string; name: string; status?: string }> }>(
        `/v1/projects/${projectId}/campaigns`
      ),
    enabled: !!projectId && !isDemoMode,
  });

  const liveHits = useMemo<SearchHit[]>(() => {
    const hits: SearchHit[] = [];
    for (const d of knowledge.data?.data ?? []) {
      hits.push({
        type: 'Document',
        title: d.title,
        subtitle: d.status ?? 'knowledge',
        href: 'knowledge/library',
      });
    }
    const oppRaw = opportunities.data?.data;
    const oppItems = Array.isArray(oppRaw)
      ? oppRaw
      : Array.isArray(oppRaw?.items)
        ? oppRaw.items
        : [];
    for (const o of oppItems) {
      hits.push({
        type: 'Opportunity',
        title: o.title ?? o.domain ?? 'Opportunity',
        subtitle: o.score != null ? `Score ${o.score}` : (o.domain ?? ''),
        href: 'backlink-builder/explorer',
      });
    }
    for (const c of campaigns.data?.data ?? []) {
      hits.push({
        type: 'Campaign',
        title: c.name,
        subtitle: c.status ?? 'campaign',
        href: `campaigns/${c.id}`,
      });
    }
    return hits;
  }, [knowledge.data, opportunities.data, campaigns.data]);

  const demoHits: SearchHit[] = [
    ...DEMO_PROJECTS.map((p) => ({
      type: 'Project',
      title: p.name,
      subtitle: p.domain,
      href: 'mission-control',
    })),
    ...DEMO_KB_DOCUMENTS.map((d) => ({
      type: 'Document',
      title: d.title,
      subtitle: `${d.chunks} chunks`,
      href: 'knowledge/library',
    })),
    ...DEMO_OPPORTUNITIES.map((o) => ({
      type: 'Opportunity',
      title: o.title,
      subtitle: `Score ${o.score}`,
      href: 'campaigns/queue',
    })),
  ];

  const source = isDemoMode ? demoHits : liveHits;
  const q = query.trim().toLowerCase();
  const results =
    q.length > 0
      ? source.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.subtitle.toLowerCase().includes(q) ||
            r.type.toLowerCase().includes(q)
        )
      : source.slice(0, 8);

  const loading = !isDemoMode && (knowledge.isLoading || opportunities.isLoading || campaigns.isLoading);

  return (
    <PageTransition className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Search className="h-6 w-6" /> Universal Search
        </h1>
        <p className="text-muted-foreground">
          Search documents, opportunities, and campaigns in this project
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search anything..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title={q ? 'No matches' : 'Nothing to search yet'}
          description={
            q
              ? 'Try a different keyword, or open Knowledge / Opportunities to add data.'
              : 'Upload knowledge documents or discover opportunities to populate search.'
          }
        />
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <Card
              key={`${r.type}-${r.title}-${r.href}`}
              className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
              onClick={() => projectId && navigate(`/projects/${projectId}/${r.href}`)}
            >
              <CardContent className="py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.subtitle}</p>
                </div>
                <span className="text-[10px] text-muted-foreground uppercase">{r.type}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(isDemoMode ? DEMO_CHAT_PROMPTS : ['Summarize this project', 'Find link opportunities']).map(
          (p) => (
            <Button
              key={p}
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => projectId && navigate(`/projects/${projectId}/command-center`)}
            >
              <Sparkles className="h-3 w-3 mr-1" /> {p}
            </Button>
          )
        )}
      </div>
    </PageTransition>
  );
}
