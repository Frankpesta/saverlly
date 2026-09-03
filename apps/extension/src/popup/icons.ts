// Hand-traced from the exact icons in extension_figma_files/ (pixel-sampled and zoomed
// crops). Not generic/emoji stand-ins. Keep these in sync if the design changes.

export const ARROW_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 12h15.5M13.5 5.5L20 12l-6.5 6.5" stroke="#111827" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ARROW_ICON_LIGHT = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 12h15.5M13.5 5.5L20 12l-6.5 6.5" stroke="#6b7280" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const TAG_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.5 3H6a2 2 0 00-2 2v5.5a2 2 0 00.6 1.4l9 9a2 2 0 002.8 0l6-6a2 2 0 000-2.8l-9-9a2 2 0 00-1.4-.6z" fill="currentColor"/><circle cx="7.75" cy="7.75" r="1.4" fill="#00000030"/></svg>`;

export const CHECK_ICON = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4.5 4.5L19 8" stroke="#58C3B7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const X_ICON = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6L6 18" stroke="#9ca3af" stroke-width="2.6" stroke-linecap="round"/></svg>`;

export const SPINNER_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="#58C3B7" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="6" opacity="1"/><line x1="12" y1="18" x2="12" y2="22" opacity="0.2"/><line x1="4.9" y1="4.9" x2="7.8" y2="7.8" opacity="0.9"/><line x1="16.2" y1="16.2" x2="19.1" y2="19.1" opacity="0.3"/><line x1="2" y1="12" x2="6" y2="12" opacity="0.8"/><line x1="18" y1="12" x2="22" y2="12" opacity="0.4"/><line x1="4.9" y1="19.1" x2="7.8" y2="16.2" opacity="0.6"/><line x1="16.2" y1="7.8" x2="19.1" y2="4.9" opacity="0.5"/></g></svg>`;

// Row-level "in progress" icon in the applying-state checklist: a two-tone ring (light
// track + teal arc) rather than the radiating-tick spinner used for pills. Matches the
// distinct ring shape in the Figma "Applying And Testing The Codes" frames.
export const RING_SPINNER_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" fill="none" stroke="#EAF7F5" stroke-width="3"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="#58C3B7" stroke-width="3" stroke-linecap="round" stroke-dasharray="42 18"/></svg>`;

// Row-level "not started yet" icon. The same radiating-tick shape as SPINNER_ICON but
// muted gray and motionless, matching the faint idle icon in the reference design.
export const PENDING_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="#E5E7EB" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.9" y1="4.9" x2="7.8" y2="7.8"/><line x1="16.2" y1="16.2" x2="19.1" y2="19.1"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.9" y1="19.1" x2="7.8" y2="16.2"/><line x1="16.2" y1="7.8" x2="19.1" y2="4.9"/></g></svg>`;
