import './popup.css';

/** Popup is instructional only — package state lives in the page content-script memory. */
export function PopupApp() {
  return (
    <div className="popup">
      <header>
        <h1>SEO OS Companion</h1>
        <p>Phase 2.1 — in-memory delivery layer</p>
      </header>

      <div className="card">
        <p>
          <strong>Waiting for Handoff…</strong>
        </p>
        <p className="muted">
          In SEO OS → Assisted Manual → click <strong>Open package</strong>. The floating widget on
          the page shows Connected status. Nothing is stored in the browser.
        </p>
      </div>
    </div>
  );
}
