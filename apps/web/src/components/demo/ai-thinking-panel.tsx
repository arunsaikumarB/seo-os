import { motion, AnimatePresence } from 'framer-motion';
import { Brain, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function AIThinkingPanel({
  steps,
  currentStep,
  active,
}: {
  steps: string[];
  currentStep: number;
  active: boolean;
}) {
  if (!active && currentStep === 0) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <motion.div
            animate={{ rotate: active ? 360 : 0 }}
            transition={{ repeat: active ? Infinity : 0, duration: 2, ease: 'linear' }}
          >
            <Brain className="h-4 w-4 text-primary" />
          </motion.div>
          AI Thinking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <AnimatePresence mode="popLayout">
          {steps.slice(0, currentStep + 1).map((step, i) => {
            const isLast = i === currentStep;
            const isDone = step === 'Completed.' || i < currentStep;
            return (
              <motion.div
                key={`${step}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex items-center gap-2 text-sm rounded-md px-2 py-1.5',
                  isLast && active && 'bg-primary/10'
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                )}
                <span className={isDone ? 'text-foreground' : 'text-muted-foreground'}>{step}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
