/**
 * Watch for wizard step changes after the user clicks Continue manually.
 * When newly visible fillable fields appear, auto-fill from the current package.
 */
import type { OpportunityPackageFields } from '../types';
import { fillMatchedFields } from '../fill/form-filler';
import { noopDomainLearning } from '../hooks';

let observer: MutationObserver | null = null;
let enabled = false;
let pkg: OpportunityPackageFields | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastFingerprint = '';

function visibleFieldFingerprint(): string {
  const inputs = Array.from(
    document.querySelectorAll('input:not([type="hidden"]), textarea, select, [contenteditable="true"]')
  ) as HTMLElement[];
  return inputs
    .filter((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0;
    })
    .map((el) => `${el.tagName}:${el.id}:${el.getAttribute('name')}:${el.getAttribute('type')}`)
    .join('|');
}

function maybeAutofill(): void {
  if (!enabled || !pkg) return;
  const fp = visibleFieldFingerprint();
  if (fp === lastFingerprint) return;
  lastFingerprint = fp;
  fillMatchedFields({
    package: pkg,
    domainLearning: noopDomainLearning,
    visibleOnly: true,
  });
}

export function startWizardWatcher(opportunityPackage: OpportunityPackageFields): void {
  pkg = opportunityPackage;
  enabled = true;
  lastFingerprint = visibleFieldFingerprint();
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => maybeAutofill(), 450);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
  });
}

export function stopWizardWatcher(): void {
  enabled = false;
  pkg = null;
  observer?.disconnect();
  observer = null;
}

export function isWizardWatcherActive(): boolean {
  return enabled;
}
