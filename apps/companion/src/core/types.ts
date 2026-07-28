/** SEO OS Companion — Phase 1.1 Form Intelligence types */

export type FieldRole =
  | 'business_name'
  | 'title'
  | 'website'
  | 'email'
  | 'phone'
  | 'description'
  | 'address'
  | 'city'
  | 'state'
  | 'country'
  | 'zip'
  | 'category'
  | 'facebook'
  | 'linkedin'
  | 'twitter'
  | 'captcha'
  | 'payment'
  | 'submit'
  | 'login'
  | 'search'
  | 'unknown';

/** Roles we attempt to fill from the business profile */
export const FILLABLE_ROLES: ReadonlyArray<Exclude<FieldRole, 'unknown' | 'captcha' | 'payment' | 'submit' | 'login' | 'search'>> = [
  'business_name',
  'title',
  'website',
  'email',
  'phone',
  'description',
  'address',
  'city',
  'state',
  'country',
  'zip',
  'category',
  'facebook',
  'linkedin',
  'twitter',
] as const;

export type FillableRole = (typeof FILLABLE_ROLES)[number];

export const CONFIDENCE_FILL_THRESHOLD = 80;

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
  category: string;
  facebook: string;
  linkedin: string;
  twitter: string;
}

export type FieldControlKind =
  | 'input'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'contenteditable';

export interface NormalizedField {
  /** Stable id for overlays / navigation */
  uid: string;
  element: HTMLElement;
  kind: FieldControlKind;
  inputType: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  label: string;
  nearbyText: string;
  sectionHeading: string;
  required: boolean;
  autocomplete: string;
  /** Radio/checkbox value attribute */
  valueAttr: string;
}

export interface FieldClassification {
  field: NormalizedField;
  role: FieldRole;
  /** 0–100 weighted score */
  confidence: number;
  matchedAlias: string | null;
  matchedBy: string[];
  reason: string;
}

export type FillAction =
  | 'filled'
  | 'skipped'
  | 'missing'
  | 'captcha'
  | 'low_confidence'
  | 'empty_profile';

export interface FillDetail {
  uid: string;
  role: FieldRole;
  action: FillAction;
  reason: string;
  label: string;
  confidence: number;
  matchedAlias: string | null;
  matchedBy: string[];
  required: boolean;
}

export interface FillSummary {
  detected: number;
  filled: number;
  skipped: number;
  missing: number;
  captcha: number;
  details: FillDetail[];
  missingRequired: FillDetail[];
}

export interface FillResult {
  summary: FillSummary;
  classifications: FieldClassification[];
}

export interface DomainLearningHook {
  getDomainAliases?(hostname: string): Partial<Record<FillableRole, string[]>> | null;
}

export interface AiMatchHook {
  suggestRole?(
    field: NormalizedField
  ): Promise<{ role: FieldRole; confidence: number } | null>;
}
