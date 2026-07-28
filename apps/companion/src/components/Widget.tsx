import { useEffect, useState } from 'react';
import type { BusinessProfile, FillSummary } from '../core/types';
import { fillMatchedFields, previewMatches } from '../core/fill/form-filler';
import { noopDomainLearning } from '../core/hooks';
import { loadProfile, onProfileChanged } from '../core/profile/storage';
import { ROLE_LABELS } from '../core/match/aliases';

export function Widget() {
  const [expanded, setExpanded] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<FillSummary | null>(null);
  const [preview, setPreview] = useState({ fields: 0, matched: 0 });

  useEffect(() => {
    void loadProfile().then(setProfile);
    return onProfileChanged(setProfile);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const { fields, confident } = previewMatches({
      domainLearning: noopDomainLearning,
    });
    setPreview({ fields: fields.length, matched: confident.length });
  }, [expanded, profile]);

  const onFill = () => {
    if (!profile || busy) return;
    setBusy(true);
    try {
      const result = fillMatchedFields({
        profile,
        domainLearning: noopDomainLearning,
        minConfidence: 'medium',
      });
      setSummary(result.summary);
    } finally {
      setBusy(false);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        className="soc-fab"
        aria-label="Open SEO OS Companion"
        title="SEO OS Companion"
        onClick={() => setExpanded(true)}
      >
        <span className="soc-fab-mark">S</span>
      </button>
    );
  }

  return (
    <div className="soc-panel" role="dialog" aria-label="SEO OS Companion">
      <header className="soc-header">
        <div>
          <div className="soc-brand">SEO OS Companion</div>
          <div className="soc-sub">Phase 1 · fill only, never submit</div>
        </div>
        <button
          type="button"
          className="soc-icon-btn"
          aria-label="Collapse"
          onClick={() => setExpanded(false)}
        >
          −
        </button>
      </header>

      <div className="soc-body">
        <p className="soc-meta">
          Detected <strong>{preview.fields}</strong> controls ·{' '}
          <strong>{preview.matched}</strong> confident matches
        </p>

        <button
          type="button"
          className="soc-primary"
          disabled={busy || !profile}
          onClick={onFill}
        >
          {busy ? 'Filling…' : 'Fill Form'}
        </button>

        <ul className="soc-rules">
          <li>Fills confident matches only</li>
          <li>Skips unknown fields</li>
          <li>Never clicks Submit</li>
          <li>Never solves CAPTCHA</li>
          <li>Skips login &amp; payment forms</li>
        </ul>

        {summary && (
          <div className="soc-summary">
            <div className="soc-summary-title">Summary</div>
            <div className="soc-stats">
              <span>
                Matched <b>{summary.matched}</b>
              </span>
              <span>
                Filled <b>{summary.filled}</b>
              </span>
              <span>
                Skipped <b>{summary.skipped}</b>
              </span>
            </div>
            {summary.details.length > 0 && (
              <ul className="soc-details">
                {summary.details.slice(0, 12).map((d, i) => (
                  <li key={`${d.label}-${i}`}>
                    <span className={`soc-pill soc-pill-${d.action}`}>
                      {d.action === 'filled'
                        ? 'filled'
                        : d.action === 'matched_empty'
                          ? 'empty'
                          : 'skip'}
                    </span>
                    {d.role !== 'unknown' ? ROLE_LABELS[d.role] : d.label}
                    <span className="soc-muted"> — {d.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
