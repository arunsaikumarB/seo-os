import { createRoot } from 'react-dom/client';
import { Widget } from '../components/Widget';
import widgetCss from './widget.css?inline';

const HOST_ID = 'seo-os-companion-root';

function mount(): void {
  if (document.getElementById(HOST_ID)) return;
  if (!document.documentElement) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-seo-os-companion', '1');
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = widgetCss;
  shadow.appendChild(style);

  const mountPoint = document.createElement('div');
  mountPoint.id = 'soc-react-root';
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(<Widget />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
