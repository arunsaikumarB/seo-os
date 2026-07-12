import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createOrganizationSchema, type CreateOrganizationInput } from '@seo-os/shared';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { getApiErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function slugifyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function OnboardingOrganizationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { createOrganization, fetchMe } = useApi();
  const setCurrentOrgId = useAppStore((s) => s.setCurrentOrgId);
  const demoMode = useAppStore((s) => s.demoMode);

  const { data: meData, isFetched } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: !demoMode,
  });

  useEffect(() => {
    const existingOrgs = meData?.data.organizations ?? [];
    if (!isFetched || demoMode || existingOrgs.length === 0) return;
    const orgId = existingOrgs[0].org_id;
    setCurrentOrgId(orgId);
    navigate('/projects', { replace: true });
  }, [demoMode, meData?.data.organizations, isFetched, navigate, setCurrentOrgId]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationInput>({ resolver: zodResolver(createOrganizationSchema) });

  const nameValue = watch('name');

  useEffect(() => {
    if (!nameValue) return;
    setValue('slug', slugifyName(nameValue), { shouldValidate: true });
  }, [nameValue, setValue]);

  const onSubmit = async (data: CreateOrganizationInput) => {
    try {
      const res = await createOrganization(data);
      setCurrentOrgId(res.data.id);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Organization created');
      navigate('/onboarding/project');
    } catch (err) {
      toast.error('Failed to create organization', {
        description: getApiErrorMessage(err, 'Try a different URL slug or sign in again.'),
      });
    }
  };

  if (!demoMode && !isFetched) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Badge className="w-fit mb-2 border-border bg-muted/50 text-xs">Step 1 of 17</Badge>
          <CardTitle>Create your organization</CardTitle>
          <CardDescription>
            Organizations separate users, projects, campaigns, reports, and AI memory. Agencies and
            teams start here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Organization name</Label>
              <Input id="name" placeholder="Logisoft" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug">URL slug</Label>
              <Input id="slug" placeholder="logisoft" {...register('slug')} />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens only. Must be unique.
              </p>
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="industry">Industry (optional)</Label>
              <Input id="industry" placeholder="IT Services" {...register('industry')} />
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
