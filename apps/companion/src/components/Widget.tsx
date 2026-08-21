import { useCallback, useEffect, useState } from 'react';
import type { FieldClassification, FillSummary, MappingDiagnostics } from '../core/types';
import { CONFIDENCE_FILL_THRESHOLD, activePackageToFillFields } from '../core/types';
import { fillMatchedFields, previewClassifications, roleLabel } from '../core/fill/form-filler';
import { createDomainLearningHook } from '../core/hooks';
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
import { computeMappingDiagnostics } from '../core/match/classifier';
import { TEACHABLE_ROLES } from '../core/match/aliases';
import { fieldKnowledgeKey } from '../core/match/confidence';
import { onLearningChange, uploadFieldMapping } from '../core/learning/api';
import { startWizardWatcher, stopWizardWatcher } from '../core/wizard/watcher';

const domainLearning = createDomainLearningHook();

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

function websiteFieldKey(c: FieldClassification): string {
  const keys = fieldKnowledgeKey(c.field);
  return keys[0] || c.field.name || c.field.id || c.field.label || c.field.uid;
}

export function Widget() {
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);
  const [diag, setDiag] = useState<ConnectionDiagnostics>(getDiagnostics());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<FillSummary | null>(null);
  const [mapping, setMapping] = useState<MappingDiagnostics | null>(null);
  const [classifications, setClassifications] = useState<FieldClassification[]>([]);
  const [inspect, setInspect] = useState(false);
  const [debug, setDebug] = useState(false);
  const [teach, setTeach] = useState(false);
  const [teachUid, setTeachUid] = useState<string | null>(null);
  const [teachBusy, setTeachBusy] = useState(false);
  const [missingIndex, setMissingIndex] = useState(0);

  const active = getActivePackage();
  const connected = getConnectionState() === 'connected';

  const refreshPreview = useCallback(() => {
    const { fields, classifications: next } = previewClassifications({
      domainLearning,
    });
    void fields;
    setClassifications(next);
    setMapping(computeMappingDiagnostics(next));
    for (const c of next) {
      c.field.element.setAttribute('data-soc-uid', c.field.uid);
    }
    if (isInspectorEnabled() || inspect) {
      setInspectorClassifications(next);
    }
    return next;
  }, [inspect]);

  useEffect(() => {
    companionLog('ui.mount', { phase: '2.3' });
    const offPkg = onActivePackageChange(() => setTick((t) => t + 1));
    const offAct = onPackageActivated(() => setTick((t) => t + 1));
    const offDiag = onDiagnosticsChange(setDiag);
    const offLearn = onLearningChange(() => setTick((t) => t + 1));
    return () => {
      offPkg();
      offAct();
      offDiag();
      offLearn();
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
        domainLearning,
        threshold: CONFIDENCE_FILL_THRESHOLD,
        debug,
        visibleOnly: true,
      });
      setSummary(fillResult.summary);
      setMapping(fillResult.summary.mapping ?? computeMappingDiagnostics(fillResult.classifications));
      setClassifications(fillResult.classifications);
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
    setMapping(null);
    setClassifications([]);
    setTeach(false);
  };

  const onTeachConfirm = async (c: FieldClassification, mappedTo: string) => {
    const domain = active?.domain || location.hostname;
    const websiteField = websiteFieldKey(c);
    setTeachBusy(true);
    try {
      const ok = await uploadFieldMapping({
        domain,
        websiteField,
        mappedTo,
        confidence: 1,
        verifiedBy: 'user',
      });
      if (ok) {
        companionLog('teach.saved', { domain, websiteField, mappedTo });
        setTeachUid(null);
        refreshPreview();
      }
    } finally {
      setTeachBusy(false);
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

  const teachCandidates = classifications.filter(
    (c) =>
      c.matchSource === 'unknown' ||
      c.matchSource === 'confidence' ||
      (c.role === 'unknown' && c.matchSource !== 'structural')
  );

  void tick;

  if (!expanded) {
    return (
      <button
        type="button"
        className="soc-fab"
        aria-label="Open Backlink Agent Companion"
        title="Backlink Agent Companion"
        onClick={() => setExpanded(true)}
      >
        <span className="soc-fab-mark">S</span>
      </button>
    );
  }

  return (
    <div className="soc-panel" role="dialog" aria-label="Backlink Agent Companion">
      <header className="soc-header">
        <div>
          <div className="soc-brand">Backlink Agent Companion</div>
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
              <div className="soc-opp-label">Current Package</div>
              <div className="soc-opp-domain">{active.domain}</div>
              {(active.projectName || active.businessName) && (
                <p className="soc-meta" style={{ marginTop: 4 }}>
                  Project: <strong>{active.projectName || '—'}</strong>
                  {active.businessName ? (
                    <>
                      {' '}
                      · Business: <strong>{active.businessName}</strong>
                    </>
                  ) : null}
                </p>
              )}
              <p className="soc-meta" style={{ marginTop: 6 }}>
                <strong>{fieldCount(active)} fields</strong> · Generated{' '}
                <strong>{formatGenerated(active.generatedAt)}</strong>
              </p>
            </div>

            {mapping && (
              <div className="soc-map-stats">
                <div>
                  Detected <b>{mapping.detected}</b>
                </div>
                <div>
                  Mapped <b>{mapping.mapped}</b>
                </div>
                <div>
                  Unknown <b>{mapping.unknown}</b>
                </div>
              </div>
            )}

            <button type="button" className="soc-primary" disabled={busy} onClick={onFill}>
              {busy ? 'Filling…' : 'Fill Current Step'}
            </button>
            <button
              type="button"
              className="soc-secondary"
              onClick={() => {
                setTeach((v) => !v);
                refreshPreview();
              }}
            >
              Teach Companion{teach ? ' ▲' : ''}
            </button>
            <button type="button" className="soc-secondary" onClick={onClear}>
              Clear Package
            </button>
          </>
        ) : (
          <div className="soc-warn">
            <p className="soc-error-title">Waiting for Package</p>
            <p>
              In Backlink Agent → Assisted Manual → <strong>Activate Package</strong>.
            </p>
          </div>
        )}

        {teach && connected && (
          <div className="soc-teach">
            <div className="soc-summary-title">Incorrect Mapping</div>
            <p className="soc-meta">Which package field should this be?</p>
            {teachCandidates.length === 0 ? (
              <p className="soc-meta">No unknown / low-confidence fields on this step.</p>
            ) : (
              teachCandidates.slice(0, 8).map((c) => (
                <div key={c.field.uid} className="soc-teach-card">
                  <button
                    type="button"
                    className="soc-teach-field"
                    onClick={() => setTeachUid(teachUid === c.field.uid ? null : c.field.uid)}
                  >
                    Mark field wrong · {c.field.label || c.field.name || c.field.id || 'field'}
                  </button>
                  {teachUid === c.field.uid && (
                    <div className="soc-teach-options">
                      {TEACHABLE_ROLES.map((opt) => (
                        <label key={opt.role} className="soc-teach-opt">
                          <input
                            type="radio"
                            name={`teach-${c.field.uid}`}
                            disabled={teachBusy}
                            onChange={() => void onTeachConfirm(c, opt.role)}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        <div className="soc-diag">
          <div className="soc-summary-title">Mapping Diagnostics</div>
          {mapping ? (
            <>
              <DiagRow label="Detected" value={String(mapping.detected)} />
              <DiagRow label="Mapped" value={String(mapping.mapped)} />
              <DiagRow label="Domain Matches" value={String(mapping.domainMatches)} />
              <DiagRow label="Alias Matches" value={String(mapping.aliasMatches)} />
              <DiagRow label="Unknown" value={String(mapping.unknown)} />
              <DiagRow label="Skipped" value={String(mapping.skipped)} />
              <DiagRow label="Confidence" value={`${mapping.avgConfidence}%`} />
            </>
          ) : (
            <>
              <DiagRow label="Connected" value={diag.connected} />
              <DiagRow label="Package Loaded" value={diag.packageLoaded} />
              <DiagRow label="Current Opportunity" value={diag.opportunityId || '—'} />
              <DiagRow label="Current Domain" value={diag.domain || '—'} />
            </>
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
          <li>Green = domain · Blue = alias · Yellow = confidence</li>
          <li>Never Submit / CAPTCHA / payment</li>
          <li>Unknown until verified</li>
        </ul>

        {summary && (
          <div className="soc-summary">
            <div className="soc-summary-title">Fill Summary</div>
            <div className="soc-stats soc-stats-grid">
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
                <span className={`soc-pill soc-pill-${d.matchSource ?? d.action}`}>
                  {d.matchSource ?? d.action}
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
