// The support chat's icon: a twinkling star (the AI) that turns into a friendly support face with a headset
// (the people behind it), and back, over and over (index.css: .sup-star, .sup-face). Still for people who turn
// motion off: then it shows the face.
export function SupportIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden className={className}>
      {/* The star, with a small one beside it. */}
      <g className="sup-star">
        <path d="M14 3.2c.75 5.9 4.9 10.05 10.8 10.8-5.9.75-10.05 4.9-10.8 10.8-.75-5.9-4.9-10.05-10.8-10.8 5.9-.75 10.05-4.9 10.8-10.8Z" fill="currentColor" />
        <path className="sup-spark" d="M22.4 3.4c.2 1.5 1.2 2.5 2.7 2.7-1.5.2-2.5 1.2-2.7 2.7-.2-1.5-1.2-2.5-2.7-2.7 1.5-.2 2.5-1.2 2.7-2.7Z" fill="currentColor" opacity=".85" />
      </g>
      {/* The face with its headset. */}
      <g className="sup-face" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="14" cy="15" r="7.2" fill="currentColor" fillOpacity=".14" />
        <path d="M5.6 14.6a8.4 8.4 0 0 1 16.8 0" />
        <rect x="3.9" y="13.2" width="3.2" height="5.2" rx="1.6" fill="currentColor" stroke="none" />
        <rect x="20.9" y="13.2" width="3.2" height="5.2" rx="1.6" fill="currentColor" stroke="none" />
        <path d="M22.5 18.4c-.2 2.6-1.9 4-4.6 4.2" />
        <circle cx="17.2" cy="22.6" r="1.15" fill="currentColor" stroke="none" />
        <g className="sup-eyes">
          <circle cx="11.6" cy="14.4" r="1.05" fill="currentColor" stroke="none" />
          <circle cx="16.4" cy="14.4" r="1.05" fill="currentColor" stroke="none" />
        </g>
        <path d="M11.4 17.4c1.5 1.4 3.7 1.4 5.2 0" />
      </g>
    </svg>
  );
}
