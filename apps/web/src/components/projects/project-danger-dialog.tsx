import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

export type ProjectDangerMode = 'archive' | 'reset' | 'delete';

type Impact = {
  workspaceId: string;
  totalRecords: number;
  categories: Record<string, number>;
  byTable: Record<string, number>;
};

const CATEGORY_LABELS: Record<string, string> = {
  imported_urls: 'Imported URLs',
  ai_analysis: 'AI Analysis',
  opportunity_queue: 'Opportunity Queue',
  content_packs: 'Content Packs',
  image_assets: 'Image Assets',
  video_assets: 'Video Assets',
  submission_queue: 'Submission Queue',
  browser_executions: 'Browser Executions',
  reports: 'Reports',
  verification_history: 'Verification History',
  ai_learning: 'AI Learning',
  campaigns: 'Campaigns',
  other: 'Other records',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ProjectDangerMode;
  projectId: string;
  projectName: string;
  onConfirm: (opts: { clearAiLearning?: boolean }) => Promise<void>;
  pending?: boolean;
};

export function ProjectDangerDialog({
  open,
  onOpenChange,
  mode,
  projectId,
  projectName,
  onConfirm,
  pending,
}: Props) {
  const { request } = useApi();
  const [typed, setTyped] = useState('');
  const [clearAiLearning, setClearAiLearning] = useState(false);

  useEffect(() => {
    if (!open) {
      setTyped('');
      setClearAiLearning(false);
    }
  }, [open, mode]);

  const needsImpact = mode === 'reset' || mode === 'delete';
  const impact = useQuery({
    queryKey: ['project-impact', projectId],
    queryFn: () => request<{ data: Impact }>(`/v1/projects/${projectId}/impact`),
    enabled: open && needsImpact && !!projectId,
  });

  const confirmWord = mode === 'delete' ? 'DELETE' : mode === 'reset' ? 'RESET' : '';
  const canConfirm =
    mode === 'archive'
      ? true
      : typed.trim().toUpperCase() === confirmWord && !impact.isLoading;

  const title =
    mode === 'archive'
      ? 'Archive project'
      : mode === 'reset'
        ? 'Reset project'
        : 'Delete project';

  const description =
    mode === 'archive'
      ? `${projectName} will be hidden from active projects and become read-only. You can restore it later.`
      : mode === 'reset'
        ? `${projectName} will keep settings, providers, and business profile — operational data below will be permanently removed.`
        : `${projectName} and all related child records will be permanently deleted. This cannot be undone.`;

  const totalRemoved = useMemo(() => {
    const total = impact.data?.data.totalRecords ?? 0;
    return mode === 'delete' ? total + 1 : total;
  }, [impact.data?.data.totalRecords, mode]);

  const categories = impact.data?.data.categories ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {needsImpact && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">
              Records that will be removed:{' '}
              <span className="tabular-nums text-destructive">
                {impact.isLoading ? '…' : totalRemoved.toLocaleString()}
              </span>
            </p>
            {impact.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <ul className="grid max-h-48 gap-1 overflow-y-auto text-xs text-muted-foreground sm:grid-cols-2">
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                  const n = Number(categories[key] ?? 0);
                  if (!n && key !== 'video_assets') return null;
                  return (
                    <li key={key} className="flex justify-between gap-2">
                      <span>{label}</span>
                      <span className="tabular-nums font-medium text-foreground">{n}</span>
                    </li>
                  );
                })}
                {mode === 'delete' && (
                  <li className="flex justify-between gap-2 sm:col-span-2">
                    <span>Project workspace row</span>
                    <span className="tabular-nums font-medium text-foreground">1</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        {mode === 'reset' && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={clearAiLearning}
              onChange={(e) => setClearAiLearning(e.target.checked)}
            />
            <span>
              Also clear AI learning (memory, image learning, selector memory, learned submission
              patterns)
            </span>
          </label>
        )}

        {confirmWord && (
          <div className="space-y-1">
            <Label htmlFor="danger-confirm">
              Type <span className="font-mono font-semibold">{confirmWord}</span> to confirm
            </Label>
            <Input
              id="danger-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
              autoComplete="off"
              className="font-mono"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className="text-destructive border-destructive/40"
            disabled={!canConfirm || pending}
            onClick={() => onConfirm({ clearAiLearning })}
          >
            {pending
              ? 'Working…'
              : mode === 'archive'
                ? 'Archive'
                : mode === 'reset'
                  ? 'Reset project'
                  : 'Delete forever'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
