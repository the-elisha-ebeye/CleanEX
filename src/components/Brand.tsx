import { cx } from '../lib/cx'

/**
 * The CleanEX mark: a washing drum drawn as a "C", water inside it, and a
 * sparkle at the opening. Kept in sync with public/cleanex.svg (the favicon).
 */
export function CleanexMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cx('shrink-0', className)}>
      <rect width="48" height="48" rx="13" fill="var(--color-sky)" />
      <path
        d="M31.5 14.6A12 12 0 1 0 33.4 31"
        fill="none"
        stroke="#fff"
        strokeWidth="5.2"
        strokeLinecap="round"
      />
      <path
        d="M15.2 27.2c2.2-1.7 4.4-1.7 6.6 0s4.4 1.7 6.6 0"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity=".9"
      />
      <path
        d="M36.5 7.5c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5z"
        fill="var(--color-taupe-50)"
      />
    </svg>
  )
}

/** "Clean" in ink, "EX" in sky blue; the tagline is taupe. */
export function Wordmark({
  className,
  compact,
  inverted,
}: {
  className?: string
  compact?: boolean
  /** White text for use on the sky-blue sign-in panel. */
  inverted?: boolean
}) {
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <CleanexMark className={cx('size-9', inverted && 'rounded-[13px] ring-2 ring-white/70')} />
      <span className="leading-tight">
        <span className={cx('block text-[1.15rem] font-extrabold tracking-tight', inverted ? 'text-white' : 'text-ink')}>
          Clean<span className={inverted ? 'text-white' : 'text-brand'}>EX</span>
        </span>
        {!compact && (
          <span
            className={cx(
              'block text-[0.68rem] font-semibold tracking-[0.12em] uppercase',
              inverted ? 'text-white/80' : 'text-taupe-700',
            )}
          >
            Laundry manager
          </span>
        )}
      </span>
    </span>
  )
}
