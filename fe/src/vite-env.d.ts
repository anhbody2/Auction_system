/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** sec-004: inactivity limit in ms (default 30 minutes). */
  readonly VITE_IDLE_TIMEOUT_MS?: string;
  /** sec-004: how long before the limit the warning shows, in ms (default 60 s). */
  readonly VITE_IDLE_WARNING_MS?: string;
  /** chat-1.1: Facebook page username or ID for the Messenger chat box; unset hides it. */
  readonly VITE_FACEBOOK_PAGE?: string;
}
