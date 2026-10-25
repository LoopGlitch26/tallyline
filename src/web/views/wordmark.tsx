export function Wordmark() {
  return (
    <div class="wordmark">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--ink)" />
        <path d="M8 22 L13 15 L18 18 L24 9" fill="none" stroke="var(--visitors)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="8" y="24" width="4" height="2" rx="1" fill="var(--revenue)" />
        <rect x="14" y="23" width="4" height="3" rx="1" fill="var(--revenue)" />
        <rect x="20" y="21" width="4" height="5" rx="1" fill="var(--revenue)" />
      </svg>
      <span>Tallyline</span>
    </div>
  );
}
