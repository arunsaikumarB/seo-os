import { useEffect, useState } from 'react';
import type { BusinessProfile, FillSummary } from '../core/types';
import { CONFIDENCE_FILL_THRESHOLD } from '../core/types';
import { fillMatchedFields, previewClassifications, roleLabel } from '../core/fill/form-filler';
import { noopDomainLearning } from '../core/hooks';
import { loadProfile, onProfileChanged } from '../core/profile/storage';
import {
  disableInspector,
  enableInspector,
  isInspectorEnabled,
  setInspectorClassifications,
} from '../core/overlay/inspector';
import { scrollToElement } from '../core/overlay/highlights';
import { getMissingTargets } from '../core/overlay/missing-nav';
import { isFillConfident } from '../core/match/classifier';

export function Widget() {
  const [expanded, setExpanded] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<FillSummary | null>(null);
  const [inspect, setInspect] = useState(false);
  const [debug, setDebug] = useState(false);
  const [missingIndex, setMissingIndex] = useState(0);
  const [preview, setPreview] = useState({ detected: 0, fillable: 0 });

  useEffect(() => {
    void loadProfile().then(setProfile);
    return onProfileChanged(setProfile);
  }, []);

  const refreshPreview = () => {
    const { fields, classifications } = previewClassifications({
      domainLearning: noopDomainLearning,
    });
    const fillable = classifications.filter((c) => isFillConfident(c)).length;
    setPreview({ detected: fields.length, fillable });
    for (const c of classifications) {
      c.field.element.setAttribute('data-soc-uid', c.field.uid);
    }
    if (isInspectorEnabled() || inspect) {
      setInspectorClassifications(classifications);
    }
    return classifications;
  };

  useEffect(() => {
    if (!expanded) return;
    refreshPreview();
  }, [expanded, profile]);

  useEffect(() => {
    if (!inspect) {
      disableInspector();
      return;
    }
    const classifications = refreshPreview();
    enableInspector(classifications);
    return () => disableInspector();
  }, [inspect]);

  const onFill = () => {
    if (!profile || busy) return;
    setBusy(true);
    try {
      const result = fillMatchedFields({
        profile,
        domainLearning: noopDomainLearning,
        threshold: CONFIDENCE_FILL_THRESHOLD,
        debug,
      });
      setSummary(result.summary);
      setMissingIndex(0);
      if (inspect) setInspectorClassifications(result.classifications);
      refreshPreview();
    } finally {
      setBusy(false);
    }
  };

  const missingCount = summary?.missingRequired.length ?? 0;

  const onNextMissing = () => {
    const targets = getMissingTargets();
    if (!targets.length) return;
    const el = targets[missingIndex % targets.length];
    if (el) scrollToElement(el);
    setMissingIndex((i) => i + 1);
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
          <div className="soc-sub">Phase 1.1 · Form Intelligence</div>
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
          Detected <strong>{preview.detected}</strong> · Fillable ≥{CONFIDENCE_FILL_THRESHOLD}%{' '}
          <strong>{preview.fillable}</strong>
        </p>

        <button
          type="button"
          className="soc-primary"
          disabled={busy || !profile}
          onClick={onFill}
        >
          {busy ? 'Filling…' : 'Fill Form'}
        </button>

        <div className="soc-row">
          <label className="soc-toggle">
            <input
              type="checkbox"
              checked={inspect}
              onChange={(e) => setInspect(e.target.checked)}
            />
            Inspect Fields
          </label>
          <label className="soc-toggle">
            <input
              type="checkbox"
              checked={debug}
              onChange={(e) => setDebug(e.target.checked)}
            />
            Debug
          </label>
        </div>

        <button
          type="button"
          className="soc-secondary"
          disabled={!missingCount && !getMissingTargets().length}
          onClick={onNextMissing}
        >
          Next Missing{missingCount ? ` (${missingCount})` : ''}
        </button>

        <ul className="soc-rules">
          <li>Fill when confidence ≥ {CONFIDENCE_FILL_THRESHOLD}%</li>
          <li>Skip unknown · never Submit / CAPTCHA</li>
          <li>Pricing on page does not block fill</li>
        </ul>

        {summary && (
          <div className="soc-summary">
            <div className="soc-summary-title">Summary</div>
            <div className="soc-stats soc-stats-grid">
              <span>
                Detected <b>{summary.detected}</b>
              </span>
              <span>
                Filled <b>{summary.filled}</b>
              </span>
              <span>
                Skipped <b>{summary.skipped}</b>
              </span>
              <span>
                Missing <b>{summary.missing}</b>
              </span>
              <span>
                CAPTCHA <b>{summary.captcha}</b>
              </span>
            </div>

            {summary.missingRequired.length > 0 && (
              <div className="soc-missing-block">
                <div className="soc-summary-title">Missing required</div>
                <ul className="soc-details">
                  {summary.missingRequired.map((d) => (
                    <li key={d.uid}>
                      <span className="soc-pill soc-pill-missing">req</span>
                      {roleLabel(d.role)} — {d.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.details.length > 0 && (
              <ul className="soc-details">
                {summary.details.slice(0, 14).map((d, i) => (
                  <li key={`${d.uid}-${i}`}>
                    <span className={`soc-pill soc-pill-${d.action}`}>
                      {d.action === 'filled'
                        ? 'ok'
                        : d.action === 'missing'
                          ? 'miss'
                          : d.action === 'captcha'
                            ? 'cap'
                            : 'skip'}
                    </span>
                    {roleLabel(d.role)}
                    <span className="soc-muted">
                      {' '}
                      · {d.confidence}% — {d.reason}
                    </span>
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
