import './popup.css';

export function PopupApp() {
  return (
    <div className="popup">
      <header>
        <h1>SEO OS Companion</h1>
        <p>Phase 2.2 — one active package in memory</p>
      </header>
      <div className="card">
        <p>
          <strong>Waiting for Package</strong>
        </p>
        <p className="muted">
          In SEO OS → Assisted Manual → <strong>Activate Package</strong>. The floating widget holds
          exactly one package until you activate another or clear it.
        </p>
      </div>
    </div>
  );
}
