import { orgNav, projectNav, type NavItem } from '@/config/navigation';

export interface CommandRoute {
  label: string;
  href: string;
  group: string;
  keywords?: string[];
}

export function getOrgRoutes(): CommandRoute[] {
  return orgNav.map((item) => ({
    label: item.label,
    href: item.href,
    group: 'Organization',
    keywords: [item.label.toLowerCase()],
  }));
}

export function getProjectRoutes(projectId: string): CommandRoute[] {
  return projectNav.map((item) => ({
    label: item.label,
    href: `/projects/${projectId}/${item.href}`,
    group: 'Project',
    keywords: [item.label.toLowerCase()],
  }));
}

export function getGlobalRoutes(projectId?: string): CommandRoute[] {
  const routes: CommandRoute[] = [
    { label: 'All Projects', href: '/projects', group: 'Navigation' },
    ...getOrgRoutes(),
  ];
  if (projectId) routes.push(...getProjectRoutes(projectId));
  routes.push({
    label: 'Executive Dashboard',
    href: '/org/executive',
    group: 'Organization',
    keywords: ['executive', 'ceo', 'metrics'],
  });
  routes.push({
    label: 'Universal Search',
    href: projectId ? `/projects/${projectId}/search` : '/projects',
    group: 'Search',
    keywords: ['search', 'find'],
  });
  return routes;
}

export function flattenNavItems(items: NavItem[], base: string): CommandRoute[] {
  return items.map((item) => ({
    label: item.label,
    href: `${base}/${item.href}`,
    group: 'Navigate',
  }));
}
