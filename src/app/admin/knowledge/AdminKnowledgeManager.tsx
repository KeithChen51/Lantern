"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@iconify/react";
import { LhButton, LhCallout, LhChip, LhIconButton, LhLoadingGlyph } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { PageHeading } from "@/components/ui/PageHeading";
import { resourceLabels } from "@/components/knowledge/ResourceView";
import styles from "./knowledge-manager.module.css";

type ResourceType = keyof typeof resourceLabels;

type KnowledgeFolder = {
  id: string;
  name: string;
  parentId: string | null;
  deleted: boolean;
};

type KnowledgeResource = {
  id: string;
  name: string;
  folderId: string | null;
  type: ResourceType;
  title: string;
  archived: boolean;
  publishedVersionId: string | null;
  latestVersionId: string | null;
  updatedAt: string;
};

type KnowledgeIndex = {
  folders: KnowledgeFolder[];
  resources: KnowledgeResource[];
  protectedIds: string[];
};

type ItemRef = { kind: "folder" | "resource"; id: string };
type View = { kind: "root" | "trash" | "folder"; folderId: string | null };

type PreviewFile = {
  path: string;
  mediaType?: string;
  contentBase64?: string;
};

type PreviewResource = {
  id: string;
  type: ResourceType;
  title: string;
  source?: string;
  summary?: string;
  archived?: boolean;
  publishedVersionId?: string | null;
  version: {
    id: string;
    number: number;
    title: string;
    markdown: string;
    files: PreviewFile[];
    publishedAt?: string | null;
    createdAt?: string;
  };
};

type UploadItem = { file: File; path: string };
type UploadResult = { name: string; path?: string; resourceId?: string; versionId?: string; error?: string; code?: string; skipped?: boolean };
type UploadBatch = { folderId: string | null; type: ResourceType };

const EMPTY_FOLDERS: KnowledgeFolder[] = [];
const EMPTY_RESOURCES: KnowledgeResource[] = [];

type DialogState =
  | { kind: "createFolder"; parentId: string | null }
  | { kind: "rename"; item: ItemRef }
  | { kind: "trash"; items: ItemRef[] }
  | { kind: "move" };

const INTERNAL_DRAG_TYPE = "application/x-lighthouse-knowledge-item";

const typeOptions: Array<{ value: ResourceType; label: string }> = [
  { value: "document", label: resourceLabels.document },
  { value: "notice", label: resourceLabels.notice },
  { value: "case", label: resourceLabels.case },
  { value: "skill", label: resourceLabels.skill },
  { value: "tool", label: resourceLabels.tool },
];

const icon = (value: keyof typeof lighthouseIcons, className?: string) => <Icon icon={lighthouseIcons[value]} aria-hidden="true" className={className} />;

function FolderIcon({ open = false }: { open?: boolean }) {
  return (
    <svg className={styles.folderIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={open ? "M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2H18.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" : "M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2H18.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"} fill="currentColor" opacity={open ? 0.92 : 0.76} />
      <path d="M3.5 9h17" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" opacity=".55" />
    </svg>
  );
}

function FileIcon({ type }: { type: ResourceType }) {
  return (
    <span className={styles.fileIcon} data-resource-type={type} aria-hidden="true">
      {type === "skill" ? "S" : type === "tool" ? "T" : "M"}
    </span>
  );
}

function formatDate(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value.slice(0, 10) : date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as { error?: unknown; message?: unknown };
    if (typeof record.error === "string") return record.error;
    if (record.error && typeof record.error === "object" && typeof (record.error as { message?: unknown }).message === "string") return (record.error as { message: string }).message;
    if (typeof record.message === "string") return record.message;
  }
  return fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(errorMessage(payload, `请求失败：${response.status}`)) as Error & { code?: string; payload?: unknown };
    error.code = payload && typeof payload === "object" && typeof (payload as { code?: unknown }).code === "string" ? (payload as { code: string }).code : undefined;
    error.payload = payload;
    throw error;
  }
  return payload as T;
}

function unwrap<T>(payload: T | { data: T }): T {
  if (payload && typeof payload === "object" && "data" in payload) return (payload as { data: T }).data;
  return payload as T;
}

function itemKey(item: ItemRef) {
  return `${item.kind}:${item.id}`;
}

function decodeFileText(file: PreviewFile) {
  if (!file.contentBase64 || (file.mediaType && !file.mediaType.startsWith("text/"))) return "";
  try {
    const bytes = Uint8Array.from(atob(file.contentBase64), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

async function readDroppedEntries(items: DataTransferItemList) {
  type ReadError = (error?: unknown) => void;
  type Entry = {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
    file?: (callback: (file: File) => void, errorCallback?: ReadError) => void;
    createReader?: () => { readEntries: (callback: (entries: Entry[]) => void, errorCallback?: ReadError) => void };
  };
  type EntryItem = { webkitGetAsEntry?: () => Entry | null };
  const roots: Entry[] = Array.from(items).map((item) => {
    const entryItem = item as unknown as EntryItem;
    return typeof entryItem.webkitGetAsEntry === "function" ? entryItem.webkitGetAsEntry() : null;
  }).filter((entry): entry is Entry => Boolean(entry));

  const readDirectory = (entry: Entry, prefix: string): Promise<UploadItem[]> => new Promise((resolve, reject) => {
    if (!entry.createReader) return reject(new Error(`无法读取目录：${entry.name}`));
    const reader = entry.createReader();
    const all: Entry[] = [];
    const readBatch = () => reader.readEntries((batch) => {
      if (!batch.length) {
        void Promise.all(all.map((child) => readEntry(child, `${prefix}${entry.name}/`))).then((parts) => resolve(parts.flat())).catch(reject);
        return;
      }
      all.push(...batch);
      readBatch();
    }, (error) => reject(error instanceof Error ? error : new Error(`无法读取目录：${entry.name}`)));
    try {
      readBatch();
    } catch (error) {
      reject(error);
    }
  });

  const readEntry = (entry: Entry, prefix: string): Promise<UploadItem[]> => {
    if (entry.isFile && entry.file) {
      return new Promise((resolve, reject) => {
        try {
          entry.file?.((file) => resolve([{ file, path: `${prefix}${file.name}` }]), (error) => reject(error instanceof Error ? error : new Error(`无法读取文件：${entry.name}`)));
        } catch (error) {
          reject(error);
        }
      });
    }
    if (entry.isDirectory) return readDirectory(entry, prefix);
    return Promise.resolve([]);
  };

  return (await Promise.all(roots.map((entry) => readEntry(entry, "")))).flat();
}

export function AdminKnowledgeManager() {
  const [data, setData] = React.useState<KnowledgeIndex | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [view, setView] = React.useState<View>({ kind: "root", folderId: null });
  const [query, setQuery] = React.useState("");
  const [treeCollapsed, setTreeCollapsed] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [dragTarget, setDragTarget] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<DialogState | null>(null);
  const [dialogValue, setDialogValue] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [preview, setPreview] = React.useState<{ loading: boolean; resource: PreviewResource | null; error: string }>({ loading: false, resource: null, error: "" });
  const [uploadItems, setUploadItems] = React.useState<UploadItem[]>([]);
  const [uploadType, setUploadType] = React.useState<ResourceType>("document");
  const [uploadBusy, setUploadBusy] = React.useState(false);
  const [uploadMessage, setUploadMessage] = React.useState("");
  const [uploadError, setUploadError] = React.useState("");
  const [uploadExcluded, setUploadExcluded] = React.useState<string[]>([]);
  const [conflictItems, setConflictItems] = React.useState<UploadItem[]>([]);
  const [conflictResults, setConflictResults] = React.useState<UploadResult[]>([]);
  const [failedResults, setFailedResults] = React.useState<UploadResult[]>([]);
  const [retryContext, setRetryContext] = React.useState<UploadBatch | null>(null);
  const [dropActive, setDropActive] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const directoryInputRef = React.useRef<HTMLInputElement>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await requestJson<KnowledgeIndex | { data: KnowledgeIndex }>("/api/admin/knowledge");
      setData(unwrap(payload));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "知识目录加载失败。请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void loadData(); }, [loadData]);

  const folders = data?.folders ?? EMPTY_FOLDERS;
  const resources = data?.resources ?? EMPTY_RESOURCES;
  const protectedIds = new Set(data?.protectedIds ?? []);
  const activeFolder = view.kind === "folder" ? folders.find((folder) => folder.id === view.folderId) : null;
  const currentFolderName = view.kind === "trash" ? "回收站" : activeFolder?.name ?? "全部文件";
  const isTrash = view.kind === "trash";

  const visibleFolders = React.useMemo(() => {
    const candidates = isTrash ? folders.filter((folder) => folder.deleted) : folders.filter((folder) => !folder.deleted && folder.parentId === view.folderId);
    return candidates.filter((folder) => folder.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  }, [folders, isTrash, query, view.folderId]);

  const visibleResources = React.useMemo(() => {
    const candidates = isTrash ? resources.filter((resource) => resource.archived) : resources.filter((resource) => !resource.archived && resource.folderId === view.folderId);
    return candidates.filter((resource) => `${resource.name} ${resource.title}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  }, [isTrash, query, resources, view.folderId]);

  const selectedItems = React.useMemo(() => {
    return [...selected].map((value) => {
      const [kind, ...rest] = value.split(":");
      return { kind: kind as ItemRef["kind"], id: rest.join(":") };
    });
  }, [selected]);

  const activeBreadcrumb = React.useMemo(() => {
    if (view.kind !== "folder" || !activeFolder) return [];
    const result: KnowledgeFolder[] = [];
    const seen = new Set<string>();
    let current: KnowledgeFolder | undefined = activeFolder;
    while (current && !seen.has(current.id)) {
      result.unshift(current);
      seen.add(current.id);
      current = current.parentId ? folders.find((folder) => folder.id === current?.parentId && !folder.deleted) : undefined;
    }
    return result;
  }, [activeFolder, folders, view.kind]);

  function setCurrentView(nextView: View) {
    setView(nextView);
    setSelected(new Set());
    setQuery("");
  }

  function toggleSelected(item: ItemRef, additive = true) {
    setSelected((previous) => {
      const next = additive ? new Set(previous) : new Set<string>();
      const key = itemKey(item);
      if (additive && previous.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleRowKeyDown(event: React.KeyboardEvent<HTMLDivElement>, item: ItemRef) {
    if ((event.target as HTMLElement).closest("button,input,a")) return;
    if (event.key === " ") {
      event.preventDefault();
      toggleSelected(item);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (item.kind === "folder") {
        if (!isTrash) setCurrentView({ kind: "folder", folderId: item.id });
        return;
      }
      void openPreview(item.id);
    } else if (event.key === "Escape") {
      setSelected(new Set());
    } else if (event.key === "Delete" && !isTrash) {
      event.preventDefault();
      setDialog({ kind: "trash", items: selected.has(itemKey(item)) ? selectedItems : [item] });
    } else if (event.key === "F2" && !isTrash) {
      event.preventDefault();
      const name = item.kind === "folder" ? folders.find(folder => folder.id === item.id)?.name : resources.find(resource => resource.id === item.id)?.name;
      setDialog({ kind: "rename", item });
      setDialogValue(name ?? "");
    }
  }

  function handleRowClick(event: React.MouseEvent<HTMLDivElement>, item: ItemRef) {
    if ((event.target as HTMLElement).closest("button,input,a")) return;
    toggleSelected(item, event.metaKey || event.ctrlKey);
  }

  function startDrag(event: React.DragEvent<HTMLDivElement>, item: ItemRef) {
    const items = selected.has(itemKey(item)) && selectedItems.length > 1 ? selectedItems : [item];
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(INTERNAL_DRAG_TYPE, JSON.stringify(items));
    event.dataTransfer.setData("text/plain", items.map(itemKey).join(","));
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>, target: string) {
    if (event.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragTarget(target);
    }
  }

  async function moveItems(items: ItemRef[], folderId: string | null) {
    if (!items.length || isTrash) return;
    setBusy("move");
    setError("");
    try {
      await requestJson("/api/admin/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "move", items, folderId }) });
      setMessage(`已移动 ${items.length} 项到${folderId ? folders.find((folder) => folder.id === folderId)?.name ?? "目标文件夹" : "全部文件"}。`);
      setSelected(new Set());
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "移动失败，请检查目标文件夹。");
    } finally {
      setBusy("");
      setDragTarget(null);
    }
  }

  async function handleDrop(event: React.DragEvent<HTMLElement>, folderId: string | null) {
    event.preventDefault();
    const raw = event.dataTransfer.getData(INTERNAL_DRAG_TYPE);
    setDragTarget(null);
    if (!raw) return;
    try {
      const items = JSON.parse(raw) as ItemRef[];
      await moveItems(items, folderId);
    } catch {
      setError("无法读取拖拽内容，请重新选择文件或文件夹。");
    }
  }

  async function postAction(body: unknown) {
    return requestJson<unknown>("/api/admin/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  async function submitDialog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const value = dialogValue.trim();
    if ((dialog.kind === "createFolder" || dialog.kind === "rename") && !value) return;
    setBusy("dialog");
    setError("");
    try {
      if (dialog.kind === "createFolder") {
        await postAction({ action: "createFolder", name: value, parentId: dialog.parentId });
        setMessage("文件夹已创建。");
      } else if (dialog.kind === "rename") {
        await postAction({ action: "rename", kind: dialog.item.kind, id: dialog.item.id, name: value });
        setMessage("名称已更新。");
      } else if (dialog.kind === "trash") {
        await postAction({ action: "trash", items: dialog.items });
        setMessage(`已移入回收站 ${dialog.items.length} 项。`);
      } else if (dialog.kind === "move") {
        const folderId = value === "__root__" ? null : value || null;
        await moveItems(selectedItems, folderId);
      }
      setDialog(null);
      setDialogValue("");
      if (dialog.kind !== "move") {
        setSelected(new Set());
        await loadData();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "操作失败，请稍后重试。");
    } finally {
      setBusy("");
    }
  }

  async function restoreItems(items: ItemRef[]) {
    setBusy("restore");
    setError("");
    try {
      await postAction({ action: "restore", items });
      setMessage(`已恢复 ${items.length} 项。`);
      setSelected(new Set());
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "恢复失败，请稍后重试。");
    } finally {
      setBusy("");
    }
  }

  async function openPreview(id: string) {
    const resource = resources.find((item) => item.id === id);
    setPreview({ loading: true, resource: null, error: "" });
    try {
      const suffix = resource?.latestVersionId ? `?version=${encodeURIComponent(resource.latestVersionId)}` : "";
      const payload = await requestJson<PreviewResource | { data: PreviewResource }>(`/api/admin/knowledge/${encodeURIComponent(id)}${suffix}`);
      setPreview({ loading: false, resource: unwrap(payload), error: "" });
    } catch (nextError) {
      setPreview({ loading: false, resource: null, error: nextError instanceof Error ? nextError.message : "预览加载失败。" });
    }
  }

  async function publishPreview() {
    if (!preview.resource) return;
    setBusy("publish");
    setError("");
    try {
      await postAction({ action: "publish", id: preview.resource.id, versionId: preview.resource.version.id });
      setMessage("草稿已发布。");
      await loadData();
      await openPreview(preview.resource.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "发布失败，请稍后重试。");
    } finally {
      setBusy("");
    }
  }

  function setUploadFiles(files: File[], includeRelativePath = false) {
    if (retryContext) {
      setUploadError("请先处理当前批次的失败项，再开始新的上传。");
      return;
    }
    const items = files.map((file) => ({ file, path: includeRelativePath ? ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name) : file.name }));
    setUploadItems((previous) => {
      const byPath = new Map(previous.map((item) => [item.path, item]));
      items.forEach((item) => byPath.set(item.path, item));
      return [...byPath.values()];
    });
    setUploadMessage("");
    setUploadError("");
    setUploadExcluded([]);
  }

  async function handleExternalDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropActive(false);
    if (event.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) return;
    if (isTrash) {
      setUploadError("请先选择一个知识目录，再导入资料。");
      return;
    }
    if (retryContext) {
      setUploadError("请先处理当前批次的失败项，再开始新的上传。");
      return;
    }
    try {
      const droppedEntries = event.dataTransfer.items.length ? await readDroppedEntries(event.dataTransfer.items) : [];
      const dropped = droppedEntries.length ? droppedEntries : Array.from(event.dataTransfer.files).map((file) => ({ file, path: file.name }));
      if (!dropped.length) {
        setUploadError("没有读取到文件，请重新拖入 Markdown 或 Skill 文件夹。");
        return;
      }
      setUploadItems((previous) => {
        const byPath = new Map(previous.map((item) => [item.path, item]));
        dropped.forEach((item) => byPath.set(item.path, item));
        return [...byPath.values()];
      });
      setUploadMessage("");
      setUploadError("");
      setUploadExcluded([]);
    } catch {
      setUploadError("读取拖拽目录失败，请改用“选择 Skill 文件夹”。");
    }
  }

  function resultMatchesItem(result: UploadResult, item: UploadItem) {
    if (result.path) return result.path === item.path;
    const resultName = result.name.trim();
    if (!resultName) return false;
    return resultName === item.path || resultName === item.file.name || fileNameFromPath(resultName) === fileNameFromPath(item.path);
  }

  function itemsForResults(results: UploadResult[], candidates: UploadItem[], batch: UploadBatch) {
    if (!results.length) return [];
    // A Skill upload is one package even when it contains many files. The API
    // reports the package name (often without .zip), so retry the full source
    // package instead of trying to match that name to a child file.
    if (batch.type === "skill") return candidates;
    const matched = candidates.filter((item) => results.some((result) => resultMatchesItem(result, item)));
    return matched.length || candidates.length === 1 ? (matched.length ? matched : candidates) : [];
  }

  async function uploadFiles(items = uploadItems, conflict: "ask" | "overwrite" | "rename" | "skip" = "ask", boundContext?: UploadBatch) {
    if (!items.length) return;
    setUploadBusy(true);
    setUploadError("");
    setUploadMessage("");
    try {
      const batch = boundContext ?? retryContext ?? { folderId: view.kind === "folder" ? view.folderId : null, type: uploadType };
      const formData = new FormData();
      items.forEach((item) => formData.append("files", item.file, fileNameFromPath(item.path)));
      formData.append("paths", JSON.stringify(items.map((item) => item.path)));
      formData.append("folderId", batch.folderId ?? "");
      formData.append("type", batch.type);
      formData.append("conflict", conflict);
      const response = await fetch("/api/admin/knowledge/upload", { method: "POST", body: formData, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { results?: UploadResult[]; excluded?: string[]; error?: unknown };
      const results = payload.results ?? [];
      setUploadExcluded(payload.excluded ?? []);
      const failed = results.filter((result) => result.error || result.code === "conflict");
      if (!response.ok && !results.length) throw new Error(errorMessage(payload, `上传失败：${response.status}`));
      if (!results.length) throw new Error("上传接口没有返回逐项处理结果，未清理待上传文件。");
      const currentPaths = new Set(items.map((item) => item.path));
      const previousFailed = failedResults;
      const otherFailed = batch.type === "skill" ? [] : previousFailed.filter((result) => !items.some((item) => resultMatchesItem(result, item)));
      const otherItems = uploadItems.filter((item) => !currentPaths.has(item.path));
      if (failed.length > 0) {
        const conflictFailures = failed.filter((result) => result.code === "conflict");
        const currentRetryItems = itemsForResults(failed, items, batch);
        const retryItems = [...new Map([...otherItems, ...currentRetryItems].map((item) => [item.path, item])).values()];
        const conflictRetryItems = itemsForResults(conflictFailures, items, batch);
        const allFailed = [...otherFailed, ...failed];
        setFailedResults(allFailed);
        setRetryContext(retryItems.length > 0 ? (retryContext ?? batch) : null);
        setUploadItems((previous) => previous.filter((item) => retryItems.some((retryItem) => retryItem.path === item.path)));
        setConflictResults(conflictFailures);
        setConflictItems(conflict === "ask" ? conflictRetryItems : []);
        const succeeded = results.filter((result) => !result.error && !result.skipped).length;
        const unresolved = retryItems.length > 0 ? `已保留 ${retryItems.length} 个失败文件供重试` : "失败文件无法安全匹配，请重新选择";
        setUploadMessage(`${succeeded} 项已生成草稿，${allFailed.length} 项未完成；${unresolved}。成功文件不会重复提交。`);
        await loadData();
      } else {
        const succeeded = results.filter((result) => !result.error && !result.skipped).length;
        const skipped = results.filter((result) => result.skipped).length;
        const excluded = payload.excluded?.length ? `，${payload.excluded.length} 个依赖/缓存文件已排除` : "";
        const remainingItems = uploadItems.filter((item) => !currentPaths.has(item.path));
        const hasRemainingFailures = remainingItems.length > 0 || otherFailed.length > 0;
        setUploadMessage(`上传处理完成：${succeeded} 项生成草稿${skipped ? `，${skipped} 项已跳过` : ""}${excluded}${hasRemainingFailures ? `；仍有 ${remainingItems.length} 项待处理` : ""}。请打开预览确认后发布。`);
        setUploadItems(remainingItems);
        setConflictItems([]);
        setConflictResults([]);
        setFailedResults(otherFailed);
        setRetryContext(hasRemainingFailures ? (retryContext ?? batch) : null);
        await loadData();
      }
    } catch (nextError) {
      setUploadError(nextError instanceof Error ? nextError.message : "上传失败，请稍后重试。");
    } finally {
      setUploadBusy(false);
    }
  }

  function clearUploadQueue() {
    setUploadItems([]);
    setConflictItems([]);
    setConflictResults([]);
    setFailedResults([]);
    setRetryContext(null);
  }

  function removeUploadItem(path: string) {
    setUploadItems((previous) => {
      const next = previous.filter((item) => item.path !== path);
      if (!next.length) {
        setConflictItems([]);
        setConflictResults([]);
        setFailedResults([]);
        setRetryContext(null);
      }
      return next;
    });
  }

  const directoryInputProps = { webkitdirectory: "", directory: "" } as unknown as React.InputHTMLAttributes<HTMLInputElement>;

  function renderTree(parentId: string | null, depth = 0): React.ReactNode {
    return folders.filter((folder) => !folder.deleted && folder.parentId === parentId).map((folder) => {
      const active = view.kind === "folder" && view.folderId === folder.id;
      const target = `folder:${folder.id}`;
      return (
        <li key={folder.id}>
          <button
            type="button"
            className={styles.treeItem}
            data-active={active ? "true" : undefined}
            data-drop-target={dragTarget === target ? "true" : undefined}
            style={{ paddingLeft: `${0.75 + depth * 1.05}rem` }}
            onClick={() => setCurrentView({ kind: "folder", folderId: folder.id })}
            onDragOver={(event) => handleDragOver(event, target)}
            onDragLeave={() => setDragTarget(null)}
            onDrop={(event) => void handleDrop(event, folder.id)}
            aria-current={active ? "page" : undefined}
          >
            <FolderIcon open={active} />
            <span>{folder.name}</span>
            <span className={styles.treeCount}>{resources.filter((resource) => !resource.archived && resource.folderId === folder.id).length || ""}</span>
          </button>
          <ul className={styles.treeChildren}>{renderTree(folder.id, depth + 1)}</ul>
        </li>
      );
    });
  }

  function renderRow(item: KnowledgeFolder | KnowledgeResource, kind: ItemRef["kind"]) {
    const ref = { kind, id: item.id } as ItemRef;
    const selectedRow = selected.has(itemKey(ref));
    const folder = kind === "folder" ? item as KnowledgeFolder : null;
    const resource = kind === "resource" ? item as KnowledgeResource : null;
    const protectedItem = resource ? protectedIds.has(resource.id) : false;
    const target = `row:${kind}:${item.id}`;
    return (
      <div
        key={item.id}
        className={styles.fileRow}
        data-selected={selectedRow ? "true" : undefined}
        data-drop-target={dragTarget === target ? "true" : undefined}
        role="row"
        tabIndex={0}
        aria-selected={selectedRow}
        draggable={!isTrash}
        onClick={(event) => handleRowClick(event, ref)}
        onKeyDown={(event) => handleRowKeyDown(event, ref)}
        onDoubleClick={() => {
          if (folder && !isTrash) setCurrentView({ kind: "folder", folderId: folder.id });
          else if (!folder) void openPreview(resource?.id ?? "");
        }}
        onDragStart={(event) => startDrag(event, ref)}
        onDragEnd={() => setDragTarget(null)}
        onDragOver={folder ? (event) => handleDragOver(event, target) : undefined}
        onDragLeave={folder ? () => setDragTarget(null) : undefined}
        onDrop={folder ? (event) => void handleDrop(event, folder.id) : undefined}
      >
        <span className={styles.selectionCell}>
          <input
            type="checkbox"
            checked={selectedRow}
            onChange={() => toggleSelected(ref)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`选择${folder?.name ?? resource?.name ?? "项目"}`}
          />
        </span>
        <span className={styles.nameCell}>
          {folder ? <FolderIcon open={false} /> : <FileIcon type={resource?.type ?? "document"} />}
          <span className={styles.nameCopy}>
            <strong>{folder?.name ?? resource?.name ?? resource?.title}</strong>
            {resource && resource.name !== resource.title && <span>{resource.title}</span>}
          </span>
        </span>
        <span className={styles.typeCell}>{folder ? "文件夹" : resourceLabels[resource?.type ?? "document"]}</span>
        <span className={styles.statusCell}>
          {folder ? <LhChip tone="neutral">{isTrash ? "已删除" : "目录"}</LhChip> : resource?.archived ? <LhChip tone="neutral">已删除</LhChip> : resource?.publishedVersionId && resource.latestVersionId && resource.latestVersionId !== resource.publishedVersionId ? <LhChip tone="warning">有未发布更新</LhChip> : resource?.publishedVersionId ? <LhChip tone="success">已发布</LhChip> : <LhChip tone="warning">草稿</LhChip>}
        </span>
        <span className={styles.updatedCell}>{folder ? "—" : formatDate(resource?.updatedAt)}</span>
        <span className={styles.rowActions}>
          {folder && !isTrash ? (
            <LhIconButton label="重命名文件夹" size="sm" icon={icon("edit")} onClick={(event) => { event.stopPropagation(); setDialog({ kind: "rename", item: ref }); setDialogValue(folder.name); }} />
          ) : !folder ? (
            <LhIconButton label="预览资源" size="sm" icon={icon("document")} onClick={(event) => { event.stopPropagation(); void openPreview(resource?.id ?? ""); }} />
          ) : null}
          {!isTrash && (
            <LhIconButton
              label={protectedItem ? "系统资源不可删除" : folder ? "删除文件夹" : "删除资源"}
              size="sm"
              variant="ghost"
              disabled={protectedItem}
              icon={icon(protectedItem ? "admin" : "delete")}
              onClick={(event) => { event.stopPropagation(); if (!protectedItem) { setDialog({ kind: "trash", items: [ref] }); setDialogValue(""); } }}
            />
          )}
          {isTrash && <LhIconButton label="恢复" size="sm" variant="ghost" icon={icon("reject")} onClick={(event) => { event.stopPropagation(); void restoreItems([ref]); }} />}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.managerPage}>
      <PageHeading
        title="知识文件管理"
        description="像整理桌面文件夹一样维护灯塔知识：拖拽归档，批量导入，预览草稿后再发布。"
      >
        <LhButton type="button" variant="secondary" icon={icon("admin")} onClick={() => window.location.assign("/admin")}>返回后台</LhButton>
      </PageHeading>

      {(error || message) && <LhCallout tone={error ? "danger" : "success"} icon={icon(error ? "warning" : "status")} className={styles.topNotice}>{error || message}</LhCallout>}

      <section className={styles.workspace} aria-label="知识文件工作区">
        <aside className={`${styles.treePanel} ${treeCollapsed ? styles.treePanelCollapsed : ""}`} aria-label="知识目录">
          <div className={styles.treeHeader}>
            <div><span className={styles.panelLabel}>目录</span><strong>灯塔知识</strong></div>
            <button type="button" className={styles.mobileTreeToggle} aria-expanded={!treeCollapsed} onClick={() => setTreeCollapsed((value) => !value)}>{treeCollapsed ? "展开" : "收起"}</button>
          </div>
          <div className={styles.treeBody}>
            <button type="button" className={styles.treeItem} data-active={view.kind === "root" ? "true" : undefined} data-drop-target={dragTarget === "root" ? "true" : undefined} onClick={() => setCurrentView({ kind: "root", folderId: null })} onDragOver={(event) => handleDragOver(event, "root")} onDragLeave={() => setDragTarget(null)} onDrop={(event) => void handleDrop(event, null)} aria-current={view.kind === "root" ? "page" : undefined}>
              <FolderIcon open={view.kind === "root"} /><span>全部文件</span><span className={styles.treeCount}>{resources.filter((resource) => !resource.archived).length || ""}</span>
            </button>
            <ul className={styles.treeChildren}>{renderTree(null)}</ul>
            <div className={styles.treeDivider} />
            <button type="button" className={styles.treeItem} data-active={isTrash ? "true" : undefined} data-drop-target={dragTarget === "trash" ? "true" : undefined} onDragOver={(event) => handleDragOver(event, "trash")} onDragLeave={() => setDragTarget(null)} onDrop={(event) => {
              event.preventDefault();
              setDragTarget(null);
              const raw = event.dataTransfer.getData(INTERNAL_DRAG_TYPE);
              if (raw) { try { setDialog({ kind: "trash", items: JSON.parse(raw) as ItemRef[] }); } catch { setError("无法读取拖拽内容。"); } }
            }} onClick={() => setCurrentView({ kind: "trash", folderId: null })} aria-current={isTrash ? "page" : undefined}>
              {icon("delete", styles.treeGlyph)}<span>回收站</span><span className={styles.treeCount}>{resources.filter((resource) => resource.archived).length || ""}</span>
            </button>
          </div>
          <div className={styles.treeFooter}><span>拖拽到目录即可移动</span></div>
        </aside>

        <div className={styles.fileArea}>
          <div className={styles.fileToolbar}>
            <div className={styles.breadcrumbs} aria-label="当前位置">
              <button type="button" onClick={() => setCurrentView({ kind: "root", folderId: null })}>全部文件</button>
              {view.kind === "trash" ? <><span aria-hidden="true">/</span><strong>回收站</strong></> : activeBreadcrumb.map((folder) => <React.Fragment key={folder.id}><span aria-hidden="true">/</span><button type="button" onClick={() => setCurrentView({ kind: "folder", folderId: folder.id })}>{folder.name}</button></React.Fragment>)}
            </div>
            <div className={styles.toolbarActions}>
              <LhButton type="button" size="sm" variant="secondary" icon={icon("add")} onClick={() => { setDialog({ kind: "createFolder", parentId: view.kind === "folder" ? view.folderId : null }); setDialogValue(""); }}>新建文件夹</LhButton>
              {selectedItems.length > 0 && !isTrash && <>
                <LhButton type="button" size="sm" variant="quiet" icon={icon("pin")} onClick={() => { setDialog({ kind: "move" }); setDialogValue("__root__"); }}>移动到…</LhButton>
                <LhButton type="button" size="sm" variant="danger" icon={icon("delete")} onClick={() => setDialog({ kind: "trash", items: selectedItems })}>删除 {selectedItems.length} 项</LhButton>
              </>}
              {selectedItems.length > 0 && isTrash && <LhButton type="button" size="sm" variant="signal" icon={icon("reject")} onClick={() => void restoreItems(selectedItems)}>恢复 {selectedItems.length} 项</LhButton>}
            </div>
          </div>

          <div className={styles.searchLine}>
            <label className={styles.searchBox}><span className={styles.visuallyHidden}>搜索当前目录</span>{icon("search")}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前目录中的文件和文件夹" /></label>
            <span className={styles.itemCount}>{isTrash ? "回收站" : currentFolderName} · {visibleFolders.length + visibleResources.length} 项</span>
          </div>

          <div className={styles.uploadPanel}>
            <div className={styles.uploadHeading}><div><strong>导入知识资料</strong><p>Markdown 可批量导入；Skill 可选择文件夹或 ZIP，并保留相对路径。</p></div><label className={styles.typeSelect}>资源类型<select disabled={isTrash || Boolean(retryContext)} value={uploadType} onChange={(event) => setUploadType(event.target.value as ResourceType)}>{typeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label></div>
            <div className={`${styles.dropZone} ${dropActive ? styles.dropZoneActive : ""} ${isTrash || retryContext ? styles.dropZoneDisabled : ""}`} onDragEnter={(event) => { if (!isTrash && !retryContext && !event.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) setDropActive(true); }} onDragOver={(event) => { if (!isTrash && !retryContext && !event.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false); }} onDrop={(event) => void handleExternalDrop(event)}>
              {icon("publish", styles.uploadGlyph)}<div><strong>拖入文件或文件夹</strong><span>外部文件会进入当前目录；拖动已有条目请放到左侧目录完成移动。</span></div>
              <div className={styles.uploadPickers}><LhButton type="button" size="sm" variant="secondary" disabled={isTrash || Boolean(retryContext)} onClick={() => fileInputRef.current?.click()}>选择 Markdown / ZIP</LhButton><LhButton type="button" size="sm" variant="ghost" disabled={isTrash || Boolean(retryContext)} onClick={() => directoryInputRef.current?.click()}>选择 Skill 文件夹</LhButton></div>
              <input ref={fileInputRef} className={styles.hiddenInput} type="file" multiple accept=".md,.markdown,.zip" disabled={isTrash || Boolean(retryContext)} onChange={(event) => { setUploadFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
              <input ref={directoryInputRef} className={styles.hiddenInput} type="file" multiple accept=".md,.markdown,*/*" disabled={isTrash || Boolean(retryContext)} {...directoryInputProps} onChange={(event) => { setUploadFiles(Array.from(event.target.files ?? []), true); event.currentTarget.value = ""; }} />
            </div>
            {uploadItems.length > 0 && <div className={styles.uploadQueue}><div className={styles.queueHeader}><strong>待导入 {uploadItems.length} 项</strong><button type="button" onClick={clearUploadQueue}>清空</button></div><ul>{uploadItems.map((item) => <li key={item.path}><span>{item.path}</span><button type="button" aria-label={`移除 ${item.path}`} onClick={() => removeUploadItem(item.path)}>{icon("close")}</button></li>)}</ul><div className={styles.queueActions}><span>目标：{retryContext ? `${retryContext.folderId ? folders.find((folder) => folder.id === retryContext.folderId)?.name ?? "原目标文件夹" : "全部文件"} · ${typeOptions.find((option) => option.value === retryContext.type)?.label ?? retryContext.type}` : isTrash ? "请先选择知识目录" : currentFolderName}</span><LhButton type="button" size="sm" variant="primary" disabled={uploadBusy || isTrash} icon={uploadBusy ? <LhLoadingGlyph label="正在上传" /> : icon("publish")} onClick={() => void uploadFiles()}>{uploadBusy ? "正在导入" : "上传并生成草稿"}</LhButton></div></div>}
            {(uploadMessage || uploadError) && <div className={`${styles.uploadResult} ${uploadError ? styles.uploadResultError : ""}`} role={uploadError ? "alert" : "status"}>{uploadError || uploadMessage}{!uploadError && uploadExcluded.length > 0 && <details><summary>查看已排除文件（{uploadExcluded.length}）</summary><ul>{uploadExcluded.map((path) => <li key={path}>{path}</li>)}</ul></details>}{!uploadError && failedResults.length > 0 && <details><summary>查看未完成项目（{failedResults.length}）</summary><ul>{failedResults.map((result, index) => <li key={`${result.name}-${index}`}>{result.name}{result.error ? `：${result.error}` : result.code ? `：${result.code}` : ""}</li>)}</ul></details>}</div>}
            {conflictItems.length > 0 && <div className={styles.conflictPanel}><div><strong>发现同名资料</strong><p>{conflictResults.map((result) => result.name).join("、")}</p><p>将按原目标：{retryContext?.folderId ? folders.find((folder) => folder.id === retryContext.folderId)?.name ?? "原目标文件夹" : "全部文件"} · {retryContext ? typeOptions.find((option) => option.value === retryContext.type)?.label ?? retryContext.type : uploadType} 处理。</p></div><div className={styles.conflictActions}><LhButton type="button" size="sm" variant="secondary" disabled={uploadBusy} onClick={() => void uploadFiles(conflictItems, "overwrite")}>覆盖</LhButton><LhButton type="button" size="sm" variant="signal" disabled={uploadBusy} onClick={() => void uploadFiles(conflictItems, "rename")}>重命名导入</LhButton><LhButton type="button" size="sm" variant="quiet" disabled={uploadBusy} onClick={() => { setUploadItems((previous) => previous.filter((item) => !conflictItems.some((conflictItem) => conflictItem.path === item.path))); setConflictItems([]); setConflictResults([]); setFailedResults((previous) => previous.filter((result) => result.code !== "conflict")); setRetryContext((previous) => failedResults.some((result) => result.code !== "conflict") ? previous : null); setUploadMessage("已跳过同名资料。"); }}>跳过</LhButton></div></div>}
          </div>

          {loading && <div className={styles.loadingState}><LhLoadingGlyph label="正在加载知识目录" />正在加载知识目录…</div>}
          {!loading && error && !data && <div className={styles.emptyState}><strong>目录暂时不可用</strong><p>{error}</p><LhButton type="button" variant="secondary" onClick={() => void loadData()} icon={icon("refresh")}>重新加载</LhButton></div>}
          {!loading && data && <div className={styles.fileTable} role="table" aria-label={`${currentFolderName}中的文件`}>
            <div className={styles.tableHeader} role="row"><span aria-hidden="true" /><span>名称</span><span>类型</span><span>状态</span><span>更新时间</span><span className={styles.visuallyHidden}>操作</span></div>
            {visibleFolders.map((folder) => renderRow(folder, "folder"))}
            {visibleResources.map((resource) => renderRow(resource, "resource"))}
            {visibleFolders.length === 0 && visibleResources.length === 0 && <div className={styles.emptyState}><span className={styles.emptyIcon}>{icon(isTrash ? "delete" : "document")}</span><strong>{query ? "没有匹配的内容" : isTrash ? "回收站是空的" : "这个目录还没有内容"}</strong><p>{query ? "换一个关键词，或清空搜索条件。" : isTrash ? "删除的资源会在这里保留，确认后可以恢复。" : "可以拖入 Markdown、Skill 文件夹或 ZIP 开始建立知识目录。"}</p>{!query && !isTrash && <LhButton type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} icon={icon("add")}>选择资料</LhButton>}</div>}
          </div>}
        </div>
      </section>

      {dialog && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="knowledge-dialog-title"><form onSubmit={(event) => void submitDialog(event)}><div className={styles.modalHeader}><h2 id="knowledge-dialog-title">{dialog.kind === "createFolder" ? "新建文件夹" : dialog.kind === "rename" ? "重命名" : dialog.kind === "move" ? "移动到" : "确认移入回收站"}</h2><button type="button" className={styles.modalClose} onClick={() => setDialog(null)} aria-label="关闭">{icon("close")}</button></div>{dialog.kind === "trash" ? <p className={styles.modalCopy}>将 {dialog.items.length} 项移入回收站？删除后仍可在回收站恢复。</p> : dialog.kind === "move" ? <label className={styles.modalField}>目标文件夹<select value={dialogValue} onChange={(event) => setDialogValue(event.target.value)}><option value="__root__">全部文件（根目录）</option>{folders.filter((folder) => !folder.deleted && !selected.has(itemKey({ kind: "folder", id: folder.id }))).map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label> : <label className={styles.modalField}>名称<input autoFocus value={dialogValue} onChange={(event) => setDialogValue(event.target.value)} placeholder="输入名称" /></label>}<div className={styles.modalActions}><LhButton type="button" size="sm" variant="quiet" onClick={() => setDialog(null)}>取消</LhButton><LhButton type="submit" size="sm" variant={dialog.kind === "trash" ? "danger" : "primary"} disabled={busy === "dialog"} icon={busy === "dialog" ? <LhLoadingGlyph label="处理中" /> : undefined}>{dialog.kind === "trash" ? "移入回收站" : dialog.kind === "move" ? "移动" : "保存"}</LhButton></div></form></div></div>}

      {(preview.loading || preview.resource || preview.error) && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview({ loading: false, resource: null, error: "" }); }}><div className={`${styles.previewModal} ${preview.loading ? styles.previewLoading : ""}`} role="dialog" aria-modal="true" aria-labelledby="knowledge-preview-title"><div className={styles.modalHeader}><div><span className={styles.panelLabel}>草稿预览</span><h2 id="knowledge-preview-title">{preview.resource?.title ?? "正在加载"}</h2></div><button type="button" className={styles.modalClose} onClick={() => setPreview({ loading: false, resource: null, error: "" })} aria-label="关闭">{icon("close")}</button></div>{preview.loading && <div className={styles.loadingState}><LhLoadingGlyph label="正在加载预览" />正在加载资源…</div>}{preview.error && <LhCallout tone="danger" icon={icon("warning")}>{preview.error}</LhCallout>}{preview.resource && <><div className={styles.previewMeta}><LhChip tone="primary">{resourceLabels[preview.resource.type]}</LhChip><span>版本 {preview.resource.version.number}</span><span>{preview.resource.publishedVersionId && preview.resource.version.id !== preview.resource.publishedVersionId ? "有未发布更新" : preview.resource.version.publishedAt ? `发布于 ${formatDate(preview.resource.version.publishedAt)}` : "未发布草稿"}</span><span>{preview.resource.source ?? "用户导入"}</span></div><div className={styles.previewBody}><ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.resource.version.markdown}</ReactMarkdown></div>{preview.resource.version.files.length > 0 && <section className={styles.previewFiles}><h3>配套文件</h3><ul>{preview.resource.version.files.map((file) => { const text = decodeFileText(file); const published = Boolean(preview.resource?.version.publishedAt); return <li key={file.path}><div><strong>{file.path}</strong><span>{file.mediaType ?? "文件"}</span></div>{text && <details><summary>预览文本</summary><pre>{text}</pre></details>}{published ? <a href={`/api/resources/${encodeURIComponent(preview.resource!.id)}/files?version=${encodeURIComponent(preview.resource!.version.id)}&path=${encodeURIComponent(file.path)}`} download>下载</a> : <span className={styles.previewOnly}>草稿仅预览</span>}</li>; })}</ul></section>}<div className={styles.previewActions}><div className={styles.previewActionCopy}><a className={styles.packageDownload} href={`/api/admin/knowledge/${encodeURIComponent(preview.resource.id)}/download?version=${encodeURIComponent(preview.resource.version.id)}`} download>下载整包</a><span>{preview.resource.publishedVersionId && preview.resource.version.id !== preview.resource.publishedVersionId ? "发布前请检查未发布更新、正文和附件路径。" : preview.resource.version.publishedAt ? "当前版本已发布" : "发布前请检查正文、资源类型和附件路径。"}</span></div><LhButton type="button" variant="primary" disabled={Boolean(preview.resource.version.publishedAt) || busy === "publish"} onClick={() => void publishPreview()} icon={busy === "publish" ? <LhLoadingGlyph label="正在发布" /> : icon("publish")}>{preview.resource.version.publishedAt ? "已发布" : "手动发布"}</LhButton></div></>}</div></div>}
    </div>
  );
}
