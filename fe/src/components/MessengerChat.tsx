import { useEffect, useRef, useState } from 'react';

/**
 * chat-1.1: floating chat box that hands off to Messenger, where be/chat.py replies. Facebook retired its embeddable
 * chat plugin and the bot has no web endpoint, so nothing is typed here. Hidden until VITE_FACEBOOK_PAGE is set.
 */
export function MessengerChat() {
  const page = import.meta.env.VITE_FACEBOOK_PAGE;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!page) return null;

  return (
    <div className="chat" ref={box}>
      <div className="chat-panel" id="chat-panel" hidden={!open} data-testid="chat-panel">
        <h2 className="chat-title">Chat with Beat'em</h2>
        <p className="chat-bubble">Hi! Send us a message on Messenger and we'll reply there.</p>
        <a className="btn btn-primary" href={`https://m.me/${encodeURIComponent(page)}`} target="_blank" rel="noopener noreferrer">
          Open Messenger
        </a>
      </div>
      <button
        type="button"
        className="chat-toggle"
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        aria-controls="chat-panel"
        onClick={() => setOpen((o) => !o)}
        data-testid="chat-toggle"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M.001 11.639C.001 4.949 5.241 0 12.001 0S24 4.95 24 11.639c0 6.689-5.24 11.638-12 11.638-1.21 0-2.38-.16-3.47-.46a.96.96 0 00-.64.05l-2.39 1.05a.96.96 0 01-1.35-.85l-.07-2.14a.97.97 0 00-.32-.68A11.39 11.389 0 01.002 11.64zm8.32-2.19l-3.52 5.6c-.35.53.32 1.139.82.75l3.79-2.87c.25-.2.6-.2.86 0l2.8 2.1c.84.63 2.04.4 2.6-.48l3.52-5.6c.35-.53-.32-1.13-.82-.75l-3.79 2.87c-.25.2-.6.2-.86 0l-2.8-2.1a1.8 1.8 0 00-2.6.48z"
          />
        </svg>
      </button>
    </div>
  );
}
