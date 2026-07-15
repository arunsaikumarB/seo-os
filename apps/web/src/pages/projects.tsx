import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Archive,
  Building2,
  FolderKanban,
  Copy,
  RotateCcw,
  Trash2,
  ArchiveRestore,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@seo-os/shared';
import { useApi } from '@/hooks/use-api';
import { useActiveOrg } from '@/hooks/use-active-org';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ProjectFormDialog } from '@/components/projects/project-form-dialog';
import {
  ProjectDangerDialog,
  type ProjectDangerMode,
} from '@/components/projects/project-danger-dialog';
import { GuidedEmptyState } from '@/components/workflow/guided-empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function invalidateProjectQueries(queryClient: ReturnType<typeof useQueryClient>, orgId: string | null) {
  queryClient.invalidateQueries({ queryKey: ['projects'] });
  queryClient.invalidateQueries({ queryKey: ['mission-control-summary'] });
  queryClient.invalidateQueries({ queryKey: ['project'] });
  if (orgId) queryClient.invalidateQueries({ queryKey: ['projects', orgId] });
}

function ProjectsContent() {
  const queryClient = useQueryClient();
  const { activeOrgId, hasOrganizations, isReady } = useActiveOrg();
  const {
    fetchProjects,
    archiveProject,
    restoreProject,
    duplicateProject,
    resetProject,
    deleteProject,
  } = useApi();
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [danger, setDanger] = useState<{
    project: Project;
    mode: ProjectDangerMode;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['projects', activeOrgId, 'all'],
    queryFn: () => fetchProjects(activeOrgId!, { includeArchived: true }),
    enabled: !!activeOrgId,
  });

  const projects = data?.data ?? [];
  const active = useMemo(() => projects.filter((p) => p.status !== 'archived'), [projects]);
  const archived = useMemo(() => projects.filter((p) => p.status === 'archived'), [projects]);

  const lifecycle = useMutation({
    mutationFn: async (opts: {
      mode: ProjectDangerMode | 'restore' | 'duplicate';
      project: Project;
      clearAiLearning?: boolean;
    }) => {
      const { mode, project, clearAiLearning } = opts;
      if (mode === 'archive') return archiveProject(project.id);
      if (mode === 'restore') return restoreProject(project.id);
      if (mode === 'duplicate') return duplicateProject(project.id);
      if (mode === 'reset')
        return resetProject(project.id, { confirm: 'RESET', clearAiLearning });
      if (mode === 'delete') return deleteProject(project.id, { confirm: 'DELETE' });
      throw new Error('Unknown action');
    },
    onSuccess: (_data, vars) => {
      const labels: Record<string, string> = {
        archive: 'Project archived',
        restore: 'Project restored',
        duplicate: 'Project duplicated',
        reset: 'Project reset',
        delete: 'Project deleted',
      };
      toast.success(labels[vars.mode] ?? 'Done');
      setDanger(null);
      invalidateProjectQueries(queryClient, activeOrgId);
    },
    onError: (err: Error) => toast.error(err.message || 'Action failed'),
  });

  if (isReady && !hasOrganizations) {
    return (
      <GuidedEmptyState
        icon={Building2}
        title="Create your first organization"
        description="Organizations separate users, projects, campaigns, reports, and AI memory. This is Step 1 of your SEO journey."
        actionLabel="Create Organization"
        actionHref="/onboarding/organization"
        stepLabel="Step 1 of 17"
        estimatedMinutes={2}
        difficulty="Beginner"
      />
    );
  }

  const renderCard = (project: Project) => {
    const isArchived = project.status === 'archived';
    return (
      <Card
        key={project.id}
        className={`group transition-colors ${isArchived ? 'opacity-80' : 'hover:border-primary/40'}`}
      >
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {project.name}
              {isArchived && <Badge className="text-[10px]">Archived</Badge>}
            </CardTitle>
            <CardDescription>{project.domain}</CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isArchived && (
                <>
                  <DropdownMenuItem onClick={() => setEditProject(project)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => lifecycle.mutate({ mode: 'duplicate', project })}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDanger({ project, mode: 'archive' })}>
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDanger({ project, mode: 'reset' })}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </DropdownMenuItem>
                </>
              )}
              {isArchived && (
                <DropdownMenuItem
                  onClick={() => lifecycle.mutate({ mode: 'restore', project })}
                >
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                  Restore
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDanger({ project, mode: 'delete' })}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant={isArchived ? 'outline' : 'default'}>
            <Link to={`/projects/${project.id}/home`}>
              {isArchived ? 'View (read-only)' : 'Open Project'}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/projects/${project.id}/settings/general`}>Settings</Link>
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted-foreground">
            Enterprise project management — edit, duplicate, archive, reset, delete
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New project
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : active.length === 0 && archived.length === 0 ? (
        <GuidedEmptyState
          icon={FolderKanban}
          title="Create your first SEO project"
          description="Projects organize your website, campaigns, backlinks, and AI knowledge. One project per website."
          actionLabel="Create Project"
          onAction={() => setCreateOpen(true)}
          stepLabel="Step 2 of 17"
          estimatedMinutes={3}
          difficulty="Beginner"
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">{active.map(renderCard)}</div>
          {archived.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Archived projects</h2>
              <div className="grid gap-4 sm:grid-cols-2">{archived.map(renderCard)}</div>
            </div>
          )}
        </>
      )}

      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      <ProjectFormDialog
        open={!!editProject}
        onOpenChange={(o) => !o && setEditProject(null)}
        mode="edit"
        project={editProject ?? undefined}
      />
      {danger && (
        <ProjectDangerDialog
          open={!!danger}
          onOpenChange={(o) => !o && setDanger(null)}
          mode={danger.mode}
          projectId={danger.project.id}
          projectName={danger.project.name}
          pending={lifecycle.isPending}
          onConfirm={async ({ clearAiLearning }) => {
            await lifecycle.mutateAsync({
              mode: danger.mode,
              project: danger.project,
              clearAiLearning,
            });
          }}
        />
      )}
    </div>
  );
}

export function ProjectsPage() {
  return <ProjectsContent />;
}
