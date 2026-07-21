import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PartyPopper } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkflow } from '@/hooks/use-workflow';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';

interface WorkflowCelebrationProps {
  projectId: string;
}

export function WorkflowCelebration({ projectId }: WorkflowCelebrationProps) {
  const { allComplete, jobsOpen, continueHref } = useWorkflow(projectId);
  const { request } = useApi();

  const summary = useQuery({
    queryKey: ['celebration-summary', projectId],
    queryFn: () =>
      request<{ data: Record<string, unknown> }>(
        `/v1/projects/${projectId}/backlink-builder/summary`
      ).catch(() => ({ data: {} })),
    enabled: !!projectId && allComplete && !jobsOpen,
    retry: false,
  });

  if (!allComplete || jobsOpen) return null;

  const s = (summary.data?.data ?? {}) as Record<string, unknown>;
  const num = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : 0);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mb-6"
    >
      <Card className="border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-primary/5 to-emerald-500/10">
        <CardContent className="py-6 space-y-4">
          <div className="flex items-start gap-3">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 2.5 }}
            >
              <PartyPopper className="h-8 w-8 text-emerald-500" />
            </motion.div>
            <div>
              <h2 className="text-lg font-semibold">Campaign Completed</h2>
              <p className="text-sm text-muted-foreground mt-1">
                AI submitted{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {num('submitted') || 'your'}
                </span>{' '}
                backlinks
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {(
              [
                ['Approved', num('approved') || num('verified')],
                ['Pending', num('pending')],
                ['Verified', num('verified') || num('won')],
                ['Traffic estimate', String(s.estimatedTraffic ?? '—')],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-background/60 px-3 py-2 border border-border/40">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={continueHref}>Download Report</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/projects/${projectId}/home`}>Continue</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
