import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Settings,
  Archive,
  ArchiveRestore,
  Copy,
  RotateCcw,
  Trash2,
  MonitorSmartphone,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import {
  ProjectDangerDialog,
  type ProjectDangerMode,
} from '@/components/projects/project-danger-dialog';
import { ProjectSettingsNav } from '@/components/settings/project-settings-nav';
import type { Project } from '@seo-os/shared';

export function ProjectSettingsPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const {
    request,
    updateProject,
    archiveProject,
    restoreProject,
    duplicateProject,
    resetProject,
    deleteProject,
  } = useApi();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [url, setUrl] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [dangerMode, setDangerMode] = useState<ProjectDangerMode | null>(null);

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => request<{ data: Project }>(`/v1/projects/${projectId}`),
    enabled: !!projectId,
  });

  const p = project.data?.data;
  const isArchived = p?.status === 'archived';

  useEffect(() => {
    if (!p) return;
    setName(p.name ?? '');
    setDomain(p.domain ?? '');
    setUrl(p.url ?? '');
    setIndustry(p.industry ?? '');
    setDescription(p.description ?? '');
  }, [p?.id, p?.name, p?.domain, p?.url, p?.industry, p?.description]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['mission-control-summary'] });
    queryClient.invalidateQueries({ queryKey: ['project-impact', projectId] });
  };

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
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update project'),
  });

  const quick = useMutation({
    mutationFn: async (action: 'restore' | 'duplicate') => {
      if (action === 'restore') return restoreProject(projectId);
      return duplicateProject(projectId);
    },
    onSuccess: (res, action) => {
      toast.success(action === 'restore' ? 'Project restored' : 'Project duplicated');
      invalidateAll();
      if (action === 'duplicate' && res.data?.id) {
        navigate(`/projects/${res.data.id}/settings/general`);
      }
    },
    onError: (err: Error) => toast.error(err.message || 'Action failed'),
  });

  const danger = useMutation({
    mutationFn: async (opts: { mode: ProjectDangerMode; clearAiLearning?: boolean }) => {
      if (opts.mode === 'archive') return archiveProject(projectId);
      if (opts.mode === 'reset')
        return resetProject(projectId, {
          confirm: 'RESET',
          clearAiLearning: opts.clearAiLearning,
        });
      return deleteProject(projectId, { confirm: 'DELETE' });
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.mode === 'archive'
          ? 'Project archived'
          : vars.mode === 'reset'
            ? 'Project reset'
            : 'Project deleted'
      );
      setDangerMode(null);
      invalidateAll();
      if (vars.mode === 'delete') navigate('/projects');
      if (vars.mode === 'archive') navigate('/projects');
    },
    onError: (err: Error) => toast.error(err.message || 'Action failed'),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <ProjectSettingsNav projectId={projectId} />
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Settings className="h-6 w-6" /> Project settings
        </h1>
        <p className="text-muted-foreground">Website details and enterprise project lifecycle</p>
      </div>

      {isArchived && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              This project is <strong>archived</strong> and read-only. Restore it to resume work.
            </p>
            <Button
              size="sm"
              disabled={quick.isPending}
              onClick={() => quick.mutate('restore')}
            >
              <ArchiveRestore className="h-4 w-4 mr-1" /> Restore
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">General</CardTitle>
              <CardDescription>Name, domain, and description for this project</CardDescription>
            </div>
            {p?.status && <Badge className="capitalize text-[10px]">{p.status}</Badge>}
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
                <Input
                  id="proj-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isArchived}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proj-domain">Domain</Label>
                <Input
                  id="proj-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                  disabled={isArchived}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proj-url">URL</Label>
                <Input
                  id="proj-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  disabled={isArchived}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proj-industry">Industry</Label>
                <Input
                  id="proj-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  disabled={isArchived}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proj-desc">Description</Label>
                <textarea
                  id="proj-desc"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isArchived}
                />
              </div>
              <Button
                onClick={() => save.mutate()}
                disabled={
                  isArchived ||
                  save.isPending ||
                  name.trim().length < 2 ||
                  domain.trim().length < 3
                }
              >
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4" /> Browser Runtime
          </CardTitle>
          <CardDescription>
            Playwright / Chromium health for Browser Execution. Reinstall, repair, and run diagnostics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link to={`/projects/${projectId}/settings/browser-runtime`}>
              Open Browser Runtime <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project actions</CardTitle>
          <CardDescription>
            Duplicate copies settings, business profile, providers, and campaign templates — never
            reports or execution history.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!p || quick.isPending || isArchived}
            onClick={() => quick.mutate('duplicate')}
          >
            <Copy className="h-4 w-4 mr-1" /> Duplicate project
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Archive (read-only), reset operational data, or permanently delete this project
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!isArchived ? (
            <Button
              variant="outline"
              className="text-destructive"
              disabled={!p || danger.isPending}
              onClick={() => setDangerMode('archive')}
            >
              <Archive className="h-4 w-4 mr-1" /> Archive
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={!p || quick.isPending}
              onClick={() => quick.mutate('restore')}
            >
              <ArchiveRestore className="h-4 w-4 mr-1" /> Restore
            </Button>
          )}
          <Button
            variant="outline"
            className="text-destructive"
            disabled={!p || danger.isPending || isArchived}
            onClick={() => setDangerMode('reset')}
          >
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            disabled={!p || danger.isPending}
            onClick={() => setDangerMode('delete')}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        </CardContent>
      </Card>

      {dangerMode && p && (
        <ProjectDangerDialog
          open={!!dangerMode}
          onOpenChange={(o) => !o && setDangerMode(null)}
          mode={dangerMode}
          projectId={projectId}
          projectName={p.name}
          pending={danger.isPending}
          onConfirm={async ({ clearAiLearning }) => {
            await danger.mutateAsync({ mode: dangerMode, clearAiLearning });
          }}
        />
      )}
    </div>
  );
}
