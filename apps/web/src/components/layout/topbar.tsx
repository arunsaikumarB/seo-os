import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/providers/theme-provider';
import { Moon, Sun } from 'lucide-react';
import { OrgSwitcher } from './org-switcher';
import { ProjectSwitcher } from './project-switcher';
import { UserMenu } from './user-menu';
import { NotificationsMenu } from './notifications-menu';
import { ModeToggles } from '@/components/workflow/mode-toggles';

interface TopbarProps {
  projectId?: string;
  showProjectSwitcher?: boolean;
}

export function Topbar({ projectId, showProjectSwitcher = false }: TopbarProps) {
  const { resolved, setTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background/80 px-4 md:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2">
        <OrgSwitcher />
        {showProjectSwitcher && projectId && <ProjectSwitcher projectId={projectId} />}
        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-2 text-muted-foreground sm:flex"
          disabled
        >
          <Search className="h-4 w-4" />
          Search
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline-flex">
            Ctrl K
          </kbd>
        </Button>
        <Badge className="hidden border-border bg-muted/50 text-[10px] font-normal text-muted-foreground sm:inline-flex">
          Backlink Ops
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        <ModeToggles />
        <NotificationsMenu />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
