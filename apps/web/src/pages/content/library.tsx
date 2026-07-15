import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Image as ImageIcon, Plus, Send, Video } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/demo/empty-state';
import { useApi } from '@/hooks/use-api';
import { ImageIntelligencePanel } from '@/pages/content/image-intelligence';
import {
  OpportunitySelector,
  type SelectedOpportunity,
} from '@/components/opportunities/opportunity-selector';

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

const PACK_TYPES = [
  'guest_post',
  'directory',
  'profile',
  'forum',
  'qa_site',
  'press_release',
  'resource_page',
  'broken_link',
  'citation',
  'digital_pr',
  'web2',
  'infographic',
  'partnership',
];

type StudioTab = 'articles' | 'images' | 'videos' | 'metadata' | 'templates';

function resolvePackType(opportunityType: string): string {
  if (PACK_TYPES.includes(opportunityType)) return opportunityType;
  const aliases: Record<string, string> = {
    business_listing: 'directory',
    citation: 'citation',
    image_submission: 'infographic',
    web_2_0: 'web2',
  };
  return aliases[opportunityType] ?? opportunityType ?? 'guest_post';
}

export function ContentLibraryPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StudioTab>('articles');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<SelectedOpportunity | null>(null);
  const [packType, setPackType] = useState('guest_post');
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [packJson, setPackJson] = useState('');

  const handleSelectOpp = useCallback((opp: SelectedOpportunity | null) => {
    setSelectedOpp(opp);
    if (opp) setPackType(resolvePackType(String(opp.opportunity_type)));
  }, []);

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
      return request(
        `/v1/projects/${projectId}/backlink-builder/opportunities/${selectedOpp.id}/content-pack`,
        {
          method: 'POST',
          body: JSON.stringify({ type: packType }),
        }
      );
    },
    onSuccess: () => {
      toast.success(`Content pack generated for ${selectedOpp?.website ?? 'opportunity'}`);
      queryClient.invalidateQueries({ queryKey: ['content-packs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['approved-opportunities', projectId] });
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
      toast.success('Content pack saved');
      setEditingPackId(null);
      queryClient.invalidateQueries({ queryKey: ['content-packs', projectId] });
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

  const tabs: { id: StudioTab; label: string; icon: typeof FileText }[] = [
    { id: 'articles', label: 'Articles', icon: FileText },
    { id: 'images', label: 'Images', icon: ImageIcon },
    { id: 'videos', label: 'Videos', icon: Video },
    { id: 'metadata', label: 'Metadata', icon: FileText },
    { id: 'templates', label: 'Templates', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6" /> Content Studio 2.0
          </h1>
          <p className="text-muted-foreground">
            Articles, Image Intelligence, video metadata, and reusable templates for backlink campaigns.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTab('images')}>
            <ImageIcon className="h-4 w-4 mr-1" /> Images
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/video-studio`}>Video Studio</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/projects/${projectId}/campaigns/approvals`}>Approvals</Link>
          </Button>
          {tab === 'articles' && (
            <Button onClick={() => setShowCreate((v) => !v)}>
              <Plus className="h-4 w-4 mr-1" /> New draft
            </Button>
          )}
        </div>
      </div>

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
            <CardTitle className="text-base">Templates</CardTitle>
            <CardDescription>
              Content pack types and image types reused across campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium mb-1">Article pack types</p>
              <div className="flex flex-wrap gap-1">
                {PACK_TYPES.map((t) => (
                  <Badge key={t} className="text-[10px] capitalize">
                    {t.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="font-medium mb-1">Image types</p>
              <p className="text-muted-foreground text-xs">
                Blog hero, featured, Open Graph, social covers, directory logos, infographics, and more —
                powered by Image Intelligence.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'articles' && (
        <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Generate content pack</CardTitle>
          <CardDescription>
            Select an approved website. Content type and required fields are detected automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OpportunitySelector
            projectId={projectId}
            selectedId={selectedOpp?.id ?? null}
            onSelect={handleSelectOpp}
            mode="content"
          />

          {selectedOpp && (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label htmlFor="pack-type">Content type</Label>
                <select
                  id="pack-type"
                  className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm capitalize"
                  value={packType}
                  onChange={(e) => setPackType(e.target.value)}
                >
                  {!PACK_TYPES.includes(packType) && (
                    <option value={packType}>{packType.replace(/_/g, ' ')}</option>
                  )}
                  {PACK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                disabled={!selectedOpp || generatePack.isPending}
                onClick={() => generatePack.mutate()}
              >
                {generatePack.isPending ? 'Generating…' : 'Generate Content Pack'}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/projects/${projectId}/backlink-builder/image-studio`}>Image Studio</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/projects/${projectId}/backlink-builder/video-studio`}>Video Studio</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content packs</CardTitle>
          <CardDescription>{packList.length} pack(s) — Estimated AI output until edited</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {packs.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : packList.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No content packs yet"
              description="Generate a pack from an opportunity to start Content Studio 2.0."
            />
          ) : (
            packList.map((p) => (
              <div key={p.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {p.opportunities?.title ?? p.backlink_type} · {p.opportunities?.domain ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {p.backlink_type.replace(/_/g, ' ')} · {p.status}
                    </p>
                  </div>
                  <Badge className="text-[10px]">Estimated</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingPackId(p.id);
                    setPackJson(JSON.stringify(p.pack ?? {}, null, 2));
                  }}
                >
                  Edit pack
                </Button>
              </div>
            ))
          )}

          {editingPack && (
            <div className="space-y-2 rounded-md border p-3">
              <Label htmlFor="pack-json">Editable pack JSON</Label>
              <textarea
                id="pack-json"
                className="flex min-h-[220px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={packJson}
                onChange={(e) => setPackJson(e.target.value)}
              />
              <div className="flex gap-2">
                <Button disabled={savePack.isPending} onClick={() => savePack.mutate()}>
                  {savePack.isPending ? 'Saving…' : 'Save / mark ready'}
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
