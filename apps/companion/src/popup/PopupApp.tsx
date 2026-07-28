import { useEffect, useState } from 'react';
import type { BusinessProfile } from '../core/types';
import { DEMO_PROFILE } from '../core/profile/defaults';
import { loadProfile, saveProfile } from '../core/profile/storage';

const FIELDS: Array<{ key: keyof BusinessProfile; label: string; multiline?: boolean }> = [
  { key: 'businessName', label: 'Business Name' },
  { key: 'website', label: 'Website' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description', multiline: true },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'zip', label: 'ZIP' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'twitter', label: 'Twitter' },
];

export function PopupApp() {
  const [profile, setProfile] = useState<BusinessProfile>(DEMO_PROFILE);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProfile().then(setProfile);
  }, []);

  const onChange = (key: keyof BusinessProfile, value: string) => {
    setSaved(false);
    setProfile((p) => ({ ...p, [key]: value }));
  };

  const onSave = async () => {
    setError(null);
    try {
      await saveProfile(profile);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const onResetDemo = () => {
    setProfile({ ...DEMO_PROFILE });
    setSaved(false);
  };

  return (
    <div className="popup">
      <header>
        <h1>SEO OS Companion</h1>
        <p>Phase 1 profile — used by Fill Form on web pages.</p>
      </header>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
      >
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            {f.multiline ? (
              <textarea
                rows={3}
                value={profile[f.key]}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            ) : (
              <input
                type="text"
                value={profile[f.key]}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )}
          </label>
        ))}

        <div className="actions">
          <button type="submit">Save profile</button>
          <button type="button" className="ghost" onClick={onResetDemo}>
            Reset demo
          </button>
        </div>
        {saved && <p className="ok">Saved — open any page and use the floating widget.</p>}
        {error && <p className="err">{error}</p>}
      </form>
    </div>
  );
}
