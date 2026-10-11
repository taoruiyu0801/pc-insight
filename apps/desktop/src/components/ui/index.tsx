import {
  useId,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cloneElement, isValidElement } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCw,
} from "lucide-react";
import { durationParts } from "../../lib/format";
import { stateInfo, type Tone } from "../../lib/semantics";
import { isDateKey, longDate, relativeDay, shiftDate } from "../../lib/dates";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="spin" size={15} aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Label + control + help + error with ids wired for assistive tech. */
export function Field({
  label,
  help,
  error,
  children,
  aside,
  className = "",
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  children: ReactElement<Record<string, unknown>>;
  aside?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby":
          [helpId, errorId].filter(Boolean).join(" ") || undefined,
      })
    : children;
  return (
    <div className={`field ${error ? "field-invalid" : ""} ${className}`}>
      <div className="field-label-row">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        {aside}
      </div>
      {control}
      {help && (
        <p id={helpId} className="field-help">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** State marker: tone fill plus a distinct shape, so state never relies on colour alone. */
export function StateMark({ tone }: { tone: Tone }) {
  return <i className={`state-mark tone-${tone}`} aria-hidden />;
}

export function StateBadge({
  state,
  idle = false,
}: {
  state: string;
  idle?: boolean;
}) {
  const info = stateInfo(state, idle);
  return (
    <span className={`state-badge tone-${info.tone}`}>
      <StateMark tone={info.tone} />
      {info.label}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

/** Large duration with smaller units: 3 小时 12 分. */
export function Duration({
  ms,
  className = "",
}: {
  ms: number;
  className?: string;
}) {
  return (
    <span className={`duration ${className}`}>
      {durationParts(ms).map((p) => (
        <span key={p.unit}>
          <span className="duration-value">{p.value}</span>
          <span className="duration-unit">{p.unit}</span>
        </span>
      ))}
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="spinner" role="status">
      <Loader2 className="spin" size={16} aria-hidden />
      {label}
    </span>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="state-block state-loading" role="status" aria-live="polite">
      <div className="loading-rules" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <p>{label}</p>
    </div>
  );
}

export function ErrorBlock({
  title,
  message,
  onRetry,
  compact = false,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`state-block state-error ${compact ? "compact" : ""}`}
      role="alert"
    >
      <AlertTriangle size={18} aria-hidden />
      <div>
        <strong>{title}</strong>
        <p className="wrap-anywhere">{message}</p>
      </div>
      {onRetry && (
        <Button
          size="sm"
          icon={<RotateCw size={14} aria-hidden />}
          onClick={onRetry}
        >
          重试
        </Button>
      )}
    </div>
  );
}

export function EmptyBlock({
  title,
  children,
  action,
  mark = true,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  mark?: boolean;
}) {
  return (
    <div className="state-block state-empty">
      {mark && <FiveLaneMark size={36} muted />}
      <div>
        <strong>{title}</strong>
        {children && <div className="state-text">{children}</div>}
      </div>
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

/**
 * The five-lane brand mark: goal, attention, context, background, state —
 * five strokes of different lengths, like a page from a time ledger.
 * Purely decorative; it never encodes real data.
 */
export function FiveLaneMark({
  size = 24,
  muted = false,
}: {
  size?: number;
  muted?: boolean;
}) {
  return (
    <svg
      className={`five-lane-mark ${muted ? "muted" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <line x1="3" y1="4" x2="15" y2="4" className="m-goal" />
      <line x1="3" y1="8.5" x2="21" y2="8.5" className="m-attention" />
      <line x1="7" y1="13" x2="17" y2="13" className="m-context" />
      <line x1="10" y1="17.5" x2="21" y2="17.5" className="m-job" />
      <line x1="3" y1="22" x2="12" y2="22" className="m-state" />
    </svg>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          className={value === o.value ? "on" : ""}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            const i = options.findIndex((x) => x.value === value);
            const next =
              options[
                (i + (e.key === "ArrowRight" ? 1 : options.length - 1)) %
                  options.length
              ];
            onChange(next.value);
            const group = e.currentTarget.parentElement;
            requestAnimationFrame(() =>
              group
                ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
                ?.focus(),
            );
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Previous / date input / next, never beyond today. */
export function DateNav({
  date,
  today,
  onChange,
  label = "查看日期",
  compact = false,
}: {
  date: string;
  today: string;
  onChange: (d: string) => void;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`date-nav ${compact ? "compact" : ""}`}
      role="group"
      aria-label={label}
    >
      <IconButton label="前一天" onClick={() => onChange(shiftDate(date, -1))}>
        <ChevronLeft size={16} aria-hidden />
      </IconButton>
      <input
        type="date"
        aria-label={label}
        value={date}
        max={today}
        onChange={(e) => {
          const v = e.target.value;
          if (isDateKey(v) && v <= today) onChange(v);
        }}
      />
      <IconButton
        label="后一天"
        disabled={date >= today}
        onClick={() => onChange(shiftDate(date, 1))}
      >
        <ChevronRight size={16} aria-hidden />
      </IconButton>
      {!compact && date !== today && (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => onChange(today)}
        >
          回到今天
        </button>
      )}
    </div>
  );
}

export function DateHeading({ date, today }: { date: string; today: string }) {
  return (
    <span className="date-heading">
      <span className="serif">{longDate(date)}</span>
      <span className={`tag ${date === today ? "tag-accent" : "tag-neutral"}`}>
        {date === today ? "今天" : `${relativeDay(date, today)} · 回顾`}
      </span>
    </span>
  );
}

/** Thin proportional bar; `max` must be the real scale, values are not inflated. */
export function Meter({
  value,
  max,
  tone = "focus",
  label,
}: {
  value: number;
  max: number;
  tone?: string;
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="meter" role="img" aria-label={label}>
      <i className={`tone-fill-${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}
