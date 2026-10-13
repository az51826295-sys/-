/** 로키 낱말 규칙(고쳐·약속·파일·재촉)의 영어·일본어 판 (10-14). 돈 0. */
const { FIX_WORDS, PROMISE_WORDS, FILE_WORDS, GO_WORDS } = await import("../../src/lib/chat/everydayService");
const c: [RegExp, string, string, boolean][] = [
 [FIX_WORDS,"FIX","make the ball slower",true],[FIX_WORDS,"FIX","ボールを遅くして直して",true],[FIX_WORDS,"FIX","thanks, looks great",false],[FIX_WORDS,"FIX","ありがとう、いいね",false],
 [PROMISE_WORDS,"PROMISE","Got it, I'll fix the jump.",true],[PROMISE_WORDS,"PROMISE","ジャンプを直しますね",true],[PROMISE_WORDS,"PROMISE","Here is how it works.",false],
 [FILE_WORDS,"FILE","send me the files",true],[FILE_WORDS,"FILE","ファイルをください",true],[FILE_WORDS,"FILE","how do files work in unity",false],
 [GO_WORDS,"GO","yes",true],[GO_WORDS,"GO","はい",true],[GO_WORDS,"GO","お願いします！",true],[GO_WORDS,"GO","yes but make it red",false],[GO_WORDS,"GO","시작",true],
];
let bad=0; for (const [r,n,s,w] of c){const g=r.test(s); if(g!==w){bad++;console.log("어긋남",n,JSON.stringify(s),g);}}
console.log(`${c.length}줄 · 어긋남 ${bad}`);
process.exit(bad ? 1 : 0);
