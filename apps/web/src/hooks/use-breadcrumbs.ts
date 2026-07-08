import { useLocation } from 'react-router-dom';
import type { BreadcrumbItem } from '@/components/layout/breadcrumbs';
import { projectNav } from '@/config/navigation';

export function useBreadcrumbs(projectId: string): BreadcrumbItem[] {
  const location = useLocation();
  const path = location.pathname.replace(`/projects/${projectId}/`, '');
  const segment = path.split('/')[0] || 'mission-control';

  const navItem = projectNav.find((n) => n.href.startsWith(segment) || n.href === path);
  const label = navItem?.label ?? segment.replace(/-/g, ' ');

  return [
    { label: 'Projects', href: '/projects' },
    { label: 'Mission area', href: `/projects/${projectId}/mission-control` },
    { label },
  ];
}
