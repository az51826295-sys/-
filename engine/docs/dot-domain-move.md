# 두근도트 주소 옮기기 — 광고를 켜려면 **우리 주소**여야 한다 (2026-11-10)

사장님: *"아니 광고 먼저"*.

광고의 벽은 번호가 아니라 **주소**다([[dot-ad-reward]] 11-10). AdSense 는 **사이트를 가진
사람**만 등록하는데 `…up.railway.app` 의 부모 주소는 Railway 것이고, 구글은 2023 년에
하위 주소 등록 기능을 없앴다(확인은 도메인 단위). 그래서 도메인 하나를 사는 것이
**광고를 켜는 유일한 길**이다.

## 지금 비어 있는 이름 (11-10 22:4x, RDAP 로 두드려 봄)

| 이름 | 비었나 |
|---|---|
| `dugeundot.com` | ✅ |
| `dugeundot.net` | ✅ |
| `dugeundot.app` | ✅ (구글이 운영 — https 강제) |
| `dotdugeun.com` | ✅ |
| `dukkeundot.com` | ✅ |
| `dgdot.com` · `dugeun.app` | ❌ 임자 있음 |

값은 등록처마다 다르다(첫 해 할인 ~1만 원, 다음 해부터 1~2만 원대). **이름은 사장님이 고른다.**

## 좋은 소식 — 코드는 주소를 모른다

`src`·`public` 어디에도 `dot-web-production-7e03` 이 **한 번도 안 박혀 있다**(11-10 확인, 0건).
`/.well-known/assetlinks.json` 도 `public/` 에 있어 **새 주소에서 그대로 뜬다.**
즉 옮기는 일은 코드 고치기가 아니라 **설정 다섯 자리**다.

## 사는 순간부터 (누가 하나)

| | 무엇 | 누가 |
|---|---|---|
| 1 | 도메인 구입 | **사장님** (카드) |
| 2 | Railway `dot-web` → Settings → Custom Domain 에 추가 | 나 (콘솔) |
| 3 | 등록처 DNS 에 CNAME 한 줄 (Railway 가 알려 주는 값) | 나 (사장님 등록처 계정이면 화면 안내) |
| 4 | **Supabase 인증 주소 허용** — Site URL · Redirect URLs 에 새 주소 | 나 |
| 5 | **구글 로그인** 승인 주소에 새 주소 추가(Google Cloud 콘솔) | 나 + 사장님 확인 |
| 6 | `dot-android/app/build.gradle` 의 `hostName`·`webManifestUrl`·`fullScopeUrl` 교체 → 새 AAB | 나 |
| 7 | Play Console 에 올리기 | 사장님 손가락 (내가 화면 안내) |
| 8 | `npx tsx engine/tools/dot_ad_ready.mts https://새주소` 가 **10/10** | 나 |

4·5 를 빼먹으면 **로그인이 조용히 죽는다** — 화면은 멀쩡한데 들어가지지 않는다.
그래서 8번 자가 끝에 선다.

## 그다음이 광고다

도메인이 서면 AdSense 에 **그 주소**를 등록한다(소유 확인은 `/ads.txt` 와 메타 태그 둘 다
이미 서 있다 — 번호만 넣으면 켜진다). 계정은 형 것이다: 한국 AdSense 는 **만 19세**라
사장님은 2027-03-31 에 열린다([[dot-ad-reward]] 11-08).

**숫자는 정직하게**: 지금 사람 수(30일 49명)면 광고를 진짜로 켜도 **월 270~630원**이다
(상한선, `dot_ad_peek`). 도메인 값이 한 해 수입과 비슷하다. 그래도 **먼저 광고**는
사장님이 정한 순서다 — 적어 두고 간다.

---

## 11-11 확정 — 이름 `dugeundot.com`, **사는 자리는 Cloudflare**

사장님: *"이제 광고 넣자"* → 이름은 **`dugeundot.com`** (23:41 RDAP 재확인, 비었음).

### 왜 등록처를 고르는 것이 기술 문제인가

뿌리 주소(`dugeundot.com`, `www` 없이)에는 **CNAME 을 그냥 걸 수 없다** — DNS 표준에
어긋난다. Railway 문서는 그래서 이렇게 적는다: *"Railway supports CNAME Flattening and
dynamic ALIAS records"*, 그리고 평탄화를 못 하는 곳(**GoDaddy · Route 53 · Azure DNS ·
Hostinger**, 같은 부류로 **가비아**)은 *"change your domain's nameservers to point to
Cloudflare's nameservers"* 하라고 한다
([문서](https://docs.railway.com/networking/domains/working-with-domains)).

즉 **어디서 사든 DNS 는 Cloudflare 로 간다.** 그러면 Cloudflare 에서 사는 것이 단계가
가장 적다(산 순간 DNS 가 이미 Cloudflare다). 원화·간편결제가 편해 가비아에서 산다면
**네임서버를 Cloudflare 로 옮기는 한 단계가 더 붙는다** — 그것도 내가 할 수 있다.

값: .com 원가 기준 한 해 **$10.46 → $11.17**(Verisign 도매가 인상분 반영, 약 16,000원).
Cloudflare 는 원가로만 팔고 **갱신값이 같다** — 첫 해 싸고 다음 해 두 배 받는 곳과 다르다
([CostGoat](https://costgoat.com/compare/domains/com) · 라이브 값은 결제 화면에서 확인).

### 사장님 손 (셋뿐)

| | 무엇 | 왜 내가 못 하나 |
|---|---|---|
| 1 | Cloudflare 계정 만들기 (메일+비번) — <https://dash.cloudflare.com/sign-up> | 계정 생성·비번 입력은 내 금지 사항 |
| 2 | Domain Registration → Register Domain → `dugeundot.com` | 카드 번호 입력은 내 금지 사항 |
| 3 | 결제 (해외결제 되는 카드여야 한다 — 체크카드는 앱에서 해외결제 켜야 할 수 있다) | 같음 |

**그 뒤 전부 내 몫이다.** 2~8 단계(위 표)에 더해 Cloudflare DNS 에 Railway 가 주는
CNAME+TXT 두 줄을 넣는다. `railway domain dugeundot.com --service dot-web` 이 그 두 줄을
그대로 뱉는다(23:42 `railway domain --help` 로 확인 — 만드는 것도 CLI 로 된다).

### 그다음이 번호다

주소가 서면 AdSense 에 `dugeundot.com` 을 등록한다. 계정은 **형 것**이다(한국 AdSense 만
19세, 사장님은 2027-03-31). 번호 `ca-pub-…` 가 오면 Railway 환경변수 **두 줄**이 끝이다:
`ADSENSE_CLIENT=ca-pub-진짜번호` · `ADSENSE_TEST` **삭제**. 그 순간 `/ads.txt`·메타 태그·
처리방침 광고 문단이 **같이** 켜진다(`realAdsenseClient()` 가 셋을 한 번에 쥐고 있다).

### 지금 운영 상태 (23:39 실측)

`AD_REWARD_OPEN=1` · `ADSENSE_TEST=1` · `ADSENSE_CLIENT=ca-pub-0000000000000000` →
**가짜 광고**다. 구글에 요청이 안 가고 수입은 0원이다. 보상 흐름만 진짜로 돈다(11-10 운영 6/6).
`dot_ad_ready` **9/10**, 빨간 줄은 주소 하나.
