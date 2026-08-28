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
  // 대화가 맨 앞이다.
  //
  // 이 제품의 정문이 대화로 옮겨졌는데 내비에는 없었다 — 매니저가 말을 걸려면
  // 주소를 외우거나 뒤로 가기를 눌러야 했고, 찾아갈 길이 없는 정문은 정문이
  // 아니다. 나머지는 그 대화가 만들어 낸 것을 **다시 찾는** 자리다.
  // 대화 하나만 남긴다.
  //
  // 나머지 화면들은 **지우지 않았다** — 20개가 도는 코드이고, 지우는 것은
  // 되돌릴 수 없다. 다만 정문에서 치웠다: 매니저가 일을 시키러 왔는데 문이
  // 다섯 개면 그중 어느 것이 "시키는 문"인지부터 골라야 하고, 그 고르기가
  // 이 제품을 어렵게 만들던 것이다.
  //
  // 필요한 사람은 주소로 갈 수 있고, 설정(왼쪽 위)에 "회사 관리"가 남아 있다.
  { href: "/ask", label: "대화" },
  // Added back after the cut to three. The home screen turns a sentence into a
  // project, and a product that creates things the person cannot then find has
  // not simplified anything — it has hidden their work.
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
