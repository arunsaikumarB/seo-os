import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function OrgSettingsGeneralPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization settings</h1>
        <p className="text-muted-foreground">General preferences for your organization</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>Name, industry, and defaults — expanded in Sprint 2</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use the organization switcher in the header to change context. Admin settings API is
          wired; full form UI ships with onboarding polish in Sprint 2.
        </CardContent>
      </Card>
    </div>
  );
}
