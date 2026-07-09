import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAppStore } from '@/stores/app-store';
import { AI_COACH_ANSWERS, AI_COACH_QUESTIONS } from '@/config/page-help';

export function AiCoachPanel() {
  const open = useAppStore((s) => s.aiCoachOpen);
  const setOpen = useAppStore((s) => s.setAiCoachOpen);
  const [answer, setAnswer] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);

  const ask = (q: string) => {
    setQuestion(q);
    setAnswer(AI_COACH_ANSWERS[q] ?? 'I can help with SEO basics. Try another question below.');
    setOpen(true);
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Bot className="h-4 w-4" />
        <span className="hidden sm:inline">Need Help? Ask AI</span>
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/40 md:bg-transparent md:pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed bottom-20 right-4 z-50 w-[calc(100%-2rem)] max-w-sm md:bottom-6"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
            >
              <Card className="shadow-2xl border-primary/20">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-primary" />
                      <p className="font-medium text-sm">AI Coach</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {answer ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">You asked: {question}</p>
                      <p className="text-sm">{answer}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Ask a question to learn SEO concepts while you work.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {AI_COACH_QUESTIONS.map((q) => (
                      <Button
                        key={q}
                        variant="outline"
                        size="sm"
                        className="text-[11px] h-7"
                        onClick={() => ask(q)}
                      >
                        {q}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
