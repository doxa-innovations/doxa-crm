"use client";
import { useListState } from "@/hooks/useListState";
import { SavedViews } from "@/components/shared/SavedViews";
import { Pagination } from "@/components/shared/Pagination";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HealthPill } from "@/components/projects/HealthPill";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { cn, formatDate } from "@/lib/utils";
import type { Project, ProjectHealth, User } from "@/types/api";

const healthOptions: ProjectHealth[] = ["green", "yellow", "red"];

function healthLabel(health: ProjectHealth): string {
  if (health === "green") {
    return "On Track";
  }

  if (health === "yellow") {
    return "At Risk";
  }

  return "Delayed";
}

function milestoneStats(project: Project) {
  const total = project.milestones.length;
  const complete = project.milestones.filter(
    (milestone) => milestone.completed_at,
  ).length;
  const percent = total > 0 ? Math.round((complete / total) * 100) : 0;

  return { complete, percent, total };
}

function progressClass(health: ProjectHealth): string {
  if (health === "green") {
    return "bg-emerald-500";
  }

  if (health === "yellow") {
    return "bg-amber-500";
  }

  return "bg-red-500";
}

export function ProjectsPageClient() {
  const { canWriteProjects } = usePermissions();
  const { filters, setFilters, page, setPage } = useListState({
    health: "",
    ownerId: "",
  });
  const [formOpen, setFormOpen] = useState(false);
  const health = filters.health;
  const setHealth = (health: string) =>
    setFilters((current) => ({ ...current, health }));
  const ownerId = filters.ownerId;
  const setOwnerId = (ownerId: string) =>
    setFilters((current) => ({ ...current, ownerId }));

  const projectsQuery = useQuery({
    queryFn: () =>
      api.get<Project[]>("/projects/", {
        health: health || undefined,
        owner_id: ownerId || undefined,
        page,
        page_size: 100,
      }),
    queryKey: ["projects", "list", health, ownerId, page],
  });
  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/directory"),
    queryKey: ["users", "project-filters"],
    retry: false,
  });

  const projects = projectsQuery.data ?? [];

  return (
    <div className="grid gap-6">
      <PageHeader
        primaryAction={
          canWriteProjects
            ? {
                icon: Plus,
                label: "New Project",
                onClick: () => setFormOpen(true),
              }
            : undefined
        }
        subtitle="Track customer onboarding work, milestones, documents, and portal access."
        title="Projects"
      />

      <SavedViews
        scope="projects"
        value={filters}
        onLoad={(saved) => {
          setFilters(saved);
          setPage(1);
        }}
      />
      <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-2">
            <select
              className="h-10 rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
              onChange={(event) => {
                setPage(1);
                setHealth(event.target.value);
              }}
              value={health}
            >
              <option value="">All health statuses</option>
              {healthOptions.map((option) => (
                <option key={option} value={option}>
                  {healthLabel(option)}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
              onChange={(event) => {
                setPage(1);
                setOwnerId(event.target.value);
              }}
              value={ownerId}
            >
              <option value="">All owners</option>
              {(usersQuery.data ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="inline-flex h-10 items-center rounded-md border border-slate-100 bg-slate-50 px-3 text-sm text-[var(--muted-foreground)]">
            <span className="mr-1.5 font-semibold text-[var(--navy)]">
              {projects.length}
            </span>
            projects
          </div>
        </div>
      </section>

      {projectsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Skeleton className="h-72 rounded-xl" key={item} />
          ))}
        </div>
      ) : null}

      {!projectsQuery.isLoading &&
      projects.length === 0 &&
      !projectsQuery.isError ? (
        <EmptyState
          action={
            canWriteProjects
              ? { label: "New Project", onClick: () => setFormOpen(true) }
              : undefined
          }
          description="Create a project manually or convert a closed-won deal into a customer project."
          icon={FolderKanban}
          title="No projects found"
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const stats = milestoneStats(project);

          return (
            <Link
              className="group rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md"
              href={`/projects/${project.id}`}
              key={project.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-[var(--navy)]">
                    {project.name}
                  </h2>
                  <p className="mt-1 truncate text-sm text-[var(--muted-foreground)]">
                    {project.account_name ?? "Account"}
                  </p>
                </div>
                <HealthPill health={project.health} />
              </div>

              <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--navy)]">
                    <CheckCircle2
                      className="h-4 w-4 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                    {stats.complete} of {stats.total} complete
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    {stats.percent}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      progressClass(project.health),
                    )}
                    style={{ width: `${stats.percent}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-3 text-sm text-[var(--muted-foreground)]">
                <div className="flex items-center justify-between gap-3">
                  <span>Status</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-[var(--navy)]">
                    {project.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound
                      className="h-4 w-4 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                    Owner
                  </span>
                  <span className="truncate font-medium text-[var(--navy)]">
                    {project.owner_name ?? "Unassigned"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays
                    className="h-4 w-4 text-[var(--primary)]"
                    aria-hidden="true"
                  />
                  <span>
                    {formatDate(project.start_date)} -{" "}
                    {project.end_date
                      ? formatDate(project.end_date)
                      : "No end date"}
                  </span>
                </div>
              </div>

              <div
                className={cn(
                  "mt-5 h-1 rounded-full",
                  progressClass(project.health),
                )}
              />
            </Link>
          );
        })}
      </div>

      {projectsQuery.isError ? (
        <div className="rounded-xl border border-red-100 bg-white p-4 text-sm text-red-700 shadow-sm">
          Could not load projects.
        </div>
      ) : null}

      {canWriteProjects ? (
        <ProjectForm onOpenChange={setFormOpen} open={formOpen} />
      ) : null}
      <Pagination
        page={page}
        count={projectsQuery.data?.length ?? 0}
        busy={projectsQuery.isFetching}
        onChange={setPage}
      />
    </div>
  );
}
