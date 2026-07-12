import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';

export function BetaAnnouncementBar() {
  const { request } = useApi();
  const q = useQuery({
    queryKey: ['beta-announcements'],
    queryFn: () =>
      request<{ data: Array<{ id: string; title: string; body: string; severity: string; href?: string }> }>(
        '/v1/beta/announcements'
      ),
    staleTime: 60_000,
  });

  const item = q.data?.data?.[0];
  if (!item) return null;

  return (
    <div className="flex items-start gap-2 border-b bg-muted/40 px-4 py-2 text-sm md:px-6">
      <Megaphone className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium truncate">{item.title}</span>
          <Badge className="text-[9px]">{item.severity}</Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{item.body}</p>
      </div>
      {item.href && (
        <Link className="text-xs underline shrink-0" to={item.href}>
          Open
        </Link>
      )}
    </div>
  );
}
