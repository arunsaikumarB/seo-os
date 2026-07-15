import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MousePointer2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

type Viewport = { width: number; height: number };

type FrameResponse = {
  data: {
    ok: boolean;
    live: boolean;
    interactive: boolean;
    restored?: boolean;
    message?: string;
    dataUrl: string | null;
    pageUrl: string | null;
    title: string | null;
    viewport: Viewport | null;
  };
};

type Props = {
  projectId: string;
  jobId: string;
  website: string;
  className?: string;
  /** Poll interval while focused (ms) */
  pollMs?: number;
};

function mapPointerToViewport(
  clientX: number,
  clientY: number,
  img: HTMLImageElement,
  viewport: Viewport
): { x: number; y: number } | null {
  const rect = img.getBoundingClientRect();
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const scale = Math.min(rect.width / nw, rect.height / nh);
  const dispW = nw * scale;
  const dispH = nh * scale;
  const ox = (rect.width - dispW) / 2;
  const oy = (rect.height - dispH) / 2;
  const ix = clientX - rect.left - ox;
  const iy = clientY - rect.top - oy;
  if (ix < 0 || iy < 0 || ix > dispW || iy > dispH) return null;
  return {
    x: Math.round((ix / dispW) * viewport.width),
    y: Math.round((iy / dispH) * viewport.height),
  };
}

const SPECIAL_KEYS = new Set([
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export function LiveBrowserView({
  projectId,
  jobId,
  website,
  className,
  pollMs = 700,
}: Props) {
  const { request } = useApi();
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const sendingRef = useRef(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [status, setStatus] = useState('Connecting…');
  const [interactive, setInteractive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);

  const pullFrame = useCallback(async () => {
    try {
      const res = await request<FrameResponse>(
        `/v1/projects/${projectId}/browser/jobs/${jobId}/intervention/frame`,
        { method: 'POST' }
      );
      const d = res.data;
      if (d.dataUrl) setDataUrl(d.dataUrl);
      if (d.viewport) viewportRef.current = d.viewport;
      setPageUrl(d.pageUrl);
      setTitle(d.title);
      setInteractive(Boolean(d.interactive && d.live));
      setStatus(d.message || (d.live ? 'Live' : 'Waiting for session'));
    } catch (err) {
      setInteractive(false);
      setStatus(err instanceof Error ? err.message : 'Frame unavailable');
    }
  }, [jobId, projectId, request]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      if (cancelled) return;
      await pullFrame();
      if (cancelled) return;
      timer = window.setTimeout(tick, focused ? pollMs : pollMs * 2);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [pullFrame, pollMs, focused]);

  const sendInput = useCallback(
    async (body: Record<string, unknown>, refreshAfter = false) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setBusy(true);
      try {
        await request(`/v1/projects/${projectId}/browser/jobs/${jobId}/intervention/input`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (refreshAfter) await pullFrame();
        else void pullFrame();
      } catch {
        /* keep stream alive */
      } finally {
        sendingRef.current = false;
        setBusy(false);
      }
    },
    [jobId, projectId, pullFrame, request]
  );

  const onPointer = (type: 'click' | 'dblclick', e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    imgRef.current?.focus();
    const vp = viewportRef.current;
    const img = imgRef.current;
    if (!vp || !img || !interactive) return;
    const coords = mapPointerToViewport(e.clientX, e.clientY, img, vp);
    if (!coords) return;
    void sendInput(
      {
        type,
        x: coords.x,
        y: coords.y,
        button: e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left',
      },
      true
    );
  };

  const onWheel = (e: React.WheelEvent<HTMLImageElement>) => {
    e.preventDefault();
    const vp = viewportRef.current;
    const img = imgRef.current;
    if (!vp || !img || !interactive) return;
    const coords = mapPointerToViewport(e.clientX, e.clientY, img, vp);
    void sendInput({
      type: 'scroll',
      x: coords?.x,
      y: coords?.y,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLImageElement>) => {
    if (!interactive) return;
    // Allow browser shortcuts with meta/ctrl except plain typing path
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') return;
    e.preventDefault();
    e.stopPropagation();
    const modifiers = [
      e.altKey ? ('Alt' as const) : null,
      e.ctrlKey ? ('Control' as const) : null,
      e.metaKey ? ('Meta' as const) : null,
      e.shiftKey ? ('Shift' as const) : null,
    ].filter(Boolean) as Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;

    if (SPECIAL_KEYS.has(e.key) || e.key.length > 1) {
      void sendInput({ type: 'keydown', key: e.key, modifiers }, true);
      return;
    }
    if (e.key.length === 1) {
      void sendInput({ type: 'type', text: e.key }, true);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-2">
          <MousePointer2 className="h-4 w-4" />
          Live browser
          {interactive ? (
            <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 border-transparent">
              Interactive
            </Badge>
          ) : (
            <Badge className="text-[10px] bg-muted text-muted-foreground">Connecting</Badge>
          )}
          {(busy || !dataUrl) && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </p>
        <p className="text-[11px] text-muted-foreground tabular-nums">{status}</p>
      </div>

      <div
        className={cn(
          'relative rounded-lg border bg-black/90 overflow-hidden min-h-[320px] flex items-center justify-center',
          focused && interactive ? 'ring-2 ring-emerald-500/60' : ''
        )}
      >
        {dataUrl ? (
          <img
            ref={imgRef}
            src={dataUrl}
            alt={`Interactive browser — ${website}`}
            tabIndex={0}
            className={cn(
              'max-h-[480px] w-full object-contain outline-none',
              interactive ? 'cursor-crosshair' : 'cursor-wait'
            )}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onClick={(e) => onPointer('click', e)}
            onDoubleClick={(e) => onPointer('dblclick', e)}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
          />
        ) : (
          <p className="text-sm text-muted-foreground p-6 text-center">
            Opening the Playwright session…
            <br />
            <span className="text-xs">
              Cookies, filled forms, and uploads stay attached. Click inside to control the page.
            </span>
          </p>
        )}
      </div>

      {pageUrl ? (
        <p className="text-[11px] text-muted-foreground truncate">
          {title ? `${title} · ` : ''}
          {pageUrl}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {focused && interactive
          ? 'Keyboard captured — type, click, scroll here. AI resumes automatically when this step is done.'
          : 'Click the live view to focus, then log in / solve CAPTCHA / enter OTP directly on the page.'}
      </p>
    </div>
  );
}
