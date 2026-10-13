import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cx } from '../lib/cx'
import { PAYMENT_LABEL, STATUS_LABEL } from '../lib/format'
import type { OrderStatus, PaymentStatus } from '../lib/types'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  size?: 'md' | 'sm'
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        size === 'md' ? 'min-h-10 px-4 text-[0.92rem]' : 'min-h-8 px-3 text-sm',
        variant === 'primary' && 'bg-brand text-white shadow-sm hover:bg-brand-deep',
        variant === 'secondary' &&
          'border border-line-strong bg-paper text-ink hover:border-ink-soft/50 hover:bg-rinse',
        variant === 'quiet' && 'text-ink-soft hover:bg-rinse-deep hover:text-ink',
        variant === 'danger' && 'border border-owed/30 bg-paper text-owed hover:bg-owed-wash',
        className,
      )}
    />
  )
}

type FieldProps = {
  label: string
  hint?: string
  error?: string
  children: (id: string, describedBy: string | undefined) => ReactNode
  className?: string
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId()
  const hintId = hint || error ? `${id}-hint` : undefined
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink-soft">
        {label}
      </label>
      {children(id, hintId)}
      {(error || hint) && (
        <p id={hintId} className={cx('text-sm', error ? 'text-owed' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

const control =
  'w-full min-h-10 rounded-lg border border-line-strong bg-paper px-3 text-ink placeholder:text-muted/70 hover:border-ink-soft/40 focus-visible:border-brand disabled:bg-rinse disabled:text-muted'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(control, className)} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(control, 'pr-8', className)} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(control, 'py-2', className)} />
}

export function SearchInput({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className={cx('relative w-full', className)}>
      <Icon
        name="search"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
      />
      <Input type="search" aria-label={label} {...props} className="pl-10" />
    </div>
  )
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  received: 'bg-taupe-100 text-taupe-700',
  in_progress: 'bg-brand-wash text-brand-deep',
  ready: 'bg-tag-wash text-tag-deep',
  picked_up: 'bg-settled-wash text-settled',
  cancelled: 'bg-owed-wash text-owed',
}

const pill =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8rem] font-semibold whitespace-nowrap'

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cx(pill, STATUS_STYLE[status])}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status]}
    </span>
  )
}

const PAYMENT_STYLE: Record<PaymentStatus, string> = {
  unpaid: 'bg-owed-wash text-owed',
  partially_paid: 'bg-tag-wash text-tag-deep',
  paid: 'bg-settled-wash text-settled',
  overpaid: 'bg-brand-wash text-brand-deep',
}

export function PaymentBadge({ status }: { status: PaymentStatus | undefined }) {
  if (!status) return <span className="text-muted">—</span>
  return <span className={cx(pill, PAYMENT_STYLE[status])}>{PAYMENT_LABEL[status]}</span>
}

const PAYMENT_TEXT: Record<PaymentStatus, string> = {
  unpaid: 'text-owed',
  partially_paid: 'text-tag-deep',
  paid: 'text-settled',
  overpaid: 'text-brand-deep',
}

export function PaymentText({ status }: { status: PaymentStatus | undefined }) {
  if (!status) return <span className="text-muted">—</span>
  return <span className={cx('font-semibold', PAYMENT_TEXT[status])}>{PAYMENT_LABEL[status]}</span>
}

export function Notice({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info' | 'success' | 'warning'
  children: ReactNode
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-lg border px-3 py-2.5 text-sm',
        tone === 'error' && 'border-owed/25 bg-owed-wash text-owed',
        tone === 'info' && 'border-brand/20 bg-brand-wash text-brand-deep',
        tone === 'success' && 'border-settled/25 bg-settled-wash text-settled',
        tone === 'warning' && 'border-tag/30 bg-tag-wash text-tag-deep',
      )}
    >
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-paper px-6 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
      {label}
    </p>
  )
}

/** A titled white card. Tables and lists sit flush inside it. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cx('card overflow-hidden', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cx('overflow-x-auto', bodyClassName)}>{children}</div>
    </section>
  )
}

const TONE_ICON: Record<string, string> = {
  blue: 'bg-brand-wash text-brand',
  amber: 'bg-tag-wash text-tag-deep',
  green: 'bg-settled-wash text-settled',
  coral: 'bg-owed-wash text-owed',
  taupe: 'bg-taupe-100 text-taupe-700',
}

export type Tone = 'blue' | 'amber' | 'green' | 'coral' | 'taupe'

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone,
  href,
  className,
}: {
  className?: string
  label: string
  value: ReactNode
  detail?: ReactNode
  icon: IconName
  tone: Tone
  href?: string
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <span className={cx('grid size-9 place-items-center rounded-xl', TONE_ICON[tone])}>
          <Icon name={icon} />
        </span>
      </div>
      <p className="mt-2 text-[1.45rem] leading-tight font-semibold tracking-tight text-ink sm:text-[1.75rem]">{value}</p>
      {detail && <p className="mt-0.5 text-sm text-muted">{detail}</p>}
    </>
  )
  return href ? (
    <a href={href} className={cx('card block p-4 transition-shadow hover:shadow-md sm:p-5', className)}>
      {body}
    </a>
  ) : (
    <div className={cx('card p-4 sm:p-5', className)}>{body}</div>
  )
}

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  variant?: 'drawer' | 'drawer-left' | 'modal'
  wide?: boolean
}

/** Native <dialog> keeps focus trapping and Escape handling in the browser. */
export function Dialog({ open, onClose, title, children, variant = 'modal', wide }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={cx(
        'bg-paper p-0 shadow-2xl',
        variant === 'drawer' && 'drawer m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl',
        variant === 'drawer-left' && 'drawer-left m-0 mr-auto h-dvh max-h-dvh w-72 max-w-[85vw] bg-taupe-50',
        variant === 'modal' &&
          cx('m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] rounded-2xl', wide ? 'max-w-5xl' : 'max-w-lg'),
      )}
    >
      {open && (
        <div className="flex h-full max-h-[inherit] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id={titleId} className="display text-xl">
              {title}
            </h2>
            <Button variant="quiet" size="sm" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </div>
      )}
    </dialog>
  )
}

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  board: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  orders: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  people:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6',
  userPlus: 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-1a7 7 0 0 1 12-4.9M19 14v6M16 17h6',
  box: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9',
  wallet: 'M4 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4zM4 6V5a1 1 0 0 1 1-1h11M16 13h.01',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  check: 'M5 12l5 5 9-10',
  menu: 'M4 6h16M4 12h16M4 18h16',
  printer: 'M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  cash: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  spin: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx('shrink-0', className)}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-[1.75rem] sm:text-[2rem]">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-muted">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}

/** Small segmented control for switching filters or tabs. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; label: ReactNode }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 gap-1 rounded-xl bg-rinse-deep/70 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            'inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors',
            value === o.id ? 'bg-paper text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Wrapping filter chips. */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; label: string; count?: number }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            'min-h-8 rounded-full border px-3 text-sm font-semibold transition-colors',
            value === o.id
              ? 'border-ink bg-ink text-white'
              : 'border-line-strong bg-paper text-ink-soft hover:border-ink-soft/50',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cx('ml-1.5', value === o.id ? 'text-white/70' : 'text-muted')}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
