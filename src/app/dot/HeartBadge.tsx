/**
 * **하트 수 표시** (11-06 사장님 "유아이에 하트 수 표시" → "총 개수를 보여주고").
 *
 * 방 안에서는 입력칸 아래에 늘 보이는데 **방 밖에서는 안 보였다**(피드·검색·채팅목록·내 창).
 * 하트가 쓰는 값이 된 날부터 그건 지갑을 안 보여 주는 것이다.
 *
 * 09-28 에 사장님이 *"오늘 남은 대화는 표시하지말고"* 라 하셔서 뺐던 자리이기도 하다.
 * **조건이 달라졌다**: 그때는 아침마다 저절로 차는 수라 미터기였고, 지금은 받아야 생기는 값이다.
 *
 * 처음엔 출석 전에 이 자리를 받는 단추로 바꿨는데, 사장님이 *"총 개수를 보여주고"* 라 하셔서
 * **숫자만** 남겼다. 받는 일은 하루 첫 입장에 저절로 뜨는 판(`CheckInPopup`)이 한다.
 * 그래서 이 조각은 상태가 없다 — 서버 조각이 그린다(`HeartBadgeServer`).
 */
export default function HeartBadge({ hearts }: { hearts: number }) {
  return (
    <>
      <style>{CSS}</style>
      <span className="hb" aria-label={`남은 하트 ${hearts}개`}><b>♥</b>{hearts}</span>
    </>
  );
}

const CSS = `
.hb { margin-left:auto; display:inline-flex; align-items:center; gap:4px; font-size:14px; font-weight:700; color:#ff5c7a; white-space:nowrap; }
.hb b { font-weight:700; }
`;
