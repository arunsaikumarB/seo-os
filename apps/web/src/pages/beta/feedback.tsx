import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquarePlus, Bug, Lightbulb, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageTransition } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { getApiErrorMessage } from '@/lib/api';

type FeedbackRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
  category: string;
  status: string;
  created_at: string;
};

export function FeedbackCenterPage() {
  const orgId = useAppStore((s) => s.currentOrgId);
  const projectId = useAppStore((s) => s.currentProjectId);
  const { request } = useApi();
  const qc = useQueryClient();
  const [type, setType] = useState<'bug' | 'feature' | 'general'>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [category, setCategory] = useState('general');
  const [screenshotUrl, setScreenshotUrl] = useState('');

  const list = useQuery({
    queryKey: ['beta-feedback', orgId],
    queryFn: () =>
      request<{ data: FeedbackRow[] }>(`/v1/organizations/${orgId}/beta/feedback`),
    enabled: !!orgId,
  });

  const submit = useMutation({
    mutationFn: () =>
      request(`/v1/organizations/${orgId}/beta/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          type,
          title,
          body,
          severity,
          category,
          workspaceId: projectId || undefined,
          screenshotUrl: screenshotUrl || undefined,
          environment: {
            href: typeof window !== 'undefined' ? window.location.href : '',
            viewport:
              typeof window !== 'undefined'
                ? `${window.innerWidth}x${window.innerHeight}`
                : '',
            online: typeof navigator !== 'undefined' ? navigator.onLine : true,
          },
        }),
      }),
    onSuccess: () => {
      toast.success('Feedback submitted — thank you');
      setTitle('');
      setBody('');
      setScreenshotUrl('');
      qc.invalidateQueries({ queryKey: ['beta-feedback', orgId] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Submit failed')),
  });

  const icon = useMemo(() => {
    if (type === 'bug') return <Bug className="h-4 w-4" />;
    if (type === 'feature') return <Lightbulb className="h-4 w-4" />;
    return <MessageCircle className="h-4 w-4" />;
  }, [type]);

  if (!orgId) {
    return (
      <PageTransition>
        <p className="text-muted-foreground text-sm">Select an organization to submit feedback.</p>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <MessageSquarePlus className="h-6 w-6" /> Feedback Center
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Report bugs, request features, or share general feedback for Closed Beta
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {icon} New submission
          </CardTitle>
          <CardDescription>Severity · category · environment captured automatically</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['bug', 'feature', 'general'] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={type === t ? 'default' : 'outline'}
                onClick={() => setType(t)}
              >
                {t}
              </Button>
            ))}
          </div>
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="w-full min-h-28 rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Describe what happened, what you expected, and steps to reproduce…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              {['critical', 'high', 'medium', 'low', 'info'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Input
              placeholder="Category (e.g. outreach)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <Input
              placeholder="Screenshot URL (optional)"
              value={screenshotUrl}
              onChange={(e) => setScreenshotUrl(e.target.value)}
            />
          </div>
          <Button
            disabled={submit.isPending || title.length < 3 || body.length < 5}
            onClick={() => submit.mutate()}
          >
            Submit feedback
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your org feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(list.data?.data ?? []).map((f) => (
            <div key={f.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{f.body}</p>
                </div>
                <div className="flex gap-1">
                  <Badge className="text-[10px]">{f.type}</Badge>
                  <Badge className="text-[10px]">{f.severity}</Badge>
                  <Badge className="text-[10px]">{f.status}</Badge>
                </div>
              </div>
            </div>
          ))}
          {(list.data?.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No feedback yet — be the first.</p>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
