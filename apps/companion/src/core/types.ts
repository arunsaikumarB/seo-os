/** SEO OS Companion — Phase 2 types (delivery layer; SEO OS owns content) */

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
  | 'newsletter'
  | 'unknown';

export const FILLABLE_ROLES = [
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

/** Flat package from SEO OS — never stored permanently as a profile */
export type OpportunityPackageFields = {
  title: string;
  url: string;
  description: string;
  shortDescription: string;
  businessName: string;
  email: string;
  phone: string;
  category: string;
  facebook: string;
  linkedin: string;
  twitter: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zip: string;
};

export type CurrentOpportunity = {
  opportunityId: string;
  packageId: string;
  workspaceId: string;
  domain: string;
  entryUrl: string;
  package: OpportunityPackageFields;
  learningKey: string;
};

export type FieldControlKind =
  | 'input'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'contenteditable';

export interface NormalizedField {
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
  valueAttr: string;
}

export interface FieldClassification {
  field: NormalizedField;
  role: FieldRole;
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
  | 'empty_package';

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

/** Phase 3+ learning — stub only */
export interface DomainLearningHook {
  getDomainAliases?(hostname: string): Partial<Record<FillableRole, string[]>> | null;
  rememberMapping?(_input: {
    learningKey: string;
    role: FillableRole;
    selector: string;
    alias: string;
  }): void;
}

export interface AiMatchHook {
  suggestRole?(
    field: NormalizedField
  ): Promise<{ role: FieldRole; confidence: number } | null>;
}
