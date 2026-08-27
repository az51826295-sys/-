import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 터널을 통해 들어오는 개발 요청을 허용한다.
   *
   * 개발 서버는 기본적으로 다른 출처에서 오는 `/_next/*` 요청을 막는다. 안전한
   * 기본값이지만, 폰에서 보려고 터널을 열면 화면은 뜨고 스크립트와 폰트만
   * 조용히 막혀서 **버튼이 안 눌리는 것처럼 보인다** — 콘솔을 열기 전까지는
   * 원인이 어디에도 안 적힌다.
   *
   * trycloudflare 주소는 켤 때마다 바뀌므로 와일드카드로 둔다. 개발 전용이고
   * 프로덕션 빌드에는 영향이 없다.
   */
  allowedDevOrigins: ["*.trycloudflare.com", "172.30.1.54"],

  /* config options here */
};

export default nextConfig;
