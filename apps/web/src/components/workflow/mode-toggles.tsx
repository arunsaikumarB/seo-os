import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/app-store';

export function ModeToggles() {
  const learningMode = useAppStore((s) => s.learningMode);
  const setLearningMode = useAppStore((s) => s.setLearningMode);

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
    </div>
  );
}
