import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import {
  Users,
  Building2,
  Flame,
  HeartHandshake,
  Clock,
  Star,
  Activity,
  ArrowRight,
} from 'lucide-react';

export type RelationshipIntelligenceSummary = {
  contactsDiscovered: number;
  organizations: number;
  warmRelationships: number;
  hotLeads: number;
  partners: number;
  pendingFollowUps: number;
  topPartners: Array<{
    company_name?: string;
    domain?: string;
    relationship_score?: number;
    warmth?: string;
  }>;
  relationshipHealth: number;
  warmthBreakdown?: { cold: number; warm: number; hot: number; partner: number };
  disclaimer?: string;
};

interface RelationshipIntelligenceWidgetProps {
  summary?: RelationshipIntelligenceSummary;
  projectId: string;
}

export function RelationshipIntelligenceWidget({
  summary,
  projectId,
}: RelationshipIntelligenceWidgetProps) {
  const data = summary ?? {
    contactsDiscovered: 0,
    organizations: 0,
    warmRelationships: 0,
    hotLeads: 0,
    partners: 0,
    pendingFollowUps: 0,
    topPartners: [],
    relationshipHealth: 0,
  };

  const base = `/projects/${projectId}/relationships`;
  const metrics = [
    { label: 'Contacts Discovered', value: data.contactsDiscovered, icon: Users },
    { label: 'Organizations', value: data.organizations, icon: Building2 },
    { label: 'Warm Relationships', value: data.warmRelationships, icon: HeartHandshake },
    { label: 'Hot Leads', value: data.hotLeads, icon: Flame },
    { label: 'Partners', value: data.partners, icon: Star },
    { label: 'Pending Follow-ups', value: data.pendingFollowUps, icon: Clock },
    { label: 'Relationship Health', value: data.relationshipHealth, icon: Activity },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-violet-500" /> Relationship Intelligence
              </CardTitle>
              <CardDescription className="mt-1">
                AI-powered publisher relationships — not a CRM
              </CardDescription>
            </div>
            <Button size="sm" asChild>
              <Link to={base}>
                Open Hub <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProgressBarLabel label="Relationship health" value={data.relationshipHealth} />
          <StaggerGrid className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
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
          {(data.topPartners?.length ?? 0) > 0 && (
            <div className="text-xs space-y-1 border-t pt-2">
              <p className="font-medium flex items-center gap-1">
                <Star className="h-3 w-3" /> Top Partners
              </p>
              {data.topPartners!.slice(0, 3).map((p) => (
                <div key={p.domain} className="flex justify-between text-muted-foreground">
                  <span className="truncate">{p.company_name ?? p.domain}</span>
                  <Badge className="text-[9px] capitalize">{p.warmth ?? 'warm'}</Badge>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground italic">
            {data.disclaimer ??
              'Uses publicly available information only. No login scraping or automated outreach.'}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
