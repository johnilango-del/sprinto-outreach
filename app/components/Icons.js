// Small line icons (inline SVG, no image files).
const PATHS = {
  play: <path d="M7 5l12 7-12 7V5z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  decision: (
    <>
      <path d="M12 3v18" />
      <path d="M5 8h14l-2 5H7L5 8z" />
    </>
  ),
  facts: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 16a8 8 0 1116 0" />
      <path d="M12 16l4-5" />
    </>
  ),
  pages: (
    <>
      <path d="M8 3h8l4 4v14H8z" />
      <path d="M4 7v14h12" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  alert: (
    <>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4M12 17.5v.01" />
    </>
  ),
  todo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.01" />
    </>
  ),
};

export function Icon({ name, size }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size || 16}
      height={size || 16}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name] || null}
    </svg>
  );
}

export function SectionTitle({ icon, label, children }) {
  return (
    <div className="card-title">
      <span className="icon-tile">
        <Icon name={icon} />
      </span>
      <div>
        <div className="eyebrow">{label}</div>
        {children}
      </div>
    </div>
  );
}
