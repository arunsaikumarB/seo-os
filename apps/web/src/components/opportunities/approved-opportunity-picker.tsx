import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

export type ApprovedOpportunity = {
  id: string;
  website: string;
  domain: string | null;
  title: string;
  score: number;
  opportunity_type: string;
  backlink_type?: string;
  category?: string;
  domain_rating?: number | null;
  monthly_traffic?: number | null;
  status: string;
  pipeline_stage?: string | null;
  readiness: string;
  selectable?: boolean;
  content_selectable?: boolean;
  required_fields?: string[];
  has_content_pack?: boolean;
  has_submission?: boolean;
  has_content_draft?: boolean;
};

const READINESS_LABEL: Record<string, string> = {
  ready: 'Ready',
  in_progress: 'In progress',
  needs_approval: 'Needs approval',
  completed: 'Completed',
  failed: 'Failed',
  needs_domain: 'Needs domain',
  not_ready: 'Not ready',
};

type Props = {
  projectId: string;
  selectedId: string | null;
  onSelect: (opp: ApprovedOpportunity | null) => void;
  /** execution = only selectable rows; content = all approved */
  mode?: 'content' | 'execution';
  emptyMessage?: string;
  showTable?: boolean;
};

export function useApprovedOpportunities(projectId: string) {
  const { request } = useApi();
  return useQuery({
    queryKey: ['approved-opportunities', projectId],
    queryFn: () =>
      request<{ data: ApprovedOpportunity[] }>(
        `/v1/projects/${projectId}/campaigns/approved-opportunities`
      ),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });
}

export function ApprovedOpportunityPicker({
  projectId,
  selectedId,
  onSelect,
  mode = 'content',
  emptyMessage = 'No approved opportunities available. Approve websites in Opportunity Queue first.',
  showTable = true,
}: Props) {
  const query = useApprovedOpportunities(projectId);
  const [search, setSearch] = useState('');
  const items = query.data?.data ?? [];
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const autoSelectedRef = useRef(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((o) => {
      if (mode === 'execution' && !o.selectable) return false;
      if (!q) return true;
      return (
        o.website.toLowerCase().includes(q) ||
        (o.domain ?? '').toLowerCase().includes(q) ||
        String(o.opportunity_type).toLowerCase().includes(q) ||
        String(o.backlink_type ?? '').toLowerCase().includes(q) ||
        String(o.category ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, search, mode]);

  const selected = items.find((o) => o.id === selectedId) ?? null;

  // Auto-select when exactly one approved opportunity exists
  useEffect(() => {
    if (query.isLoading || autoSelectedRef.current) return;
    if (items.length === 1) {
      autoSelectedRef.current = true;
      onSelectRef.current(items[0]);
    }
  }, [items, query.isLoading]);

  if (query.isLoading) {
    return <Skeleton className="h-28 w-full" />;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="approved-opp-search">Website</Label>
        <Input
          id="approved-opp-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by website name, type, or category…"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="approved-opp-select">Select opportunity</Label>
        <select
          id="approved-opp-select"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={selectedId ?? ''}
          onChange={(e) => {
            const next = items.find((o) => o.id === e.target.value) ?? null;
            onSelect(next);
          }}
        >
          <option value="">Choose a website…</option>
          {filtered.map((o) => (
            <option key={o.id} value={o.id}>
              {o.website}
              {o.backlink_type || o.opportunity_type
                ? ` · ${o.backlink_type ?? String(o.opportunity_type).replace(/_/g, ' ')}`
                : ''}
              {` · score ${o.score}`}
            </option>
          ))}
        </select>
      </div>

      {showTable && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Website</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">DR</th>
                <th className="px-3 py-2 font-medium">Traffic</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const active = o.id === selectedId;
                return (
                  <tr
                    key={o.id}
                    className={`border-t cursor-pointer ${active ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                    onClick={() => onSelect(o)}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium">{o.website}</p>
                      {o.domain && o.domain !== o.website && (
                        <p className="text-xs text-muted-foreground">{o.domain}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 capitalize">
                      {(o.backlink_type ?? o.opportunity_type).replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2 capitalize">
                      {String(o.category ?? '—').replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{o.domain_rating ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {o.monthly_traffic != null ? o.monthly_traffic.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{o.score}</td>
                    <td className="px-3 py-2">
                      <Badge className="text-[10px]">
                        {READINESS_LABEL[o.readiness] ?? o.readiness}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-3">No websites match your search.</p>
          )}
        </div>
      )}

      {selected && (
        <div className="rounded-md border p-3 space-y-2 text-sm">
          <p className="font-medium">{selected.website}</p>
          <p className="text-xs text-muted-foreground capitalize">
            {(selected.backlink_type ?? selected.opportunity_type).replace(/_/g, ' ')}
            {' · '}
            {String(selected.category ?? '').replace(/_/g, ' ')}
            {' · score '}
            {selected.score}
            {selected.domain_rating != null ? ` · DR ${selected.domain_rating}` : ''}
            {selected.monthly_traffic != null
              ? ` · traffic ${selected.monthly_traffic.toLocaleString()}`
              : ''}
          </p>
          {(selected.required_fields?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Required fields for this website</p>
              <div className="flex flex-wrap gap-1">
                {selected.required_fields!.map((f) => (
                  <Badge key={f} className="text-[10px]">
                    {f.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
