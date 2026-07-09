import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoModeToggle } from '@/components/demo/demo-mode-toggle';
import { useDemoMode } from '@/hooks/use-demo-mode';
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
  const { isDemoMode } = useDemoMode();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background/80 px-4 md:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2">
        <OrgSwitcher />
        {showProjectSwitcher && projectId && <ProjectSwitcher projectId={projectId} />}
        <DemoModeToggle />
        {isDemoMode && (
          <Badge className="hidden sm:inline-flex border-primary/30 bg-primary/10 text-primary text-[10px]">
            Executive Demo
          </Badge>
        )}
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
          SEO OS
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        <ModeToggles />
        <NotificationsMenu />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
        >
          {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
