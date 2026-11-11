/**
 * **두근도트 버전 — 한 자리에서만 온다** (11-12).
 *
 * 설정 화면에 `두근도트 1.0.7` 이 손으로 적혀 있었다. Play 에 올라간 앱은 **1.0.10** 이다 —
 * 화면이 사람에게 거짓말을 하고 있었다. 손으로 적은 숫자는 올릴 때마다 어긋난다.
 *
 * 그래서 숫자를 **여기 하나만** 둔다. 진짜 출처는 `dot-android/app/build.gradle` 의
 * `versionName` 이고(그게 Play 에 올라가는 값이다), 이 줄은 그 값을 따라 적는 **사본**이다.
 * 두 폴더가 서로 다른 집이라 코드로 묶을 수 없어서, 대신 **자가 대조한다** —
 * `engine/tools/dot_screen_truth.mts` 가 build.gradle 을 읽어 화면 값과 견주고,
 * 어긋나면 빨개진다. 자가 없으면 이 사본은 또 조용히 늙는다([[unrun-code-is-unmeasured]]).
 *
 * **올릴 때 순서**: build.gradle 의 `versionName` 을 올린다 → 이 줄을 같은 값으로 → 자를 돌린다.
 */
export const DOT_APP_VERSION = "1.0.10";
