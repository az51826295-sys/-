/**
 * 우리가 만들고 사장님이 고른 아이콘.
 *
 * `<img>` 가 아니라 CSS 마스크로 그린다. 이 아이콘들은 단색 선화라서, 마스크로
 * 쓰면 **글자 색을 그대로 따라간다** — 밝은 화면에서는 검게, 어두운 화면에서는
 * 희게, 눌린 버튼 안에서는 그 버튼의 글자색으로. `<img>` 로 넣으면 파일에 박힌
 * 색 하나로 고정되고, 두 테마 중 한쪽에서 반드시 안 보인다.
 *
 * 고른 기록: `genesis-project/data/picks/rookery-ui.json`
 */

export type IconName =
  | "chat"
  | "company"
  | "attach"
  | "history"
  | "settings"
  | "signout";

export default function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={"inline-block shrink-0 bg-current " + className}
      style={{
        width: size,
        height: size,
        maskImage: `url(/icons/${name}.svg)`,
        WebkitMaskImage: `url(/icons/${name}.svg)`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
