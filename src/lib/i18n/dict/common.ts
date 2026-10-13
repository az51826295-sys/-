import type { Dict } from "../core";

/** 한국어 원문 → 영어·일본어. 열쇠는 화면에 쓰인 한국어 그대로다(core.ts 참고). */
export const COMMON: Dict = {
  "구글에서 돌아온 값이 없어요.": { en: "Google didn't send anything back.", ja: "Googleから値が返ってきませんでした。" },
  "링크에 확인값이 없어요.": { en: "The link is missing its confirmation code.", ja: "リンクに確認コードがありません。" },
  "링크가 만료됐거나 이미 썼어요. 다시 로그인해 주세요.": { en: "The link has expired or was already used. Please sign in again.", ja: "リンクの有効期限が切れたか、すでに使われています。もう一度ログインしてください。" },
  "QR 이 만료됐어요(2분). 컴퓨터에서 다시 띄워 주세요.": { en: "The QR code expired (2 minutes). Show it again on your computer.", ja: "QRコードの有効期限が切れました（2分）。パソコンでもう一度表示してください。" },
  "QR 을 읽지 못했어요. 컴퓨터에서 다시 띄워 주세요.": { en: "Couldn't read the QR code. Show it again on your computer.", ja: "QRコードを読み取れませんでした。パソコンでもう一度表示してください。" },
  "이미 쓴 QR 이에요. 컴퓨터에서 다시 띄워 주세요.": { en: "That QR code was already used. Show a new one on your computer.", ja: "このQRコードは使用済みです。パソコンでもう一度表示してください。" },
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
