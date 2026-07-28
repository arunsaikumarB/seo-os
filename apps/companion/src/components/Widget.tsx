import { useCallback, useEffect, useState } from 'react';
import type { CurrentOpportunity, FillSummary } from '../core/types';
import { CONFIDENCE_FILL_THRESHOLD } from '../core/types';
import { fillMatchedFields, previewClassifications, roleLabel } from '../core/fill/form-filler';
import { noopDomainLearning } from '../core/hooks';
import { fetchCurrentOpportunity } from '../core/api/opportunity';
import { captureHandoffFromPage, getHandoffToken } from '../core/session/handoff';
import { onHandoffReceived } from '../core/session/web-bridge';
import {
  type ConnectionDiagnostics,
  companionLog,
  getDiagnostics,
  loadDiagnosticsFromStorage,
  onDiagnosticsChange,
  patchDiagnostics,
} from '../core/diagnostics/connection';
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

function DiagRow({ label, value }: { label: string; value: string }) {
  const ok = value === 'Yes' || (label === 'Current Opportunity ID' && value !== '—');
  return (
    <div className="soc-diag-row">
      <span>{label}</span>
      <strong className={ok ? 'soc-diag-yes' : 'soc-diag-no'}>{value}</strong>
    </div>
  );
}

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
  const [diag, setDiag] = useState<ConnectionDiagnostics>(getDiagnostics());

  const refreshOpportunity = useCallback(async () => {
    companionLog('ui.refresh_start', {});
    captureHandoffFromPage();
    setStatus('loading');
    setError(null);
    patchDiagnostics({ lastStage: 'ui.refresh_start', lastError: null });

    const token = await getHandoffToken();
    if (!token) {
      setOpp(null);
      setStatus('disconnected');
      const msg =
        'No handoff token found. Click Open package in Assisted Manual — that creates the handshake.';
      setError(msg);
      companionLog('ui.disconnected_no_token', {}, 'warn');
      patchDiagnostics({
        tokenPresent: 'No',
        packageLoaded: 'No',
        lastError: msg,
        lastStage: 'ui.disconnected_no_token',
      });
      return null;
    }

    const result = await fetchCurrentOpportunity({ force: true });
    if (!result.ok) {
      setOpp(null);
      setStatus('disconnected');
      setError(result.error);
      companionLog('ui.disconnected_fetch_failed', { error: result.error }, 'error');
      patchDiagnostics({
        packageLoaded: 'No',
        lastError: result.error,
        lastStage: 'ui.disconnected_fetch_failed',
      });
      return null;
    }

    setOpp(result.data);
    setStatus('connected');
    companionLog('ui.connected', {
      opportunityId: result.data.opportunityId,
      domain: result.data.domain,
    });
    patchDiagnostics({
      packageLoaded: 'Yes',
      authenticated: 'Yes',
      apiReachable: 'Yes',
      opportunityId: result.data.opportunityId,
      lastError: null,
      lastStage: 'ui.connected',
    });
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
    void loadDiagnosticsFromStorage().then(setDiag);
    const offDiag = onDiagnosticsChange(setDiag);
    void refreshOpportunity();
    const unsub = onHandoffReceived(() => {
      companionLog('ui.handoff_event', {});
      void refreshOpportunity();
    });
    return () => {
      offDiag();
      unsub();
      stopWizardWatcher();
    };
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
            {status === 'connected'
              ? 'Connected'
              : status === 'loading'
                ? 'Connecting…'
                : 'Not connected'}
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
        {status === 'loading' ? (
          <p className="soc-meta">Connecting to SEO OS…</p>
        ) : status === 'connected' && opp ? (
          <>
            <div className="soc-opp">
              <div className="soc-opp-label">Current Opportunity</div>
              <div className="soc-opp-domain">{opp.domain}</div>
            </div>

            <p className="soc-meta">
              Detected <strong>{preview.detected}</strong> fields · Ready{' '}
              <strong>{preview.fillable}</strong>
            </p>

            <button type="button" className="soc-primary" disabled={busy} onClick={onFill}>
              {busy ? 'Filling…' : 'Fill Current Step'}
            </button>
          </>
        ) : (
          <div className="soc-warn">
            <p className="soc-error-title">Connection failed</p>
            <p>{error || 'Unknown connection error — check Diagnostics below'}</p>
            {diag.lastStage && (
              <p className="soc-muted">
                Last stage: <code>{diag.lastStage}</code>
                {diag.lastHttpStatus != null ? ` · HTTP ${diag.lastHttpStatus}` : ''}
              </p>
            )}
            <button type="button" className="soc-secondary" onClick={() => void refreshOpportunity()}>
              Retry connect
            </button>
          </div>
        )}

        <div className="soc-diag">
          <div className="soc-summary-title">Diagnostics</div>
          <DiagRow label="Handoff Created" value={diag.handoffCreated} />
          <DiagRow label="Token Present" value={diag.tokenPresent} />
          <DiagRow label="API Reachable" value={diag.apiReachable} />
          <DiagRow label="Authenticated" value={diag.authenticated} />
          <DiagRow label="Package Loaded" value={diag.packageLoaded} />
          <DiagRow
            label="Current Opportunity ID"
            value={diag.opportunityId || opp?.opportunityId || '—'}
          />
          {diag.tokenSource && diag.tokenSource !== 'none' && (
            <p className="soc-muted">Token source: {diag.tokenSource}</p>
          )}
        </div>

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
          <li>Open DevTools console for structured handshake logs</li>
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
