import { useState } from "react";
import type { Project } from "../../../../../packages/types";
import { api } from "../../api";
import { useMutate, usePending } from "../../data/context";
import { Button, Dialog, Field } from "../../components/ui/exports";

export async function requestRecording(recording: boolean, breaking = false) {
  const allowed = await api.recording(recording, breaking);
  if (!allowed) await api.requestRecording();
  return allowed;
}

export function StartRecordingDialog({
  projects,
  onClose,
}: {
  projects: Project[];
  onClose: () => void;
}) {
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const busy = usePending("recording"),
    mutate = useMutate();
  const start = async (unassigned: boolean) => {
    if (!unassigned && !goal) return;
    const result = await mutate(
      "recording",
      async () => {
        if (!unassigned && !(await api.intent(goal)))
          throw new Error("无法选择目标");
        if (!(await api.recording(true, false, unassigned)))
          throw new Error("请重新选择目标");
      },
      {
        inlineError: true,
        success: unassigned ? "仅记录应用，相关性暂不判断" : "已开始记录",
      },
    );
    if (result.status === "failed") setError(result.error);
    else if (result.status !== "busy") onClose();
  };
  return (
    <Dialog
      title="选择目标后开始记录"
      onRequestClose={() => !busy && onClose()}
      footer={
        <>
          <Button disabled={busy} onClick={() => void start(true)}>
            仅记录应用
          </Button>
          <Button
            variant="primary"
            disabled={!goal}
            loading={busy}
            onClick={() => void start(false)}
          >
            选择目标并开始
          </Button>
        </>
      }
    >
      <p>
        没有目标时，只保留应用活动，相关性暂不判断。选择目标只影响之后的记录。
      </p>
      <Field label="当前目标">
        <select
          value={goal}
          disabled={busy}
          onChange={(e) => setGoal(e.target.value)}
        >
          <option value="">请选择目标</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {!projects.length && (
        <p className="secondary-text">
          还没有项目，可以先取消并新建项目，或仅记录应用。
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
