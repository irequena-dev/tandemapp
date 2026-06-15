type LogoProps = {
  /** Pixel size of the mark. */
  size?: number
  /** Render the "Tándem" wordmark next to the mark. */
  withWordmark?: boolean
  className?: string
}

/**
 * Tándem brand mark: two interlocking rings — a partnership, two carrying one
 * load together. Inherits `color` (use the sage primary or white on the
 * brand panel). Adult and geometric, never cute.
 */
export function Logo({ size = 28, withWordmark = false, className }: LogoProps) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        role="img"
        aria-label="Tándem"
      >
        <circle cx="12" cy="16" r="8" stroke="currentColor" strokeWidth="2.75" />
        <circle cx="20" cy="16" r="8" stroke="currentColor" strokeWidth="2.75" />
      </svg>
      {withWordmark && (
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--ds-font-display)',
            fontSize: '1.3rem',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: 'currentColor',
          }}
        >
          Tándem
        </span>
      )}
    </span>
  )
}
