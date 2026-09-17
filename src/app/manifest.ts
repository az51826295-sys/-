import type { MetadataRoute } from "next";

/**
 * 홈 화면에 얹는 앱. **스토어 없이 오늘 폰에서 써 볼 수 있게** 하는 것이 목적이다.
 *
 * 09-09 사장님 계획: 채팅앱 먼저 출시, 그다음 루키 AI. 안드로이드 정식 앱은
 * 이 웹을 TWA 로 감싸서 낼 것이므로(bubblewrap), 여기 적는 이름·색·아이콘이
 * 그대로 스토어 앱의 것이 된다. 두 번 정하지 않는다.
 *
 * `display: "standalone"` 이 주소창을 없앤다 — 그게 없으면 홈 화면에 얹어도
 * 브라우저로 보이고, 사람은 앱이 아니라고 느낀다.
 *
 * 97회차 09-13: 이 파일이 PRODUCT 를 안 봐서, 로키(rookery-web) 서비스도
 * 두근도트 이름·아이콘을 내보내고 있었다(안드로이드 앱이 잘못된 서버를
 * 열던 사고와 같은 날 발견). 이제 PRODUCT 로 갈라 낸다.
 */
export default function manifest(): MetadataRoute.Manifest {
  if (process.env.PRODUCT === "rookery") {
    return {
      name: "Rookery — 무엇이든 물어보기",
      short_name: "Rookery",
      description: "여러 생성 AI를 지휘해 조사·문서·앱·그림·영상을 만들고 판정하는 AI. 설계도는 사람이, 실행과 판정은 로키가.",
      start_url: "/ask",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0a0a0a",
      theme_color: "#0a0a0a",
      lang: "ko",
      icons: [
        { src: "/rookery-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/rookery-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/rookery-icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
  }
  return {
    name: "두근도트 — 오늘 하루 어땠어요?",
    short_name: "두근도트",
    description: "도트 캐릭터와 이야기하는 앱. 친해질수록 말투와 표정이 바뀝니다.",
    start_url: "/dot",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#b2c7d9",
    theme_color: "#a5bccd",
    lang: "ko",
    icons: [
      { src: "/dot-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/dot-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/dot-icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
