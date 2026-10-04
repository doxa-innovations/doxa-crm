"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  Edit,
  FileText,
  LinkIcon,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useRef, useState } from "react";

import { HealthPill } from "@/components/projects/HealthPill";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { cn, formatDate } from "@/lib/utils";
import type { Milestone, MilestoneCreate, MilestoneUpdate, Project, ProjectDocument } from "@/types/api";

interface ProjectDetailClientProps {
  projectId: string;
}

const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;

function compareDueDate(left: Milestone, right: Milestone): number {
  return new Date(left.due_date).getTime() - new Date(right.due_date).getTime();
}

function isOverdue(milestone: Milestone): boolean {
  if (milestone.completed_at) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(milestone.due_date);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate < today;
}

function fileSizeLabel(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function portalBaseUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BETTER_AUTH_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return appUrl.replace(/\/+$/, "");
}

function maskToken(token: string): string {
  if (token.length <= 12) {
    return "********";
  }

  return `${token.slice(0, 8)}****${token.slice(-4)}`;
}

function milestoneStats(milestones: Milestone[]) {
  const total = milestones.length;
  const complete = milestones.filter((milestone) => Boolean(milestone.completed_at)).length;
  const percent = total > 0 ? Math.round((complete / total) * 100) : 0;

  return { complete, percent, total };
}

export function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { canWriteProjects } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmArchiveProject, setConfirmArchiveProject] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState("");
  const [milestoneError, setMilestoneError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [milestoneToDelete, setMilestoneToDelete] = useState<Milestone | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<ProjectDocument | null>(null);

  const projectQuery = useQuery({
    queryFn: () => api.get<Project>(`/projects/${projectId}`),
    queryKey: ["projects", "detail", projectId],
  });
  const milestonesQuery = useQuery({
    queryFn: () => api.get<Milestone[]>(`/projects/${projectId}/milestones`),
    queryKey: ["projects", "milestones", projectId],
  });
  const documentsQuery = useQuery({
    queryFn: () => api.get<ProjectDocument[]>(`/projects/${projectId}/documents`),
    queryKey: ["projects", "documents", projectId],
  });

  const project = projectQuery.data;
  const milestones = useMemo(
    () => [...(milestonesQuery.data ?? project?.milestones ?? [])].sort(compareDueDate),
    [milestonesQuery.data, project?.milestones],
  );
  const documents = documentsQuery.data ?? project?.documents ?? [];
  const stats = milestoneStats(milestones);
  const portalLink = project ? `${portalBaseUrl()}/portal/${project.portal_token}` : "";

  const addMilestone = useMutation({
    mutationFn: (payload: MilestoneCreate) => api.post<Milestone, MilestoneCreate>(`/projects/${projectId}/milestones`, payload),
    onSuccess: () => {
      setNewMilestoneTitle("");
      setNewMilestoneDueDate("");
      setMilestoneError("");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "detail", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "milestones", projectId] });
    },
  });

  const toggleMilestone = useMutation({
    mutationFn: ({ completedAt, milestoneId }: { completedAt: string | null; milestoneId: string }) =>
      api.patch<Milestone, MilestoneUpdate>(`/projects/${projectId}/milestones/${milestoneId}`, { completed_at: completedAt }),
    onMutate: async ({ completedAt, milestoneId }) => {
      await queryClient.cancelQueries({ queryKey: ["projects", "milestones", projectId] });
      const previous = queryClient.getQueryData<Milestone[]>(["projects", "milestones", projectId]);
      queryClient.setQueryData<Milestone[]>(["projects", "milestones", projectId], (current) =>
        (current ?? milestones).map((milestone) =>
          milestone.id === milestoneId ? { ...milestone, completed_at: completedAt } : milestone,
        ),
      );

      return { previous };
    },
    onError: (_error, _milestoneId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["projects", "milestones", projectId], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "detail", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "milestones", projectId] });
    },
  });

  const deleteMilestone = useMutation({
    mutationFn: (milestoneId: string) => api.delete<void>(`/projects/${projectId}/milestones/${milestoneId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "detail", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "milestones", projectId] });
    },
  });

  const uploadDocument = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.postForm<ProjectDocument>(`/projects/${projectId}/documents`, formData);
    },
    onSuccess: () => {
      setUploadError("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      void queryClient.invalidateQueries({ queryKey: ["projects", "detail", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "documents", projectId] });
    },
  });

  const deleteDocument = useMutation({
    mutationFn: (documentId: string) => api.delete<void>(`/projects/${projectId}/documents/${documentId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "detail", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "documents", projectId] });
    },
  });
  const archiveProject = useMutation({
    mutationFn: () => api.post<void>(`/projects/${projectId}/archive`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      router.push("/projects");
    },
  });

  function handleAddMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newMilestoneTitle.trim() || !newMilestoneDueDate) {
      setMilestoneError("Add a title and due date.");
      return;
    }

    addMilestone.mutate({
      due_date: newMilestoneDueDate,
      title: newMilestoneTitle.trim(),
    });
  }

  function handleToggleMilestone(milestone: Milestone) {
    if (toggleMilestone.isPending) {
      return;
    }

    toggleMilestone.mutate({
      completedAt: milestone.completed_at ? null : new Date().toISOString(),
      milestoneId: milestone.id,
    });
  }

  function handleDeleteMilestone(milestone: Milestone) {
    setMilestoneToDelete(milestone);
  }

  function handleDocumentChange(file: File | undefined) {
    if (!file) {
      return;
    }

    if (file.size > MAX_DOCUMENT_SIZE) {
      setUploadError("Document must be 20MB or smaller.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setUploadError("");
    uploadDocument.mutate(file);
  }

  function handleDeleteDocument(document: ProjectDocument) {
    setDocumentToDelete(document);
  }

  async function copyText(value: string, target: "portal" | "token") {
    await navigator.clipboard.writeText(value);
    if (target === "portal") {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      return;
    }

    setTokenCopied(true);
    window.setTimeout(() => setTokenCopied(false), 1600);
  }

  if (projectQuery.isLoading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-36 rounded-xl" />
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <Skeleton className="h-[560px] rounded-xl" />
          <Skeleton className="h-[560px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (projectQuery.isError || !project) {
    return <div className="rounded-xl border border-red-100 bg-white p-5 text-sm text-red-700 shadow-sm">Could not load project.</div>;
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-normal text-[#0F2444]">{project.name}</h1>
              <HealthPill health={project.health} size="lg" />
            </div>
            <Link className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-[#2563EB] hover:underline" href={`/accounts/${project.account_id}`}>
              <LinkIcon className="h-4 w-4" aria-hidden="true" />
              {project.account_name ?? "Account"}
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void copyText(portalLink, "portal")} type="button" variant="outline">
              <Copy className="h-4 w-4" aria-hidden="true" />
              {copied ? "Copied" : "Copy Portal Link"}
            </Button>
            {canWriteProjects ? (
              <>
                <Button onClick={() => setEditOpen(true)} type="button">
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  Edit
                </Button>
                <Button onClick={() => setConfirmArchiveProject(true)} type="button" variant="outline">
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  Archive Project
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[#0F2444]">
              {stats.complete} of {stats.total} complete
            </span>
            <span className="text-[#64748B]">{stats.percent}% milestone progress</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${stats.percent}%` }} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#0F2444]">Milestones</h2>
              <p className="mt-1 text-sm text-[#64748B]">Delivery checkpoints sorted by due date.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {milestonesQuery.isLoading ? (
              <>
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
              </>
            ) : null}

            {!milestonesQuery.isLoading && milestones.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-[#64748B]">No milestones yet.</div>
            ) : null}

            {milestones.map((milestone) => {
              const overdue = isOverdue(milestone);
              const completed = Boolean(milestone.completed_at);

              return (
                <div className="flex items-start gap-4 rounded-lg border border-slate-100 bg-white p-4 shadow-[0_1px_0_rgba(15,36,68,0.03)]" key={milestone.id}>
                  <button
                    aria-label={completed ? "Mark milestone incomplete" : "Complete milestone"}
                    className={cn(
                      "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border transition",
                      completed
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-300 bg-white text-transparent hover:border-[#2563EB] hover:text-[#2563EB]",
                    )}
                    disabled={!canWriteProjects || toggleMilestone.isPending}
                    onClick={() => handleToggleMilestone(milestone)}
                    title={completed ? "Mark incomplete" : "Mark complete"}
                    type="button"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className={cn("font-semibold text-[#0F2444]", completed && "text-[#64748B] line-through")}>{milestone.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <span className={cn("inline-flex items-center gap-1.5", overdue ? "font-medium text-red-600" : "text-[#64748B]")}>
                        {overdue ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CalendarDays className="h-4 w-4" aria-hidden="true" />}
                        Due {formatDate(milestone.due_date)}
                      </span>
                      {completed && milestone.completed_at ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Completed {formatDate(milestone.completed_at)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {canWriteProjects ? (
                    <Button
                      aria-label="Delete milestone"
                      disabled={deleteMilestone.isPending}
                      onClick={() => handleDeleteMilestone(milestone)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {canWriteProjects ? (
            <form className="mt-5 rounded-lg border border-slate-100 bg-slate-50 p-4" onSubmit={handleAddMilestone}>
              <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                <Input
                  disabled={addMilestone.isPending}
                  onChange={(event) => setNewMilestoneTitle(event.target.value)}
                  placeholder="Milestone title"
                  value={newMilestoneTitle}
                />
                <Input disabled={addMilestone.isPending} onChange={(event) => setNewMilestoneDueDate(event.target.value)} type="date" value={newMilestoneDueDate} />
                <Button disabled={addMilestone.isPending} type="submit">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Milestone
                </Button>
              </div>
              {milestoneError ? <p className="mt-2 text-xs text-red-600">{milestoneError}</p> : null}
              {addMilestone.isError ? <p className="mt-2 text-xs text-red-600">Could not add milestone.</p> : null}
            </form>
          ) : null}
        </section>

        <aside className="grid gap-4 content-start">
          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-[#0F2444]">Documents</h2>
              {canWriteProjects ? (
                <>
                  <Button disabled={uploadDocument.isPending} onClick={() => fileInputRef.current?.click()} size="sm" type="button" variant="outline">
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Upload
                  </Button>
                  <input
                    className="hidden"
                    onChange={(event) => handleDocumentChange(event.target.files?.[0])}
                    ref={fileInputRef}
                    type="file"
                  />
                </>
              ) : null}
            </div>

            {uploadDocument.isPending ? (
              <div className="mt-4 rounded-lg bg-[#EFF6FF] p-3 text-sm text-[#2563EB]">
                Uploading document...
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-blue-100">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-[#2563EB]" />
                </div>
              </div>
            ) : null}
            {uploadError ? <p className="mt-3 text-xs text-red-600">{uploadError}</p> : null}
            {uploadDocument.isError ? <p className="mt-3 text-xs text-red-600">Could not upload document.</p> : null}

            <div className="mt-4 grid gap-3">
              {documentsQuery.isLoading ? (
                <>
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                </>
              ) : null}
              {!documentsQuery.isLoading && documents.length === 0 ? <p className="text-sm text-[#64748B]">No documents uploaded yet.</p> : null}
              {documents.map((document) => (
                <div className="rounded-lg border border-slate-100 p-3" key={document.id}>
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                      <FileText className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0F2444]">{document.filename}</p>
                      <p className="mt-1 text-xs text-[#64748B]">
                        {fileSizeLabel(document.file_size)} - {formatDate(document.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <a
                      className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50"
                      href={document.download_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Download
                    </a>
                    {canWriteProjects ? (
                      <Button disabled={deleteDocument.isPending} onClick={() => handleDeleteDocument(document)} size="sm" type="button" variant="ghost">
                        <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#0F2444]">Project Info</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              {project.deal_id ? (
                <div>
                  <dt className="text-[#64748B]">Source Deal</dt>
                  <dd className="mt-1">
                    <Link className="font-semibold text-[#2563EB] hover:underline" href={`/deals/${project.deal_id}`}>
                      View deal
                    </Link>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[#64748B]">Status</dt>
                <dd className="mt-1 font-semibold capitalize text-[#0F2444]">{project.status}</dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Dates</dt>
                <dd className="mt-1 font-semibold text-[#0F2444]">
                  {formatDate(project.start_date)} - {project.end_date ? formatDate(project.end_date) : "No end date"}
                </dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Owner</dt>
                <dd className="mt-1 font-semibold text-[#0F2444]">{project.owner_name ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Portal Token</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <code className="rounded-md bg-slate-100 px-2 py-1 text-xs text-[#0F2444]">{maskToken(project.portal_token)}</code>
                  <Button onClick={() => void copyText(project.portal_token, "token")} size="sm" type="button" variant="outline">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    {tokenCopied ? "Copied" : "Copy"}
                  </Button>
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      {canWriteProjects ? (
        <>
          <ProjectForm onOpenChange={setEditOpen} onSaved={() => void projectQuery.refetch()} open={editOpen} project={project} />
          <ConfirmDialog
            confirmLabel="Confirm"
            isPending={deleteMilestone.isPending}
            onConfirm={() => {
              if (milestoneToDelete) {
                deleteMilestone.mutate(milestoneToDelete.id, {
                  onSuccess: () => setMilestoneToDelete(null),
                });
              }
            }}
            onOpenChange={(open) => {
              if (!open) {
                setMilestoneToDelete(null);
              }
            }}
            open={Boolean(milestoneToDelete)}
            title="Delete milestone"
          />
          <ConfirmDialog
            confirmLabel="Archive"
            confirmVariant="default"
            description="Archive this project to hide it from active project lists. Existing milestones, documents, portal history, and audit context stay in the system."
            iconTone="warning"
            isPending={archiveProject.isPending}
            onConfirm={() => archiveProject.mutate()}
            onOpenChange={setConfirmArchiveProject}
            open={confirmArchiveProject}
            title="Archive project"
          />
          <ConfirmDialog
            confirmLabel="Confirm"
            isPending={deleteDocument.isPending}
            onConfirm={() => {
              if (documentToDelete) {
                deleteDocument.mutate(documentToDelete.id, {
                  onSuccess: () => setDocumentToDelete(null),
                });
              }
            }}
            onOpenChange={(open) => {
              if (!open) {
                setDocumentToDelete(null);
              }
            }}
            open={Boolean(documentToDelete)}
            title="Delete document"
          />
        </>
      ) : null}
    </div>
  );
}
