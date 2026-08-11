import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { getApiErrorMessage } from '@/lib/api';
import { PageTransition } from '@/components/demo/page-transition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type DomainSummary = {
  domain: string;
  fieldCount: number;
  verified: boolean;
  verifiedPct: number;
  successCount: number;
  lastVerified: string | null;
  updatedAt: string | null;
};

type FieldMapping = {
  websiteField: string;
  mappedTo: string;
  confidence: number;
  verifiedBy: string;
  updatedAt: string;
};

type DomainDetail = {
  domain: string;
  fieldMappings: FieldMapping[];
  categories: unknown[];
  verified: boolean;
  successCount: number;
  lastVerified: string | null;
  updatedAt: string | null;
  fieldCount: number;
};

const ROLE_OPTIONS = [
  'business_name',
  'website',
  'description',
  'email',
  'phone',
  'category',
  'address',
  'city',
  'state',
  'country',
  'zip',
  'title',
  'facebook',
  'linkedin',
  'twitter',
  'skip',
] as const;

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    business_name: 'Business Name',
    website: 'Website',
    description: 'Description',
    email: 'Email',
    phone: 'Phone',
    category: 'Category',
    address: 'Address',
    city: 'City',
    state: 'State',
    country: 'Country',
    zip: 'ZIP',
    title: 'Title',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    twitter: 'Twitter',
    skip: 'Skip',
  };
  return map[role] ?? role;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

export function FieldKnowledgePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['field-knowledge', projectId],
    queryFn: () => request<{ data: DomainSummary[] }>('/v1/learning/domains'),
    enabled: !!projectId,
  });

  const detail = useQuery({
    queryKey: ['field-knowledge-domain', selected],
    queryFn: () =>
      request<{ data: DomainDetail }>(
        `/v1/learning/domain/${encodeURIComponent(selected!)}`
      ),
    enabled: !!selected,
  });

  const saveMapping = useMutation({
    mutationFn: (body: {
      domain: string;
      websiteField: string;
      mappedTo: string;
    }) =>
      request('/v1/learning/field-mapping', {
        method: 'POST',
        body: JSON.stringify({ ...body, confidence: 1, verifiedBy: 'user' }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['field-knowledge'] });
      void qc.invalidateQueries({ queryKey: ['field-knowledge-domain', selected] });
      toast.success('Mapping updated');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Save failed')),
  });

  const removeMapping = useMutation({
    mutationFn: (opts: { domain: string; websiteField: string }) =>
      request(
        `/v1/learning/domain/${encodeURIComponent(opts.domain)}/field/${encodeURIComponent(opts.websiteField)}`,
        { method: 'DELETE' }
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['field-knowledge'] });
      void qc.invalidateQueries({ queryKey: ['field-knowledge-domain', selected] });
      toast.success('Mapping removed');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Delete failed')),
  });

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);

  return (
    <PageTransition>
      <div className="space-y-6 p-6 w-full min-w-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <BookOpen className="h-6 w-6" /> Field Knowledge
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Shared Companion mappings. Domain knowledge overrides aliases for every teammate.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${list.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Domains</CardTitle>
              <CardDescription>Verified field mappings learned from Companion</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {list.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No domains yet. Use Teach Companion on a submission form to save the first mapping.
                </p>
              ) : (
                rows.map((row) => (
                  <button
                    key={row.domain}
                    type="button"
                    className={`w-full text-left rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition ${
                      selected === row.domain ? 'border-emerald-500/60 bg-emerald-500/5' : ''
                    }`}
                    onClick={() => setSelected(row.domain)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{row.domain}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{row.fieldCount} fields</span>
                      <Badge className="text-[10px]">
                        Verified {row.verifiedPct}%
                      </Badge>
                      <span>Updated {formatWhen(row.updatedAt)}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selected ? selected : 'Select a domain'}
              </CardTitle>
              <CardDescription>
                {selected
                  ? 'Edit website field → package field mappings'
                  : 'Choose a domain to view and edit mappings'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selected ? null : detail.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading mappings…</p>
              ) : (
                (detail.data?.data.fieldMappings ?? []).map((m) => (
                  <div
                    key={`${m.websiteField}-${m.mappedTo}`}
                    className="rounded-lg border px-3 py-2 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs">{m.websiteField}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        disabled={removeMapping.isPending}
                        onClick={() =>
                          removeMapping.mutate({
                            domain: selected,
                            websiteField: m.websiteField,
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">→</span>
                      <select
                        className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
                        value={m.mappedTo}
                        disabled={saveMapping.isPending}
                        onChange={(e) =>
                          saveMapping.mutate({
                            domain: selected,
                            websiteField: m.websiteField,
                            mappedTo: e.target.value,
                          })
                        }
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))
              )}
              {selected && detail.data?.data.fieldMappings?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No mappings for this domain.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
