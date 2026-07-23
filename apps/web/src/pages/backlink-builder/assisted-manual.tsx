import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Download, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { getApiUrl, getApiErrorMessage } from '@/lib/api';
import { useAppStore } from '@/stores/app-store';
import { PageTransition } from '@/components/demo/page-transition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type PackageField = {
  selector: string;
  role: string;
  label: string;
  value: string;
  charCount: number;
  maxlength: number | null;
  confidence: 'high' | 'medium' | 'low';
  recommendedOption?: string | null;
  options?: string[];
  humanStep?: string | null;
  overLimit?: boolean;
};

type AssistedPackage = {
  id: string;
  opportunityId: string;
  domain: string;
  entryUrl: string;
  bucket: 'ready' | 'check_fields' | 'needs_person';
  status: string;
  gate: string;
  fingerprintStatus: string;
  preparedAt: string;
  correctionCount: number;
  minutesSpent: number | null;
  failureReason: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  userVerified?: boolean;
  classifierOutdated?: boolean;
  readerVersion?: number | null;
  classifierVersion?: number | null;
  currentReaderVersion?: number;
  currentClassifierVersion?: number;
  package: {
    gateNotes: string;
    honestyNotes: string[];
    fields: PackageField[];
    multiStepLabel: string | null;
    readerVersion?: number;
    classifierVersion?: number;
  };
  blocked?: boolean;
  blockReason?: string;
};

const BUCKET_LABEL: Record<string, string> = {
  ready: 'Ready',
  check_fields: 'Check these fields',
  needs_person: 'Needs a person',
};

export function AssistedManualPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { getAccessToken } = useAuth();
  const orgId = useAppStore((s) => s.currentOrgId);
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [minutesDraft, setMinutesDraft] = useState('');

  const board = useQuery({
    queryKey: ['assisted-manual', projectId],
    queryFn: () =>
      request<{
        data: {
          honesty: string[];
          pilot: { max: number; used: number; canAdd: boolean };
          counts: {
            automatable: number;
            assisted: number;
            manual: number;
            ready: number;
            checkFields: number;
            needsPerson: number;
            conservationOk: boolean;
          };
          packages: AssistedPackage[];
        };
      }>(`/v1/projects/${projectId}/backlink-builder/assisted-manual`),
    enabled: !!projectId,
  });

  const metrics = useQuery({
    queryKey: ['assisted-manual-metrics', projectId],
    queryFn: () =>
      request<{
        data: {
          medianMinutesPerSite: number | null;
          correctionRate: number | null;
          bucketMix: { ready: number; checkFields: number; needsPerson: number };
          rejectionRate: number | null;
          goNoGo: { medianOk: boolean; correctionOk: boolean };
        };
      }>(`/v1/projects/${projectId}/backlink-builder/assisted-manual/metrics`),
    enabled: !!projectId,
  });

  const prepare = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/backlink-builder/assisted-manual/prepare`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success('Packages prepared for content-ready sites');
      void qc.invalidateQueries({ queryKey: ['assisted-manual', projectId] });
      void qc.invalidateQueries({ queryKey: ['manual-submissions', projectId] });
      void qc.invalidateQueries({ queryKey: ['assisted-manual-metrics', projectId] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Prepare failed')),
  });

  const patchStatus = useMutation({
    mutationFn: (body: {
      packageId: string;
      status?: string;
      minutesSpent?: number;
      rejectedAtSubmit?: boolean;
      userVerified?: boolean;
    }) =>
      request(`/v1/projects/${projectId}/backlink-builder/assisted-manual/${body.packageId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: body.status,
          minutesSpent: body.minutesSpent,
          rejectedAtSubmit: body.rejectedAtSubmit,
          userVerified: body.userVerified,
        }),
      }),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.status === 'done'
          ? 'Marked Submitted'
          : vars.userVerified
            ? 'Marked Verified'
            : 'Updated'
      );
      void qc.invalidateQueries({ queryKey: ['assisted-manual', projectId] });
      void qc.invalidateQueries({ queryKey: ['assisted-manual-metrics', projectId] });
      void qc.invalidateQueries({ queryKey: ['execution-summary', projectId] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Update failed')),
  });

  const correct = useMutation({
    mutationFn: (body: {
      packageId: string;
      selector?: string;
      markPackageGood?: boolean;
    }) =>
      request(
        `/v1/projects/${projectId}/backlink-builder/assisted-manual/${body.packageId}/correct`,
        {
          method: 'POST',
          body: JSON.stringify({
            selector: body.selector,
            markPackageGood: body.markPackageGood,
          }),
        }
      ),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.markPackageGood
          ? 'Marked good'
          : vars.selector
            ? 'Marked wrong — will re-infer on next read'
            : 'Saved'
      );
      void qc.invalidateQueries({ queryKey: ['assisted-manual', projectId] });
      void qc.invalidateQueries({ queryKey: ['assisted-manual-metrics', projectId] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Correction failed')),
  });

  const clearCorrections = useMutation({
    mutationFn: (packageId: string) =>
      request<{ data: AssistedPackage }>(
        `/v1/projects/${projectId}/backlink-builder/assisted-manual/${packageId}/clear-corrections`,
        { method: 'POST' }
      ),
    onSuccess: (res) => {
      const reason = res.data?.failureReason;
      if (reason?.includes('Re-read failed')) {
        toast.error(reason);
      } else {
        toast.success('Corrections cleared; form re-read');
      }
      void qc.invalidateQueries({ queryKey: ['assisted-manual', projectId] });
      void qc.invalidateQueries({ queryKey: ['assisted-manual-metrics', projectId] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Clear corrections failed')),
  });

  const reread = useMutation({
    mutationFn: (packageId: string) =>
      request<{ data: AssistedPackage }>(
        `/v1/projects/${projectId}/backlink-builder/assisted-manual/${packageId}/reread`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      ),
    onSuccess: (res) => {
      const reason = res.data?.failureReason;
      if (reason?.includes('Re-read failed')) {
        toast.error(reason);
      } else {
        toast.success('Form re-read — roles refreshed');
      }
      void qc.invalidateQueries({ queryKey: ['assisted-manual', projectId] });
      void qc.invalidateQueries({ queryKey: ['assisted-manual-metrics', projectId] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Re-read failed')),
  });

  async function downloadExcel() {
    const token = await getAccessToken();
    const res = await fetch(
      `${getApiUrl()}/v1/projects/${projectId}/reports/assisted-manual.xlsx`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(orgId ? { 'X-Org-Id': orgId } : {}),
        },
      }
    );
    if (!res.ok) {
      toast.error('Excel export failed');
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'assisted-manual-packages.xlsx';
    a.click();
  }

  const d = board.data?.data;
  const packages = d?.packages ?? [];
  const byBucket = {
    ready: packages.filter((p) => p.bucket === 'ready'),
    check_fields: packages.filter((p) => p.bucket === 'check_fields'),
    needs_person: packages.filter((p) => p.bucket === 'needs_person'),
  };

  return (
    <PageTransition className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> Assisted Manual
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Every site with generated content gets a prepared package. Open each link, paste the
            fields, clear login/CAPTCHA yourself, and submit. Auto-publish stays off.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => prepare.mutate()} disabled={prepare.isPending}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', prepare.isPending && 'animate-spin')} />
            Prepare all content-ready sites
          </Button>
          <Button size="sm" variant="outline" onClick={() => void downloadExcel()}>
            <Download className="h-3.5 w-3.5 mr-1" /> Excel
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/execution`}>Submit queue</Link>
          </Button>
        </div>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What this lane does not do</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            {(d?.honesty ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4 text-sm">
        <Stat label="Automatable" value={d?.counts.automatable} />
        <Stat label="Assisted Manual" value={d?.counts.assisted} />
        <Stat label="Manual (offline)" value={d?.counts.manual} />
        <Stat
          label="Conservation"
          value={d?.counts.conservationOk ? 'OK' : 'Check'}
          warn={d != null && !d.counts.conservationOk}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <Stat label="Ready" value={d?.counts.ready} />
        <Stat label="Check these fields" value={d?.counts.checkFields} />
        <Stat label="Needs a person" value={d?.counts.needsPerson} />
      </div>

      {metrics.data?.data ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pilot metrics (§9)</CardTitle>
            <CardDescription>
              Median minutes · correction rate · bucket mix — decide scale-up on these numbers.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-4 text-sm">
            <p>
              Median min/site:{' '}
              <span className="font-semibold tabular-nums">
                {metrics.data.data.medianMinutesPerSite ?? '—'}
              </span>{' '}
              <span className="text-muted-foreground">(target ≤4)</span>
            </p>
            <p>
              Correction rate:{' '}
              <span className="font-semibold tabular-nums">
                {metrics.data.data.correctionRate != null
                  ? `${Math.round(metrics.data.data.correctionRate * 100)}%`
                  : '—'}
              </span>{' '}
              <span className="text-muted-foreground">(target ≤20%)</span>
            </p>
            <p>
              Rejected at submit:{' '}
              <span className="font-semibold tabular-nums">
                {metrics.data.data.rejectionRate != null
                  ? `${Math.round(metrics.data.data.rejectionRate * 100)}%`
                  : '—'}
              </span>
            </p>
            <p className="text-muted-foreground">
              Log minutes on Done to unlock median.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {(['ready', 'check_fields', 'needs_person'] as const).map((bucket) => (
        <section key={bucket} className="space-y-3">
          <h2 className="text-sm font-medium">
            {BUCKET_LABEL[bucket]}{' '}
            <span className="text-muted-foreground tabular-nums">
              ({byBucket[bucket].length})
            </span>
          </h2>
          {byBucket[bucket].length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            byBucket[bucket].map((pkg) => {
              const open = openId === pkg.id;
              return (
                <Card key={pkg.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{pkg.domain}</CardTitle>
                        <CardDescription className="mt-1 break-all">
                          <a
                            href={pkg.entryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-2 hover:underline"
                          >
                            {pkg.entryUrl}
                          </a>
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge>{pkg.status}</Badge>
                        <Badge>{pkg.gate}</Badge>
                        <Badge
                          className={cn(
                            pkg.fingerprintStatus !== 'fresh' && 'border-amber-500 text-amber-700'
                          )}
                        >
                          {pkg.fingerprintStatus}
                        </Badge>
                      </div>
                    </div>
                    {pkg.failureReason ? (
                      <p className="text-xs text-amber-700 flex items-center gap-1 mt-2">
                        <AlertTriangle className="h-3.5 w-3.5" /> {pkg.failureReason}
                      </p>
                    ) : null}
                    {pkg.classifierOutdated ? (
                      <p className="text-xs text-amber-700 flex items-center gap-1 mt-2">
                        <AlertTriangle className="h-3.5 w-3.5" /> Classifier updated — Re-read form
                        to refresh field roles
                        {pkg.classifierVersion != null || pkg.currentClassifierVersion != null
                          ? ` (package v${pkg.classifierVersion ?? '?'} / current v${pkg.currentClassifierVersion ?? '?'})`
                          : ''}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground mt-1">{pkg.package?.gateNotes}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setOpenId(open ? null : pkg.id)}>
                        {open ? 'Hide fields' : 'Open package'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reread.isPending}
                        onClick={() => reread.mutate(pkg.id)}
                        title="Fetch the live form again and re-classify. Confirmed role replacements are kept; known-bad fields re-infer."
                      >
                        <RefreshCw
                          className={cn(
                            'h-3.5 w-3.5 mr-1',
                            reread.isPending && reread.variables === pkg.id && 'animate-spin'
                          )}
                        />
                        Re-read form (ignore cache)
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={clearCorrections.isPending}
                        onClick={() => clearCorrections.mutate(pkg.id)}
                        title="Remove all pinned human corrections for this site and re-read the form"
                      >
                        Clear corrections for this site
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pkg.fingerprintStatus !== 'fresh'}
                        onClick={() =>
                          patchStatus.mutate({ packageId: pkg.id, status: 'in_progress' })
                        }
                      >
                        Start
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const mins = Number(minutesDraft);
                          patchStatus.mutate({
                            packageId: pkg.id,
                            status: 'done',
                            minutesSpent: Number.isFinite(mins) && mins > 0 ? mins : undefined,
                          });
                        }}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Done
                      </Button>
                      {pkg.status === 'done' || pkg.submittedAt ? (
                        <Button
                          size="sm"
                          variant={pkg.userVerified ? 'secondary' : 'outline'}
                          disabled={patchStatus.isPending}
                          onClick={() =>
                            patchStatus.mutate({
                              packageId: pkg.id,
                              userVerified: !pkg.userVerified,
                            })
                          }
                          title="Tick after email confirmation / listing goes live"
                        >
                          {pkg.userVerified ? 'Verified ✓' : 'Mark Verified'}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          correct.mutate({ packageId: pkg.id, markPackageGood: true })
                        }
                      >
                        Was this right? Yes
                      </Button>
                      <input
                        className="h-8 w-20 rounded-md border bg-background px-2 text-xs"
                        placeholder="min"
                        value={openId === pkg.id ? minutesDraft : ''}
                        onChange={(e) => {
                          setOpenId(pkg.id);
                          setMinutesDraft(e.target.value);
                        }}
                        title="Minutes spent (pilot metric)"
                      />
                    </div>

                    {open ? (
                      <div className="space-y-2 border-t pt-3">
                        {(pkg.package?.fields ?? []).map((f) => (
                          <div
                            key={f.selector}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-sm',
                              (f.confidence === 'low' || f.confidence === 'medium') &&
                                'border-amber-500/40 bg-amber-500/5',
                              f.overLimit && 'border-destructive/50'
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium">
                                {f.label}{' '}
                                <span className="text-muted-foreground font-normal">
                                  ({f.role})
                                </span>
                              </p>
                              <Badge className="text-[10px]">
                                {f.confidence}
                              </Badge>
                            </div>
                            {f.value ? (
                              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                                {f.value}
                              </p>
                            ) : null}
                            <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                              {f.charCount}
                              {f.maxlength != null ? ` / ${f.maxlength}` : ''} chars
                              {f.recommendedOption
                                ? ` · Category: [${f.recommendedOption}] ← recommended · ${(f.options?.length ?? 1) - 1} other options`
                                : ''}
                            </p>
                            {f.humanStep ? (
                              <p className="text-xs mt-1">{f.humanStep}</p>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 mt-1 text-xs"
                              onClick={() =>
                                correct.mutate({ packageId: pkg.id, selector: f.selector })
                              }
                              title="Clear this mapping and re-infer on next read (does not pin as a correction)"
                            >
                              Mark field wrong
                            </Button>
                          </div>
                        ))}
                        {pkg.package?.multiStepLabel ? (
                          <p className="text-sm text-amber-700">{pkg.package.multiStepLabel}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>
      ))}
    </PageTransition>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number | string | undefined;
  warn?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border px-3 py-2', warn && 'border-amber-500/50')}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value ?? '—'}</p>
    </div>
  );
}
