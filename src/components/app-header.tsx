"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppRole, Profile } from "@/types/domain";
import { logout } from "@/app/staff/actions";

const links: Record<AppRole, { href: string; label: string }[]> = {
  waiter: [{ href: "/staff/tables", label: "Tavoli" }],
  cashier: [
    { href: "/staff/tables", label: "Tavoli" },
    { href: "/asporti", label: "Asporti" },
    { href: "/cassa", label: "Cassa" },
  ],
  admin: [
    { href: "/staff/tables", label: "Tavoli" },
    { href: "/asporti", label: "Asporti" },
    { href: "/cassa", label: "Cassa" },
    { href: "/admin/statistiche", label: "Statistiche" },
    { href: "/admin", label: "Admin" },
  ],
};

export function AppHeader({ profile }: { profile: Profile }) {
  const pathname = usePathname();

  return (
    <header className="app-header">
      <Link className="brand" href="/staff/tables">
        <span className="brand-mark brand-mark-image" aria-hidden="true">
          <Image
            src="/images/la-sagretta-mark.png"
            alt=""
            width={40}
            height={40}
            priority
          />
        </span>
        <span>
          <strong>La Sagretta</strong>
          <small>{profile.full_name}</small>
        </span>
      </Link>
      <nav className="app-nav" aria-label="Navigazione staff">
        {links[profile.role].map((link) => {
          const isTableRoute =
            link.href === "/staff/tables" && pathname.startsWith("/staff/table/");
          const isTakeawayRoute =
            link.href === "/asporti" && pathname.startsWith("/staff/order/");
          const isActive =
            pathname === link.href ||
            (link.href !== "/admin" && pathname.startsWith(`${link.href}/`)) ||
            isTableRoute ||
            isTakeawayRoute;
          return (
            <Link
              className={isActive ? "is-active" : undefined}
              href={link.href}
              key={link.href}
              aria-current={isActive ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <form action={logout}>
        <button className="text-button" type="submit">
          Esci
        </button>
      </form>
    </header>
  );
}
