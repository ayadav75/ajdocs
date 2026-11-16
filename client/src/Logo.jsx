export const APP_NAME = 'AJDocs';

// Folded-corner page with ruled lines + wordmark. Colours come from CSS tokens, so it follows light/dark mode.
export default function Logo({ size = 'small' }) {
  return (
    <span className={`logo logo-${size}`}>
      <svg className="logo-mark" viewBox="0 0 32 40" aria-hidden="true">
        <path d="M3 2.5h18.5l8 8V37.5H3z" fill="var(--paper)" stroke="var(--violet)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M21.5 2.5v8h8" fill="var(--violet-tint)" stroke="var(--violet)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M9 19h14M9 25h14M9 31h8" stroke="var(--violet)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="logo-word">AJ<span>Docs</span></span>
    </span>
  );
}
