import Link from "next/link";
import { logout } from "@/app/login/actions";

/**
 * Three links. It was seventeen a week ago, then six, and now three.
 *
 * The test is not "could somebody use this menu" but "does somebody have to
 * read it". Three nouns — where I am, who works here, what the company is —
 * can be taken in without being read.
 *
 * Work and Results left because neither was a destination. Nobody opens a
 * product to look at a list of assignments; they open it because something
 * finished or something is stuck, and both of those are on the home screen
 * already, named. The full lists are still there, one click from home.
 *
 * Settings left because it is not something you do, it is something you did
 * once. It lives on the Company page, which is where a person goes when they
 * want to change what kind of company this is.
 *
 * Nothing was deleted. Every page still works and is still linked from the
 * place it belongs to.
 */
const LINKS = [
  { href: "/dashboard", label: "Home" },
  // Added back after the cut to three. The home screen turns a sentence into a
  // project, and a product that creates things the person cannot then find has
  // not simplified anything — it has hidden their work.
  { href: "/dashboard/projects", label: "Projects" },
  { href: "/employees", label: "Employees" },
  { href: "/dashboard/company", label: "Company" },
];

export function NavBar() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-zinc-200 px-6 py-4">
      <Link href="/dashboard" className="text-sm font-semibold text-zinc-900">
        Rookery
      </Link>
      {/* Wraps rather than overflows: a narrow window gets two rows, not a row
          with items hidden past the edge. */}
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-zinc-600 hover:text-zinc-900"
          >
            {link.label}
          </Link>
        ))}
        <form action={logout}>
          <button type="submit" className="text-zinc-600 hover:text-zinc-900">
            Log out
          </button>
        </form>
      </nav>
    </header>
  );
}
