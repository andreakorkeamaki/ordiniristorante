import Link from "next/link";
import type { AppRole, Profile } from "@/types/domain";
import { logout } from "@/app/staff/actions";

const links: Record<AppRole, { href: string; label: string }[]> = {
  waiter: [{ href: "/staff/tables", label: "Tavoli" }],
  cashier: [
    { href: "/staff/tables", label: "Tavoli" },
    { href: "/cassa", label: "Cassa" },
  ],
  admin: [
    { href: "/staff/tables", label: "Tavoli" },
    { href: "/cassa", label: "Cassa" },
    { href: "/admin", label: "Admin" },
  ],
};

export function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="app-header">
      <Link className="brand" href="/staff/tables">
        <span className="brand-mark">LS</span>
        <span>
          <strong>La Sagretta</strong>
          <small>{profile.full_name}</small>
        </span>
      </Link>
      <nav className="app-nav" aria-label="Navigazione staff">
        {links[profile.role].map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <form action={logout}>
        <button className="text-button" type="submit">
          Esci
        </button>
      </form>
    </header>
  );
}
