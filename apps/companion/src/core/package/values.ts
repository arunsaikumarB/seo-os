import type { FillableRole, OpportunityPackageFields } from '../types';

const ROLE_TO_PACKAGE: Record<FillableRole, keyof OpportunityPackageFields> = {
  business_name: 'businessName',
  website: 'url',
  email: 'email',
  phone: 'phone',
  title: 'title',
  description: 'description',
  meta_description: 'metaDescription',
  further_info: 'furtherCompanyInfo',
  article: 'article',
  keywords: 'keywords',
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

export function packageValueForRole(
  pkg: OpportunityPackageFields,
  role: FillableRole
): string {
  if (role === 'description') {
    return String(pkg.description || pkg.shortDescription || '').trim();
  }
  if (role === 'meta_description') {
    return String(
      pkg.metaDescription || pkg.shortDescription || pkg.description || ''
    ).trim();
  }
  if (role === 'further_info') {
    return String(pkg.furtherCompanyInfo || pkg.article || pkg.description || '').trim();
  }
  if (role === 'article') {
    return String(
      pkg.article || pkg.furtherCompanyInfo || pkg.description || pkg.shortDescription || ''
    ).trim();
  }
  const key = ROLE_TO_PACKAGE[role];
  return String(pkg[key] ?? '').trim();
}
