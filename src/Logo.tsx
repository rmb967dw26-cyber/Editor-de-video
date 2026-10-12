/** Logotipo de PollArt: icono (barra + reproducir) y nombre. */
export function Logo() {
  return (
    <span className="logo" aria-label="PollArt">
      <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="pollart-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f08a3e" />
            <stop offset="1" stopColor="#c2408f" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#pollart-grad)" />
        <rect x="7" y="7" width="3.2" height="18" rx="1.6" fill="#fff" />
        <path d="M13 8.6c0-1.2 1.3-1.9 2.3-1.3l9.4 6.2c.9.6.9 1.9 0 2.5l-9.4 6.2c-1 .7-2.3 0-2.3-1.3z" fill="#fff" />
      </svg>
      <span className="logo-text">
        Poll<span className="logo-accent">Art</span>
      </span>
    </span>
  )
}
