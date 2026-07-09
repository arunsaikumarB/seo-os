import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import { GitBranch, ArrowLeft, Plus, Clock, Mail } from 'lucide-react';
import { useState } from 'react';

type Sequence = {
  id: string;
  name: string;
  status: string;
  current_step: number;
  outreach_sequence_steps?: Array<{ count: number }>;
};

type SequenceDetail = Sequence & {
  steps: Array<{
    id: string;
    step_order: number;
    step_type: string;
    delay_days: number;
    subject?: string;
  }>;
};

const STEP_LABELS: Record<string, string> = {
  initial_email: 'Initial outreach',
  wait: 'Wait',
  follow_up: 'Follow-up',
  reminder: 'Reminder',
  final_follow_up: 'Final follow-up',
  close: 'Close campaign',
};

export function SequenceBuilderPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState('Guest Post Outreach');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sequences = useQuery({
    queryKey: ['outreach-sequences', projectId],
    queryFn: () => request<{ data: Sequence[] }>(`/v1/projects/${projectId}/outreach/sequences`),
    enabled: !!projectId,
  });

  const detail = useQuery({
    queryKey: ['outreach-sequence', projectId, selectedId],
    queryFn: () =>
      request<{ data: SequenceDetail }>(
        `/v1/projects/${projectId}/outreach/sequences/${selectedId}`
      ),
    enabled: !!projectId && !!selectedId,
  });

  const create = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/outreach/sequences`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      toast.success('Sequence created with default steps');
      queryClient.invalidateQueries({ queryKey: ['outreach-sequences', projectId] });
    },
  });

  const steps = detail.data?.data?.steps ?? [];

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
            <GitBranch className="h-6 w-6 text-emerald-500" /> Sequence Builder
          </h1>
          <p className="text-muted-foreground">
            Initial outreach → wait → follow-up → reminder → final → close
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
          placeholder="Sequence name"
        />
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="h-4 w-4 mr-1" /> New sequence
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sequences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(sequences.data?.data ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left border rounded-md px-3 py-2 ${selectedId === s.id ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}
              >
                <p className="font-medium text-sm">{s.name}</p>
                <div className="flex gap-2 mt-1">
                  <Badge className="text-[9px] capitalize">{s.status}</Badge>
                  <span className="text-xs text-muted-foreground">Step {s.current_step}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Steps</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedId && <p className="text-sm text-muted-foreground">Select a sequence</p>}
            {steps.map((step, i) => (
              <div key={step.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full border flex items-center justify-center text-xs font-medium">
                    {step.step_order}
                  </div>
                  {i < steps.length - 1 && <div className="w-px h-4 bg-border" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium flex items-center gap-2">
                    {step.step_type === 'wait' ? (
                      <Clock className="h-3.5 w-3.5" />
                    ) : (
                      <Mail className="h-3.5 w-3.5" />
                    )}
                    {STEP_LABELS[step.step_type] ?? step.step_type}
                  </p>
                  {step.step_type === 'wait' && (
                    <p className="text-xs text-muted-foreground">Wait {step.delay_days} days</p>
                  )}
                  {step.subject && (
                    <p className="text-xs text-muted-foreground truncate">{step.subject}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
