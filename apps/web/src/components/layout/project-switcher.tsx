import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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

interface ProjectSwitcherProps {
  projectId: string;
}

export function ProjectSwitcher({ projectId }: ProjectSwitcherProps) {
  const navigate = useNavigate();
  const { currentOrgId } = useAppStore();
  const { fetchProjects } = useApi();

  const { data } = useQuery({
    queryKey: ['projects', currentOrgId],
    queryFn: () => fetchProjects(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const projects = data?.data ?? [];
  const current = projects.find((p) => p.id === projectId);

  if (!currentOrgId) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 max-w-[200px]">
          <span className="truncate">{current?.name ?? 'Project'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => navigate(`/projects/${p.id}/home`)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{p.name}</span>
            {p.id === projectId && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/projects')}>All projects</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
