import type { Dict } from "../core";

/** 한국어 원문 → 영어·일본어. 열쇠는 화면에 쓰인 한국어 그대로다(core.ts 참고). */
export const COMMON: Dict = {
  // ── 로그인·가입 (두근도트·로키 같이)
  "이메일이나 비밀번호가 맞지 않아요.": { en: "Your email or password is incorrect.", ja: "メールアドレスまたはパスワードが正しくありません。" },
  "메일함에서 확인 링크를 먼저 눌러 주세요.": { en: "Please click the confirmation link in your inbox first.", ja: "先にメールボックスの確認リンクを押してください。" },
  "구글 로그인 주소를 못 받았어요.": { en: "Couldn't get the Google sign-in link.", ja: "Googleログインのリンクを取得できませんでした。" },
  "이메일과 비밀번호를 넣어 주세요.": { en: "Please enter your email and password.", ja: "メールアドレスとパスワードを入力してください。" },
  "메일함에서 확인 링크를 누른 뒤 로그인해 주세요.": { en: "Click the confirmation link in your inbox, then sign in.", ja: "メールボックスの確認リンクを押してからログインしてください。" },
  "두근도트 — 로그인": { en: "Dugeun Dot — Sign in", ja: "ドゥグンドット — ログイン" },
  "로키 — 로그인": { en: "Rookery — Sign in", ja: "Rookery — ログイン" },
  "두근도트 — 가입": { en: "Dugeun Dot — Sign up", ja: "ドゥグンドット — 新規登録" },
  "로키 — 가입": { en: "Rookery — Sign up", ja: "Rookery — 新規登録" },
};
