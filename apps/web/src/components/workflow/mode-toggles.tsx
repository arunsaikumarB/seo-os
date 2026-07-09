import { GraduationCap, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';

export function ModeToggles() {
  const learningMode = useAppStore((s) => s.learningMode);
  const expertMode = useAppStore((s) => s.expertMode);
  const setLearningMode = useAppStore((s) => s.setLearningMode);
  const setExpertMode = useAppStore((s) => s.setExpertMode);

  return (
    <div className="hidden lg:flex items-center gap-1 mr-2">
      <Button
        variant={learningMode ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setLearningMode(!learningMode)}
        title="Teach SEO concepts as you complete each step"
      >
        <GraduationCap className="h-3.5 w-3.5" />
        Learning
      </Button>
      <Button
        variant={expertMode ? 'secondary' : 'ghost'}
        size="sm"
        className={cn('h-8 gap-1.5 text-xs', expertMode && 'border-primary/30')}
        onClick={() => setExpertMode(!expertMode)}
        title="Show all modules in sidebar for experienced SEO professionals"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Expert
      </Button>
    </div>
  );
}
