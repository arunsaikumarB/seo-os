import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import {
  Upload,
  Bot,
  CheckCircle,
  Clock,
  FileText,
  Send,
  ShieldCheck,
  XCircle,
  ArrowRight,
  Zap,
} from 'lucide-react';
import type { AutomationSummary } from './types';

interface AutomationWidgetProps {
  summary?: AutomationSummary;
  projectId: string;
}

export function AutomationWidget({ summary, projectId }: AutomationWidgetProps) {
  const data = summary ?? {
    importedWebsites: 0,
    totalImports: 0,
    analyzedWebsites: 0,
    qualifiedOpportunities: 0,
    contentGenerated: 0,
    pendingApproval: 0,
    submitted: 0,
    published: 0,
    verified: 0,
    rejected: 0,
    waiting: 0,
    accepted: 0,
    disclaimer: '',
  };

  const base = `/projects/${projectId}/backlink-builder`;
  const metrics = [
    { label: 'Imported', value: data.importedWebsites, icon: Upload },
    { label: 'Analyzed', value: data.analyzedWebsites, icon: Bot },
    { label: 'Qualified', value: data.qualifiedOpportunities, icon: CheckCircle },
    { label: 'Content Generated', value: data.contentGenerated, icon: FileText },
    { label: 'Pending Approval', value: data.pendingApproval, icon: Clock },
    { label: 'Submitted', value: data.submitted, icon: Send },
    { label: 'Published', value: data.published, icon: Zap },
    { label: 'Verified', value: data.verified, icon: ShieldCheck },
    { label: 'Rejected', value: data.rejected, icon: XCircle },
  ];

  const activeRun = data.recentRuns?.[0];
  const progress = activeRun?.progress ?? (data.analyzedWebsites > 0 ? 100 : 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-violet-500" /> Automation Engine
              </CardTitle>
              <CardDescription className="mt-1">
                Import → Analyze → Classify → Generate → Track → Verify
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link to={`${base}/import`}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> Import
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link to={`${base}/automation`}>
                  Pipeline <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Pipeline progress</span>
              <span>{progress}%</span>
            </div>
            <ProgressBarLabel label="Pipeline progress" value={progress} />
          </div>

          <StaggerGrid className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            {metrics.map((m) => (
              <StaggerItem key={m.label}>
                <div className="rounded-md border bg-card/50 p-2 text-center">
                  <m.icon className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-semibold tabular-nums">
                    <AnimatedCounter value={m.value} />
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-tight">{m.label}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGrid>

          {activeRun && activeRun.status === 'running' && (
            <div className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400">
              <Badge className="text-[9px] animate-pulse">Live</Badge>
              Running: {String(activeRun.current_step).replace(/_/g, ' ')}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground italic border-t pt-2">
            {data.disclaimer ||
              'Automates preparation and tracking. Third-party websites control publication — backlinks are never guaranteed.'}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
