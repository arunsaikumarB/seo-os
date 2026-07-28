import type { FieldRole } from '../types';

/**
 * Configurable alias dictionary — Phase 1.
 * Keys are FieldRole; values are lowercase aliases matched against
 * label / placeholder / name / id / aria-label.
 *
 * Phase 2 can merge domain-learned aliases on top of this map.
 */
export const FIELD_ALIASES: Record<Exclude<FieldRole, 'unknown'>, string[]> = {
  business_name: [
    'business name',
    'company name',
    'company',
    'organization',
    'organisation',
    'org name',
    'business',
    'brand name',
    'brand',
    'site name',
    'website name',
    'listing name',
    'business_name',
    'company_name',
    'companyname',
    'businessname',
    'org',
  ],
  website: [
    'website',
    'website url',
    'web site',
    'url',
    'site url',
    'homepage',
    'home page',
    'web address',
    'company website',
    'business website',
    'website_url',
    'websiteurl',
    'site',
  ],
  email: [
    'email',
    'e-mail',
    'email address',
    'e-mail address',
    'contact email',
    'business email',
    'work email',
    'email_address',
    'emailaddress',
    'mail',
  ],
  phone: [
    'phone',
    'telephone',
    'tel',
    'mobile',
    'phone number',
    'contact number',
    'cell',
    'cellphone',
    'phone_number',
    'phonenumber',
    'contact phone',
  ],
  title: [
    'title',
    'page title',
    'listing title',
    'headline',
    'subject',
    'job title',
    'position',
    'post title',
  ],
  description: [
    'description',
    'about',
    'about us',
    'bio',
    'summary',
    'details',
    'long description',
    'short description',
    'business description',
    'company description',
    'overview',
    'desc',
  ],
  address: [
    'address',
    'street address',
    'street',
    'address line',
    'address line 1',
    'address1',
    'addr',
    'mailing address',
    'business address',
  ],
  city: ['city', 'town', 'locality', 'municipality'],
  state: [
    'state',
    'province',
    'region',
    'state/province',
    'state province',
    'county',
  ],
  country: ['country', 'nation', 'country/region', 'country region'],
  zip: [
    'zip',
    'zip code',
    'zipcode',
    'postal',
    'postal code',
    'postcode',
    'post code',
    'pin',
    'pin code',
    'pincode',
  ],
  facebook: [
    'facebook',
    'facebook url',
    'facebook page',
    'fb',
    'fb url',
    'facebook_url',
  ],
  linkedin: [
    'linkedin',
    'linked in',
    'linkedin url',
    'linkedin page',
    'linkedin profile',
    'linkedin_url',
  ],
  twitter: [
    'twitter',
    'twitter url',
    'twitter handle',
    'x',
    'x url',
    'x.com',
    'twitter_url',
    'tweet',
  ],
};

export const ROLE_LABELS: Record<Exclude<FieldRole, 'unknown'>, string> = {
  business_name: 'Business Name',
  website: 'Website',
  email: 'Email',
  phone: 'Phone',
  title: 'Title',
  description: 'Description',
  address: 'Address',
  city: 'City',
  state: 'State',
  country: 'Country',
  zip: 'ZIP',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  twitter: 'Twitter',
};

export type AliasDictionary = typeof FIELD_ALIASES;

/** Merge base aliases with optional overrides (Phase 2 domain learning). */
export function mergeAliases(
  base: AliasDictionary,
  overrides?: Partial<Record<Exclude<FieldRole, 'unknown'>, string[]>> | null
): AliasDictionary {
  if (!overrides) return base;
  const next = { ...base };
  for (const [role, extra] of Object.entries(overrides) as Array<
    [Exclude<FieldRole, 'unknown'>, string[]]
  >) {
    if (!extra?.length) continue;
    next[role] = [...new Set([...base[role], ...extra.map((a) => a.toLowerCase())])];
  }
  return next;
}
