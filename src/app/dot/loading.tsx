/** 화면 사이 기다림 — 검은 화면 대신 도트 점 셋 (09-12 사장님 "차라리 로딩을 하던가"). */
export default function DotLoading() {
  return (
    <div style={{ minHeight: "100dvh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@keyframes dl { 0%,80%,100%{opacity:.2} 40%{opacity:1} } .dl span{display:inline-block;width:12px;height:12px;background:#1c1c1c;margin:0 5px;animation:dl 1.1s infinite steps(1,end)} .dl span:nth-child(2){animation-delay:.2s} .dl span:nth-child(3){animation-delay:.4s}`}</style>
      <div className="dl" aria-label="불러오는 중"><span /><span /><span /></div>
    </div>
  );
}
