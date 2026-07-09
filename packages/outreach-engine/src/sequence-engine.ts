/** Sequence engine — Epic 5 */

import type { SequenceStepInput, SequenceStepType } from './outreach-types.js';
import { DEFAULT_SEQUENCE_STEPS } from './outreach-types.js';

export function getStepLabel(stepType: SequenceStepType): string {
  const labels: Record<SequenceStepType, string> = {
    initial_email: 'Initial outreach',
    wait: 'Wait',
    follow_up: 'Follow-up',
    reminder: 'Reminder',
    final_follow_up: 'Final follow-up',
    close: 'Close campaign',
  };
  return labels[stepType];
}

export function buildDefaultSequence(name: string): { name: string; steps: SequenceStepInput[] } {
  return { name, steps: DEFAULT_SEQUENCE_STEPS };
}

export function getNextActionableStep(
  steps: Array<{ step_order: number; step_type: string; delay_days: number }>,
  currentStep: number
): { stepOrder: number; stepType: string; delayDays: number } | null {
  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
  const next = sorted.find(
    (s) => s.step_order > currentStep && s.step_type !== 'wait' && s.step_type !== 'close'
  );
  if (!next) return null;
  const waitBefore = sorted
    .filter(
      (s) => s.step_order > currentStep && s.step_order < next.step_order && s.step_type === 'wait'
    )
    .reduce((sum, s) => sum + (s.delay_days ?? 0), 0);
  return { stepOrder: next.step_order, stepType: next.step_type, delayDays: waitBefore };
}

export function computeDeliverabilityRates(events: Array<{ event_type: string }>, sent: number) {
  const counts = { sent, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, spam: 0 };
  for (const e of events) {
    const t = e.event_type as keyof typeof counts;
    if (t in counts && t !== 'sent') counts[t]++;
  }
  const delivered = counts.delivered || sent;
  return {
    ...counts,
    openRate: delivered > 0 ? Math.round((counts.opened / delivered) * 100) : 0,
    replyRate: sent > 0 ? Math.round((counts.replied / sent) * 100) : 0,
    bounceRate: sent > 0 ? Math.round((counts.bounced / sent) * 100) : 0,
  };
}
