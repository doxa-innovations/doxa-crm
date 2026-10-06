"use client";

import {
  Activity,
  BarChart3,
  Building2,
  CheckSquare,
  FolderKanban,
  Kanban,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Search,
  Settings,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import * as NavigationDialog from "@radix-ui/react-dialog";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { normalizeRole, type CrmRole } from "@/lib/auth-types";
import { cn, getInitials } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  hiddenFor?: CrmRole[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navGroups: NavGroup[] = [
  {
    items: [{ href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" }],
    label: "Overview",
  },
  {
    items: [
      { href: "/leads", icon: UserPlus, label: "Leads" },
      { href: "/contacts", icon: Users, label: "Contacts" },
      { href: "/accounts", icon: Building2, label: "Accounts" },
      { href: "/deals", icon: Kanban, label: "Deals" },
      { href: "/tasks", icon: CheckSquare, label: "Tasks" },
    ],
    label: "Sales",
  },
  {
    items: [
      { href: "/campaigns", icon: Megaphone, label: "Campaigns" },
      { href: "/activities", icon: Activity, label: "Activities" },
    ],
    label: "Marketing",
  },
  {
    items: [{ href: "/projects", icon: FolderKanban, label: "Projects" }],
    label: "Customers",
  },
  {
    items: [{ href: "/reports", icon: BarChart3, label: "Reports" }],
    label: "Insights",
  },
  {
    items: [
      {
        hiddenFor: [
          "customer_success",
          "marketing_manager",
          "marketing_rep",
          "read_only",
          "sales_rep",
        ],
        href: "/settings",
        icon: Settings,
        label: "Settings",
      },
      { href: "/search", icon: Search, label: "Search" },
    ],
    label: "System",
  },
];

function getDisplayName(
  sessionName: unknown,
  storedName: string | undefined,
): string {
  return typeof sessionName === "string" && sessionName.trim()
    ? sessionName
    : storedName || "Your account";
}

function getEmail(
  sessionEmail: unknown,
  storedEmail: string | undefined,
): string {
  return typeof sessionEmail === "string" && sessionEmail.trim()
    ? sessionEmail
    : storedEmail || "";
}

function getRoleLabel(role: CrmRole): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { clearAuth, user: storedUser } = useAuthStore();
  const session = authClient.useSession();
  const sessionUser = session.data?.user;
  const role = normalizeRole(sessionUser?.role ?? storedUser?.role);
  const name = getDisplayName(
    sessionUser?.full_name ?? sessionUser?.name,
    storedUser?.full_name,
  );
  const email = getEmail(sessionUser?.email, storedUser?.email);

  const handleLogout = async () => {
    await authClient.signOut();
    clearAuth();
    router.push("/login");
  };

  const sidebar = (
    <aside className="flex h-full w-[240px] flex-col bg-[var(--navy)] text-white">
      <div className="flex h-16 items-center justify-between px-5">
        <Link
          className="text-lg font-bold text-white"
          href="/dashboard"
          onClick={onClose}
        >
          Doxa CRM
        </Link>
        <button
          aria-label="Close navigation"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white md:hidden"
          type="button"
          onClick={onClose}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.hiddenFor?.includes(role),
          );

          if (visibleItems.length === 0) {
            return null;
          }

          return (
            <div className="mb-5" key={group.label}>
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase text-white/70">
                {group.label}
              </div>
              <div className="grid gap-1">
                {visibleItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      className={cn(
                        "flex h-10 items-center gap-3 border-l-2 border-transparent px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white/90",
                        isActive && "border-l-teal-300 bg-white/10 text-white",
                      )}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      key={item.href}
                      onClick={onClose}
                    >
                      <item.icon
                        className="h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[var(--navy)]">
            {getInitials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">
              {name}
            </div>
            <div className="truncate text-xs text-white/70">{email}</div>
            <div className="mt-0.5 truncate text-xs text-white/70">
              {getRoleLabel(role)}
            </div>
          </div>
        </div>
        <Button
          className="mt-4 w-full justify-start bg-white/10 text-white hover:bg-white/15"
          size="sm"
          type="button"
          variant="ghost"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Logout
        </Button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="fixed inset-y-0 left-0 z-40 hidden md:block">
        {sidebar}
      </div>
      <NavigationDialog.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <NavigationDialog.Portal>
          <NavigationDialog.Overlay className="fixed inset-0 z-50 bg-slate-950/55 md:hidden" />
          <NavigationDialog.Content
            className="fixed inset-y-0 left-0 z-50 md:hidden"
            aria-describedby={undefined}
          >
            <NavigationDialog.Title className="sr-only">
              Navigation
            </NavigationDialog.Title>
            {sidebar}
          </NavigationDialog.Content>
        </NavigationDialog.Portal>
      </NavigationDialog.Root>
    </>
  );
}
