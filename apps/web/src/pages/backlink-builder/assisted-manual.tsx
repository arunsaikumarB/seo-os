import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Copy,
  Check,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Ban,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { getApiUrl, getApiErrorMessage } from '@/lib/api';
import { useAppStore } from '@/stores/app-store';
import { PageTransition } from '@/components/demo/page-transition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  flagged?: boolean;
  flagReason?: string | null;
  required?: boolean;
};

type PasteReadyItem = {
  role: string;
  label: string;
  value: string;
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
  formUnavailable?: boolean;
  readerVersion?: number | null;
  classifierVersion?: number | null;
  currentReaderVersion?: number;
  currentClassifierVersion?: number;
  package: {
    gateNotes: string;
    honestyNotes: string[];
    fields: PackageField[];
    otherFields?: Array<{ selector: string; label: string; humanStep: string }>;
    pasteReadyContent?: PasteReadyItem[];
    categoryNote?: string | null;
    multiStep?: boolean;
    multiStepLabel: string | null;
    readerVersion?: number;
    classifierVersion?: number;
    confidenceSummary?: string | null;
    importedEntryUrl?: string | null;
    resolvedFormUrl?: string | null;
    formDiscoverySource?: string | null;
    humanSteps?: string[];
    targetFormSelector?: string | null;
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
  /** Local paste edits — keyed by `${packageId}::${selector}` so edits survive hide/show */
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});

  const fieldKey = (packageId: string, selector: string) => `${packageId}::${selector}`;
  const fieldValue = (packageId: string, f: PackageField) => {
    const key = fieldKey(packageId, f.selector);
    return key in fieldEdits ? fieldEdits[key]! : (f.value ?? '');
  };
  const setFieldValue = (packageId: string, selector: string, value: string) => {
    setFieldEdits((prev) => ({ ...prev, [fieldKey(packageId, selector)]: value }));
  };

  const board = useQuery({
    queryKey: ['assisted-manual', projectId],
    queryFn: () =>
      request<{
        data: {
          honesty: string[];
          pilot: { max: number; used: number; canAdd: boolean };
          counts: {
            assisted: number;
            ready: number;
            checkFields: number;
            needsPerson: number;
            assistedOk?: boolean;
            conservationOk?: boolean;
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
      const doneAndVerified = vars.status === 'done' && vars.userVerified === true;
      toast.success(
        doneAndVerified
          ? 'Marked Submitted & Verified'
          : vars.status === 'done'
            ? 'Marked Submitted'
            : vars.status === 'skipped'
              ? 'Skipped — removed from worklist'
              : vars.userVerified
                ? 'Marked Verified'
                : vars.userVerified === false
                  ? 'Verification cleared'
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

  const reportBad = useMutation({
    mutationFn: (vars: { packageId: string; note?: string }) =>
      request<{
        data: { reportId: string; message: string; fixtureDraft: unknown };
      }>(
        `/v1/projects/${projectId}/backlink-builder/assisted-manual/${vars.packageId}/report-bad`,
        {
          method: 'POST',
          body: JSON.stringify({ note: vars.note }),
        }
      ),
    onSuccess: () => {
      toast.success('Reported — HTML + roles saved as a fixture candidate');
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Report failed')),
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
            Open each prepared package, paste the fields, clear any login/CAPTCHA yourself, and
            submit on the site. Every content-ready site lands here — one manual lane.
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
        <Stat label="Ready" value={d?.counts.ready} />
        <Stat label="Check these fields" value={d?.counts.checkFields} />
        <Stat label="Needs a person" value={d?.counts.needsPerson} />
        <Stat
          label="Conservation"
          value={d?.counts.conservationOk === false ? 'FAIL' : 'ok'}
          warn={d?.counts.conservationOk === false}
        />
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
        <section key={bucket} className="space-y-2">
          <h2 className="text-sm font-medium">
            {BUCKET_LABEL[bucket]}{' '}
            <span className="text-muted-foreground tabular-nums">
              ({byBucket[bucket].length})
            </span>
          </h2>
          {byBucket[bucket].length === 0 ? (
            <p className="text-sm text-muted-foreground pl-1">None yet.</p>
          ) : (
            <ul className="rounded-xl border divide-y overflow-hidden bg-card">
              {byBucket[bucket].map((pkg) => {
                const open = openId === pkg.id;
                const issues = collectPackageIssues(pkg);
                const tone = statusTone(pkg, issues);
                return (
                  <li key={pkg.id} className="bg-card">
                    <div className="flex items-center gap-2 px-3 py-2.5 min-h-11">
                      <IssueStatusIcon tone={tone} issues={issues} domain={pkg.domain} />
                      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{pkg.domain}</span>
                        <Badge className="text-[10px] shrink-0">{BUCKET_LABEL[pkg.bucket]}</Badge>
                        {pkg.package?.multiStep || pkg.package?.multiStepLabel ? (
                          <Badge className="text-[10px] shrink-0 border-amber-500/50 text-amber-800">
                            Multi-step
                          </Badge>
                        ) : null}
                        {pkg.gate && pkg.gate !== 'none' && pkg.gate !== 'multi_step' ? (
                          <Badge className="text-[10px] shrink-0 opacity-80">{pkg.gate}</Badge>
                        ) : null}
                        {pkg.status === 'done' || pkg.submittedAt ? (
                          <Badge className="text-[10px] shrink-0 border-emerald-500/40 text-emerald-700">
                            {pkg.userVerified ? 'Verified' : 'Submitted'}
                          </Badge>
                        ) : null}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 shrink-0 gap-0.5"
                        onClick={() => setOpenId(open ? null : pkg.id)}
                      >
                        {open ? (
                          <>
                            Close <ChevronDown className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            Open <ChevronRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </Button>
                    </div>

                    {open ? (
                      <div className="border-t bg-muted/20 px-3 py-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              window.open(pkg.entryUrl, '_blank', 'noopener,noreferrer')
                            }
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open package
                          </Button>
                          <Button
                            size="sm"
                            disabled={patchStatus.isPending || pkg.status === 'done'}
                            onClick={() => {
                              const mins = Number(minutesDraft);
                              patchStatus.mutate({
                                packageId: pkg.id,
                                status: 'done',
                                minutesSpent:
                                  Number.isFinite(mins) && mins > 0 ? mins : undefined,
                              });
                            }}
                            title="Mark as Submitted"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" /> Done
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={patchStatus.isPending}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Skip ${pkg.domain}? It leaves the Assisted Manual worklist.`
                                )
                              ) {
                                return;
                              }
                              patchStatus.mutate({ packageId: pkg.id, status: 'skipped' });
                            }}
                          >
                            Skip
                          </Button>
                          <input
                            className="h-8 w-16 rounded-md border bg-background px-2 text-xs"
                            placeholder="min"
                            value={minutesDraft}
                            onChange={(e) => setMinutesDraft(e.target.value)}
                            title="Minutes spent"
                          />
                          <PackageMoreMenu
                            pkg={pkg}
                            rereadPending={reread.isPending && reread.variables === pkg.id}
                            clearPending={
                              clearCorrections.isPending &&
                              clearCorrections.variables === pkg.id
                            }
                            reportPending={reportBad.isPending}
                            patchPending={patchStatus.isPending}
                            onReread={() => reread.mutate(pkg.id)}
                            onClear={() => clearCorrections.mutate(pkg.id)}
                            onReport={() => {
                              const note = window.prompt(
                                'What looks wrong? (optional)',
                                ''
                              );
                              if (note === null) return;
                              reportBad.mutate({
                                packageId: pkg.id,
                                note: note.trim() || undefined,
                              });
                            }}
                            onMarkGood={() =>
                              correct.mutate({ packageId: pkg.id, markPackageGood: true })
                            }
                            onDoneVerified={() => {
                              const mins = Number(minutesDraft);
                              patchStatus.mutate({
                                packageId: pkg.id,
                                status: 'done',
                                userVerified: true,
                                minutesSpent:
                                  Number.isFinite(mins) && mins > 0 ? mins : undefined,
                              });
                            }}
                            onToggleVerified={() =>
                              patchStatus.mutate({
                                packageId: pkg.id,
                                userVerified: !pkg.userVerified,
                              })
                            }
                            onStart={() =>
                              patchStatus.mutate({ packageId: pkg.id, status: 'in_progress' })
                            }
                          />
                        </div>

                        {pkg.package?.gateNotes ? (
                          <p className="text-xs text-muted-foreground">{pkg.package.gateNotes}</p>
                        ) : null}
                        {pkg.package?.humanSteps && pkg.package.humanSteps.length > 0 ? (
                          <p className="text-xs text-amber-800">
                            You must: {pkg.package.humanSteps.join(' · ')}
                          </p>
                        ) : null}

                        {pkg.package?.multiStepLabel ? (
                          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-900">
                            <p className="font-medium">{pkg.package.multiStepLabel}</p>
                            <p className="text-xs text-amber-800/90 mt-0.5">
                              Step 1 may only ask for a category — use the paste-ready values below
                              once you reach the content step.
                            </p>
                          </div>
                        ) : null}

                        {pkg.package?.categoryNote ? (
                          <p className="text-xs text-muted-foreground">{pkg.package.categoryNote}</p>
                        ) : null}

                        <div className="space-y-2">
                          {(pkg.package?.fields ?? [])
                            .filter((f) => f.role !== 'category')
                            .map((f) => (
                            <EditableFieldCard
                              key={f.selector}
                              field={f}
                              value={fieldValue(pkg.id, f)}
                              onChange={(v) => setFieldValue(pkg.id, f.selector, v)}
                              onMarkWrong={() =>
                                correct.mutate({ packageId: pkg.id, selector: f.selector })
                              }
                            />
                          ))}
                          {(pkg.package?.pasteReadyContent?.length ?? 0) > 0 ? (
                            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 space-y-2">
                              <p className="text-sm font-medium">
                                Paste-ready for later steps
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Not mapped to fields on this page — copy and paste when the form
                                asks for them.
                              </p>
                              {pkg.package!.pasteReadyContent!.map((item) => (
                                <PasteReadyCard
                                  key={`${pkg.id}-${item.role}`}
                                  item={item}
                                  value={
                                    fieldEdits[fieldKey(pkg.id, `paste:${item.role}`)] ??
                                    item.value
                                  }
                                  onChange={(v) =>
                                    setFieldValue(pkg.id, `paste:${item.role}`, v)
                                  }
                                />
                              ))}
                            </div>
                          ) : null}
                          {(pkg.package?.otherFields ?? []).filter(
                            (o) => !/categor|industry|^type$|topic|niche/i.test(o.label)
                          ).length > 0 ? (
                            <div className="rounded-lg border border-dashed px-3 py-2 text-sm space-y-1">
                              <p className="font-medium">
                                Other fields on this form (fill yourself)
                              </p>
                              <ul className="text-muted-foreground space-y-1">
                                {pkg.package!.otherFields!
                                  .filter(
                                    (o) =>
                                      !/categor|industry|^type$|topic|niche/i.test(o.label)
                                  )
                                  .map((o) => (
                                  <li key={o.selector}>
                                    {o.label} — {o.humanStep}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </PageTransition>
  );
}

function collectPackageIssues(pkg: AssistedPackage): string[] {
  const issues: string[] = [];
  if (pkg.failureReason) issues.push(pkg.failureReason);
  if (pkg.formUnavailable) issues.push('Form unavailable or not found');
  if (pkg.blocked && pkg.blockReason) issues.push(pkg.blockReason);
  if (pkg.fingerprintStatus === 'stale') issues.push('Package expired — re-prepare');
  if (pkg.fingerprintStatus === 'changed') issues.push('Form changed — re-prepare');
  for (const f of pkg.package?.fields ?? []) {
    if (f.flagged && f.flagReason) issues.push(`${f.label || f.role}: ${f.flagReason}`);
    else if (f.flagged) issues.push(`${f.label || f.role}: flagged`);
    else if (f.required && !String(f.value ?? '').trim() && f.role !== 'attachment' && f.role !== 'terms') {
      issues.push(`${f.label || f.role}: content missing`);
    }
    if (f.overLimit) issues.push(`${f.label || f.role}: over character limit`);
  }
  if (pkg.classifierOutdated) {
    issues.push(
      `Reader/classifier outdated (reader v${pkg.readerVersion ?? '?'}→${pkg.currentReaderVersion ?? '?'} · classifier v${pkg.classifierVersion ?? '?'}→${pkg.currentClassifierVersion ?? '?'}) — use ⋯ → Re-read`
    );
  }
  return [...new Set(issues)];
}

function statusTone(
  pkg: AssistedPackage,
  issues: string[]
): 'ok' | 'warn' | 'block' {
  if (
    pkg.formUnavailable ||
    pkg.blocked ||
    /cloudflare|login|captcha|registration|form_unavailable|no form/i.test(
      String(pkg.failureReason ?? '')
    ) ||
    (pkg.bucket === 'needs_person' &&
      (pkg.gate === 'cloudflare' || pkg.gate === 'login' || pkg.gate === 'captcha'))
  ) {
    return 'block';
  }
  if (pkg.status === 'done' || pkg.bucket === 'ready') return 'ok';
  if (pkg.bucket === 'check_fields' || issues.length > 0 || pkg.bucket === 'needs_person') {
    return pkg.bucket === 'needs_person' && issues.length === 0 ? 'block' : 'warn';
  }
  return issues.length ? 'warn' : 'ok';
}

function IssueStatusIcon({
  tone,
  issues,
  domain,
}: {
  tone: 'ok' | 'warn' | 'block';
  issues: string[];
  domain: string;
}) {
  const Icon =
    tone === 'ok' ? CheckCircle2 : tone === 'block' ? Ban : AlertTriangle;
  const color =
    tone === 'ok'
      ? 'text-emerald-600'
      : tone === 'block'
        ? 'text-destructive'
        : 'text-amber-600';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'shrink-0 rounded-md p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            color
          )}
          title={issues.length ? `${issues.length} issue(s)` : 'No issues'}
          aria-label={`Status for ${domain}`}
        >
          <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-sm">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {domain}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {issues.length === 0 ? (
          <DropdownMenuItem disabled className="text-sm opacity-100">
            No issues flagged
          </DropdownMenuItem>
        ) : (
          issues.map((issue) => (
            <DropdownMenuItem
              key={issue}
              disabled
              className="text-sm whitespace-normal leading-snug opacity-100 cursor-default"
            >
              {issue}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PackageMoreMenu(props: {
  pkg: AssistedPackage;
  rereadPending: boolean;
  clearPending: boolean;
  reportPending: boolean;
  patchPending: boolean;
  onReread: () => void;
  onClear: () => void;
  onReport: () => void;
  onMarkGood: () => void;
  onDoneVerified: () => void;
  onToggleVerified: () => void;
  onStart: () => void;
}) {
  const { pkg } = props;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 w-8 px-0" title="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">More</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!pkg.formUnavailable ? (
          <DropdownMenuItem disabled={props.rereadPending} onClick={props.onReread}>
            Re-read form
          </DropdownMenuItem>
        ) : null}
        {!pkg.formUnavailable ? (
          <DropdownMenuItem disabled={props.clearPending} onClick={props.onClear}>
            Clear corrections
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled={props.reportPending} onClick={props.onReport}>
          Report bad package
        </DropdownMenuItem>
        <DropdownMenuItem onClick={props.onMarkGood}>Was this right? Yes</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pkg.fingerprintStatus !== 'fresh' || props.patchPending}
          onClick={props.onStart}
        >
          Start
        </DropdownMenuItem>
        {(pkg.gate === 'none' || !pkg.gate) && pkg.status !== 'done' && !pkg.userVerified ? (
          <DropdownMenuItem disabled={props.patchPending} onClick={props.onDoneVerified}>
            Done & Verified
          </DropdownMenuItem>
        ) : null}
        {pkg.status === 'done' || pkg.submittedAt ? (
          <DropdownMenuItem disabled={props.patchPending} onClick={props.onToggleVerified}>
            {pkg.userVerified ? 'Clear Verified' : 'Mark Verified'}
          </DropdownMenuItem>
        ) : null}
        {pkg.classifierOutdated ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground opacity-100">
              Reader v{pkg.readerVersion ?? '?'}→{pkg.currentReaderVersion ?? '?'} · classifier v
              {pkg.classifierVersion ?? '?'}→{pkg.currentClassifierVersion ?? '?'}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EditableFieldCard(props: {
  field: PackageField;
  value: string;
  onChange: (value: string) => void;
  onMarkWrong: () => void;
}) {
  const { field: f, value, onChange, onMarkWrong } = props;
  const [copied, setCopied] = useState(false);
  const charCount = value.length;
  const overLimit = f.maxlength != null && charCount > f.maxlength;
  const rows = Math.min(12, Math.max(2, value.split('\n').length + (value.length > 120 ? 2 : 0)));

  async function copyValue() {
    const text = value;
    if (!text.trim()) {
      toast.error('Nothing to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`Copied ${f.label || f.role}`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Clipboard unavailable');
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-sm',
        (f.confidence === 'low' || f.confidence === 'medium' || f.flagged) &&
          'border-amber-500/40 bg-amber-500/5',
        (f.overLimit || overLimit) && 'border-destructive/50'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {f.label}{' '}
          <span className="text-muted-foreground font-normal">({f.role})</span>
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {f.flagged ? (
            <Badge className="text-[10px] border-amber-500 text-amber-800">flagged</Badge>
          ) : null}
          <Badge className="text-[10px]">{f.confidence}</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2"
            onClick={() => void copyValue()}
            title="Copy field value"
            disabled={!value.trim()}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>
      </div>
      {f.flagReason ? (
        <p className="text-xs text-amber-800 mt-1 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {f.flagReason}
        </p>
      ) : null}
      <textarea
        className={cn(
          'mt-2 w-full rounded-md border bg-background px-2.5 py-2 text-sm leading-relaxed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          overLimit && 'border-destructive'
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck
        aria-label={`${f.label || f.role} value`}
      />
      <p
        className={cn(
          'text-[11px] text-muted-foreground mt-1 tabular-nums',
          overLimit && 'text-destructive'
        )}
      >
        {charCount}
        {f.maxlength != null ? ` / ${f.maxlength}` : ''} chars
      </p>
      {f.humanStep ? (
        <p className="text-xs mt-1 text-amber-800 font-medium">{f.humanStep}</p>
      ) : null}
      {!value.trim() && f.humanStep?.toLowerCase().includes('you fill') ? (
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Empty on purpose — supply this value on the site.
        </p>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 mt-1 text-xs"
        onClick={onMarkWrong}
        title="Clear this mapping and re-infer on next read (does not pin as a correction)"
      >
        Mark field wrong
      </Button>
    </div>
  );
}

function PasteReadyCard({
  item,
  value,
  onChange,
}: {
  item: PasteReadyItem;
  value: string;
  onChange: (v: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const rows = item.role === 'long_desc' ? 4 : item.role === 'short_desc' ? 3 : 2;

  async function copyValue() {
    if (!value.trim()) {
      toast.error('Nothing to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`Copied ${item.label}`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Clipboard unavailable');
    }
  }

  return (
    <div className="rounded-md border bg-background px-2.5 py-2 text-sm space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-xs">
          {item.label}{' '}
          <span className="text-muted-foreground font-normal">({item.role})</span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2"
          onClick={() => void copyValue()}
          disabled={!value.trim()}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
      <textarea
        className="w-full rounded-md border bg-background px-2.5 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck
        aria-label={`${item.label} paste-ready value`}
      />
    </div>
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
