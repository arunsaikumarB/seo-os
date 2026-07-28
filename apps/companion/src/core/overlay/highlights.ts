const STYLE_ID = 'seo-os-companion-fill-highlights';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .soc-hl-filled {
      outline: 2px solid #16a34a !important;
      outline-offset: 1px !important;
      border-color: #16a34a !important;
    }
    .soc-hl-skipped {
      outline: 2px solid #ca8a04 !important;
      outline-offset: 1px !important;
      border-color: #ca8a04 !important;
    }
    .soc-hl-missing {
      outline: 2px solid #dc2626 !important;
      outline-offset: 1px !important;
      border-color: #dc2626 !important;
    }
  `;
  document.documentElement.appendChild(style);
}

export function clearFillHighlights(): void {
  document
    .querySelectorAll('.soc-hl-filled, .soc-hl-skipped, .soc-hl-missing')
    .forEach((n) => {
      n.classList.remove('soc-hl-filled', 'soc-hl-skipped', 'soc-hl-missing');
    });
}

export function applyFillHighlights(opts: {
  filled: HTMLElement[];
  skipped: HTMLElement[];
  missing: HTMLElement[];
}): void {
  ensureStyles();
  for (const el of opts.filled) el.classList.add('soc-hl-filled');
  for (const el of opts.skipped) {
    if (!el.classList.contains('soc-hl-filled') && !el.classList.contains('soc-hl-missing')) {
      el.classList.add('soc-hl-skipped');
    }
  }
  for (const el of opts.missing) {
    el.classList.remove('soc-hl-skipped');
    el.classList.add('soc-hl-missing');
  }
}

export function scrollToElement(el: HTMLElement): void {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('soc-hl-missing');
  try {
    el.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }
}
