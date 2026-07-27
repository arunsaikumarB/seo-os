/**
 * Whether a submission strategy needs image/video assets.
 *
 * Manual directory submissions are usually text-only. Type-level hints like
 * "logo often required" must NOT trigger Flux / quality checks — only a real
 * file or image upload field on the target form.
 */

export type MediaNeedSignal = {
  /** Recipe has attachment / file fields */
  hasAttachmentField?: boolean;
  /**
   * @deprecated Planning hint only — ignored by strategyNeedsMedia.
   * Type defaults ("logo often required") must not enqueue image jobs.
   */
  mediaRequirements?: { images?: boolean; videos?: boolean } | null;
  /** Live HTML: target form has file / image upload control */
  htmlHasImageUpload?: boolean;
  htmlHasVideoUpload?: boolean;
  /** Observed attachment support from form intelligence (not type defaults) */
  attachmentSupport?: boolean | null;
  /**
   * @deprecated Heuristic learning flag — ignored unless paired with a real
   * upload field. Prefer hasAttachmentField / htmlHasImageUpload.
   */
  logoRequired?: boolean | null;
};

export type MediaNeedDecision = {
  images: boolean;
  videos: boolean;
  reason: string;
};

/** Detect file/image upload controls in form HTML (not type-level guesses). */
export function htmlHasFileOrImageUpload(html: string): boolean {
  if (!html) return false;
  if (/type=["']file["']/i.test(html)) return true;
  if (/accept=["'][^"']*image/i.test(html)) return true;
  if (/upload\s*(an?\s+)?(image|logo|photo|avatar|cover|banner|picture)/i.test(html)) return true;
  return false;
}

export function htmlHasVideoUploadControl(html: string): boolean {
  if (!html) return false;
  return /accept=["'][^"']*video/i.test(html) || /upload\s*(an?\s+)?video/i.test(html);
}

export function strategyNeedsMedia(signal: MediaNeedSignal): MediaNeedDecision {
  // Concrete form evidence only — never mediaRequirements / logoRequired heuristics.
  const images =
    Boolean(signal.hasAttachmentField) ||
    Boolean(signal.htmlHasImageUpload) ||
    signal.attachmentSupport === true;
  const videos = Boolean(signal.htmlHasVideoUpload);

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
      ? 'Form has image and video upload fields'
      : images
        ? 'Form has file/image upload field'
        : 'Form has video upload field',
  };
}
