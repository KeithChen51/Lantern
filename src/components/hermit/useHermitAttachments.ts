"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { authFetch } from "@/components/auth/auth-fetch";
import { HermitUploadScope } from "./upload-scope";
import { getHermitApiError, isSupportedHermitFile, type HermitAttachment } from "./types";
import { restoredAttachments, type ConversationDetail } from "./conversation-state";

const MAX_ATTACHMENTS_PER_CONVERSATION = 5;
function createLocalAttachmentId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
}

export function useHermitAttachments(uploadOwner: string | null, initial?: ConversationDetail) {
  const uploadOwnerRef = useRef(uploadOwner);
  const uploadScopeRef = useRef<HermitUploadScope | null>(null);
  useLayoutEffect(() => {
    uploadOwnerRef.current = uploadOwner;
    const scope = new HermitUploadScope(uploadOwner, () => uploadOwnerRef.current);
    uploadScopeRef.current = scope;
    return () => { scope.dispose(); };
  }, [uploadOwner]);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const uploadQueueLengthRef = useRef(0);
  const canceledUploadIdsRef = useRef(new Set<string>());
  const [attachments, setAttachments] = useState<HermitAttachment[]>(() => restoredAttachments(initial));
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  async function uploadAttachment(file: File, localId: string, scope: HermitUploadScope) {
    scope.assertActive();
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await authFetch("/api/hermit/attachments", { method: "POST", body: formData, signal: scope.signal });
      scope.assertActive();
      const responseText = await response.text();
      scope.assertActive();
      let payload: unknown = responseText;
      try {
        payload = responseText ? JSON.parse(responseText) : null;
      } catch {
        // Keep the plain text body for the short actionable error extractor.
      }
      if (!response.ok || !payload || typeof payload !== "object" || !("id" in payload) || typeof payload.id !== "string") {
        throw new Error(getHermitApiError(payload, "文件上传失败，请重试。"));
      }

      const data = payload as { id: string; name?: unknown; size?: unknown; status?: unknown };
      if (data.status !== "ready") throw new Error(getHermitApiError(payload, "文件暂时无法读取，请重试。"));
      if (canceledUploadIdsRef.current.delete(localId)) {
        await deleteServerAttachment(data.id, scope);
        return;
      }
      setAttachments((current) => current.map((attachment) => (
        attachment.localId === localId
          ? {
              ...attachment,
              id: data.id,
              name: typeof data.name === "string" ? data.name : attachment.name,
              size: typeof data.size === "number" ? data.size : attachment.size,
              status: "ready",
              sent: false,
              error: undefined,
            }
          : attachment
      )));
    } catch (error) {
      if (!scope.active) return;
      const message = getHermitApiError(error, "有文件未能上传，请重试或移除后继续。");
      setAttachments((current) => current.map((attachment) => (
        attachment.localId === localId ? { ...attachment, status: "error", error: message } : attachment
      )));
      setUploadError(message);
    }
  }

  async function uploadSelectedFiles(files: File[], availableSlots: number, scope: HermitUploadScope) {
    await scope.forEach(files.slice(0, availableSlots), async file => {
      if (!isSupportedHermitFile(file)) {
        setUploadError(`${file.name} 暂不支持。请选择 PDF、Word、TXT 或 Markdown 文件。`);
        return;
      }

      const localId = createLocalAttachmentId(file);
      setAttachments((current) => [...current, { localId, name: file.name, size: file.size, status: "uploading", file }]);
      await uploadAttachment(file, localId, scope);
    });
  }

  function enqueueUpload(task: (scope: HermitUploadScope) => Promise<void>) {
    const scope = uploadScopeRef.current;
    if (!scope?.active) return;
    uploadQueueLengthRef.current += 1;
    setIsUploadingAttachments(true);

    const run = async () => {
      try {
        scope.assertActive();
        await task(scope);
      } finally {
        uploadQueueLengthRef.current -= 1;
        if (scope.active && uploadQueueLengthRef.current === 0) setIsUploadingAttachments(false);
      }
    };

    const next = uploadQueueRef.current.then(run, run);
    uploadQueueRef.current = next.catch(() => undefined);
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    if (isUploadingAttachments || uploadQueueLengthRef.current > 0) return;
    setUploadError(null);

    const availableSlots = Math.max(0, MAX_ATTACHMENTS_PER_CONVERSATION - attachments.length);
    if (availableSlots === 0) {
      setUploadError("本次对话最多保留 5 个附件。");
      return;
    }

    if (files.length > availableSlots) setUploadError("本次对话最多保留 5 个附件，其他文件未加入。");
    const selectedFiles = Array.from(files);
    enqueueUpload(scope => uploadSelectedFiles(selectedFiles, availableSlots, scope));
  }

  async function handleRemoveAttachment(attachment: HermitAttachment) {
    if (attachment.status === "uploading") canceledUploadIdsRef.current.add(attachment.localId);
    setAttachments((current) => current.filter((item) => item.localId !== attachment.localId));
    if (!attachment.id) return;

    const scope = uploadScopeRef.current;
    if (scope?.active) await deleteServerAttachment(attachment.id, scope);
  }

  async function deleteServerAttachment(id: string, scope: HermitUploadScope) {
    try {
      scope.assertActive();
      await authFetch("/api/hermit/attachments", {
        method: "DELETE",
        signal: scope.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // The local removal still gives the user control; the server can clean up expired attachments.
    }
  }

  function handleRetryAttachment(attachment: HermitAttachment) {
    if (!attachment.file) return;
    setUploadError(null);
    setAttachments((current) => current.map((item) => (
      item.localId === attachment.localId ? { ...item, status: "uploading", error: undefined } : item
    )));
    enqueueUpload(scope => uploadAttachment(attachment.file as File, attachment.localId, scope));
  }

  return { attachments, setAttachments, uploadError, isUploadingAttachments, handleFilesSelected, handleRemoveAttachment, handleRetryAttachment, uploadScopeRef };
}
