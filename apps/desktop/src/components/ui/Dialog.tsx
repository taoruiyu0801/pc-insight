import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModal } from "./modal";

interface ModalFrameProps {
  title: ReactNode;
  kicker?: ReactNode;
  /** Called for Escape, the close button and backdrop clicks. The owner decides
   * whether closing is allowed (pending save, unsaved changes). */
  onRequestClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Dialog({
  title,
  kicker,
  onRequestClose,
  children,
  footer,
  width = 480,
}: ModalFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(ref, onRequestClose);
  return createPortal(
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onRequestClose();
      }}
    >
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ width }}
      >
        <header className="dialog-head">
          <div>
            {kicker && <div className="kicker">{kicker}</div>}
            <h2 id={titleId} className="dialog-title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭"
            onClick={onRequestClose}
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  title,
  kicker,
  onRequestClose,
  children,
  footer,
}: ModalFrameProps) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useModal(ref, onRequestClose);
  return createPortal(
    <div
      className="scrim scrim-drawer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onRequestClose();
      }}
    >
      <aside
        ref={ref}
        className="drawer"
        data-autofocus
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="drawer-head">
          <div className="drawer-title-block">
            {kicker && <div className="kicker">{kicker}</div>}
            <h2 id={titleId} className="drawer-title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭详情"
            onClick={onRequestClose}
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

/** Small confirmation on top of any page or modal. */
export function Confirm({
  title,
  body,
  confirmLabel,
  cancelLabel = "取消",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      title={title}
      onRequestClose={() => !pending && onCancel()}
      width={400}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            data-autofocus
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-body">{body}</div>
    </Dialog>
  );
}
