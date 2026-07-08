import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageTransition } from '@/components/demo/page-transition';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { DEMO_CHAT_PROMPTS, DEMO_PROJECTS, DEMO_KB_DOCUMENTS, DEMO_OPPORTUNITIES } from '@/demo/data';

const DEMO_SEARCH_RESULTS = [
  ...DEMO_PROJECTS.map((p) => ({ type: 'Project', title: p.name, subtitle: p.domain, href: 'mission-control' })),
  ...DEMO_KB_DOCUMENTS.map((d) => ({ type: 'Document', title: d.title, subtitle: `${d.chunks} chunks`, href: 'knowledge/library' })),
  ...DEMO_OPPORTUNITIES.map((o) => ({ type: 'Opportunity', title: o.title, subtitle: `Score ${o.score}`, href: 'campaigns/queue' })),
];

export function SearchPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { isDemoMode } = useDemoMode();
  const [query, setQuery] = useState('');

  const results = query.length > 0
    ? DEMO_SEARCH_RESULTS.filter(
        (r) =>
          r.title.toLowerCase().includes(query.toLowerCase()) ||
          r.subtitle.toLowerCase().includes(query.toLowerCase())
      )
    : DEMO_SEARCH_RESULTS.slice(0, 6);

  return (
    <PageTransition className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Search className="h-6 w-6" /> Universal Search
        </h1>
        <p className="text-muted-foreground">Search projects, documents, opportunities, and more</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search anything..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!isDemoMode && (
        <p className="text-sm text-muted-foreground text-center">Enable Demo Mode for instant search results.</p>
      )}

      <div className="space-y-2">
        {results.map((r) => (
          <Card
            key={`${r.type}-${r.title}`}
            className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
            onClick={() => projectId && navigate(`/projects/${projectId}/${r.href}`)}
          >
            <CardContent className="py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.subtitle}</p>
              </div>
              <span className="text-[10px] text-muted-foreground uppercase">{r.type}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {DEMO_CHAT_PROMPTS.slice(0, 4).map((p) => (
          <Button
            key={p}
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => projectId && navigate(`/projects/${projectId}/command-center`)}
          >
            <Sparkles className="h-3 w-3 mr-1" /> {p}
          </Button>
        ))}
      </div>
    </PageTransition>
  );
}
