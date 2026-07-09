import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '@seo-os/shared';
import { toast } from 'sonner';
import type { Project } from '@seo-os/shared';
import { useApi } from '@/hooks/use-api';
import { useActiveOrg } from '@/hooks/use-active-org';
import { getApiErrorMessage } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  project?: Project;
}

export function ProjectFormDialog({ open, onOpenChange, mode, project }: ProjectFormDialogProps) {
  const queryClient = useQueryClient();
  const { activeOrgId, hasOrganizations } = useActiveOrg();
  const { createProject, updateProject } = useApi();

  const schema = mode === 'create' ? createProjectSchema : updateProjectSchema;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectInput | UpdateProjectInput>({
    resolver: zodResolver(schema),
    defaultValues: project
      ? {
          name: project.name,
          domain: project.domain,
          url: project.url ?? undefined,
          industry: project.industry ?? undefined,
          description: project.description ?? undefined,
        }
      : undefined,
  });

  useEffect(() => {
    if (project && mode === 'edit') {
      reset({
        name: project.name,
        domain: project.domain,
        url: project.url ?? undefined,
        industry: project.industry ?? undefined,
        description: project.description ?? undefined,
      });
    }
  }, [project, mode, reset]);

  const onSubmit = async (data: CreateProjectInput | UpdateProjectInput) => {
    try {
      if (mode === 'create') {
        if (!hasOrganizations || !activeOrgId) {
          toast.error('No organization selected', {
            description: 'Create or select an organization first.',
          });
          return;
        }
        await createProject(activeOrgId, data as CreateProjectInput);
        toast.success('Project created');
      } else if (project) {
        await updateProject(project.id, data);
        toast.success('Project updated');
      }
      queryClient.invalidateQueries({ queryKey: ['projects', activeOrgId] });
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(mode === 'create' ? 'Failed to create project' : 'Failed to update project', {
        description: getApiErrorMessage(err, 'Check organization access and domain format.'),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New project' : 'Edit project'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Add a website to your organization.' : 'Update project details.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="pf-name">Name</Label>
            <Input id="pf-name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="pf-domain">Domain</Label>
            <Input id="pf-domain" {...register('domain')} />
            {errors.domain && <p className="text-xs text-destructive">{errors.domain.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="pf-url">URL (optional)</Label>
            <Input id="pf-url" placeholder="https://example.com" {...register('url')} />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
