import { useEffect, useState } from 'react';
import { getHandoffToken, getCachedOpportunity, clearSession } from '../core/session/handoff';
import { fetchCurrentOpportunity } from '../core/api/opportunity';
import './popup.css';

export function PopupApp() {
  const [state, setState] = useState<'loading' | 'connected' | 'empty'>('loading');
  const [domain, setDomain] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const token = await getHandoffToken();
      if (!token) {
        setState('empty');
        return;
      }
      const cached = await getCachedOpportunity();
      if (cached) {
        setDomain(cached.domain);
        setState('connected');
      }
      const result = await fetchCurrentOpportunity({ force: true });
      if (result.ok) {
        setDomain(result.data.domain);
        setState('connected');
      } else {
        setError(result.error);
        setState(cached ? 'connected' : 'empty');
      }
    })();
  }, []);

  return (
    <div className="popup">
      <header>
        <h1>SEO OS Companion</h1>
        <p>Phase 2 — delivery layer for opportunity packages</p>
      </header>

      {state === 'loading' && <p className="muted">Checking connection…</p>}

      {state === 'connected' && (
        <div className="card">
          <div className="ok">Connected</div>
          <p>
            Current opportunity: <strong>{domain}</strong>
          </p>
          <p className="muted">
            Content comes from SEO OS for this opportunity only. No business profile is stored in
            the extension.
          </p>
        </div>
      )}

      {state === 'empty' && (
        <div className="card">
          <p>
            Not connected. In <strong>SEO OS → Assisted Manual</strong>, click{' '}
            <strong>Open package</strong>. Companion will load that opportunity’s generated package
            and fill the submission form.
          </p>
          {error && <p className="err">{error}</p>}
        </div>
      )}

      <button
        type="button"
        className="ghost"
        onClick={() => {
          void clearSession().then(() => {
            setState('empty');
            setDomain(null);
          });
        }}
      >
        Clear session
      </button>
    </div>
  );
}
