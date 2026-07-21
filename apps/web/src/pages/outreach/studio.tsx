import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import { PenLine, Sparkles, Send, Eye, ArrowLeft } from 'lucide-react';

const AI_TYPES = [
  { id: 'initial', label: 'Initial email' },
  { id: 'follow_up', label: 'Follow-up' },
  { id: 'guest_post', label: 'Guest post' },
  { id: 'reply', label: 'Reply' },
  { id: 'meeting_request', label: 'Meeting request' },
  { id: 'thank_you', label: 'Thank you' },
  { id: 'subject_line', label: 'Subject lines' },
] as const;

const TONES = ['professional', 'friendly', 'formal', 'casual', 'persuasive'] as const;

export function EmailStudioPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(
    '<p>Hi {{contact_name}},</p><p></p><p>Best regards,<br/>{{sender_name}}</p>'
  );
  const [tone, setTone] = useState<string>('professional');
  const [aiType, setAiType] = useState<string>('initial');
  const [preview, setPreview] = useState(false);
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);

  const templates = useQuery({
    queryKey: ['outreach-templates', projectId],
    queryFn: () =>
      request<{
        data: Array<{ id: string; name: string; subject: string; body_html: string; tone: string }>;
      }>(`/v1/projects/${projectId}/outreach/templates`),
    enabled: !!projectId,
  });

  const contentDrafts = useQuery({
    queryKey: ['content-drafts', projectId],
    queryFn: () =>
      request<{
        data: {
          emailDrafts: Array<{ id: string; subject?: string; title?: string; status?: string; created_at: string }>;
          contentDrafts: Array<{ id: string; title?: string; body?: string; status?: string; created_at: string }>;
        };
      }>(`/v1/projects/${projectId}/campaigns/drafts`),
    enabled: !!projectId,
  });

  const aiGenerate = useMutation({
    mutationFn: () =>
      request<{
        data: {
          messageId: string;
          subject: string;
          bodyHtml: string;
          subjectSuggestions?: string[];
        };
      }>(`/v1/projects/${projectId}/outreach/messages/ai-generate`, {
        method: 'POST',
        body: JSON.stringify({ type: aiType, tone, toEmail, context: { senderName: 'Our team' } }),
      }),
    onSuccess: (res) => {
      setSubject(res.data.subject);
      setBodyHtml(res.data.bodyHtml);
      setLastMessageId(res.data.messageId);
      toast.success('AI draft generated — review before sending');
    },
    onError: () => toast.error('AI generation failed'),
  });

  const saveDraft = useMutation({
    mutationFn: () =>
      request<{ data: { messageId: string } }>(`/v1/projects/${projectId}/outreach/messages`, {
        method: 'POST',
        body: JSON.stringify({ toEmail, subject, bodyHtml, tone }),
      }),
    onSuccess: (res) => {
      setLastMessageId(res.data.messageId);
      toast.success('Draft saved');
      queryClient.invalidateQueries({ queryKey: ['outreach-threads', projectId] });
    },
  });

  const submitApproval = useMutation({
    mutationFn: (messageId: string) =>
      request(`/v1/projects/${projectId}/outreach/messages/${messageId}/submit`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Submitted for approval — a human must approve before send');
      queryClient.invalidateQueries({ queryKey: ['mission-control-summary', projectId] });
    },
    onError: () => toast.error('Submit failed'),
  });

  const applyTemplate = async (templateId: string) => {
    const res = await request<{ data: { subject: string; bodyHtml: string } }>(
      `/v1/projects/${projectId}/outreach/templates/${templateId}/apply`,
      {
        method: 'POST',
        body: JSON.stringify({
          context: {
            contact_name: 'there',
            sender_name: 'Our team',
            company_name: 'your site',
            domain: 'example.com',
          },
        }),
      }
    );
    setSubject(res.data.subject);
    setBodyHtml(res.data.bodyHtml);
  };

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/projects/${projectId}/outreach/inbox`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <PenLine className="h-6 w-6 text-emerald-500" /> Email Studio
          </h1>
          <p className="text-muted-foreground">
            Compose, personalize, preview, and submit for human approval
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Composer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>To</Label>
                <Input
                  type="email"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="editor@example.com"
                />
              </div>
              <div>
                <Label>Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Collaboration idea..."
                />
              </div>
              <div>
                <Label>Body (HTML)</Label>
                <textarea
                  className="w-full min-h-[200px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Tokens: {'{{contact_name}}'}, {'{{company_name}}'}, {'{{domain}}'},{' '}
                  {'{{sender_name}}'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveDraft.mutate()}
                  disabled={!toEmail || !subject}
                >
                  Save draft
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const id = lastMessageId;
                    if (id) submitApproval.mutate(id);
                    else
                      saveDraft.mutate(undefined, {
                        onSuccess: (r) => submitApproval.mutate(r.data.messageId),
                      });
                  }}
                  disabled={!toEmail || !subject}
                >
                  <Send className="h-3.5 w-3.5 mr-1" /> Submit for approval
                </Button>
              </div>
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium mb-2">Subject: {subject}</p>
                <div
                  className="prose prose-sm max-w-none border rounded-md p-4"
                  dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> AI Writer
              </CardTitle>
              <CardDescription>Generate drafts — always requires human review</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {AI_TYPES.map((t) => (
                  <Button
                    key={t.id}
                    size="sm"
                    variant={aiType === t.id ? 'default' : 'outline'}
                    onClick={() => setAiType(t.id)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {TONES.map((t) => (
                  <Badge
                    key={t}
                    className={`cursor-pointer capitalize ${tone === t ? 'border-emerald-500/50 text-emerald-600' : ''}`}
                    onClick={() => setTone(t)}
                  >
                    {t}
                  </Badge>
                ))}
              </div>
              <Button
                className="w-full"
                onClick={() => aiGenerate.mutate()}
                disabled={!toEmail || aiGenerate.isPending}
              >
                Generate with AI
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Send path</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <p>
                Gmail / Outlook OAuth send is deferred to V1.1. SMTP remains the live send path when
                configured. Drafts still require human approval before send.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Content drafts</CardTitle>
              <CardDescription>
                Moved from Generate Content — outreach-ready copy lives here
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(contentDrafts.data?.data.contentDrafts ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No content drafts yet.</p>
              ) : (
                (contentDrafts.data?.data.contentDrafts ?? []).map((d) => (
                  <div key={d.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{d.title ?? 'Untitled'}</p>
                      <Badge className="text-[10px] capitalize">{d.status ?? 'draft'}</Badge>
                    </div>
                    {d.body ? (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{d.body}</p>
                    ) : null}
                  </div>
                ))
              )}
              {(contentDrafts.data?.data.emailDrafts ?? []).length > 0 ? (
                <div className="pt-2 space-y-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground">Email drafts</p>
                  {(contentDrafts.data?.data.emailDrafts ?? []).map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <p className="font-medium">{d.subject ?? d.title ?? 'Email draft'}</p>
                      <Badge className="text-[10px] capitalize">{d.status ?? 'draft'}</Badge>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(templates.data?.data ?? []).map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => applyTemplate(t.id)}
                >
                  {t.name}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
