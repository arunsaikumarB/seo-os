import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { BreadcrumbItem } from '@/components/layout/breadcrumbs';
import { workflowNavSections } from '@/config/workflow-navigation';
import { projectNav } from '@/config/navigation';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';

function findNavLabel(path: string): string | undefined {
  for (const section of workflowNavSections) {
    for (const item of section.items) {
      if (item.href === path) return item.label;
      if (path.startsWith(`${item.href}/`)) return item.label;
    }
  }
  const legacy = projectNav.find((n) => n.href === path || path.startsWith(`${n.href}/`));
  return legacy?.label;
}

function formatSegment(segment: string): string {
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useBreadcrumbs(projectId: string): BreadcrumbItem[] {
  const location = useLocation();
  const { currentOrgId } = useAppStore();
  const { fetchProjects } = useApi();

  const path = location.pathname.replace(`/projects/${projectId}/`, '').replace(/^\//, '');
  const segments = path.split('/').filter(Boolean);

  const { data } = useQuery({
    queryKey: ['projects', currentOrgId],
    queryFn: () => fetchProjects(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const project = data?.data.find((p) => p.id === projectId);
  const projectName = project?.name ?? 'Project';

  const crumbs: BreadcrumbItem[] = [
    { label: 'Workspace', href: '/projects' },
    { label: 'Projects', href: '/projects' },
    { label: projectName, href: `/projects/${projectId}/home` },
  ];

  if (segments.length === 0 || segments[0] === 'home') {
    crumbs.push({ label: 'Project Overview' });
    return crumbs;
  }

  const sectionPath = segments.slice(0, 2).join('/');
  const singlePath = segments[0];
  const sectionLabel = findNavLabel(sectionPath) ?? findNavLabel(singlePath);

  if (sectionLabel) {
    crumbs.push({
      label: sectionLabel,
      href:
        segments.length > 1
          ? `/projects/${projectId}/${singlePath}`
          : undefined,
    });
  }

  if (segments.length > 1 && segments[0] !== segments[segments.length - 1]) {
    const leaf = segments[segments.length - 1];
    const leafLabel = findNavLabel(segments.join('/')) ?? formatSegment(leaf);
    if (leafLabel !== sectionLabel) {
      crumbs.push({ label: leafLabel });
    }
  } else if (!sectionLabel) {
    crumbs.push({ label: formatSegment(singlePath) });
  }

  return crumbs;
}
