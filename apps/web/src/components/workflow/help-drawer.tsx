import { AnimatePresence, motion } from 'framer-motion';
import { X, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/app-store';
import { getPageHelp } from '@/config/page-help';
import { usePageHelpKey } from '@/hooks/use-workflow';

interface HelpDrawerProps {
  projectId: string;
}

export function HelpDrawer({ projectId }: HelpDrawerProps) {
  const open = useAppStore((s) => s.helpDrawerOpen);
  const setOpen = useAppStore((s) => s.setHelpDrawerOpen);
  const pathKey = usePageHelpKey(projectId);
  const help = getPageHelp(pathKey);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-4 w-4" />
        <span className="hidden sm:inline">What is this?</span>
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            >
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Help</p>
                  <h2 className="text-lg font-semibold">{help.title}</h2>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm">
                <section>
                  <h3 className="font-medium mb-1">Purpose</h3>
                  <p className="text-muted-foreground">{help.purpose}</p>
                </section>
                <section>
                  <h3 className="font-medium mb-1">Why it matters</h3>
                  <p className="text-muted-foreground">{help.whyItMatters}</p>
                </section>
                <section>
                  <h3 className="font-medium mb-1">How AI uses it</h3>
                  <p className="text-muted-foreground">{help.howAiUsesIt}</p>
                </section>
                <section>
                  <h3 className="font-medium mb-2">Best practices</h3>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    {help.bestPractices.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-lg border bg-muted/30 p-4">
                  <h3 className="font-medium mb-1">Real example</h3>
                  <p className="text-muted-foreground italic">{help.example}</p>
                </section>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
