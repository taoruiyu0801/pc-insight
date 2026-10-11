import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useNotices } from "../data/context";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { activeModal, subscribeModals } from "../components/ui/modal";

export function Notices() {
  const { list, notices } = useNotices();
  const modal = useSyncExternalStore(subscribeModals, activeModal);
  return createPortal(
    <div className="notices" aria-live="polite">
      {list.map((n) => (
        <div
          key={n.id}
          className={`notice notice-${n.kind}`}
          role={n.kind === "error" ? "alert" : "status"}
        >
          {n.kind === "success" ? (
            <CheckCircle2 size={16} aria-hidden />
          ) : n.kind === "info" ? (
            <Info size={16} aria-hidden />
          ) : (
            <AlertTriangle size={16} aria-hidden />
          )}
          <span className="wrap-anywhere">{n.text}</span>
          {n.action && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                notices.dismiss(n.id);
                void n.action!.run();
              }}
            >
              {n.action.label}
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => notices.dismiss(n.id)}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>,
    modal ?? document.body,
  );
}
