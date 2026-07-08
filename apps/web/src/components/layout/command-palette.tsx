import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { getGlobalRoutes } from '@/config/routes';

interface CommandPaletteProps {
  projectId?: string;
}

export function CommandPalette({ projectId }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const routes = getGlobalRoutes(projectId);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl">
        <Command>
          <CommandInput placeholder="Search navigation, pages…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {['Navigation', 'Organization', 'Project', 'Search'].map((group) => {
              const items = routes.filter((r) => r.group === group);
              if (!items.length) return null;
              return (
                <CommandGroup key={group} heading={group}>
                  {items.map((route) => (
                    <CommandItem
                      key={route.href}
                      value={`${route.label} ${route.keywords?.join(' ') ?? ''}`}
                      onSelect={() => {
                        navigate(route.href);
                        setOpen(false);
                      }}
                    >
                      {route.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
