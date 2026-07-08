import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createOrganizationSchema, type CreateOrganizationInput } from '@seo-os/shared';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function OnboardingOrganizationPage() {
  const navigate = useNavigate();
  const { createOrganization } = useApi();
  const setCurrentOrgId = useAppStore((s) => s.setCurrentOrgId);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationInput>({ resolver: zodResolver(createOrganizationSchema) });

  const onSubmit = async (data: CreateOrganizationInput) => {
    try {
      const res = await createOrganization(data);
      setCurrentOrgId(res.data.id);
      toast.success('Organization created');
      navigate('/onboarding/project');
    } catch {
      toast.error('Failed to create organization');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create your organization</CardTitle>
          <CardDescription>
            Agencies and teams start here. You can add unlimited projects next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Organization name</Label>
              <Input id="name" placeholder="Acme Agency" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug">URL slug</Label>
              <Input id="slug" placeholder="acme-agency" {...register('slug')} />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="industry">Industry (optional)</Label>
              <Input id="industry" placeholder="Marketing" {...register('industry')} />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
