import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Image as ImageIcon, Plus, Send, Sparkles, Video } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/demo/empty-state';
import { useApi } from '@/hooks/use-api';
import { ImageIntelligencePanel } from '@/pages/content/image-intelligence';
import { OpportunitySelector } from '@/components/opportunities/opportunity-selector';
import { CurrentOpportunityBanner } from '@/components/opportunities/current-opportunity-banner';
import { useCurrentOpportunity } from '@/hooks/use-current-opportunity';
import { AiActivityCard, AiLoadingState } from '@/components/workflow/ai-activity-card';

type DraftRow = {
  id: string;
  title?: string;
  subject?: string;
  body?: string;
  status?: string;
  created_at: string;
  campaign_id?: string | null;
};

type ContentPackRow = {
  id: string;
  backlink_type: string;
  status: string;
  pack: Record<string, unknown>;
  updated_at: string;
  opportunities?: { id: string; title: string; domain: string; opportunity_type: string } | null;
};

type ContentIntelligence = {
  opportunityId: string;
  domain?: string | null;
  websiteName?: string | null;
  plan: {
    mode: string;
    modeLabel: string;
    detectedType: string;
    detectedTypeLabel: string;
    storageType: string;
    sections: string[];
    requirements: {
      requiredFields: string[];
      mediaRequirements: { images: boolean; videos: boolean; imageNotes?: string; videoNotes?: string };
      loginRequired: boolean;
      captchaRequired: boolean;
    };
    openImageStudio: boolean;
    openVideoStudio: boolean;
    confidence: number;
    reason: string;
  };
  quality: {
    seoScore: number;
    readabilityScore: number;
    uniquenessScore: number;
    eeatScore: number;
    overall: number;
    recommendations: string[];
  } | null;
  latestPackId: string | null;
  packStatus: string | null;
  imagesReady: boolean;
  videoReady: boolean;
  submissionReady: boolean;
  estimatedApprovalProbability: number;
  estimatedReviewHours: number;
  reusedLearning: boolean;
  requiredAssets: {
    fields: string[];
    images: boolean;
    videos: boolean;
  };
};

const MODE_HINTS: Record<string, string> = {
  guest_post: 'Blog editor with SEO metadata, author bio, FAQs, and featured image fields.',
  article: 'Article submission package with headings, body, references, and meta tags.',
  directory: 'Business listing fields — NAP, descriptions, category, logo, hours.',
  profile: 'Company profile — about, services, founder, social links, cover.',
  forum: 'Natural discussion opener, helpful reply, and anchor placement.',
  qa: 'Question, answer, supporting explanation, and reference links.',
  press: 'Press release — headline, quotes, boilerplate, media contact.',
  image: 'Image submission metadata — redirecting Image Studio for assets.',
  infographic: 'Infographic package — Image Studio generates the visual.',
  video: 'Video metadata package — titles, tags, transcript, chapters.',
  resource: 'Resource page suggestion with description and anchors.',
  outreach: 'Outreach-ready replacement or partnership content.',
  generic: 'General submission fields detected from the destination site.',
};

type StudioTab = 'articles' | 'images' | 'videos' | 'metadata' | 'templates';

function PreviewField({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === '') return null;
  const text =
    typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? JSON.stringify(value, null, 2)
        : typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : String(value);
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
    </div>
  );
}

function ContentPackPreview({ pack, mode }: { pack: Record<string, unknown>; mode: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 rounded-md border p-3 bg-muted/20">
      {(mode === 'directory' || mode === 'profile') && (
        <>
          <PreviewField label="Business name" value={pack.businessName} />
          <PreviewField label="Category" value={(pack.categorySuggestions as string[])?.[0]} />
          <PreviewField label="Short description" value={pack.shortDescription} />
          <PreviewField label="Long description" value={pack.longDescription} />
          <PreviewField label="Address" value={pack.address} />
          <PreviewField label="Phone" value={pack.phone} />
          <PreviewField label="Email" value={pack.email} />
          <PreviewField label="Hours" value={pack.businessHours} />
          <PreviewField label="Social links" value={pack.socialLinks} />
          <PreviewField label="Services" value={pack.services} />
        </>
      )}
      {(mode === 'guest_post' || mode === 'article' || mode === 'resource') && (
        <>
          <PreviewField label="SEO title" value={pack.seoTitle ?? pack.title} />
          <PreviewField label="Slug" value={pack.slug} />
          <PreviewField label="Meta description" value={pack.metaDescription} />
          <PreviewField label="Excerpt" value={pack.excerpt} />
          <PreviewField label="Author bio" value={pack.authorBio} />
          <PreviewField label="CTA" value={pack.cta} />
          <PreviewField label="H2 outline" value={pack.h2} />
          <PreviewField label="FAQs" value={pack.faq} />
        </>
      )}
      {mode === 'forum' && <PreviewField label="Discussion" value={pack.discussionPosts} />}
      {mode === 'qa' && (
        <>
          <PreviewField label="Question" value={pack.question} />
          <PreviewField label="Answer" value={pack.answer} />
        </>
      )}
      {mode === 'press' && (
        <>
          <PreviewField label="Headline" value={pack.headline} />
          <PreviewField label="Subheading" value={pack.subheading} />
          <PreviewField label="Quotes" value={pack.quotes} />
          <PreviewField label="Boilerplate" value={pack.boilerplate} />
        </>
      )}
      {(mode === 'image' || mode === 'infographic') && (
        <PreviewField label="Image metadata" value={pack.imageMetadata} />
      )}
      {mode === 'video' && <PreviewField label="Video metadata" value={pack.videoMetadata} />}
      <PreviewField label="Internal links" value={pack.internalLinks} />
      <PreviewField label="External links" value={pack.externalLinks ?? pack.suggestedLinks} />
      <PreviewField label="Body" value={pack.body} />
      <PreviewField label="Schema" value={pack.schemaJsonLd ?? pack.schema} />
      {typeof pack.quality === 'object' && pack.quality != null ? (
        <PreviewField
          label="Quality scores"
          value={{
            overall: (pack.quality as Record<string, unknown>).overall,
            seo: (pack.quality as Record<string, unknown>).seoScore,
            readability: (pack.quality as Record<string, unknown>).readabilityScore,
            eeat: (pack.quality as Record<string, unknown>).eeatScore,
          }}
        />
      ) : null}
    </div>
  );
}

export function ContentLibraryPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StudioTab>('articles');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { opportunity: selectedOpp, setOpportunity } = useCurrentOpportunity(projectId);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [packJson, setPackJson] = useState('');
  const [showRawJson, setShowRawJson] = useState(false);

  const handleSelectOpp = (opp: typeof selectedOpp) => {
    setOpportunity(opp);
    setEditingPackId(null);
  };

  const intelligence = useQuery({
    queryKey: ['content-intelligence', projectId, selectedOpp?.id],
    queryFn: () =>
      request<{ data: ContentIntelligence }>(
        `/v1/projects/${projectId}/backlink-builder/opportunities/${selectedOpp!.id}/content-intelligence`
      ),
    enabled: !!projectId && !!selectedOpp?.id,
  });

  const intel = intelligence.data?.data;
  const studioMode = intel?.plan.mode ?? selectedOpp?.studio_mode ?? 'generic';
  const modeLabel =
    intel?.plan.modeLabel ?? selectedOpp?.studio_mode_label ?? 'General Submission Mode';

  const drafts = useQuery({
    queryKey: ['content-drafts', projectId],
    queryFn: () =>
      request<{
        data: { emailDrafts: DraftRow[]; contentDrafts: DraftRow[] };
      }>(`/v1/projects/${projectId}/campaigns/drafts`),
    enabled: !!projectId,
  });

  const packs = useQuery({
    queryKey: ['content-packs', projectId],
    queryFn: () =>
      request<{ data: ContentPackRow[] }>(`/v1/projects/${projectId}/backlink-builder/content-packs`),
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/campaigns/drafts/content`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      }),
    onSuccess: () => {
      toast.success('Content draft created');
      setTitle('');
      setBody('');
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['content-drafts', projectId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create draft'),
  });

  const submit = useMutation({
    mutationFn: (draftId: string) =>
      request(`/v1/projects/${projectId}/campaigns/drafts/content/${draftId}/submit`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Submitted for approval');
      queryClient.invalidateQueries({ queryKey: ['content-drafts', projectId] });
      queryClient.invalidateQueries({ queryKey: ['approvals', projectId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Submit failed'),
  });

  const generatePack = useMutation({
    mutationFn: () => {
      if (!selectedOpp) throw new Error('Select an approved opportunity first');
      return request<{ data: ContentPackRow & { intelligence?: Record<string, unknown> } }>(
        `/v1/projects/${projectId}/backlink-builder/opportunities/${selectedOpp.id}/content-pack`,
        { method: 'POST', body: JSON.stringify({}) }
      );
    },
    onSuccess: (res) => {
      const mode = String(res.data?.intelligence?.modeLabel ?? modeLabel);
      toast.success(`Generated ${mode} package for ${selectedOpp?.website ?? 'opportunity'}`);
      queryClient.invalidateQueries({ queryKey: ['content-packs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['content-intelligence', projectId, selectedOpp?.id] });
      queryClient.invalidateQueries({ queryKey: ['approved-opportunities', projectId] });
      if (res.data?.id) {
        setEditingPackId(res.data.id);
        setPackJson(JSON.stringify(res.data.pack ?? {}, null, 2));
      }
      const openImage = Boolean(res.data?.intelligence?.openImageStudio);
      const openVideo = Boolean(res.data?.intelligence?.openVideoStudio);
      if (openImage) navigate(`/projects/${projectId}/backlink-builder/image-studio`);
      else if (openVideo) navigate(`/projects/${projectId}/backlink-builder/video-studio`);
    },
    onError: (err: Error) => toast.error(err.message || 'Pack generation failed'),
  });

  const savePack = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(packJson) as Record<string, unknown>;
      return request(`/v1/projects/${projectId}/backlink-builder/content-packs/${editingPackId}`, {
        method: 'PUT',
        body: JSON.stringify({ pack: parsed, status: 'ready' }),
      });
    },
    onSuccess: () => {
      toast.success('Content pack approved & saved');
      setEditingPackId(null);
      queryClient.invalidateQueries({ queryKey: ['content-packs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['content-intelligence', projectId, selectedOpp?.id] });
    },
    onError: (err: Error) => toast.error(err.message || 'Save failed'),
  });

  const contentDrafts = drafts.data?.data.contentDrafts ?? [];
  const emailDrafts = drafts.data?.data.emailDrafts ?? [];
  const packList = packs.data?.data ?? [];
  const editingPack = useMemo(
    () => packList.find((p) => p.id === editingPackId) ?? null,
    [packList, editingPackId]
  );
  const previewPack = useMemo(() => {
    if (editingPack) {
      try {
        return JSON.parse(packJson) as Record<string, unknown>;
      } catch {
        return editingPack.pack ?? {};
      }
    }
    return null;
  }, [editingPack, packJson]);

  const tabs: { id: StudioTab; label: string; icon: typeof FileText }[] = [
    { id: 'articles', label: 'Articles', icon: FileText },
    { id: 'images', label: 'Images', icon: ImageIcon },
    { id: 'videos', label: 'Videos', icon: Video },
    { id: 'metadata', label: 'Metadata', icon: FileText },
    { id: 'templates', label: 'Templates', icon: FileText },
  ];

  const sections = intel?.plan.sections ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6" /> Generate Content
          </h1>
          <p className="text-muted-foreground">
            AI builds articles, listings, images, and metadata for each approved website.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTab('images')}>
            <ImageIcon className="h-4 w-4 mr-1" /> Images
          </Button>
          {tab === 'articles' && (
            <Button onClick={() => setShowCreate((v) => !v)}>
              <Plus className="h-4 w-4 mr-1" /> New draft
            </Button>
          )}
        </div>
      </div>

      {generatePack.isPending || (intel && intel.packStatus === 'generating') ? (
        <AiActivityCard
          title="AI is generating content"
          percent={generatePack.isPending ? 55 : 72}
          current={generatePack.isPending ? 'Writing article' : 'Finishing assets'}
          next="Metadata & schema"
          eta="~1 min"
          items={[
            { label: 'Articles', state: generatePack.isPending ? 'active' : 'done' },
            { label: 'Descriptions', state: generatePack.isPending ? 'queued' : 'done' },
            {
              label: 'Images',
              state: intel?.imagesReady ? 'done' : generatePack.isPending ? 'queued' : 'active',
            },
            { label: 'Video Metadata', state: intel?.videoReady ? 'done' : 'queued' },
            { label: 'Schema', state: 'queued' },
          ]}
        />
      ) : null}

      <div className="flex flex-wrap gap-1 border-b pb-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <Button
              key={t.id}
              size="sm"
              variant={tab === t.id ? 'default' : 'ghost'}
              onClick={() => setTab(t.id)}
            >
              <Icon className="h-3.5 w-3.5 mr-1" />
              {t.label}
            </Button>
          );
        })}
      </div>

      {tab === 'images' && <ImageIntelligencePanel embedded />}

      {tab === 'videos' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Videos</CardTitle>
            <CardDescription>
              Video briefs and metadata live in Video Studio — pixel render stays provider-gated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to={`/projects/${projectId}/backlink-builder/video-studio`}>Open Video Studio</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'metadata' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
            <CardDescription>
              SEO filenames, alt text, Open Graph, and structured data are generated with every Image
              Intelligence asset. Use the Images tab to review packages.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button variant="outline" onClick={() => setTab('images')}>
              Review image metadata
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/projects/${projectId}/backlink-builder/image-studio`}>Media Studio briefs</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'templates' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adaptive studio modes</CardTitle>
            <CardDescription>
              Modes switch automatically from destination website analysis — not user selection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.entries(MODE_HINTS).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <Badge className="text-[10px] capitalize shrink-0">{k.replace(/_/g, ' ')}</Badge>
                <p className="text-muted-foreground text-xs">{v}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'articles' && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Generate Content</CardTitle>
              <CardDescription>
                Select an opportunity. AI detects the backlink type and builds the right submission —
                you never pick a format.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CurrentOpportunityBanner projectId={projectId} />
              <OpportunitySelector
                projectId={projectId}
                selectedId={selectedOpp?.id ?? null}
                onSelect={handleSelectOpp}
                mode="content"
                showTable={!selectedOpp}
                allowClear
              />

              {selectedOpp && (
                <div className="space-y-3">
                  {intelligence.isLoading ? (
                    <AiLoadingState message="AI is studying this website…" />
                  ) : intel ? (
                    <div className="rounded-md border p-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">Detected Backlink Type</span>
                        <Badge className="capitalize">{intel.plan.detectedTypeLabel}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{intel.plan.reason}</p>
                      <p className="text-xs">{MODE_HINTS[studioMode] ?? MODE_HINTS.generic}</p>

                      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5 text-sm">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Quality</p>
                          <p className="font-medium tabular-nums">
                            {intel.quality?.overall ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">SEO</p>
                          <p className="font-medium tabular-nums">
                            {intel.quality?.seoScore ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Images</p>
                          <p className="font-medium">{intel.imagesReady ? 'Ready' : 'Pending'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Video</p>
                          <p className="font-medium">{intel.videoReady ? 'Ready' : 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Submission</p>
                          <p className="font-medium">
                            {intel.submissionReady ? 'Ready' : 'Draft needed'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Est. approval</p>
                          <p className="font-medium tabular-nums">
                            {intel.estimatedApprovalProbability}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Est. review</p>
                          <p className="font-medium tabular-nums">
                            {intel.estimatedReviewHours}h
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium mb-1">Required assets / fields</p>
                        <div className="flex flex-wrap gap-1">
                          {intel.requiredAssets.fields.slice(0, 24).map((f) => (
                            <Badge key={f} className="text-[10px] bg-transparent">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {sections.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Studio sections</p>
                          <div className="flex flex-wrap gap-1">
                            {sections.map((s) => (
                              <Badge key={s} className="text-[10px] capitalize">
                                {s.replace(/_/g, ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Intelligence will load for this opportunity…
                    </p>
                  )}

                  {(intel?.plan.openImageStudio || intel?.plan.openVideoStudio) && (
                    <div className="rounded-md border border-dashed p-3 text-sm space-y-2">
                      <p>
                        {intel.plan.openImageStudio
                          ? 'This site requires image assets. Generate the metadata pack, then continue in Image Studio.'
                          : 'This site requires video assets. Generate the metadata pack, then continue in Video Studio.'}
                      </p>
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(
                            intel.plan.openImageStudio
                              ? `/projects/${projectId}/backlink-builder/image-studio`
                              : `/projects/${projectId}/backlink-builder/video-studio`
                          )
                        }
                      >
                        Open {intel.plan.openImageStudio ? 'Image' : 'Video'} Studio
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!selectedOpp || generatePack.isPending || intelligence.isLoading}
                      onClick={() => generatePack.mutate()}
                    >
                      {generatePack.isPending
                        ? 'Generating content…'
                        : studioMode.includes('forum')
                          ? 'Generate Submission'
                          : 'Generate Content'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedOpp || intelligence.isFetching}
                      onClick={() =>
                        request<{ data: ContentIntelligence }>(
                          `/v1/projects/${projectId}/backlink-builder/opportunities/${selectedOpp!.id}/content-intelligence?refresh=1`
                        ).then(() => {
                          intelligence.refetch();
                          toast.success('Re-analyzed destination');
                        })
                      }
                    >
                      Re-analyze site
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/projects/${projectId}/backlink-builder/image-studio`}>
                        Image Studio
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/projects/${projectId}/backlink-builder/video-studio`}>
                        Video Studio
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Content packs</CardTitle>
              <CardDescription>
                {packList.length} pack(s) — each opportunity gets its own detected submission package
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {packs.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : packList.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No content packs yet"
                  description="Select an approved opportunity and generate an intelligent submission package."
                />
              ) : (
                packList.map((p) => {
                  const packMode = String((p.pack as { studioMode?: string })?.studioMode ?? '');
                  const q = (p.pack as { quality?: { overall?: number } })?.quality;
                  return (
                    <div key={p.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">
                            {p.opportunities?.title ?? p.backlink_type} ·{' '}
                            {p.opportunities?.domain ?? '—'}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {packMode
                              ? packMode.replace(/_/g, ' ')
                              : p.backlink_type.replace(/_/g, ' ')}{' '}
                            · {p.status}
                            {q?.overall != null ? ` · Quality ${q.overall}` : ''}
                          </p>
                        </div>
                        <Badge className="text-[10px]">
                          {(p.pack as { intelligence?: { detectedTypeLabel?: string } })?.intelligence
                            ?.detectedTypeLabel ?? 'Auto'}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingPackId(p.id);
                          setPackJson(JSON.stringify(p.pack ?? {}, null, 2));
                          setShowRawJson(false);
                        }}
                      >
                        Preview / edit
                      </Button>
                    </div>
                  );
                })
              )}

              {editingPack && previewPack && (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Submission package preview</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowRawJson((v) => !v)}
                    >
                      {showRawJson ? 'Hide JSON' : 'Edit JSON'}
                    </Button>
                  </div>
                  <ContentPackPreview
                    pack={previewPack}
                    mode={String(previewPack.studioMode ?? studioMode)}
                  />
                  {showRawJson && (
                    <>
                      <Label htmlFor="pack-json">Editable pack JSON</Label>
                      <textarea
                        id="pack-json"
                        className="flex min-h-[220px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={packJson}
                        onChange={(e) => setPackJson(e.target.value)}
                      />
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button disabled={savePack.isPending} onClick={() => savePack.mutate()}>
                      {savePack.isPending ? 'Saving…' : 'Approve / mark ready'}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingPackId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {showCreate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">New content draft</CardTitle>
                <CardDescription>Legacy draft body stored in the project workspace</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="draft-title">Title</Label>
                  <Input
                    id="draft-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Guest post outline"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="draft-body">Body</Label>
                  <textarea
                    id="draft-body"
                    className="flex min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write or paste draft content…"
                  />
                </div>
                <Button
                  disabled={create.isPending || title.trim().length < 1 || body.trim().length < 1}
                  onClick={() => create.mutate()}
                >
                  {create.isPending ? 'Saving…' : 'Save draft'}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Content drafts</CardTitle>
              <CardDescription>{contentDrafts.length} item(s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {drafts.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : contentDrafts.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No content drafts yet"
                  description="Create a draft to start the content → approval workflow."
                  actionLabel="New draft"
                  onAction={() => setShowCreate(true)}
                />
              ) : (
                contentDrafts.map((d) => (
                  <div key={d.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{d.title ?? 'Untitled'}</p>
                      <Badge className="text-[10px] capitalize">{d.status ?? 'draft'}</Badge>
                    </div>
                    {d.body && (
                      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                        {d.body}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(d.created_at).toLocaleString()}
                      </span>
                      {(!d.status || d.status === 'draft') && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={submit.isPending}
                          onClick={() => submit.mutate(d.id)}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" /> Submit for approval
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email drafts</CardTitle>
              <CardDescription>
                {emailDrafts.length} email draft(s) — manage in Outreach Studio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {emailDrafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No email drafts yet.{' '}
                  <Link className="underline" to={`/projects/${projectId}/outreach/studio`}>
                    Open Outreach Studio
                  </Link>
                </p>
              ) : (
                emailDrafts.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{d.subject ?? d.title ?? 'Email draft'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(d.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge className="text-[10px] capitalize">{d.status ?? 'draft'}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
