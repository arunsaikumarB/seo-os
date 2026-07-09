import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, MoreHorizontal, Pencil, Archive, Building2, FolderKanban } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@seo-os/shared';
import { useApi } from '@/hooks/use-api';
import { useActiveOrg } from '@/hooks/use-active-org';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectFormDialog } from '@/components/projects/project-form-dialog';
import { GuidedEmptyState } from '@/components/workflow/guided-empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function ProjectsContent() {
  const queryClient = useQueryClient();
  const { activeOrgId, hasOrganizations, isReady } = useActiveOrg();
  const { fetchProjects, archiveProject } = useApi();
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['projects', activeOrgId],
    queryFn: () => fetchProjects(activeOrgId!),
    enabled: !!activeOrgId,
  });

  const projects = data?.data ?? [];

  const handleArchive = async (project: Project) => {
    try {
      await archiveProject(project.id);
      toast.success('Project archived');
      queryClient.invalidateQueries({ queryKey: ['projects', activeOrgId] });
    } catch {
      toast.error('Failed to archive project');
    }
  };

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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted-foreground">All websites in your organization</p>
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
      ) : projects.length === 0 ? (
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
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id} className="group hover:border-primary/40 transition-colors">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  <CardDescription>{project.domain}</CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditProject(project)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleArchive(project)}>
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link to={`/projects/${project.id}/home`}>Open Project</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      <ProjectFormDialog
        open={!!editProject}
        onOpenChange={(o) => !o && setEditProject(null)}
        mode="edit"
        project={editProject ?? undefined}
      />
    </div>
  );
}

export function ProjectsPage() {
  return <ProjectsContent />;
}
