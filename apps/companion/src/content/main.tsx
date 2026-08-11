import { createRoot } from 'react-dom/client';
import { Widget } from '../components/Widget';
import { installWebHandoffBridge } from '../core/session/web-bridge';
import { installActivePackageSync } from '../core/runtime/memory';
import widgetCss from './widget.css?inline';

const HOST_ID = 'BacklinkAgent-companion-root';

function mount(): void {
  if (document.getElementById(HOST_ID)) return;
  if (!document.documentElement) return;

  installWebHandoffBridge();
  installActivePackageSync();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-backlink-agent-companion', '1');
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
