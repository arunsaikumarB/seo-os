/** Legacy safety module — Phase 1.1 classification owns skip decisions. */
export const SAFETY_POLICY = {
  neverClickSubmit: true,
  neverSolveCaptcha: true,
  neverFillLogin: true,
  neverFillPayment: true,
  neverSkipWholePageForPricing: true,
} as const;
