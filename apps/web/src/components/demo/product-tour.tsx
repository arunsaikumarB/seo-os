import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDemoMode } from '@/hooks/use-demo-mode';

const TOUR_STEPS = [
  {
    title: 'Welcome to SEO OS',
    description:
      'Your AI Backlink Builder. One product flow from import to verified links.',
    path: null as string | null,
    orgPath: null as string | null,
  },
  {
    title: 'Mission Control',
    description:
      'Backlink KPIs only — imports, opportunities, outreach, replies, wins, and success rate.',
    path: 'mission-control',
    orgPath: null,
  },
  {
    title: 'Backlink Builder',
    description:
      'Import websites, run AI analysis, manage the pipeline, campaigns, and verification in one place.',
    path: 'backlink-builder',
    orgPath: null,
  },
  {
    title: 'Import & AI Analysis',
    description:
      'Paste website lists. Browser Intelligence, Knowledge, Memory, and Relationships run automatically in the background.',
    path: 'backlink-builder/import',
    orgPath: null,
  },
  {
    title: 'Campaigns & Outreach',
    description:
      'Qualify opportunities, launch campaigns, and send outreach from the same Backlink Builder section.',
    path: 'campaigns',
    orgPath: null,
  },
  {
    title: 'SEO AI Assistant',
    description:
      'Ask for opportunity priorities, outreach drafts, and verification guidance — focused on backlinks.',
    path: 'command-center',
    orgPath: null,
  },
  {
    title: "You're Ready",
    description:
      'Start with Import Websites. Press Ctrl+K anytime to jump. Visit Help if you get stuck.',
    path: null,
    orgPath: '/org/help',
  },
];

export function ProductTour() {
  const { showTour, setShowTour, setTourCompleted, isDemoMode, enableDemoMode } = useDemoMode();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (showTour && !isDemoMode) enableDemoMode();
  }, [showTour, isDemoMode, enableDemoMode]);

  if (!showTour) return null;

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  function goToStep(next: number) {
    const target = TOUR_STEPS[next];
    if (target?.path && projectId) {
      navigate(`/projects/${projectId}/${target.path}`);
    } else if (target?.orgPath) {
      navigate(target.orgPath);
    }
    setStep(next);
  }

  function finish() {
    setShowTour(false);
    setTourCompleted(true);
    if (projectId) navigate(`/projects/${projectId}/mission-control`);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20 }}
          className="relative w-full max-w-lg rounded-xl border bg-background shadow-2xl p-6"
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-8 w-8"
            onClick={finish}
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="mb-4 flex gap-1">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>

          <p className="text-xs text-muted-foreground mb-1">
            Step {step + 1} of {TOUR_STEPS.length}
          </p>
          <h2 className="text-xl font-semibold mb-2">{current.title}</h2>
          <p className="text-sm text-muted-foreground mb-6">{current.description}</p>

          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={step === 0}
              onClick={() => goToStep(step - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {isLast ? (
              <Button size="sm" onClick={finish}>
                Start Exploring <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={() => goToStep(step + 1)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
