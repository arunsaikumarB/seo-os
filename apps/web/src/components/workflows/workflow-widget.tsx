import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import {
  Workflow,
  Play,
  ListChecks,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Activity,
  ArrowRight,
} from 'lucide-react';

export type WorkflowSummary = {
  runningWorkflows: number;
  queuedJobs: number;
  completedToday: number;
  failedJobs: number;
  pendingApprovals: number;
  workflowHealth: string;
  automationSuccessRate: number;
  activeDefinitions?: number;
  agent?: string;
  disclaimer?: string;
};

interface WorkflowWidgetProps {
  summary?: WorkflowSummary;
  projectId: string;
}

export function WorkflowWidget({ summary, projectId }: WorkflowWidgetProps) {
  const data = summary ?? {
    runningWorkflows: 0,
    queuedJobs: 0,
    completedToday: 0,
    failedJobs: 0,
    pendingApprovals: 0,
    workflowHealth: 'unknown',
    automationSuccessRate: 0,
  };

  const base = `/projects/${projectId}/workflows`;
  const healthColor =
    data.workflowHealth === 'healthy'
      ? 'border-primary/30 text-primary'
      : data.workflowHealth === 'attention'
        ? 'border-amber-500/30 text-amber-600'
        : 'border-muted-foreground/30 text-muted-foreground';

  const metrics = [
    { label: 'Running', value: data.runningWorkflows, icon: Play },
    { label: 'Queued', value: data.queuedJobs, icon: ListChecks },
    { label: 'Completed Today', value: data.completedToday, icon: CheckCircle2 },
    { label: 'Failed', value: data.failedJobs, icon: XCircle },
    { label: 'Pending Approvals', value: data.pendingApprovals, icon: ShieldCheck },
    { label: 'Success Rate', value: data.automationSuccessRate, icon: Activity, suffix: '%' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Workflow className="h-5 w-5 text-sky-500" /> Workflow Automation
              </CardTitle>
              <CardDescription className="mt-1">
                Orchestrate SEO modules with human approval gates
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link to={`${base}/templates`}>Templates</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to={base}>
                  Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Workflow Health</span>
            <Badge className={healthColor}>{data.workflowHealth}</Badge>
          </div>
          <ProgressBarLabel label="Automation success rate" value={data.automationSuccessRate} />
          <StaggerGrid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {metrics.map((m) => (
              <StaggerItem key={m.label}>
                <div className="rounded-md border bg-card/50 p-2 text-center">
                  <m.icon className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-semibold tabular-nums">
                    <AnimatedCounter value={m.value} />
                    {m.suffix ?? ''}
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-tight">{m.label}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGrid>
          {data.disclaimer && (
            <p className="text-[11px] text-muted-foreground">{data.disclaimer}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
