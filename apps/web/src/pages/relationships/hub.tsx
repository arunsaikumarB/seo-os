import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { PageTransition } from '@/components/demo/page-transition';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import type { RelationshipIntelligenceSummary } from '@/components/relationships/relationship-intelligence-widget';
import { Users, Building2, History, Sparkles, Mail, Linkedin, ArrowRight } from 'lucide-react';

type Organization = {
  id: string;
  company_name: string;
  domain: string;
  warmth: string;
  relationship_score: number;
  priority_score: number;
  response_probability?: number;
  guest_post_available?: boolean;
  relationship_contacts?: Array<{ count: number }>;
};

type Contact = {
  id: string;
  name: string;
  role?: string;
  public_email?: string;
  linkedin_url?: string;
  confidence_score: number;
  is_recommended_outreach?: boolean;
  relationship_organizations?: { company_name: string; domain: string; warmth: string };
};

type TimelineEvent = {
  id: string;
  event_type: string;
  title: string;
  description?: string;
  created_at: string;
  relationship_organizations?: { company_name: string; domain: string };
  relationship_contacts?: { name: string };
};

function warmthBadge(w: string) {
  if (w === 'hot' || w === 'partner') return 'border-primary/30 text-primary';
  if (w === 'warm') return 'border-amber-500/30 text-amber-600';
  return 'border-muted-foreground/30 text-muted-foreground';
}

export function RelationshipHubPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { isDemoMode } = useDemoMode();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('organizations');

  const summary = useQuery({
    queryKey: ['relationship-summary', projectId],
    queryFn: () =>
      request<{ data: RelationshipIntelligenceSummary }>(
        `/v1/projects/${projectId}/relationships/summary`
      ),
    enabled: !!projectId,
  });

  const organizations = useQuery({
    queryKey: ['relationship-organizations', projectId],
    queryFn: () =>
      request<{ data: Organization[] }>(`/v1/projects/${projectId}/relationships/organizations`),
    enabled: !!projectId,
  });

  const contacts = useQuery({
    queryKey: ['relationship-contacts', projectId],
    queryFn: () => request<{ data: Contact[] }>(`/v1/projects/${projectId}/relationships/contacts`),
    enabled: !!projectId,
  });

  const timeline = useQuery({
    queryKey: ['relationship-timeline', projectId],
    queryFn: () =>
      request<{ data: TimelineEvent[] }>(`/v1/projects/${projectId}/relationships/timeline`),
    enabled: !!projectId,
  });

  const discover = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/relationships/discover`, { method: 'POST' }),
    onSuccess: () => {
      if (!isDemoMode) toast.success('Relationship discovery started from browser profiles');
      queryClient.invalidateQueries({ queryKey: ['relationship-summary', projectId] });
      queryClient.invalidateQueries({ queryKey: ['relationship-organizations', projectId] });
      queryClient.invalidateQueries({ queryKey: ['relationship-contacts', projectId] });
      queryClient.invalidateQueries({ queryKey: ['relationship-timeline', projectId] });
    },
    onError: () => toast.error('Discovery failed'),
  });

  const s = summary.data?.data;

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Relationship Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Website owners, editors, contacts, history, campaign context, replies, notes, scores, and
            AI next actions.
          </p>
        </div>
        <Button onClick={() => discover.mutate()} disabled={discover.isPending}>
          <Sparkles className="h-4 w-4 mr-2" />
          Discover from Browser Intel
        </Button>
      </div>

      {summary.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: 'Contacts', value: s?.contactsDiscovered ?? 0 },
            { label: 'Organizations', value: s?.organizations ?? 0 },
            { label: 'Warm', value: s?.warmRelationships ?? 0 },
            { label: 'Hot Leads', value: s?.hotLeads ?? 0 },
            { label: 'Follow-ups', value: s?.pendingFollowUps ?? 0 },
            { label: 'Health', value: s?.relationshipHealth ?? 0 },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-semibold">
                  <AnimatedCounter value={m.value} />
                </p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b pb-2">
        {(['organizations', 'contacts', 'timeline'] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? 'default' : 'ghost'}
            onClick={() => setTab(t)}
            className="capitalize"
          >
            {t}
          </Button>
        ))}
      </div>

      {tab === 'organizations' && (
        <div className="space-y-3 mt-4">
          {(organizations.data?.data ?? []).map((org) => (
            <Card key={org.id}>
              <CardContent className="pt-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <Link
                      to={`/projects/${projectId}/relationships/organizations/${org.id}`}
                      className="font-medium hover:underline"
                    >
                      {org.company_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{org.domain}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={warmthBadge(org.warmth)}>{org.warmth}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Score {org.relationship_score}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Priority {org.priority_score}
                  </span>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/projects/${projectId}/relationships/organizations/${org.id}`}>
                      View <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {(organizations.data?.data ?? []).length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No organizations yet</CardTitle>
                <CardDescription>
                  Run Browser Intelligence scans, then click &quot;Discover from Browser Intel&quot;
                  to build profiles.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="space-y-3 mt-4">
          {(contacts.data?.data ?? []).map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    {c.name}
                    {c.is_recommended_outreach && (
                      <Badge className="text-[10px] border-violet-500/30 text-violet-600">
                        Recommended
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.role ?? 'Unknown role'} · {c.relationship_organizations?.company_name ?? '—'}
                  </p>
                  <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                    {c.public_email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {c.public_email}
                      </span>
                    )}
                    {c.linkedin_url && (
                      <span className="flex items-center gap-1">
                        <Linkedin className="h-3 w-3" />
                        LinkedIn
                      </span>
                    )}
                  </div>
                </div>
                <Badge className="border-muted-foreground/30">
                  Confidence {c.confidence_score}
                </Badge>
              </CardContent>
            </Card>
          ))}
          {(contacts.data?.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Contacts appear after organization enrichment.
            </p>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="space-y-3 mt-4">
          {(timeline.data?.data ?? []).map((ev) => (
            <Card key={ev.id}>
              <CardContent className="pt-4 flex items-start gap-3">
                <History className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm">{ev.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {ev.relationship_organizations?.company_name ?? 'Workspace'} ·{' '}
                    {ev.event_type.replace(/_/g, ' ')}
                  </p>
                  {ev.description && <p className="text-xs mt-1">{ev.description}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(ev.created_at).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
          {(timeline.data?.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Relationship timeline events will appear here.
            </p>
          )}
        </div>
      )}
    </PageTransition>
  );
}
