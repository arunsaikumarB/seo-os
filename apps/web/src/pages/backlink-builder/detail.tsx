import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { toast } from 'sonner';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';
import { OpportunityLogo } from '@/components/backlink-builder/opportunity-logo';
import {
  scoreBadgeClass,
  formatType,
  formatNumber,
  type BacklinkOpportunity,
} from '@/components/backlink-builder/types';
import {
  Sparkles,
  ArrowLeft,
  Plus,
  ExternalLink,
  Mail,
  FileText,
  Newspaper,
  Check,
  X,
} from 'lucide-react';

type AiDraft = { id: string; draft_type: string; content: string; created_at: string };
type HistoryEvent = { id: string; event_type: string; title: string; created_at: string };

type OpportunityDetail = BacklinkOpportunity & {
  type_label?: string;
  category?: string;
  score_tier?: string;
  notes?: Array<{ id: string; body: string; created_at: string }>;
  history?: HistoryEvent[];
  drafts?: AiDraft[];
  campaigns?: { id: string; name: string } | null;
};

type Campaign = { id: string; name: string };

const DRAFT_TYPES = [
  { type: 'email', label: 'Email', icon: Mail },
  { type: 'guest_post', label: 'Guest Post', icon: FileText },
  { type: 'press_release', label: 'Press Release', icon: Newspaper },
] as const;

export function BacklinkOpportunityDetailPage() {
  const { projectId = '', opportunityId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [campaignId, setCampaignId] = useState('');
  const [activeDraft, setActiveDraft] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['backlink-opportunity', projectId, opportunityId],
    queryFn: () =>
      request<{ data: OpportunityDetail }>(
        `/v1/projects/${projectId}/backlink-builder/opportunities/${opportunityId}`
      ),
    enabled: !!projectId && !!opportunityId,
  });

  const campaigns = useQuery({
    queryKey: ['campaigns', projectId],
    queryFn: () => request<{ data: Campaign[] }>(`/v1/projects/${projectId}/campaigns`),
    enabled: !!projectId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['backlink-opportunity', projectId, opportunityId] });
    queryClient.invalidateQueries({ queryKey: ['backlink-explorer', projectId] });
  };

  const addToCampaign = useMutation({
    mutationFn: () =>
      request(
        `/v1/projects/${projectId}/backlink-builder/opportunities/${opportunityId}/add-to-campaign`,
        {
          method: 'POST',
          body: JSON.stringify({ campaignId }),
        }
      ),
    onSuccess: () => {
      toast.success('Added to campaign');
      invalidate();
    },
    onError: () => toast.error('Failed to add to campaign'),
  });

  const approve = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/backlink-builder/opportunities/bulk`, {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', opportunityIds: [opportunityId] }),
      }),
    onSuccess: () => {
      toast.success('Opportunity approved');
      invalidate();
    },
  });

  const reject = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/backlink-builder/opportunities/bulk`, {
        method: 'POST',
        body: JSON.stringify({ action: 'reject', opportunityIds: [opportunityId] }),
      }),
    onSuccess: () => {
      toast.success('Opportunity rejected');
      invalidate();
    },
  });

  const generate = useMutation({
    mutationFn: (draftType: string) =>
      request<{ data: AiDraft }>(
        `/v1/projects/${projectId}/backlink-builder/opportunities/${opportunityId}/generate`,
        { method: 'POST', body: JSON.stringify({ draftType }) }
      ),
    onSuccess: (res) => {
      toast.success('AI draft generated');
      setActiveDraft(res.data.content);
      invalidate();
    },
    onError: () => toast.error('Failed to generate draft'),
  });

  const opp = detail.data?.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/explorer`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Explorer
          </Link>
        </Button>
        <BacklinkBuilderNav />
      </div>

      {detail.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : opp ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <OpportunityLogo domain={opp.domain} logoUrl={opp.logo_url} size={40} />
                  <div>
                    <CardTitle>{opp.website_name ?? opp.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {opp.domain ?? '—'}
                      {opp.country ? ` · ${opp.country}` : ''}
                      {opp.language ? ` · ${opp.language.toUpperCase()}` : ''}
                    </CardDescription>
                    <p className="text-xs text-muted-foreground mt-1 capitalize">
                      {opp.type_label ?? formatType(opp.opportunity_type)}
                      {opp.pipeline_stage ? ` · ${opp.pipeline_stage.replace(/_/g, ' ')}` : ''}
                    </p>
                  </div>
                </div>
                <Badge className={scoreBadgeClass(opp.score)}>Score {opp.score}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric
                  label="Domain Rating"
                  value={opp.domain_rating != null ? String(opp.domain_rating) : '—'}
                />
                <Metric
                  label="Traffic"
                  value={opp.monthly_traffic != null ? formatNumber(opp.monthly_traffic) : '—'}
                />
                <Metric
                  label="Spam Score"
                  value={opp.spam_score != null ? String(opp.spam_score) : '—'}
                />
                <Metric
                  label="Success %"
                  value={opp.success_probability != null ? `${opp.success_probability}%` : '—'}
                />
                <Metric
                  label="Reply Rate"
                  value={opp.reply_rate_prediction != null ? `${opp.reply_rate_prediction}%` : '—'}
                />
                <Metric
                  label="Category"
                  value={opp.category?.replace(/_/g, ' ') ?? '—'}
                  className="capitalize"
                />
                <Metric
                  label="Queue"
                  value={opp.queue_status?.replace(/_/g, ' ') ?? '—'}
                  className="capitalize"
                />
                <Metric
                  label="Verification"
                  value={opp.verification_status ?? 'pending'}
                  className="capitalize"
                />
              </div>

              {(opp.suggested_anchor || opp.suggested_target_page || opp.outreach_strategy) && (
                <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">AI Outreach Hints</p>
                  {opp.suggested_anchor && (
                    <p>
                      <span className="text-muted-foreground">Anchor:</span> {opp.suggested_anchor}
                    </p>
                  )}
                  {opp.suggested_target_page && (
                    <p>
                      <span className="text-muted-foreground">Target page:</span>{' '}
                      {opp.suggested_target_page}
                    </p>
                  )}
                  {opp.outreach_strategy && (
                    <p>
                      <span className="text-muted-foreground">Strategy:</span>{' '}
                      {opp.outreach_strategy}
                    </p>
                  )}
                </div>
              )}

              {opp.url && (
                <div className="flex items-center gap-2">
                  <a
                    href={opp.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline break-all flex-1"
                  >
                    {opp.url}
                  </a>
                  <Button variant="outline" size="sm" asChild>
                    <a href={opp.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                    </a>
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reject.mutate()}
                  disabled={reject.isPending}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
                {DRAFT_TYPES.map(({ type, label, icon: Icon }) => (
                  <Button
                    key={type}
                    size="sm"
                    variant="secondary"
                    disabled={generate.isPending}
                    onClick={() => generate.mutate(type)}
                  >
                    <Icon className="h-3.5 w-3.5 mr-1" /> {label}
                  </Button>
                ))}
              </div>

              {activeDraft && (
                <div className="rounded-md border p-3 bg-card">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Generated Draft</p>
                  <pre className="whitespace-pre-wrap text-xs font-sans">{activeDraft}</pre>
                </div>
              )}

              {(opp.history?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Activity</p>
                  <ul className="space-y-1 text-xs">
                    {opp.history!.slice(0, 5).map((h) => (
                      <li key={h.id} className="flex justify-between gap-2">
                        <span>{h.title}</span>
                        <span className="text-muted-foreground shrink-0">
                          {new Date(h.created_at).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-primary/15 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Recommendation
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {opp.ai_suggestion ?? opp.ai_recommendation ?? 'No AI recommendation yet.'}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Campaign</CardTitle>
                <CardDescription>
                  {opp.campaigns?.name
                    ? `Assigned: ${opp.campaigns.name}`
                    : 'Attach to an active campaign'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                >
                  <option value="">Select campaign</option>
                  {(campaigns.data?.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button
                  className="w-full"
                  disabled={!campaignId || addToCampaign.isPending}
                  onClick={() => addToCampaign.mutate()}
                >
                  <Plus className="h-4 w-4 mr-1" /> Assign Campaign
                </Button>
              </CardContent>
            </Card>

            {(opp.drafts?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Previous Drafts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {opp.drafts!.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="w-full text-left rounded border p-2 text-xs hover:bg-muted/50"
                      onClick={() => setActiveDraft(d.content)}
                    >
                      <span className="font-medium capitalize">
                        {d.draft_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-muted-foreground ml-2">
                        {new Date(d.created_at).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">Opportunity not found.</p>
      )}
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`font-medium ${className ?? ''}`}>{value}</p>
    </div>
  );
}
