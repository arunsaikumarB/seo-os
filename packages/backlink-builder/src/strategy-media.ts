/**
 * Phase 9 — whether a submission strategy needs image/video assets.
 * Plain directory text forms → skip media generation.
 */

export type MediaNeedSignal = {
  /** Recipe has attachment / file fields */
  hasAttachmentField?: boolean;
  /** From detectSubmissionRequirements().mediaRequirements */
  mediaRequirements?: { images?: boolean; videos?: boolean } | null;
  /** Live HTML hints */
  htmlHasImageUpload?: boolean;
  htmlHasVideoUpload?: boolean;
  /** SIE / directory learning */
  attachmentSupport?: boolean | null;
  logoRequired?: boolean | null;
};

export type MediaNeedDecision = {
  images: boolean;
  videos: boolean;
  reason: string;
};

export function strategyNeedsMedia(signal: MediaNeedSignal): MediaNeedDecision {
  const images =
    Boolean(signal.hasAttachmentField) ||
    Boolean(signal.mediaRequirements?.images) ||
    Boolean(signal.htmlHasImageUpload) ||
    Boolean(signal.attachmentSupport) ||
    Boolean(signal.logoRequired);
  const videos =
    Boolean(signal.mediaRequirements?.videos) || Boolean(signal.htmlHasVideoUpload);

  if (!images && !videos) {
    return {
      images: false,
      videos: false,
      reason: 'Submission strategy is text-only — skipping image/video generation',
    };
  }
  return {
    images,
    videos,
    reason: images && videos
      ? 'Strategy requires images and video'
      : images
        ? 'Strategy requires image/logo upload'
        : 'Strategy requires video upload',
  };
}
