/**
 * P1 — background writes that used to run on every Campaign Health poll.
 */
export async function runCampaignHealthReconcile(workspaceId: string): Promise<void> {
  const { sweepOrphanAssets } = await import('../campaigns/content-generation.service.js');
  await sweepOrphanAssets(workspaceId).catch(() => undefined);
  try {
    const { reconcileGenerationHandoff } = await import(
      '../campaigns/generation-handoff.service.js'
    );
    await reconcileGenerationHandoff(workspaceId);
  } catch {
    /* ignore */
  }
  try {
    const { ensureExecutionJobsForReady } = await import(
      '../browser-execution/execution-pipeline.service.js'
    );
    await ensureExecutionJobsForReady({
      workspaceId,
      startImmediately: false,
    });
  } catch {
    /* ignore */
  }
}
