/** Last fill/preview missing targets for Next Missing navigation */
const missingElements: HTMLElement[] = [];

export function setMissingTargets(els: HTMLElement[]): void {
  missingElements.length = 0;
  missingElements.push(...els);
}

export function getMissingTargets(): HTMLElement[] {
  return [...missingElements];
}
