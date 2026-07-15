import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

export type SelectedOpportunity = {
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

/** @deprecated Prefer SelectedOpportunity */
export type ApprovedOpportunity = SelectedOpportunity;

const READINESS_LABEL: Record<string, string> = {
  ready: 'Ready',
  in_progress: 'In progress',
  needs_approval: 'Needs approval',
  completed: 'Completed',
  failed: 'Failed',
  needs_domain: 'Needs domain',
  not_ready: 'Not ready',
};

const EMPTY_DEFAULT =
  'No approved opportunities available. Approve websites in Opportunity Queue first.';

type Props = {
  projectId: string;
  selectedId: string | null;
  onSelect: (opp: SelectedOpportunity | null) => void;
  /** execution = only execution-selectable rows; content = all approved */
  mode?: 'content' | 'execution';
  emptyMessage?: string;
  showTable?: boolean;
  showRequiredFields?: boolean;
  allowClear?: boolean;
  label?: string;
};

export function useApprovedOpportunities(projectId: string) {
  const { request } = useApi();
  return useQuery({
    queryKey: ['approved-opportunities', projectId],
    queryFn: () =>
      request<{ data: SelectedOpportunity[] }>(
        `/v1/projects/${projectId}/campaigns/approved-opportunities`
      ),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });
}

/**
 * Single reusable opportunity picker — website-first, UUID never shown or edited.
 * Pass selectedId/onSelect from useCurrentOpportunity() so all modules stay in sync.
 */
export function OpportunitySelector({
  projectId,
  selectedId,
  onSelect,
  mode = 'content',
  emptyMessage = EMPTY_DEFAULT,
  showTable = true,
  showRequiredFields = true,
  allowClear = false,
  label = 'Select website',
}: Props) {
  const query = useApprovedOpportunities(projectId);
  const [search, setSearch] = useState('');
  const items = query.data?.data ?? [];
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

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
        String(o.category ?? '').toLowerCase().includes(q) ||
        String(o.status).toLowerCase().includes(q)
      );
    });
  }, [items, search, mode]);

  const selected = items.find((o) => o.id === selectedId) ?? null;

  // Auto-select only when nothing is active yet and exactly one approved site exists
  useEffect(() => {
    if (query.isLoading || selectedId) return;
    if (items.length === 1) onSelectRef.current(items[0]!);
  }, [items, query.isLoading, selectedId]);

  if (query.isLoading) {
    return <Skeleton className="h-28 w-full" />;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {!selectedId && (
        <p className="text-sm text-muted-foreground">
          No current opportunity — search and select an approved website below. Your choice stays
          active across Image Studio, Content Studio, and other modules until you change it.
        </p>
      )}

      <div className="space-y-1">
        <Label htmlFor="opp-selector-search">Search approved websites</Label>
        <Input
          id="opp-selector-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by website name, domain, type, or category…"
          autoComplete="off"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="opp-selector">{label}</Label>
        <select
          id="opp-selector"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={selectedId ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            if (!value) {
              onSelect(null);
              return;
            }
            onSelect(items.find((o) => o.id === value) ?? null);
          }}
        >
          <option value="">{allowClear ? 'Clear selection…' : 'Choose a website…'}</option>
          {filtered.map((o) => (
            <option key={o.id} value={o.id}>
              {o.website}
              {o.domain ? ` (${o.domain})` : ''}
              {` · ${o.backlink_type ?? String(o.opportunity_type).replace(/_/g, ' ')}`}
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
                <th className="px-3 py-2 font-medium">Website Name</th>
                <th className="px-3 py-2 font-medium">Domain</th>
                <th className="px-3 py-2 font-medium">Backlink Type</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">DR</th>
                <th className="px-3 py-2 font-medium">Traffic</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Readiness</th>
                <th className="px-3 py-2 font-medium">Status</th>
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
                    <td className="px-3 py-2 font-medium">{o.website}</td>
                    <td className="px-3 py-2 text-muted-foreground">{o.domain ?? '—'}</td>
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
                    <td className="px-3 py-2">
                      <Badge className="text-[10px] capitalize">
                        {String(o.status).replace(/_/g, ' ')}
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
            {selected.domain ?? 'No domain'}
            {' · '}
            {(selected.backlink_type ?? selected.opportunity_type).replace(/_/g, ' ')}
            {' · '}
            {String(selected.category ?? '').replace(/_/g, ' ')}
            {' · score '}
            {selected.score}
            {selected.domain_rating != null ? ` · DR ${selected.domain_rating}` : ''}
            {selected.monthly_traffic != null
              ? ` · traffic ${selected.monthly_traffic.toLocaleString()}`
              : ''}
            {' · '}
            {String(selected.status).replace(/_/g, ' ')}
          </p>
          {showRequiredFields && (selected.required_fields?.length ?? 0) > 0 && (
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

/** Backward-compatible alias */
export function ApprovedOpportunityPicker(props: Props) {
  return <OpportunitySelector {...props} />;
}
