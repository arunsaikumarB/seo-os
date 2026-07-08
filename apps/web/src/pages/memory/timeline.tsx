import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { Brain } from 'lucide-react';

export function MemoryTimelinePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [tier, setTier] = useState<'brand' | 'project' | 'prompt'>('brand');

  const memory = useQuery({
    queryKey: ['memory', projectId],
    queryFn: () =>
      request<{
        data: {
          entries: Array<{ id: string; tier: string; content: string; created_at: string }>;
          facts: Array<{ id: string; fact_type: string; content: string; status: string }>;
        };
      }>(`/v1/projects/${projectId}/knowledge/memory`),
    enabled: !!projectId,
  });

  const addEntry = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/knowledge/memory/entries`, {
        method: 'POST',
        body: JSON.stringify({ tier, content }),
      }),
    onSuccess: () => {
      toast.success('Memory saved');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['memory', projectId] });
    },
  });

  const approve = useMutation({
    mutationFn: (factId: string) =>
      request(`/v1/projects/${projectId}/knowledge/memory/facts/${factId}/approve`, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memory', projectId] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Memory</h1>
        <p className="text-muted-foreground">Brand, project, and approved prompt memory</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" /> Add memory
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="flex h-9 rounded-md border bg-background px-3 text-sm"
            value={tier}
            onChange={(e) => setTier(e.target.value as typeof tier)}
          >
            <option value="brand">Brand memory</option>
            <option value="project">Project memory</option>
            <option value="prompt">Approved prompt</option>
          </select>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Memory content..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button disabled={!content || addEntry.isPending} onClick={() => addEntry.mutate()}>
            Save memory
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Memory entries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(memory.data?.data.entries ?? []).map((e) => (
              <div key={e.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex justify-between mb-1">
                  <Badge className="text-[10px]">{e.tier}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p>{e.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Semantic facts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(memory.data?.data.facts ?? []).map((f) => (
              <div key={f.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex justify-between mb-1">
                  <Badge className="text-[10px]">{f.status}</Badge>
                  {f.status === 'pending' && (
                    <Button size="sm" variant="outline" onClick={() => approve.mutate(f.id)}>
                      Approve
                    </Button>
                  )}
                </div>
                <p>{f.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
