import Link from "next/link";

/**
 * **스토리 줄** — 인스타 피드 맨 위의 그 동그라미들 (227회차 09-29, 사장님 "인스타 모방해라").
 *
 * 인스타를 흉내 내는 것이 껍데기만 따라 하는 것이 되지 않으려면, 이 줄이 **실제로 쓸모**가 있어야 한다.
 * 인스타에서 이 줄은 "지금 새 게 있는 사람"으로 바로 들어가는 문이다. 우리 앱에서 그에 해당하는 것은
 * **안 읽은 말이 있는 방**이다. 그래서 안 읽은 게 있는 사람을 **앞에** 놓고 **색 링**을 두른다 —
 * 인스타에서 안 본 스토리에 링이 둘리는 것과 같은 규칙이다.
 *
 * 누르면 프로필이 아니라 **방으로** 간다. 스토리를 누르면 그 사람의 지금이 나오듯이.
 */
export type StoryItem = { slug: string; name: string; avatar: string; unread: number };

export default function StoryRow({ items }: { items: StoryItem[] }) {
  if (!items.length) return null;
  const 순서 = [...items].sort((a, b) => b.unread - a.unread);
  return (
    <div className="st-row">
      <style>{CSS}</style>
      {순서.map((c) => (
        <Link key={c.slug} href={`/dot/${c.slug}`} className="st-one" aria-label={`${c.name}${c.unread ? ` 안 읽은 말 ${c.unread}개` : ""}`}>
          <span className={`st-ring${c.unread ? " on" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.avatar ? <img src={c.avatar} alt="" /> : <span className="st-none" />}
          </span>
          <span className="st-name">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}

const CSS = `
.st-row { display:flex; gap:14px; overflow-x:auto; padding:6px 16px 12px; border-bottom:1px solid #f1f3f6; scrollbar-width:none; }
.st-row::-webkit-scrollbar { display:none; }
.st-one { flex:0 0 auto; display:flex; flex-direction:column; align-items:center; gap:5px; width:66px; text-decoration:none; }
/* 인스타의 그 링: 안 본 게 있으면 색, 없으면 옅은 회색 테두리. */
.st-ring { display:block; width:62px; height:62px; border-radius:50%; padding:2px; background:#e6eaef; }
.st-ring.on { background:conic-gradient(from 210deg, #ff5c7a, #fee500, #ff9f43, #ff5c7a); }
.st-ring img, .st-none { display:block; width:100%; height:100%; border-radius:50%; object-fit:cover; object-position:center top;
  image-rendering:pixelated; background:#fff; box-shadow:0 0 0 2px #fff inset; }
.st-none { background:#eef1f5; }
.st-name { font-size:11px; color:#3c434b; max-width:66px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;
