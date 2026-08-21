/**
 * Directory Form Intelligence — dynamic per-directory form review UI.
 * Renders only discovered fields. Never auto-submits.
 */
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { getApiErrorMessage } from '@/lib/api';
import { PageTransition } from '@/components/demo/page-transition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type DirectoryDetectedField = {
  originalLabel: string | null;
  canonicalField: string;
  inputType: string;
  required: boolean;
  optional: boolean;
  placeholder: string | null;
  defaultValue: string | null;
  options: string[];
  maxLength: number | null;
  validation: string[];
  selector: string;
  confidence: number;
  fillStatus: string;
};

type DirectoryFormSchema = {
  domain: string;
  directoryUrl: string;
  submissionUrl: string;
  analyzedAt: string;
  fields: DirectoryDetectedField[];
  categories: {
    originalValues: string[];
    suggestedMatch: string | null;
    suggestionConfidence: number;
    suggestionReason: string | null;
  };
  captcha: { present: boolean; kinds: string[]; notes: string[] };
  terms: { present: boolean; required: boolean; label: string | null };
  submitControls: Array<{ label: string }>;
  overallConfidence: number;
  reviewRequired: boolean;
  status: string;
  formPatternHint: string | null;
  gate: string;
};

type SchemaSummary = {
  domain: string;
  submissionUrl: string;
  fieldCount: number;
  overallConfidence: number;
  status: string;
  formPatternHint: string | null;
  analyzedAt: string;
  reviewRequired: boolean;
};

const FILL_STATUS_LABEL: Record<string, string> = {
  auto_populated: 'Auto-populated',
  needs_user_input: 'Needs user input',
  needs_manual_verification: 'Needs manual verification',
  directory_specific: 'Directory-specific',
  skip: 'Skip',
};

const CANONICAL_OPTIONS = [
  'website_url',
  'company_name',
  'business_name',
  'email',
  'company_email',
  'phone',
  'street_address',
  'city',
  'state',
  'province',
  'postal_code',
  'country',
  'industry',
  'category',
  'title',
  'description',
  'facebook_url',
  'instagram_url',
  'twitter_url',
  'linkedin_url',
  'youtube_url',
  'google_maps_url',
  'logo_url',
  'captcha',
  'terms_acceptance',
  'unknown',
];

export function DirectoryFormIntelligencePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Record<string, string>>({});

  const listQ = useQuery({
    queryKey: ['directory-forms', projectId],
    queryFn: () =>
      request<{ data: SchemaSummary[] }>(`/v1/projects/${projectId}/directory-forms`),
    enabled: Boolean(projectId),
  });

  const schemaQ = useQuery({
    queryKey: ['directory-form', projectId, activeDomain],
    queryFn: () =>
      request<{ data: DirectoryFormSchema }>(
        `/v1/projects/${projectId}/directory-forms/${encodeURIComponent(activeDomain!)}`
      ),
    enabled: Boolean(projectId && activeDomain),
  });

  const analyze = useMutation({
    mutationFn: (payload: { url: string; force?: boolean }) =>
      request<{
        data: {
          schema: DirectoryFormSchema;
          reused: boolean;
          drift: { changed: boolean; reasons: string[] } | null;
        };
      }>(`/v1/projects/${projectId}/directory-forms/analyze`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      const schema = res.data.schema;
      setActiveDomain(schema.domain);
      setCorrections({});
      void qc.invalidateQueries({ queryKey: ['directory-forms', projectId] });
      void qc.invalidateQueries({ queryKey: ['directory-form', projectId, schema.domain] });
      if (res.data.reused) toast.message('Reused cached directory schema');
      else if (res.data.drift?.changed) {
        toast.warning(`Form changed: ${res.data.drift.reasons.join(', ')}`);
      } else toast.success('Directory form analyzed');
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Analyze failed')),
  });

  const review = useMutation({
    mutationFn: () => {
      const domain = activeDomain!;
      const rows = Object.entries(corrections)
        .filter(([, v]) => v)
        .map(([selector, canonicalField]) => ({ selector, canonicalField }));
      return request<{ data: DirectoryFormSchema }>(
        `/v1/projects/${projectId}/directory-forms/${encodeURIComponent(domain)}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ corrections: rows }),
        }
      );
    },
    onSuccess: (res) => {
      toast.success('Field mappings reviewed');
      setCorrections({});
      void qc.invalidateQueries({ queryKey: ['directory-form', projectId, activeDomain] });
      void qc.invalidateQueries({ queryKey: ['directory-forms', projectId] });
      void res;
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Review save failed')),
  });

  const schema = schemaQ.data?.data;
  const visibleFields = useMemo(
    () => (schema?.fields ?? []).filter((f) => f.canonicalField !== 'unknown' || f.required),
    [schema]
  );

  return (
    <PageTransition>
      <div className="space-y-6 p-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Directory Form Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inspect each directory’s real submission form. Only discovered fields are shown —
            never a universal form. CAPTCHA stays manual. Nothing auto-submits.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Analyze directory URL</CardTitle>
            <CardDescription>
              Resolves the submission page, extracts DOM fields, maps to canonical business
              fields, and caches the schema for reuse.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://cipinet.com/suggest.php?action=addlink&TID=sf"
              className="flex-1"
            />
            <Button
              disabled={!url.trim() || analyze.isPending}
              onClick={() => analyze.mutate({ url: url.trim() })}
            >
              <Search className="h-4 w-4 mr-1.5" />
              Analyze
            </Button>
            <Button
              variant="outline"
              disabled={!url.trim() || analyze.isPending}
              onClick={() => analyze.mutate({ url: url.trim(), force: true })}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Re-check
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Cached schemas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 max-h-[480px] overflow-auto">
              {(listQ.data?.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No schemas yet — analyze a URL.</p>
              ) : (
                (listQ.data?.data ?? []).map((row) => (
                  <button
                    key={row.domain}
                    type="button"
                    onClick={() => {
                      setActiveDomain(row.domain);
                      setCorrections({});
                    }}
                    className={cn(
                      'w-full text-left rounded-md px-2 py-1.5 text-xs border',
                      activeDomain === row.domain
                        ? 'border-foreground/30 bg-muted'
                        : 'border-transparent hover:bg-muted/60'
                    )}
                  >
                    <div className="font-medium truncate">{row.domain}</div>
                    <div className="text-muted-foreground">
                      {row.fieldCount} fields · {Math.round(row.overallConfidence * 100)}%
                      {row.reviewRequired ? ' · review' : ''}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {!schema ? (
              <Card>
                <CardContent className="py-10 text-sm text-muted-foreground text-center">
                  Select a cached schema or analyze a directory URL.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{schema.domain}</CardTitle>
                      <Badge variant="outline">{schema.status}</Badge>
                      {schema.formPatternHint ? (
                        <Badge variant="secondary">{schema.formPatternHint.replace(/_/g, ' ')}</Badge>
                      ) : null}
                      {schema.reviewRequired ? (
                        <Badge className="bg-amber-500/15 text-amber-900 border-amber-500/30">
                          Review detected fields
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-900 border-emerald-500/30">
                          Ready for manual submit
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="break-all">
                      {schema.submissionUrl}
                      <span className="block mt-1">
                        Confidence {Math.round(schema.overallConfidence * 100)}% · Gate:{' '}
                        {schema.gate || 'none'} · Analyzed{' '}
                        {new Date(schema.analyzedAt).toLocaleString()}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-3 text-xs">
                    {schema.captcha.present ? (
                      <span className="inline-flex items-center gap-1 text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        CAPTCHA: {schema.captcha.kinds.join(', ')} — manual only
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" /> No CAPTCHA detected
                      </span>
                    )}
                    {schema.terms.present ? (
                      <span>
                        Terms{schema.terms.required ? ' (required)' : ''}:{' '}
                        {schema.terms.label || 'acceptance checkbox'}
                      </span>
                    ) : null}
                    {schema.categories.suggestedMatch ? (
                      <span>
                        Category suggestion:{' '}
                        <strong>{schema.categories.suggestedMatch}</strong> (
                        {Math.round(schema.categories.suggestionConfidence * 100)}%)
                      </span>
                    ) : schema.categories.originalValues.length ? (
                      <span>Category: pick from directory options (no safe auto-match)</span>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Directory-specific form</CardTitle>
                    <CardDescription>
                      Only fields found on this directory. Required / optional / fill status
                      shown per field.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {visibleFields.map((f) => (
                      <div
                        key={`${f.selector}-${f.canonicalField}`}
                        className="rounded-lg border px-3 py-2 space-y-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {f.originalLabel || f.canonicalField}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {f.canonicalField}
                          </Badge>
                          {f.required ? (
                            <Badge className="text-[10px] bg-red-500/10 text-red-800">Required</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Optional
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            {FILL_STATUS_LABEL[f.fillStatus] || f.fillStatus}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {Math.round(f.confidence * 100)}% · {f.inputType}
                            {f.maxLength != null ? ` · max ${f.maxLength}` : ''}
                          </span>
                        </div>
                        {f.defaultValue ? (
                          <p className="text-xs text-muted-foreground break-words">
                            Value: {f.defaultValue}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">No auto value — user input</p>
                        )}
                        {f.options.length > 0 ? (
                          <p className="text-[11px] text-muted-foreground">
                            Options ({f.options.length}): {f.options.slice(0, 8).join(', ')}
                            {f.options.length > 8 ? '…' : ''}
                          </p>
                        ) : null}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            Correct mapping:
                          </span>
                          <select
                            className="h-8 rounded-md border bg-background px-2 text-xs flex-1"
                            value={corrections[f.selector] ?? f.canonicalField}
                            onChange={(e) =>
                              setCorrections((prev) => ({
                                ...prev,
                                [f.selector]: e.target.value,
                              }))
                            }
                          >
                            {CANONICAL_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        disabled={review.isPending || Object.keys(corrections).length === 0}
                        onClick={() => review.mutate()}
                      >
                        Save field review
                      </Button>
                      <Button
                        variant="outline"
                        disabled={analyze.isPending}
                        onClick={() =>
                          analyze.mutate({ url: schema.submissionUrl || schema.directoryUrl, force: true })
                        }
                      >
                        Re-analyze for drift
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Submission stays manual — use Assisted Manual / Companion to fill, then
                      submit yourself on the directory site.
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
