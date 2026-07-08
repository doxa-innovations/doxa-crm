"use client";

import { MessageSquare, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { normalizeRole, type CrmRole } from "@/lib/auth-types";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

interface SettingsLayoutClientProps {
  children: ReactNode;
}

const allowedRoles: CrmRole[] = ["super_admin", "sales_manager"];

const settingsLinks = [
  { href: "/settings/users", icon: Users, label: "Users" },
  { href: "/settings/pipeline", icon: SlidersHorizontal, label: "Pipeline" },
  { href: "/settings/sms", icon: MessageSquare, label: "SMS" },
];

export function SettingsLayoutClient({ children }: SettingsLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const session = authClient.useSession();
  const storedUser = useAuthStore((state) => state.user);
  const role = normalizeRole(session.data?.user?.role ?? storedUser?.role);
  const isLoading = session.isPending && !storedUser;
  const allowed = allowedRoles.includes(role);

  useEffect(() => {
    if (!isLoading && !allowed) {
      window.sessionStorage.setItem("doxa:last-toast", "Only Super Admins and Sales Managers can access settings.");
      router.replace("/dashboard?settings=unauthorized");
    }
  }, [allowed, isLoading, router]);

  if (isLoading) {
    return <div className="rounded-lg border border-slate-200/70 bg-white p-4 text-sm text-[#64748B] shadow-sm sm:p-6">Checking permissions...</div>;
  }

  if (!allowed) {
    return <div className="rounded-lg border border-slate-200/70 bg-white p-4 text-sm text-[#64748B] shadow-sm sm:p-6">Redirecting to dashboard...</div>;
  }

  return (
    <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-lg border border-slate-200/70 bg-white p-3 shadow-sm lg:sticky lg:top-6 lg:self-start">
        <div className="px-1 py-1 sm:px-3 sm:py-2">
          <h1 className="text-lg font-semibold text-[#0F2444]">Settings</h1>
          <p className="mt-1 text-sm text-[#64748B]">Workspace configuration</p>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0" aria-label="Settings sections">
          {settingsLinks.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                className={cn(
                  "flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition lg:gap-3",
                  active ? "bg-[#EFF6FF] text-[#2563EB]" : "text-[#64748B] hover:bg-slate-50 hover:text-[#0F2444]",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
