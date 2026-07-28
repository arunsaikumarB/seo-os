/** Shared Companion types — Phase 1. Designed for Phase 2+ domain learning & AI matchers. */

export type FieldRole =
  | 'business_name'
  | 'website'
  | 'email'
  | 'phone'
  | 'title'
  | 'description'
  | 'address'
  | 'city'
  | 'state'
  | 'country'
  | 'zip'
  | 'facebook'
  | 'linkedin'
  | 'twitter'
  | 'unknown';

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none';

export interface BusinessProfile {
  businessName: string;
  website: string;
  email: string;
  phone: string;
  title: string;
  description: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  facebook: string;
  linkedin: string;
  twitter: string;
}

export interface DetectedField {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  tag: 'input' | 'textarea' | 'select';
  type: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  labelText: string;
  autocomplete: string;
  /** Concatenated signals used for matching */
  signals: string[];
}

export interface FieldMatch {
  field: DetectedField;
  role: FieldRole;
  confidence: MatchConfidence;
  matchedAlias: string | null;
  /** Why this match was chosen — useful for Phase 2 learning */
  reason: string;
}

export interface FillSummary {
  matched: number;
  filled: number;
  skipped: number;
  details: Array<{
    role: FieldRole;
    action: 'filled' | 'skipped' | 'matched_empty';
    reason: string;
    label: string;
  }>;
}

export interface FillResult {
  summary: FillSummary;
  matches: FieldMatch[];
}

/** Future Phase 2+: domain-specific alias overrides & learned mappings */
export interface DomainLearningHook {
  getDomainAliases?(hostname: string): Record<string, string[]> | null;
}

/** Future Phase 3+: AI-assisted matching */
export interface AiMatchHook {
  suggestRole?(
    field: DetectedField,
    candidates: FieldRole[]
  ): Promise<{ role: FieldRole; confidence: MatchConfidence } | null>;
}
