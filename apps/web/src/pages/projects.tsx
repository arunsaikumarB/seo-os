import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, MoreHorizontal, Pencil, Archive } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@seo-os/shared';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectFormDialog } from '@/components/projects/project-form-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function ProjectsContent() {
  const queryClient = useQueryClient();
  const { currentOrgId } = useAppStore();
  const { fetchProjects, archiveProject } = useApi();
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['projects', currentOrgId],
    queryFn: () => fetchProjects(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const projects = data?.data ?? [];

  const handleArchive = async (project: Project) => {
    try {
      await archiveProject(project.id);
      toast.success('Project archived');
      queryClient.invalidateQueries({ queryKey: ['projects', currentOrgId] });
    } catch {
      toast.error('Failed to archive project');
    }
  };

  if (!currentOrgId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No organization</CardTitle>
          <CardDescription>Create an organization to manage projects.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/onboarding/organization">Create organization</Link>
          </Button>
        </CardContent>
      </Card>
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
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>Create your first project to open Mission Control.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setCreateOpen(true)}>Create project</Button>
          </CardContent>
        </Card>
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
                  <Link to={`/projects/${project.id}/mission-control`}>Open Mission Control</Link>
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
