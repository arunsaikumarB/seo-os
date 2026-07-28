import type { BusinessProfile, FillableRole } from '../types';

const ROLE_TO_PROFILE: Record<FillableRole, keyof BusinessProfile> = {
  business_name: 'businessName',
  website: 'website',
  email: 'email',
  phone: 'phone',
  title: 'title',
  description: 'description',
  address: 'address',
  city: 'city',
  state: 'state',
  country: 'country',
  zip: 'zip',
  category: 'category',
  facebook: 'facebook',
  linkedin: 'linkedin',
  twitter: 'twitter',
};

export function profileValueForRole(
  profile: BusinessProfile,
  role: FillableRole
): string {
  const key = ROLE_TO_PROFILE[role];
  return String(profile[key] ?? '').trim();
}

export const EMPTY_PROFILE: BusinessProfile = {
  businessName: '',
  website: '',
  email: '',
  phone: '',
  title: '',
  description: '',
  address: '',
  city: '',
  state: '',
  country: '',
  zip: '',
  category: '',
  facebook: '',
  linkedin: '',
  twitter: '',
};

export const DEMO_PROFILE: BusinessProfile = {
  businessName: 'Acme SEO Co',
  website: 'https://example.com',
  email: 'hello@example.com',
  phone: '+1 555 0100',
  title: 'Acme SEO Co — Local Directory Listing',
  description:
    'Acme SEO Co helps small businesses grow organic search traffic with ethical link building and technical SEO.',
  address: '123 Market Street',
  city: 'San Francisco',
  state: 'CA',
  country: 'United States',
  zip: '94103',
  category: 'Marketing',
  facebook: 'https://facebook.com/example',
  linkedin: 'https://linkedin.com/company/example',
  twitter: 'https://x.com/example',
};
