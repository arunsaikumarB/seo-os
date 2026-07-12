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
      'The AI workforce for SEO teams. Let us show you how AI transforms SEO operations.',
    path: null as string | null,
    orgPath: null as string | null,
  },
  {
    title: 'Mission Control',
    description:
      'Your AI Operations Center — live workforce, campaigns, approvals, and system health at a glance.',
    path: 'mission-control',
    orgPath: null,
  },
  {
    title: 'Knowledge Engine',
    description:
      'Upload brand docs and strategy. AI learns your business and grounds every decision.',
    path: 'knowledge/library',
    orgPath: null,
  },
  {
    title: 'SEO Intelligence',
    description:
      'Website analysis, competitors, keywords, and scored opportunities — discovered automatically.',
    path: 'intelligence/website',
    orgPath: null,
  },
  {
    title: 'Campaign Engine',
    description:
      'Turn opportunities into structured campaigns with AI planning and approval workflows.',
    path: 'campaigns',
    orgPath: null,
  },
  {
    title: 'AI Command Center',
    description:
      'ChatGPT-like interface. Ask anything — analyze, create campaigns, generate content.',
    path: 'command-center',
    orgPath: null,
  },
  {
    title: 'Integrations & Technical SEO',
    description:
      'Connect Search Console, Analytics, Slack, and run technical site audits from one hub.',
    path: 'integrations/hub',
    orgPath: null,
  },
  {
    title: 'Closed Beta Feedback',
    description:
      'Report bugs and ideas in Feedback Center. Your input shapes Version 1.0.',
    path: null,
    orgPath: '/org/feedback',
  },
  {
    title: 'Executive Dashboard',
    description: 'Organization-wide metrics, time saved, and productivity scores for leadership.',
    path: null,
    orgPath: '/org/executive',
  },
  {
    title: "You're Ready",
    description:
      'Enable Demo Mode anytime for a fully interactive presentation. Press Ctrl+K for quick navigation. Visit Help for shortcuts.',
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
