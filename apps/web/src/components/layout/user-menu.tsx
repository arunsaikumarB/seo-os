import { useNavigate } from 'react-router-dom';
import { LogOut, User, Map, Clapperboard } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const { restartTour, enableDemoMode, setShowTour, isDemoMode } = useDemoMode();
  const navigate = useNavigate();

  const initials = (user?.user_metadata?.full_name ?? user?.email ?? 'U')
    .split(' ')
    .map((s: string) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.user_metadata?.avatar_url} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user?.user_metadata?.full_name ?? 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/org/settings/general')}>
          <User className="mr-2 h-4 w-4" />
          Profile & settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/org/executive')}>
          <Map className="mr-2 h-4 w-4" />
          Executive Dashboard
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (!isDemoMode) enableDemoMode();
            setShowTour(true);
          }}
        >
          <Clapperboard className="mr-2 h-4 w-4" />
          Start Product Tour
        </DropdownMenuItem>
        <DropdownMenuItem onClick={restartTour}>
          <Map className="mr-2 h-4 w-4" />
          Restart Tour
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate('/login');
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
