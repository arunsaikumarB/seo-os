import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useApi } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Organization } from '@seo-os/shared';

export function OrgSwitcher() {
  const { fetchMe } = useApi();
  const { currentOrgId, setCurrentOrgId } = useAppStore();

  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  const orgs = (data?.data.organizations ?? []).map((m) => ({
    id: m.org_id,
    role: m.role,
    org: m.organizations as unknown as Organization,
  }));

  const current = orgs.find((o) => o.id === currentOrgId) ?? orgs[0];

  if (!orgs.length) {
    return (
      <Button variant="outline" size="sm" disabled>
        No organization
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[180px]">
          <span className="truncate">{current?.org.name ?? 'Select org'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onClick={() => setCurrentOrgId(o.id)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{o.org.name}</span>
            {o.id === (currentOrgId ?? current?.id) && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
