import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { Brain, Globe, FileText, Link2, Mail, Search, ListOrdered, ArrowRight } from 'lucide-react';

export type BrowserIntelligenceSummary = {
  websitesScanned: number;
  currentlyScanning: number;
  pagesRead: number;
  opportunitiesFound: number;
  contactPages: number;
  guestPostPages: number;
  brokenLinks: number;
  aiDiscoveries: number;
  scanQueue?: Array<{ id: string; target_url: string; phase?: string; status: string }>;
  disclaimer?: string;
};

interface BrowserIntelligenceWidgetProps {
  summary?: BrowserIntelligenceSummary;
  projectId: string;
}

export function BrowserIntelligenceWidget({ summary, projectId }: BrowserIntelligenceWidgetProps) {
  const data = summary ?? {
    websitesScanned: 0,
    currentlyScanning: 0,
    pagesRead: 0,
    opportunitiesFound: 0,
    contactPages: 0,
    guestPostPages: 0,
    brokenLinks: 0,
    aiDiscoveries: 0,
  };

  const base = `/projects/${projectId}/intelligence/browser`;
  const metrics = [
    { label: 'Websites Scanned', value: data.websitesScanned, icon: Globe },
    { label: 'Scanning Now', value: data.currentlyScanning, icon: Search },
    { label: 'Pages Read', value: data.pagesRead, icon: FileText },
    { label: 'Opportunities', value: data.opportunitiesFound, icon: Link2 },
    { label: 'Contact Pages', value: data.contactPages, icon: Mail },
    { label: 'Guest Post Pages', value: data.guestPostPages, icon: Brain },
    { label: 'Broken Links', value: data.brokenLinks, icon: Link2 },
    { label: 'AI Discoveries', value: data.aiDiscoveries, icon: Brain },
  ];

  const progress = data.currentlyScanning > 0 ? 45 : data.websitesScanned > 0 ? 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5 text-cyan-500" /> Browser Intelligence
              </CardTitle>
              <CardDescription className="mt-1">
                AI-powered website analysis — not browser automation
              </CardDescription>
            </div>
            <Button size="sm" asChild>
              <Link to={base}>
                Scanner <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProgressBarLabel label="Scan activity" value={progress} />
          <StaggerGrid className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
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
          {(data.scanQueue?.length ?? 0) > 0 && (
            <div className="text-xs space-y-1 border-t pt-2">
              <p className="font-medium flex items-center gap-1">
                <ListOrdered className="h-3 w-3" /> Scan Queue
              </p>
              {data.scanQueue!.map((s) => (
                <div key={s.id} className="flex justify-between text-muted-foreground">
                  <span className="truncate">{s.target_url}</span>
                  <Badge className="text-[9px] capitalize">{s.phase ?? s.status}</Badge>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground italic">
            {data.disclaimer ??
              'Analyzes public pages only. Does not submit forms or bypass CAPTCHAs.'}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
