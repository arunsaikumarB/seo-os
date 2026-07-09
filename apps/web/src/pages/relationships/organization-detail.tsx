import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { ArrowLeft, Building2, Mail, Linkedin, History } from 'lucide-react';

type OrgDetail = {
  id: string;
  company_name: string;
  domain: string;
  website?: string;
  industry?: string;
  country?: string;
  warmth: string;
  relationship_score: number;
  response_probability: number;
  campaign_suitability: number;
  collaboration_potential: number;
  priority_score: number;
  risk_score: number;
  team_page_url?: string;
  contact_page_url?: string;
  editorial_page_url?: string;
  submission_page_url?: string;
  notes?: string;
  contacts: Array<{
    id: string;
    name: string;
    role?: string;
    public_email?: string;
    linkedin_url?: string;
    confidence_score: number;
    is_recommended_outreach?: boolean;
  }>;
  timeline: Array<{ id: string; event_type: string; title: string; created_at: string }>;
};

function warmthBadge(w: string) {
  if (w === 'hot' || w === 'partner') return 'border-primary/30 text-primary';
  if (w === 'warm') return 'border-amber-500/30 text-amber-600';
  return 'border-muted-foreground/30 text-muted-foreground';
}

export function OrganizationDetailPage() {
  const { projectId = '', orgId = '' } = useParams();
  const { request } = useApi();

  const org = useQuery({
    queryKey: ['relationship-org', projectId, orgId],
    queryFn: () =>
      request<{ data: OrgDetail }>(
        `/v1/projects/${projectId}/relationships/organizations/${orgId}`
      ),
    enabled: !!projectId && !!orgId,
  });

  const data = org.data?.data;

  if (org.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data) {
    return (
      <PageTransition>
        <p className="text-muted-foreground">Organization not found.</p>
        <Button variant="ghost" asChild className="px-0 mt-2">
          <Link to={`/projects/${projectId}/relationships`}>Back to hub</Link>
        </Button>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/projects/${projectId}/relationships`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-violet-500" />
            {data.company_name}
          </h1>
          <p className="text-muted-foreground">
            {data.domain} · {data.industry ?? 'Industry unknown'}
          </p>
          <div className="flex gap-2 mt-2">
            <Badge className={warmthBadge(data.warmth)}>{data.warmth}</Badge>
            <Badge className="border-muted-foreground/30">Priority {data.priority_score}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Relationship Scores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ProgressBarLabel label="Strength" value={data.relationship_score} />
            <ProgressBarLabel label="Response probability" value={data.response_probability} />
            <ProgressBarLabel label="Campaign suitability" value={data.campaign_suitability} />
            <ProgressBarLabel
              label="Collaboration potential"
              value={data.collaboration_potential}
            />
            <div className="flex justify-between pt-1">
              <span className="text-muted-foreground">Risk score</span>
              <span>{data.risk_score}</span>
            </div>
            {data.notes && (
              <p className="text-xs text-muted-foreground border-t pt-2">{data.notes}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Public Pages</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {[
              ['Team', data.team_page_url],
              ['Contact', data.contact_page_url],
              ['Editorial', data.editorial_page_url],
              ['Submission', data.submission_page_url],
            ].map(([label, url]) => (
              <div key={String(label)} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{label}</span>
                {url ? (
                  <a
                    href={String(url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary truncate max-w-[200px]"
                  >
                    {String(url).replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  <span>—</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Contacts ({data.contacts.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 border rounded-md px-3 py-2"
            >
              <div>
                <p className="font-medium text-sm">
                  {c.name}
                  {c.is_recommended_outreach && (
                    <Badge className="ml-2 text-[10px]">Recommended outreach</Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{c.role ?? 'Unknown'}</p>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  {c.public_email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {c.public_email}
                    </span>
                  )}
                  {c.linkedin_url && (
                    <a
                      href={c.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      <Linkedin className="h-3 w-3" />
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
              <Badge className="border-muted-foreground/30">{c.confidence_score}%</Badge>
            </div>
          ))}
          {data.contacts.length === 0 && (
            <p className="text-sm text-muted-foreground">No public contacts discovered yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.timeline.map((ev) => (
            <div key={ev.id} className="text-sm border-l-2 border-violet-500/30 pl-3 py-1">
              <p className="font-medium">{ev.title}</p>
              <p className="text-xs text-muted-foreground">
                {ev.event_type.replace(/_/g, ' ')} · {new Date(ev.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
