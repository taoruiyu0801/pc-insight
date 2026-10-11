import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button, Confirm, Dialog } from "./exports";

/**
 * Dialog wrapper for create/edit forms: blocks closing while saving, asks before
 * discarding edits, and shows a write error without closing.
 */
export function FormDialog({
  title,
  kicker,
  dirty,
  saving,
  error,
  submitLabel,
  onSubmit,
  onClose,
  children,
  width,
}: {
  title: string;
  kicker?: string;
  dirty: boolean;
  saving: boolean;
  error: string;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const [confirm, setConfirm] = useState(false);
  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirm(true);
    else onClose();
  };
  const formId = useId();
  return (
    <>
      <Dialog
        title={title}
        kicker={kicker}
        width={width}
        onRequestClose={requestClose}
        footer={
          <>
            {saving && (
              <span className="secondary-text small" role="status">
                正在保存…
              </span>
            )}
            <Button
              variant="secondary"
              onClick={requestClose}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={formId}
              loading={saving}
            >
              {submitLabel}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          className="form-stack"
          noValidate
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (saving) return;
            onSubmit();
            // After validation renders, move focus to the first field that needs fixing.
            const form = e.currentTarget;
            setTimeout(
              () =>
                form
                  .querySelector<HTMLElement>('[aria-invalid="true"]')
                  ?.focus(),
              0,
            );
          }}
        >
          {children}
          {error && (
            <p className="form-error" role="alert">
              未保存：{error}
            </p>
          )}
        </form>
      </Dialog>
      {confirm && (
        <Confirm
          title="放弃未保存的内容？"
          body="表单中的修改还没有保存。"
          confirmLabel="放弃"
          cancelLabel="继续编辑"
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
