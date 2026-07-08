import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProjectSchema, type CreateProjectInput } from '@seo-os/shared';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function OnboardingProjectPage() {
  const navigate = useNavigate();
  const { createProject } = useApi();
  const { currentOrgId, setCurrentProjectId } = useAppStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectInput>({ resolver: zodResolver(createProjectSchema) });

  const onSubmit = async (data: CreateProjectInput) => {
    if (!currentOrgId) {
      navigate('/onboarding/organization');
      return;
    }
    try {
      const res = await createProject(currentOrgId, data);
      setCurrentProjectId(res.data.id);
      toast.success('Project created');
      navigate(`/projects/${res.data.id}/mission-control`);
    } catch {
      toast.error('Failed to create project');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create your first project</CardTitle>
          <CardDescription>
            A project represents one website you manage with SEO OS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Project name</Label>
              <Input id="name" placeholder="FlowTask Marketing" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="domain">Domain</Label>
              <Input id="domain" placeholder="flowtask.io" {...register('domain')} />
              {errors.domain && <p className="text-xs text-destructive">{errors.domain.message}</p>}
            </div>
            <Button type="submit" disabled={isSubmitting}>
              Open Mission Control
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
