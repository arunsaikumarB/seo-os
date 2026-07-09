import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedProgress } from './animated-progress';
import { DEMO_SCAN_STEPS } from '@/demo/data';
import { CheckCircle2, Globe, Loader2 } from 'lucide-react';

export function WebsiteScanAnimation({
  active,
  onComplete,
}: {
  active: boolean;
  onComplete?: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      if (i >= DEMO_SCAN_STEPS.length) {
        clearInterval(interval);
        onComplete?.();
        return;
      }
      setStep(i);
    }, 1100);
    return () => clearInterval(interval);
  }, [active, onComplete]);

  if (!active && step === 0) return null;

  const progress = Math.round(((step + 1) / DEMO_SCAN_STEPS.length) * 100);

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <motion.div
              animate={{ rotate: active ? 360 : 0 }}
              transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
            >
              <Globe className="h-4 w-4 text-primary" />
            </motion.div>
            Website Analysis in Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AnimatedProgress value={progress} showPulse={active} />
          <div className="space-y-1.5">
            <AnimatePresence mode="popLayout">
              {DEMO_SCAN_STEPS.slice(0, step + 1).map((s, i) => (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-sm"
                >
                  {i < step || s === 'Completed.' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  <span
                    className={
                      i === step && active ? 'text-foreground font-medium' : 'text-muted-foreground'
                    }
                  >
                    {s}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
