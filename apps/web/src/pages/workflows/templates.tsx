import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition } from '@/components/demo/page-transition';

type Template = {
  key: string;
  name: string;
  description: string;
  category: string;
  triggerType: string;
  estimatedMinutes: number;
};

export function WorkflowTemplatesPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { request } = useApi();

  const { data, isLoading } = useQuery({
    queryKey: ['workflow-templates', projectId],
    queryFn: () =>
      request<{ data: Template[] }>(`/v1/projects/${projectId}/workflows/templates`),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: (templateKey: string) =>
      request<{ data: { id: string } }>(`/v1/projects/${projectId}/workflows`, {
        method: 'POST',
        body: JSON.stringify({ templateKey }),
      }),
    onSuccess: (res) => {
      toast.success('Workflow created from template');
      navigate(`/projects/${projectId}/workflows/${res.data.id}`);
    },
    onError: () => toast.error('Failed to create from template'),
  });

  const templates = data?.data ?? [];

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/projects/${projectId}/workflows`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflow Templates</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Built-in automations for common SEO outreach campaigns.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.key}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {t.name}
                  </CardTitle>
                  <Badge>{t.category}</Badge>
                </div>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">~{t.estimatedMinutes} min</p>
                <Button size="sm" onClick={() => createMutation.mutate(t.key)}>
                  Use template
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
