import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { Mail, Reply, Eye, Clock, Inbox, Sparkles, ArrowRight } from 'lucide-react';

export type OutreachSummary = {
  emailsSent: number;
  replies: number;
  openRate: number;
  replyRate: number;
  pendingFollowUps: number;
  inboxHealth: string;
  aiDraftQueue: number;
  disclaimer?: string;
};

interface OutreachWidgetProps {
  summary?: OutreachSummary;
  projectId: string;
}

export function OutreachWidget({ summary, projectId }: OutreachWidgetProps) {
  const data = summary ?? {
    emailsSent: 0,
    replies: 0,
    openRate: 0,
    replyRate: 0,
    pendingFollowUps: 0,
    inboxHealth: 'unknown',
    aiDraftQueue: 0,
  };

  const base = `/projects/${projectId}/outreach`;
  const healthColor =
    data.inboxHealth === 'good'
      ? 'border-primary/30 text-primary'
      : data.inboxHealth === 'fair'
        ? 'border-amber-500/30 text-amber-600'
        : 'border-muted-foreground/30 text-muted-foreground';

  const metrics = [
    { label: 'Emails Sent', value: data.emailsSent, icon: Mail },
    { label: 'Replies', value: data.replies, icon: Reply },
    { label: 'Open Rate', value: data.openRate, icon: Eye, suffix: '%' },
    { label: 'Reply Rate', value: data.replyRate, icon: Reply, suffix: '%' },
    { label: 'Pending Follow-ups', value: data.pendingFollowUps, icon: Clock },
    { label: 'AI Draft Queue', value: data.aiDraftQueue, icon: Sparkles },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5 text-emerald-500" /> Outreach & Execution
              </CardTitle>
              <CardDescription className="mt-1">
                Compose, approve, and send — humans stay in control
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link to={`${base}/studio`}>Studio</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to={`${base}/inbox`}>
                  Inbox <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Inbox className="h-3.5 w-3.5" /> Inbox Health
            </span>
            <Badge className={healthColor}>{data.inboxHealth}</Badge>
          </div>
          <ProgressBarLabel label="Reply rate" value={data.replyRate} />
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
          <p className="text-[10px] text-muted-foreground italic">
            {data.disclaimer ?? 'Every outbound email requires human approval before sending.'}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
