/** Phase 2.2 — single active package in memory (no tokens, no storage) */

export type ActivePackageField = {
  key: string;
  value: string;
};

export type ActivePackage = {
  opportunityId: string;
  domain: string;
  projectId: string;
  /** Display name for isolation UI (e.g. Desi Dhamaka) */
  projectName?: string;
  businessName?: string;
  submissionType?: string;
  generatedAt: string;
  entryUrl?: string;
  fields: ActivePackageField[];
};

export type FieldRole =
  | 'business_name'
  | 'title'
  | 'website'
  | 'email'
  | 'phone'
  | 'description'
  | 'meta_description'
  | 'further_info'
  | 'article'
  | 'keywords'
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
  'meta_description',
  'further_info',
  'article',
  'keywords',
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

/** Flat map used by the fill engine — derived from ActivePackage.fields */
export type OpportunityPackageFields = {
  title: string;
  url: string;
  description: string;
  shortDescription: string;
  metaDescription: string;
  furtherCompanyInfo: string;
  article: string;
  keywords: string;
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
  /** Normalized resolved label (for alias matching) */
  label: string;
  /** Original visible label text before normalization */
  rawLabel: string;
  /** Which resolver produced the label */
  labelResolver: string;
  /** Resolver confidence (0–100) */
  labelResolverConfidence: number;
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
  /** How the mapping was resolved — drives confidence colors */
  matchSource?: MatchSource;
}

export type MatchSource =
  | 'domain'
  | 'alias'
  | 'confidence'
  | 'structural'
  | 'unknown'
  | 'skipped';

export type MappingDiagnostics = {
  detected: number;
  mapped: number;
  domainMatches: number;
  aliasMatches: number;
  confidenceMatches: number;
  unknown: number;
  skipped: number;
  avgConfidence: number;
};

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
  matchSource?: MatchSource;
}

export interface FillSummary {
  detected: number;
  filled: number;
  skipped: number;
  missing: number;
  captcha: number;
  details: FillDetail[];
  missingRequired: FillDetail[];
  mapping?: MappingDiagnostics;
}

export interface FillResult {
  summary: FillSummary;
  classifications: FieldClassification[];
}

export type DomainFieldMapping = {
  websiteField: string;
  mappedTo: string;
  confidence?: number;
  verifiedBy?: string;
};

export interface DomainLearningHook {
  getDomainAliases?(hostname: string): Partial<Record<FillableRole, string[]>> | null;
  /** Verified shared mappings — highest priority */
  getDomainMappings?(hostname: string): DomainFieldMapping[] | null;
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

/** Map ActivePackage.fields → fill engine shape */
export function activePackageToFillFields(pkg: ActivePackage): OpportunityPackageFields {
  const map = new Map(pkg.fields.map((f) => [f.key.toLowerCase(), f.value]));
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = map.get(k.toLowerCase());
      if (v?.trim()) return v.trim();
    }
    return '';
  };
  return {
    title: get('title'),
    url: get('url', 'website'),
    description: get('description', 'long_desc', 'longDescription'),
    shortDescription: get('shortDescription', 'short_desc', 'short_description'),
    metaDescription: get(
      'metaDescription',
      'meta_description',
      'meta_desc',
      'metaDesc'
    ),
    furtherCompanyInfo: get(
      'furtherCompanyInfo',
      'further_info',
      'furtherCompany',
      'further_company_info'
    ),
    article: get('article', 'articleBody', 'body'),
    keywords: get('keywords', 'tags', 'meta_keywords'),
    businessName: get('businessName', 'business_name', 'name', 'companyName'),
    email: get('email'),
    phone: get('phone'),
    category: get('category'),
    facebook: get('facebook'),
    linkedin: get('linkedin'),
    twitter: get('twitter'),
    address: get('address'),
    city: get('city'),
    state: get('state'),
    country: get('country'),
    zip: get('zip', 'postal'),
  };
}
