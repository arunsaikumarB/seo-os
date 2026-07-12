import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Settings, Archive } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import type { Project } from '@seo-os/shared';

export function ProjectSettingsPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { request, updateProject, archiveProject } = useApi();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [url, setUrl] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => request<{ data: Project }>(`/v1/projects/${projectId}`),
    enabled: !!projectId,
  });

  const p = project.data?.data;

  useEffect(() => {
    if (!p) return;
    setName(p.name ?? '');
    setDomain(p.domain ?? '');
    setUrl(p.url ?? '');
    setIndustry(p.industry ?? '');
    setDescription(p.description ?? '');
  }, [p?.id, p?.name, p?.domain, p?.url, p?.industry, p?.description]);

  const save = useMutation({
    mutationFn: () =>
      updateProject(projectId, {
        name: name.trim(),
        domain: domain.trim(),
        url: url.trim() || undefined,
        industry: industry.trim() || undefined,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Project updated');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update project'),
  });

  const archive = useMutation({
    mutationFn: () => archiveProject(projectId),
    onSuccess: () => {
      toast.success('Project archived');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to archive project'),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Settings className="h-6 w-6" /> Project settings
        </h1>
        <p className="text-muted-foreground">Website details and workspace configuration</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">General</CardTitle>
              <CardDescription>Name, domain, and description for this project</CardDescription>
            </div>
            {p?.status && (
              <Badge className="capitalize text-[10px]">{p.status}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : project.isError || !p ? (
            <p className="text-sm text-destructive">Unable to load project.</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="proj-name">Name</Label>
                <Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proj-domain">Domain</Label>
                <Input
                  id="proj-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proj-url">URL</Label>
                <Input
                  id="proj-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proj-industry">Industry</Label>
                <Input
                  id="proj-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proj-desc">Description</Label>
                <textarea
                  id="proj-desc"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground font-mono">Project ID: {projectId}</p>
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || name.trim().length < 2 || domain.trim().length < 3}
              >
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>Archive removes this project from active workspaces</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="text-destructive"
            disabled={archive.isPending || !p || p.status === 'archived'}
            onClick={() => {
              if (window.confirm('Archive this project? You can contact support to restore later.')) {
                archive.mutate();
              }
            }}
          >
            <Archive className="h-4 w-4 mr-1" /> Archive project
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
