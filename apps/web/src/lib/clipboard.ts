/**
 * Reliable clipboard write for Assisted Manual Copy buttons.
 *
 * Prefer sync execCommand first while the click user-gesture is still valid,
 * then Clipboard API. navigator.clipboard.writeText alone often "succeeds"
 * after the gesture expires and leaves paste empty on the target site.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  const value = String(text ?? '');
  if (!value) {
    throw new Error('Nothing to copy');
  }

  // 1) Sync fallback — must run immediately inside the click handler
  if (copyViaExecCommand(value)) {
    // Also mirror into Clipboard API when available (best-effort)
    void tryClipboardApi(value);
    return;
  }

  // 2) Clipboard API if execCommand was blocked
  const apiOk = await tryClipboardApi(value);
  if (apiOk) return;

  throw new Error('Clipboard copy failed — select the text and press Ctrl+C');
}

async function tryClipboardApi(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function copyViaExecCommand(value: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  // Keep in viewport — off-screen nodes are skipped by some browsers
  ta.style.cssText =
    'position:fixed;top:0;left:0;width:2px;height:2px;padding:0;margin:0;border:0;opacity:0;z-index:-1;';
  document.body.appendChild(ta);

  const selection = document.getSelection();
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  let ok = false;
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(ta);
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }
  return ok;
}
