import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Clock, GraduationCap } from 'lucide-react';
import { APP_NAME } from '@seo-os/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TOTAL_WORKFLOW_STEPS } from '@/config/workflow-steps';

export function OnboardingWelcomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <Card className="border-primary/20 shadow-lg">
          <CardContent className="pt-10 pb-8 px-8 text-center space-y-6">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
            >
              <Sparkles className="h-8 w-8 text-primary" />
            </motion.div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Welcome to {APP_NAME}</p>
              <h1 className="text-2xl font-bold tracking-tight">
                Let&apos;s optimize your website together
              </h1>
              <p className="text-muted-foreground text-sm">
                Your AI mentor will guide you through {TOTAL_WORKFLOW_STEPS} steps — from first
                scan to verified backlinks.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <Badge className="gap-1 border-border bg-muted/50">
                <Clock className="h-3 w-3" />~25 min total
              </Badge>
              <Badge className="gap-1 border-border bg-muted/50">
                <GraduationCap className="h-3 w-3" />
                Beginner
              </Badge>
              <Badge className="bg-muted">Step 1 of {TOTAL_WORKFLOW_STEPS}</Badge>
            </div>

            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/onboarding/organization">Start</Link>
            </Button>

            <p className="text-xs text-muted-foreground">
              Already have an account?{' '}
              <Link to="/projects" className="text-primary hover:underline">
                Go to projects
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
