import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Download,
  ExternalLink,
  Ban,
  SkipForward,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import {
  useInterventions,
  type InterventionItem,
} from '@/components/browser/needs-your-action-queue';
import {
  openAllInterventionWindows,
  openInterventionWindow,
} from '@/lib/intervention-window';

function formatWait(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

type Props = {
  projectId: string;
};

/**
 * Dedicated Human Intervention Queue — optional human tasks.
 * Never blocks the automatic AI submission pipeline.
 */
export function HumanInterventionQueue({ projectId }: Props) {
  const { request } = useApi();
  const qc = useQueryClient();
  const interventions = useInterventions(projectId, 2_500);
  const items = interventions.data?.data.items ?? [];
  const verifiedItems = items.filter((i) => !i.unclassified);
  const unclassifiedItems = items.filter((i) => i.unclassified);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-opportunities', projectId] });
    qc.invalidateQueries({ queryKey: ['execution-state', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-execution-progress', projectId] });
    qc.invalidateQueries({ queryKey: ['backlink-pending', projectId] });
  };

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.jobId));
  const selectedIds = useMemo(() => [...selected], [selected]);

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.jobId)));
  };

  const toggle = (jobId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const bulk = useMutation({
    mutationFn: (action: 'skip' | 'delete_forever' | 'retry' | 'unsupported') =>
      request<{ data: { ok: number; failed: number } }>(
        `/v1/projects/${projectId}/browser/interventions/bulk`,
        {
          method: 'POST',
          body: JSON.stringify({ jobIds: selectedIds, action }),
        }
      ),
    onSuccess: (res, action) => {
      const labels: Record<string, string> = {
        skip: 'Skipped',
        delete_forever: 'Deleted forever',
        retry: 'Retrying',
        unsupported: 'Marked unsupported',
      };
      toast.success(`${labels[action] ?? action}: ${res.data.ok} site(s)`);
      setSelected(new Set());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportList = () => {
    const rows = (selectedIds.length ? items.filter((i) => selected.has(i.jobId)) : items).map(
      (i) => ({
        website: i.website,
        reason: i.reason,
        currentUrl: i.currentUrl ?? i.pausedUrl ?? '',
        detectedStep: i.detectedStep ?? i.currentStep ?? '',
        timeWaitingMs: i.timeWaitingMs ?? i.elapsedMs,
        gate: i.gate,
        jobId: i.jobId,
      })
    );
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `human-intervention-${projectId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} site(s)`);
  };

  if (items.length === 0) return null;

  return (
    <Card className="rounded-2xl border-amber-500/30 bg-amber-500/[0.04]">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-base">Human Intervention Queue</CardTitle>
            <CardDescription>
              Optional tasks — Login, CAPTCHA, approval, and verification. AI submissions keep
              running.
            </CardDescription>
          </div>
          <Badge className="bg-amber-500/15 text-amber-900 w-fit">{items.length} waiting</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={toggleAll}>
            {allSelected ? 'Clear selection' : 'Select All'}
          </Button>
          <Button
            size="sm"
            disabled={selectedIds.length === 0}
            onClick={() => openAllInterventionWindows(projectId, selectedIds)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Open Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.length === 0 || bulk.isPending}
            onClick={() => bulk.mutate('skip')}
          >
            <SkipForward className="h-3.5 w-3.5 mr-1" />
            Skip Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.length === 0 || bulk.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  'Delete forever? These domains will be added to the Global Ignore List for all future projects.'
                )
              ) {
                return;
              }
              bulk.mutate('delete_forever');
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete Selected Forever
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.length === 0 || bulk.isPending}
            onClick={() => bulk.mutate('retry')}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Retry Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.length === 0 || bulk.isPending}
            onClick={() => bulk.mutate('unsupported')}
          >
            <Ban className="h-3.5 w-3.5 mr-1" />
            Mark Unsupported
          </Button>
          <Button size="sm" variant="ghost" onClick={exportList}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Export List
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border bg-background/80">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all interventions"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2 font-medium">Website</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Signals</th>
                <th className="px-3 py-2 font-medium">Current URL</th>
                <th className="px-3 py-2 font-medium">Detected Step</th>
                <th className="px-3 py-2 font-medium">Time Waiting</th>
                <th className="px-3 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {verifiedItems.map((item: InterventionItem) => (
                <tr key={item.jobId} className="border-t">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.website}`}
                      checked={selected.has(item.jobId)}
                      onChange={() => toggle(item.jobId)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{item.website}</td>
                  <td className="px-3 py-2">
                    <span className="text-amber-800 dark:text-amber-200 text-xs">
                      {item.reason}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[160px]">
                    <span className="text-[11px] text-muted-foreground break-all line-clamp-2">
                      {(item.matchedSignals ?? []).slice(0, 4).join(', ') || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[220px]">
                    <span className="text-xs text-muted-foreground break-all line-clamp-2">
                      {item.currentUrl || item.pausedUrl || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {item.detectedStep || item.currentStep || item.stage || '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs">
                    {formatWait(item.timeWaitingMs ?? item.elapsedMs)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      onClick={() => openInterventionWindow(projectId, item.jobId)}
                    >
                      Complete
                    </Button>
                  </td>
                </tr>
              ))}
              {unclassifiedItems.length > 0 ? (
                <tr className="border-t bg-muted/30">
                  <td colSpan={8} className="px-3 py-2 text-xs font-medium text-muted-foreground">
                    Unclassified — needs diagnosis ({unclassifiedItems.length}) — the system could
                    not determine what is blocking these
                  </td>
                </tr>
              ) : null}
              {unclassifiedItems.map((item: InterventionItem) => (
                <tr key={item.jobId} className="border-t">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.website}`}
                      checked={selected.has(item.jobId)}
                      onChange={() => toggle(item.jobId)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{item.website}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-muted-foreground">{item.reason}</span>
                  </td>
                  <td className="px-3 py-2 max-w-[160px]">
                    <span className="text-[11px] text-muted-foreground break-all line-clamp-2">
                      {(item.matchedSignals ?? []).slice(0, 4).join(', ') || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[220px]">
                    <span className="text-xs text-muted-foreground break-all line-clamp-2">
                      {item.currentUrl || item.pausedUrl || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {item.detectedStep || item.currentStep || item.stage || '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs">
                    {formatWait(item.timeWaitingMs ?? item.elapsedMs)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      onClick={() => openInterventionWindow(projectId, item.jobId)}
                    >
                      Complete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Skip = this campaign only. Delete Forever = Global Ignore List for all future projects.
          Verified interventions only (evidence required).
        </p>
      </CardContent>
    </Card>
  );
}
