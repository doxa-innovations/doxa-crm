import type { Metadata } from "next";
import {
  CheckCircle2,
  Circle,
  CalendarDays,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { notFound } from "next/navigation";
import { format } from "date-fns";

type ProjectHealth = "green" | "yellow" | "red";

interface PortalMilestone {
  title: string;
  due_date: string;
  completed?: boolean;
  completed_at?: string | null;
}

interface PortalProject {
  support_email?: string | null;
  updated_at: string;
  documents: Array<{ filename: string; download_url: string }>;
  project_name: string;
  account_name?: string | null;
  health: ProjectHealth;
  milestones: PortalMilestone[];
  status: string;
  start_date: string;
  end_date: string;
}

interface PortalPageProps {
  params: Promise<{
    token: string;
  }>;
}

const healthConfig = {
  green: {
    icon: CheckCircle2,
    label: "On Track",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  red: {
    icon: TriangleAlert,
    label: "Delayed",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
  yellow: {
    icon: TriangleAlert,
    label: "At Risk",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
} satisfies Record<
  ProjectHealth,
  { icon: typeof CheckCircle2; label: string; tone: string }
>;

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function getPortalProject(token: string): Promise<PortalProject | null> {
  if (!isUuidLike(token)) {
    return null;
  }

  const apiUrl =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8001";
  const response = await fetch(
    `${apiUrl.replace(/\/+$/, "")}/api/v1/portal/${token}`,
    {
      cache: "no-store",
    },
  );

  if (
    response.status === 400 ||
    response.status === 404 ||
    response.status === 422
  ) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Could not load portal project");
  }

  return (await response.json()) as PortalProject;
}

export async function generateMetadata({
  params,
}: PortalPageProps): Promise<Metadata> {
  const { token } = await params;
  const project = await getPortalProject(token);

  if (!project) {
    return {
      title: "Project not found",
    };
  }

  return {
    title: `${project.project_name} — Project Status`,
  };
}

function formatDate(date: string): string {
  return format(new Date(date), "MMM d, yyyy");
}

function isCompleted(milestone: PortalMilestone): boolean {
  return Boolean(milestone.completed_at) || milestone.completed === true;
}

function isOverdue(milestone: PortalMilestone): boolean {
  if (isCompleted(milestone)) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(milestone.due_date);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function milestoneStatus(milestone: PortalMilestone) {
  if (isCompleted(milestone)) {
    return {
      icon: CheckCircle2,
      iconClassName: "text-emerald-600",
      label: milestone.completed_at
        ? `Completed ${formatDate(milestone.completed_at)}`
        : "Completed",
      titleClassName: "text-[var(--muted-foreground)] line-through",
    };
  }

  if (isOverdue(milestone)) {
    return {
      icon: TriangleAlert,
      iconClassName: "text-red-600",
      label: `Overdue since ${formatDate(milestone.due_date)}`,
      titleClassName: "text-[var(--navy)]",
    };
  }

  return {
    icon: Circle,
    iconClassName: "text-[var(--muted-foreground)]",
    label: `Due ${formatDate(milestone.due_date)}`,
    titleClassName: "text-[var(--navy)]",
  };
}

export default async function PortalPage({ params }: PortalPageProps) {
  const { token } = await params;
  const project = await getPortalProject(token);

  if (!project) {
    notFound();
  }

  const health = healthConfig[project.health];
  const HealthIcon = health.icon;
  const completedCount = project.milestones.filter(isCompleted).length;
  const totalCount = project.milestones.length;
  const progress =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const milestones = [...project.milestones].sort(
    (left, right) =>
      new Date(left.due_date).getTime() - new Date(right.due_date).getTime(),
  );
  const updated = format(new Date(project.updated_at), "MMM d, yyyy");

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="bg-[var(--navy)] px-4 py-5 text-white shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xl font-bold">Doxa CRM</div>
          <div className="text-sm font-medium text-white/75">
            Customer Project Portal
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--muted-foreground)]">
                {project.account_name ?? "Customer Account"}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-normal text-[var(--navy)] sm:text-4xl">
                {project.project_name}
              </h1>
            </div>
            <div
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${health.tone}`}
            >
              <HealthIcon className="h-5 w-5" aria-hidden="true" />
              {health.label}
            </div>
          </div>

          <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-[var(--muted-foreground)]">
                Project Status
              </p>
              <p className="mt-1 text-sm font-semibold capitalize text-[var(--navy)]">
                {project.status}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-[var(--muted-foreground)]">
                Project Dates
              </p>
              <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[var(--navy)]">
                <CalendarDays
                  className="h-4 w-4 text-[var(--primary)]"
                  aria-hidden="true"
                />
                {formatDate(project.start_date)} {"->"}{" "}
                {formatDate(project.end_date)}
              </p>
            </div>
          </div>

          <section className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[var(--navy)]">
                  Project Milestones
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {completedCount} of {totalCount} milestones complete
                </p>
              </div>
              <span className="text-sm font-semibold text-[var(--primary)]">
                {progress}%
              </span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--primary)]"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-5 grid gap-3">
              {milestones.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-[var(--muted-foreground)]">
                  No milestones have been published yet.
                </div>
              ) : null}
              {milestones.map((milestone) => {
                const status = milestoneStatus(milestone);
                const StatusIcon = status.icon;

                return (
                  <div
                    className="flex items-start gap-3 rounded-xl border border-slate-100 p-4"
                    key={`${milestone.title}-${milestone.due_date}`}
                  >
                    <StatusIcon
                      className={`mt-0.5 h-5 w-5 shrink-0 ${status.iconClassName}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className={`font-semibold ${status.titleClassName}`}>
                        {milestone.title}
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {status.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </section>

        <footer className="mt-6 rounded-xl bg-white/75 p-4 text-center text-sm text-[var(--muted-foreground)] shadow-sm">
          <p className="inline-flex items-center justify-center gap-2">
            <ShieldCheck
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
            This is a read-only project view provided by Doxa CRM.
          </p>
          {project.documents.length > 0 && (
            <section className="my-6 text-left">
              <h2 className="text-lg font-semibold">Shared documents</h2>
              <ul className="mt-3 space-y-3">
                {project.documents.map((document) => (
                  <li key={document.filename}>
                    <a
                      className="text-blue-700 underline"
                      href={document.download_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {document.filename}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-2">Last updated: {updated}</p>
          <p className="mt-3">
            Questions or changes?{" "}
            {project.support_email ? (
              <a
                className="text-blue-700 underline"
                href={`mailto:${project.support_email}`}
              >
                Contact the project team
              </a>
            ) : (
              "Reply to the message that included this project link."
            )}
          </p>
        </footer>
      </div>
    </main>
  );
}
