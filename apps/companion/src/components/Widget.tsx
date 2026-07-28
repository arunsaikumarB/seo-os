import { useCallback, useEffect, useState } from 'react';
import type { FillSummary } from '../core/types';
import { CONFIDENCE_FILL_THRESHOLD, activePackageToFillFields } from '../core/types';
import { fillMatchedFields, previewClassifications, roleLabel } from '../core/fill/form-filler';
import { noopDomainLearning } from '../core/hooks';
import { onPackageActivated } from '../core/session/web-bridge';
import {
  type ConnectionDiagnostics,
  companionLog,
  getDiagnostics,
  onDiagnosticsChange,
} from '../core/diagnostics/connection';
import {
  clearPackage,
  fieldCount,
  getActivePackage,
  getConnectionState,
  onActivePackageChange,
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
    (label.startsWith('Current') && value !== '—' && value !== 'No') ||
    (label === 'Fields' && value !== '0');
  return (
    <div className="soc-diag-row">
      <span>{label}</span>
      <strong className={positive ? 'soc-diag-yes' : 'soc-diag-no'}>{value}</strong>
    </div>
  );
}

function formatGenerated(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function Widget() {
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);
  const [diag, setDiag] = useState<ConnectionDiagnostics>(getDiagnostics());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<FillSummary | null>(null);
  const [inspect, setInspect] = useState(false);
  const [debug, setDebug] = useState(false);
  const [missingIndex, setMissingIndex] = useState(0);
  const [preview, setPreview] = useState({ detected: 0, fillable: 0 });

  const active = getActivePackage();
  const connected = getConnectionState() === 'connected';

  const refreshPreview = useCallback(() => {
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
  }, [inspect]);

  useEffect(() => {
    companionLog('ui.mount', { phase: '2.2' });
    const offPkg = onActivePackageChange(() => setTick((t) => t + 1));
    const offAct = onPackageActivated(() => setTick((t) => t + 1));
    const offDiag = onDiagnosticsChange(setDiag);
    return () => {
      offPkg();
      offAct();
      offDiag();
      stopWizardWatcher();
    };
  }, []);

  useEffect(() => {
    if (!expanded || !connected) return;
    refreshPreview();
  }, [expanded, connected, tick, refreshPreview]);

  useEffect(() => {
    if (!inspect) {
      disableInspector();
      return;
    }
    enableInspector(refreshPreview());
    return () => disableInspector();
  }, [inspect, refreshPreview]);

  const onFill = () => {
    const pkg = getActivePackage();
    if (!pkg || busy) return;
    setBusy(true);
    try {
      const flat = activePackageToFillFields(pkg);
      const fillResult = fillMatchedFields({
        package: flat,
        domainLearning: noopDomainLearning,
        threshold: CONFIDENCE_FILL_THRESHOLD,
        debug,
        visibleOnly: true,
      });
      setSummary(fillResult.summary);
      setMissingIndex(0);
      if (inspect) setInspectorClassifications(fillResult.classifications);
      startWizardWatcher(flat);
      refreshPreview();
    } finally {
      setBusy(false);
    }
  };

  const onClear = () => {
    stopWizardWatcher();
    clearPackage();
    setSummary(null);
  };

  const missingCount = summary?.missingRequired.length ?? 0;
  const onNextMissing = () => {
    const targets = getMissingTargets();
    if (!targets.length) return;
    const el = targets[missingIndex % targets.length];
    if (el) scrollToElement(el);
    setMissingIndex((i) => i + 1);
  };

  void tick; // force re-read active on package change

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
          <div className="soc-sub">{connected ? 'Connected' : 'Waiting for Package'}</div>
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
        {connected && active ? (
          <>
            <div className="soc-opp">
              <div className="soc-opp-label">Current Opportunity</div>
              <div className="soc-opp-domain">{active.domain}</div>
              <div className="soc-opp-label" style={{ marginTop: 6 }}>
                Opportunity ID
              </div>
              <div className="soc-opp-domain" style={{ fontSize: 12, fontWeight: 600 }}>
                {active.opportunityId}
              </div>
            </div>

            <p className="soc-meta">
              Package Ready <strong>{fieldCount(active)} fields</strong>
            </p>
            <p className="soc-meta">
              Generated <strong>{formatGenerated(active.generatedAt)}</strong>
            </p>
            <p className="soc-meta">
              Detected <strong>{preview.detected}</strong> · Fillable{' '}
              <strong>{preview.fillable}</strong>
            </p>

            <button type="button" className="soc-primary" disabled={busy} onClick={onFill}>
              {busy ? 'Filling…' : 'Fill Current Step'}
            </button>
            <button type="button" className="soc-secondary" onClick={onClear}>
              Clear Package
            </button>
          </>
        ) : (
          <div className="soc-warn">
            <p className="soc-error-title">Waiting for Package</p>
            <p>
              In SEO OS → Assisted Manual → click <strong>Activate Package</strong>. The package is
              sent directly into memory — no tokens, no storage.
            </p>
          </div>
        )}

        <div className="soc-diag">
          <div className="soc-summary-title">Diagnostics</div>
          <DiagRow label="Connected" value={diag.connected} />
          <DiagRow label="Package Loaded" value={diag.packageLoaded} />
          <DiagRow label="Current Opportunity" value={diag.opportunityId || '—'} />
          <DiagRow label="Current Domain" value={diag.domain || '—'} />
          <DiagRow label="Fields" value={String(diag.fieldCount)} />
          <DiagRow label="Generated" value={formatGenerated(diag.generatedAt)} />
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
          <li>One active package in memory</li>
          <li>Activate another package to replace</li>
          <li>Never Submit / CAPTCHA / payment</li>
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
            </div>
            {summary.details.slice(0, 10).map((d, i) => (
              <div key={`${d.uid}-${i}`} className="soc-details">
                <span className={`soc-pill soc-pill-${d.action}`}>
                  {d.action === 'filled' ? 'ok' : 'skip'}
                </span>{' '}
                {roleLabel(d.role)}
                <span className="soc-muted"> — {d.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
