import { useEffect, useState } from 'react';
import { DEMO_WORKFORCE_TASKS, DEMO_THINKING_STEPS } from './data';

export interface LiveWorkforceTask {
  id: string;
  agent: string;
  task: string;
  progress: number;
}

/** Simulates continuously updating AI workforce progress */
export function useLiveWorkforce(enabled: boolean) {
  const [tasks, setTasks] = useState<LiveWorkforceTask[]>(DEMO_WORKFORCE_TASKS);

  useEffect(() => {
    if (!enabled) {
      setTasks(DEMO_WORKFORCE_TASKS);
      return;
    }
    const interval = setInterval(() => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.progress >= 100) {
            return { ...t, progress: 0, task: t.task.replace('...', ' — restarting...') };
          }
          const delta = Math.floor(Math.random() * 8) + 2;
          return { ...t, progress: Math.min(100, t.progress + delta) };
        })
      );
    }, 2200);
    return () => clearInterval(interval);
  }, [enabled]);

  return tasks;
}

/** Cycles through AI thinking steps */
export function useThinkingSimulation(enabled: boolean, active: boolean) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    if (!enabled || !active) {
      setStepIndex(0);
      setIsThinking(false);
      return;
    }
    setIsThinking(true);
    setStepIndex(0);
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      if (i >= DEMO_THINKING_STEPS.length) {
        clearInterval(interval);
        setIsThinking(false);
        return;
      }
      setStepIndex(i);
    }, 900);
    return () => clearInterval(interval);
  }, [enabled, active]);

  return {
    steps: DEMO_THINKING_STEPS,
    currentStep: stepIndex,
    isThinking,
    visibleSteps: DEMO_THINKING_STEPS.slice(0, stepIndex + 1),
  };
}

/** Animated metric that drifts slightly for "live" feel */
export function useLiveMetric(base: number, enabled: boolean) {
  const [value, setValue] = useState(base);

  useEffect(() => {
    if (!enabled) {
      setValue(base);
      return;
    }
    const interval = setInterval(() => {
      setValue(() => base + Math.floor(Math.sin(Date.now() / 3000) * 3));
    }, 1500);
    return () => clearInterval(interval);
  }, [base, enabled]);

  return value;
}
