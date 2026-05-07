"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { OrgSwitcher } from "@/components/org-switcher";
import { SignOutButton } from "@/components/sign-out-button";

type Org = { id: string; name: string };
type SidebarUser = { name: string | null; email: string; isSuperAdmin: boolean };

type Section = {
  label?: string;
  items: Array<{ href: string; label: string; soon?: boolean; superAdminOnly?: boolean }>;
};

const SECTIONS: Section[] = [
  {
    items: [
      { href: "/overview", label: "Overview" },
      { href: "/employees", label: "Employees" },
      { href: "/time-off", label: "Time off" },
      { href: "/documents", label: "Documents" },
      { href: "/org-chart", label: "Org chart" },
      { href: "/reviews", label: "Reviews" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/api-keys", label: "API Keys" },
      { href: "/webhooks", label: "Webhooks" },
      { href: "/company", label: "Company" },
      { href: "/billing", label: "Billing" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/settings", label: "Settings" },
      { href: "/admin", label: "Admin Panel" },
      { href: "/superadmin", label: "Super Admin", superAdminOnly: true },
    ],
  },
];

export function Sidebar({
  user,
  orgs,
  activeOrgId,
}: {
  user: SidebarUser;
  orgs: ReadonlyArray<Org>;
  activeOrgId: string | undefined;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-4 py-5">
        <Link href="/overview" className="flex items-center gap-2 text-lg font-semibold">
          MyHR
        </Link>
      </div>

      <div className="px-4">
        <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
      </div>

      <nav className="flex-1 mt-6 px-2 space-y-6 overflow-y-auto">
        {SECTIONS.map((section, i) => {
          const items = section.items.filter(
            (it) => !it.superAdminOnly || user.isSuperAdmin,
          );
          if (items.length === 0) return null;
          return (
            <div key={i}>
              {section.label ? (
                <div className="px-3 pb-2 text-[11px] uppercase tracking-wider text-sidebar-muted">
                  {section.label}
                </div>
              ) : null}
              <ul className="space-y-0.5">
                {items.map((it) => {
                  const active = pathname === it.href || pathname.startsWith(it.href + "/");
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        className={cn(
                          "flex items-center justify-between rounded-[calc(var(--radius-md)-2px)] px-3 py-2 text-sm",
                          active
                            ? "bg-sidebar-active text-sidebar-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-active/60 hover:text-sidebar-foreground",
                        )}
                      >
                        <span>{it.label}</span>
                        {it.soon ? (
                          <span className="text-[10px] uppercase tracking-wider text-sidebar-muted">
                            soon
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        <div className="mb-3 text-sm">
          <div className="font-medium truncate">{user.name ?? user.email}</div>
          <div className="text-sidebar-muted text-xs truncate">{user.email}</div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
