import { useCallback, useEffect, useState } from 'react';
import type { CurrentOpportunity, FillSummary } from '../core/types';
import { CONFIDENCE_FILL_THRESHOLD } from '../core/types';
import { fillMatchedFields, previewClassifications, roleLabel } from '../core/fill/form-filler';
import { noopDomainLearning } from '../core/hooks';
import { fetchCurrentOpportunity } from '../core/api/opportunity';
import { captureHandoffFromPage, getHandoffToken } from '../core/session/handoff';
import {
  disableInspector,
  enableInspector,
  isInspectorEnabled,
  setInspectorClassifications,
} from '../core/overlay/inspector';
import { scrollToElement } from '../core/overlay/highlights';
import { getMissingTargets } from '../core/overlay/missing-nav';
import { isFillConfident } from '../core/match/classifier';
import { startWizardWatcher, stopWizardWatcher } from '../core/wizard/watcher';

export function Widget() {
  const [expanded, setExpanded] = useState(false);
  const [opp, setOpp] = useState<CurrentOpportunity | null>(null);
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<FillSummary | null>(null);
  const [inspect, setInspect] = useState(false);
  const [debug, setDebug] = useState(false);
  const [missingIndex, setMissingIndex] = useState(0);
  const [preview, setPreview] = useState({ detected: 0, fillable: 0, formReason: '' });

  const refreshOpportunity = useCallback(async () => {
    captureHandoffFromPage();
    setStatus('loading');
    setError(null);
    const token = await getHandoffToken();
    if (!token) {
      setOpp(null);
      setStatus('disconnected');
      setError('Open a package from SEO OS Assisted Manual');
      return null;
    }
    const result = await fetchCurrentOpportunity({ force: true });
    if (!result.ok) {
      setOpp(null);
      setStatus('disconnected');
      setError(result.error);
      return null;
    }
    setOpp(result.data);
    setStatus('connected');
    return result.data;
  }, []);

  const refreshPreview = useCallback(() => {
    const { fields, classifications, formReason } = previewClassifications({
      domainLearning: noopDomainLearning,
    });
    const fillable = classifications.filter((c) => isFillConfident(c)).length;
    setPreview({ detected: fields.length, fillable, formReason });
    for (const c of classifications) {
      c.field.element.setAttribute('data-soc-uid', c.field.uid);
    }
    if (isInspectorEnabled() || inspect) {
      setInspectorClassifications(classifications);
    }
    return classifications;
  }, [inspect]);

  useEffect(() => {
    void refreshOpportunity();
    return () => stopWizardWatcher();
  }, [refreshOpportunity]);

  useEffect(() => {
    if (!expanded) return;
    refreshPreview();
  }, [expanded, opp, refreshPreview]);

  useEffect(() => {
    if (!inspect) {
      disableInspector();
      return;
    }
    const classifications = refreshPreview();
    enableInspector(classifications);
    return () => disableInspector();
  }, [inspect, refreshPreview]);

  const onFill = () => {
    if (!opp || busy) return;
    setBusy(true);
    try {
      // Always re-fetch package so we never reuse another opportunity's content
      void fetchCurrentOpportunity({ force: true }).then((result) => {
        const pkg = result.ok ? result.data.package : opp.package;
        if (result.ok) setOpp(result.data);
        const fillResult = fillMatchedFields({
          package: pkg,
          domainLearning: noopDomainLearning,
          threshold: CONFIDENCE_FILL_THRESHOLD,
          debug,
          visibleOnly: true,
        });
        setSummary(fillResult.summary);
        setMissingIndex(0);
        if (inspect) setInspectorClassifications(fillResult.classifications);
        startWizardWatcher(pkg);
        refreshPreview();
        setBusy(false);
      });
    } catch {
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
          <div className="soc-sub">
            {status === 'connected' ? 'Connected' : status === 'loading' ? 'Connecting…' : 'Not connected'}
          </div>
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
        {status === 'connected' && opp ? (
          <>
            <div className="soc-opp">
              <div className="soc-opp-label">Current Opportunity</div>
              <div className="soc-opp-domain">{opp.domain}</div>
            </div>

            <p className="soc-meta">
              Detected <strong>{preview.detected}</strong> fields · Ready{' '}
              <strong>{preview.fillable}</strong>
            </p>

            <button
              type="button"
              className="soc-primary"
              disabled={busy}
              onClick={onFill}
            >
              {busy ? 'Filling…' : 'Fill Current Step'}
            </button>
          </>
        ) : (
          <div className="soc-warn">
            <p>{error || 'Not connected to SEO OS'}</p>
            <p className="soc-muted">
              In SEO OS → Assisted Manual → open a package. Companion loads that opportunity’s
              generated content only — no local business profile.
            </p>
            <button type="button" className="soc-secondary" onClick={() => void refreshOpportunity()}>
              Retry connect
            </button>
          </div>
        )}

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
          <li>SEO OS is the source of truth</li>
          <li>Fills submission form only · never Submit / CAPTCHA</li>
          <li>Wizard steps auto-fill after you click Continue</li>
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
