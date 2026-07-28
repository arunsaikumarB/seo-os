import { useCallback, useEffect, useState } from 'react';
import type { FillSummary } from '../core/types';
import { CONFIDENCE_FILL_THRESHOLD } from '../core/types';
import { fillMatchedFields, previewClassifications, roleLabel } from '../core/fill/form-filler';
import { noopDomainLearning } from '../core/hooks';
import { redeemPendingIfAny } from '../core/api/opportunity';
import { captureHandoffFromUrl } from '../core/session/handoff';
import { onHandoffReceived } from '../core/session/web-bridge';
import {
  type ConnectionDiagnostics,
  companionLog,
  getDiagnostics,
  onDiagnosticsChange,
} from '../core/diagnostics/connection';
import {
  type RuntimeMemory,
  getMemory,
  onMemoryChange,
  packageFieldCount,
} from '../core/runtime/memory';
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
  const positive =
    value === 'Yes' ||
    (label.startsWith('Current') && value !== '—' && value !== 'No');
  return (
    <div className="soc-diag-row">
      <span>{label}</span>
      <strong className={positive ? 'soc-diag-yes' : 'soc-diag-no'}>{value}</strong>
    </div>
  );
}

function statusLabel(m: RuntimeMemory): string {
  switch (m.connectionState) {
    case 'connected':
      return 'Connected';
    case 'loading_package':
      return 'Loading package…';
    case 'error':
      return 'Error';
    default:
      return 'Waiting for Handoff…';
  }
}

export function Widget() {
  const [expanded, setExpanded] = useState(false);
  const [memory, setMemory] = useState<RuntimeMemory>(getMemory());
  const [diag, setDiag] = useState<ConnectionDiagnostics>(getDiagnostics());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<FillSummary | null>(null);
  const [inspect, setInspect] = useState(false);
  const [debug, setDebug] = useState(false);
  const [missingIndex, setMissingIndex] = useState(0);
  const [preview, setPreview] = useState({ detected: 0, fillable: 0, formReason: '' });

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

  const tryRedeemFromUrl = useCallback(async () => {
    const token = captureHandoffFromUrl();
    if (!token) return;
    companionLog('ui.redeem_from_url', {});
    await redeemPendingIfAny();
  }, []);

  useEffect(() => {
    companionLog('ui.mount', { state: 'waiting_for_handoff' });
    const offMem = onMemoryChange(setMemory);
    const offDiag = onDiagnosticsChange(setDiag);
    const offHand = onHandoffReceived(() => {
      companionLog('ui.handoff_event', {});
      setMemory(getMemory());
    });
    void tryRedeemFromUrl();
    return () => {
      offMem();
      offDiag();
      offHand();
      stopWizardWatcher();
    };
  }, [tryRedeemFromUrl]);

  useEffect(() => {
    if (!expanded) return;
    if (memory.connectionState === 'connected') refreshPreview();
  }, [expanded, memory.connectionState, memory.opportunityId, refreshPreview]);

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
    const pkg = memory.currentPackage;
    if (!pkg || busy) return;
    setBusy(true);
    try {
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

  const fieldReady = packageFieldCount(memory.currentPackage);

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
          <div className="soc-sub">{statusLabel(memory)}</div>
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
        {memory.connectionState === 'connected' && memory.currentPackage ? (
          <>
            <div className="soc-opp">
              <div className="soc-opp-label">Opportunity</div>
              <div className="soc-opp-domain">{memory.opportunityId}</div>
              <div className="soc-opp-label" style={{ marginTop: 6 }}>
                Domain
              </div>
              <div className="soc-opp-domain">{memory.domain}</div>
            </div>

            <p className="soc-meta">
              Package <strong>{fieldReady} fields ready</strong>
            </p>
            <p className="soc-meta">
              Detected <strong>{preview.detected}</strong> · Fillable{' '}
              <strong>{preview.fillable}</strong>
            </p>

            <button type="button" className="soc-primary" disabled={busy} onClick={onFill}>
              {busy ? 'Filling…' : 'Fill Current Step'}
            </button>
          </>
        ) : memory.connectionState === 'loading_package' ? (
          <div className="soc-warn">
            <p className="soc-error-title">Waiting for Package…</p>
            <p>Handoff received — loading opportunity package from SEO OS.</p>
          </div>
        ) : memory.connectionState === 'error' ? (
          <div className="soc-warn">
            <p className="soc-error-title">Connection failed</p>
            <p>{memory.lastError || 'Unknown error'}</p>
            <p className="soc-muted">Open the package again from SEO OS Assisted Manual.</p>
            <button
              type="button"
              className="soc-secondary"
              onClick={() => void tryRedeemFromUrl()}
            >
              Retry URL handoff
            </button>
          </div>
        ) : (
          <div className="soc-warn">
            <p className="soc-error-title">Waiting for Handoff…</p>
            <p>No handoff received. Open the package from SEO OS.</p>
          </div>
        )}

        <div className="soc-diag">
          <div className="soc-summary-title">Diagnostics</div>
          <DiagRow label="Message Received" value={diag.messageReceived} />
          <DiagRow label="Token Valid" value={diag.tokenValid} />
          <DiagRow label="Package Request Started" value={diag.packageRequestStarted} />
          <DiagRow label="API Reachable" value={diag.apiReachable} />
          <DiagRow label="Authenticated" value={diag.authenticated} />
          <DiagRow label="Package Loaded" value={diag.packageLoaded} />
          <DiagRow label="Connected" value={diag.connected} />
          <DiagRow label="Current Opportunity" value={diag.opportunityId || memory.opportunityId || '—'} />
          <DiagRow label="Current Domain" value={diag.domain || memory.domain || '—'} />
          {diag.lastStage && (
            <p className="soc-muted">
              Stage: <code>{diag.lastStage}</code>
              {diag.lastHttpStatus != null ? ` · HTTP ${diag.lastHttpStatus}` : ''}
            </p>
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
          <li>In-memory only — refresh needs a new Open package</li>
          <li>Never Submit / CAPTCHA / payment / login</li>
          <li>Console: [SEO OS Companion] / [SEO OS Handoff]</li>
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
            {summary.details.length > 0 && (
              <ul className="soc-details">
                {summary.details.slice(0, 12).map((d, i) => (
                  <li key={`${d.uid}-${i}`}>
                    <span className={`soc-pill soc-pill-${d.action}`}>
                      {d.action === 'filled' ? 'ok' : d.action === 'missing' ? 'miss' : 'skip'}
                    </span>
                    {roleLabel(d.role)}
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
