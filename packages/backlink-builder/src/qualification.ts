/** Qualify classified domains before opportunity persistence */

import type { DomainAnalysisResult } from './domain-analyzer.js';
import type { ClassificationResult } from './classification.js';
import { getScoreTier } from './scoring.js';
import { getTypeLabel, type BacklinkTypeId } from './backlink-types.js';

/** Existing medium score tier floor — not an invented lower threshold */
export const MIN_QUALIFY_SCORE = 55;

export interface QualificationResult {
  domain: string;
  websiteName: string;
  classificationLabel: string;
  backlinkType: BacklinkTypeId;
  score: number;
  scoreTier: string;
  qualified: boolean;
  reason: string;
  signals: {
    metricsSource: string;
    hasGuestPostHint: boolean;
    hasGuidelines: boolean;
    hasContactLink: boolean;
    hasPublicSubmissionPath: boolean;
    spamRisk: number;
    fetchStatusCode?: number;
  };
}

function displayLabel(type: BacklinkTypeId): string {
  if (type === 'news' || type === 'press_release' || type === 'digital_pr') return 'Editorial';
  if (type === 'guest_post') return 'Guest Post';
  if (type === 'resource_page') return 'Resource Page';
  return getTypeLabel(type);
}

function hasPublicSubmissionPath(analysis: DomainAnalysisResult): boolean {
  const meta = analysis.metadata ?? {};
  if (meta.hasGuestPostHint === true) return true;
  if (meta.hasGuidelines === true) return true;
  // Only trust detected outreach pages that live fetch confirmed — not heuristic guesses
  if (meta.submissionPathConfirmed === true) return true;
  if (meta.hasContactLink === true && Boolean(analysis.detectedPages.contact)) return true;
  if (Boolean(analysis.detectedPages.directory) && meta.directoryPathConfirmed === true) return true;
  if (Boolean(analysis.detectedPages.forum) && meta.forumPathConfirmed === true) return true;
  if (Boolean(analysis.detectedPages.qa) && meta.qaPathConfirmed === true) return true;
  const signals = analysis.websiteSignals;
  if (signals) {
    if (
      signals.hasWriteForUs ||
      signals.hasSubmitListing ||
      signals.hasAddBusiness ||
      signals.hasCreateProfile ||
      signals.hasVideoUpload ||
      signals.hasImageGallery ||
      signals.hasForum ||
      signals.hasQa ||
      signals.hasMarketplace ||
      signals.hasPressRoom ||
      signals.formActions.length > 0
    ) {
      return true;
    }
  }
  const classification = meta.classification as { confidence?: number; id?: string } | undefined;
  if (
    classification &&
    Number(classification.confidence ?? 0) >= 70 &&
    classification.id &&
    classification.id !== 'unknown' &&
    classification.id !== 'outreach_required'
  ) {
    return true;
  }
  return false;
}

/**
 * Gate between classify and opportunity insert.
 * Does not invent opportunities — rejects without live outreach evidence.
 */
export function qualifyOpportunity(
  analysis: DomainAnalysisResult,
  classification: ClassificationResult
): QualificationResult {
  const scoreTier = getScoreTier(classification.opportunityScore);
  const spamRisk = classification.spamRisk;
  const signals = {
    metricsSource: analysis.metricsSource,
    hasGuestPostHint: analysis.metadata?.hasGuestPostHint === true,
    hasGuidelines: analysis.metadata?.hasGuidelines === true,
    hasContactLink: analysis.metadata?.hasContactLink === true,
    hasPublicSubmissionPath: hasPublicSubmissionPath(analysis),
    spamRisk,
    fetchStatusCode: analysis.fetchStatusCode,
  };

  const label = classification.classificationLabel || displayLabel(classification.backlinkType);
  const base = {
    domain: analysis.domain,
    websiteName: analysis.websiteName,
    classificationLabel: label,
    backlinkType: classification.backlinkType,
    score: classification.opportunityScore,
    scoreTier,
    signals,
  };

  if (classification.opportunityScore < MIN_QUALIFY_SCORE) {
    return {
      ...base,
      qualified: false,
      reason: `Score ${classification.opportunityScore} below medium tier (${MIN_QUALIFY_SCORE})`,
    };
  }

  if (spamRisk >= 55) {
    return {
      ...base,
      qualified: false,
      reason: `Spam risk ${spamRisk} exceeds safe outreach threshold`,
    };
  }

  if (analysis.fetchStatusCode && analysis.fetchStatusCode >= 400) {
    return {
      ...base,
      qualified: false,
      reason: `Homepage unreachable (HTTP ${analysis.fetchStatusCode})`,
    };
  }

  // Existing high tier (75+) with live reachability — escalate for manual path confirmation
  if (classification.opportunityScore >= 75 && analysis.metricsSource === 'live') {
    return {
      ...base,
      qualified: true,
      reason: 'High-score live domain — queued for outreach path review',
    };
  }

  if (!signals.hasPublicSubmissionPath) {
    return {
      ...base,
      qualified: false,
      reason: 'No public submission path',
    };
  }

  return {
    ...base,
    qualified: true,
    reason: signals.hasGuestPostHint
      ? 'Live guest/contribute path detected'
      : signals.hasGuidelines
        ? 'Editorial guidelines detected'
        : 'Public contact/outreach path confirmed',
  };
}

export function formatQualificationReport(rows: QualificationResult[]): string {
  return rows
    .map((r) =>
      [
        r.websiteName || r.domain,
        `Classification:`,
        r.classificationLabel,
        `Score: ${r.score}`,
        `Qualified: ${r.qualified ? 'YES' : 'NO'}`,
        ...(r.qualified ? [] : [`Reason:`, r.reason]),
      ].join('\n')
    )
    .join('\n\n');
}
