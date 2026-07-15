import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'General', path: 'general' },
  { label: 'Browser Runtime', path: 'browser-runtime' },
] as const;

type Props = {
  projectId: string;
};

export function ProjectSettingsNav({ projectId }: Props) {
  const { pathname } = useLocation();
  const base = `/projects/${projectId}/settings`;

  return (
    <div className="space-y-3">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/projects" className="hover:text-foreground">
              Projects
            </Link>
          </li>
          <li aria-hidden="true">→</li>
          <li>
            <Link to={`${base}/general`} className="hover:text-foreground">
              Settings
            </Link>
          </li>
          {pathname.includes('browser-runtime') ? (
            <>
              <li aria-hidden="true">→</li>
              <li className="text-foreground font-medium">Browser Runtime</li>
            </>
          ) : (
            <>
              <li aria-hidden="true">→</li>
              <li className="text-foreground font-medium">General</li>
            </>
          )}
        </ol>
      </nav>
      <div className="flex flex-wrap gap-1 border-b pb-px">
        {TABS.map((tab) => {
          const href = `${base}/${tab.path}`;
          const active = pathname.includes(`/settings/${tab.path}`);
          return (
            <Link
              key={tab.path}
              to={href}
              className={cn(
                'px-3 py-1.5 text-sm rounded-t-md border-b-2 -mb-px transition-colors',
                active
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
