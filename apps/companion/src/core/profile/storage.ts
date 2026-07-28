import type { BusinessProfile } from '../types';
import { DEMO_PROFILE, EMPTY_PROFILE } from './defaults';

const STORAGE_KEY = 'seoOsCompanion.profile';

function isProfile(value: unknown): value is BusinessProfile {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.businessName === 'string' && typeof o.email === 'string';
}

export async function loadProfile(): Promise<BusinessProfile> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    const raw = result[STORAGE_KEY];
    if (isProfile(raw)) {
      return { ...EMPTY_PROFILE, ...raw };
    }
  } catch {
    // storage unavailable (e.g. tests) — fall through
  }
  return { ...DEMO_PROFILE };
}

export async function saveProfile(profile: BusinessProfile): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: profile });
}

export function onProfileChanged(cb: (profile: BusinessProfile) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string
  ) => {
    if (area !== 'sync' && area !== 'local') return;
    const change = changes[STORAGE_KEY];
    if (change?.newValue && isProfile(change.newValue)) {
      cb({ ...EMPTY_PROFILE, ...change.newValue });
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
