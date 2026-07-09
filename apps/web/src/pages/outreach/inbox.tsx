import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import { Mail, PenLine, GitBranch, Building2, User, Clock } from 'lucide-react';

type Thread = {
  id: string;
  subject: string;
  status: string;
  last_message_at?: string;
  relationship_contacts?: { name: string; role?: string; public_email?: string };
  relationship_organizations?: { company_name: string; domain: string; warmth: string };
};

type ThreadDetail = Thread & {
  messages: Array<{
    id: string;
    direction: string;
    subject: string;
    body_html: string;
    status: string;
    created_at: string;
  }>;
  tasks: Array<{ id: string; title: string; due_at?: string; status: string }>;
  relationshipTimeline?: Array<{ title: string; event_type: string; created_at: string }>;
};

export function OutreachInboxPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const threads = useQuery({
    queryKey: ['outreach-threads', projectId],
    queryFn: () => request<{ data: Thread[] }>(`/v1/projects/${projectId}/outreach/threads`),
    enabled: !!projectId,
  });

  const detail = useQuery({
    queryKey: ['outreach-thread', projectId, selectedId],
    queryFn: () =>
      request<{ data: ThreadDetail }>(`/v1/projects/${projectId}/outreach/threads/${selectedId}`),
    enabled: !!projectId && !!selectedId,
  });

  const list = threads.data?.data ?? [];
  const active = detail.data?.data;

  return (
    <PageTransition className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Mail className="h-6 w-6 text-emerald-500" /> Outreach Inbox
          </h1>
          <p className="text-muted-foreground mt-1">
            Conversation-based outreach — company, contact, timeline, and tasks
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/outreach/sequences`}>
              <GitBranch className="h-3.5 w-3.5 mr-1" /> Sequences
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to={`/projects/${projectId}/outreach/studio`}>
              <PenLine className="h-3.5 w-3.5 mr-1" /> Email Studio
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5 min-h-[480px]">
        <Card className="lg:col-span-2">
          <CardContent className="pt-4 space-y-2 max-h-[600px] overflow-y-auto">
            {threads.isLoading && <Skeleton className="h-16 w-full" />}
            {list.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${selectedId === t.id ? 'border-emerald-500/50 bg-emerald-500/5' : 'hover:bg-muted/50'}`}
              >
                <p className="font-medium text-sm truncate">{t.subject}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {t.relationship_organizations?.company_name ??
                    t.relationship_contacts?.name ??
                    'No contact'}
                </p>
                {t.last_message_at && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(t.last_message_at).toLocaleString()}
                  </p>
                )}
              </button>
            ))}
            {!threads.isLoading && list.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                No conversations yet. Compose in Email Studio.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardContent className="pt-4">
            {!selectedId && (
              <p className="text-sm text-muted-foreground text-center py-24">
                Select a conversation
              </p>
            )}
            {selectedId && detail.isLoading && <Skeleton className="h-48 w-full" />}
            {active && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-start justify-between">
                  <div>
                    <h2 className="font-semibold">{active.subject}</h2>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                      {active.relationship_organizations && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {active.relationship_organizations.company_name}
                        </span>
                      )}
                      {active.relationship_contacts && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {active.relationship_contacts.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge className="capitalize">{active.status}</Badge>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto border rounded-md p-3">
                  {active.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`text-sm ${m.direction === 'outbound' ? 'border-l-2 border-emerald-500 pl-3' : 'border-l-2 border-blue-500 pl-3'}`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{m.subject}</span>
                        <Badge className="text-[9px]">{m.status}</Badge>
                      </div>
                      <div
                        className="text-muted-foreground mt-1 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: m.body_html }}
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(m.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>

                {(active.tasks?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Tasks
                    </p>
                    {active.tasks.map((task) => (
                      <div key={task.id} className="text-sm border rounded px-2 py-1 mb-1">
                        {task.title}
                      </div>
                    ))}
                  </div>
                )}

                {(active.relationshipTimeline?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Relationship Timeline</p>
                    {active.relationshipTimeline!.slice(0, 5).map((ev, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        {ev.title} · {ev.event_type.replace(/_/g, ' ')}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
