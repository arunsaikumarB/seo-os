import { WorkflowProgressHeader } from '@/components/workflow/workflow-progress-header';

type Props = {
  projectId: string;
  className?: string;
};

/** @deprecated Prefer WorkflowProgressHeader — kept as thin alias for shell imports */
export function WorkflowContextBar({ projectId, className }: Props) {
  return <WorkflowProgressHeader projectId={projectId} className={className} />;
}
