export default function HazardIntercept() {
  return (
    <div className="scene-hazard" aria-hidden="true">
      {/* Tipografi Raksasa Watermark di Background */}
      <div className="hazard-watermark">
        <span>OFFLINE</span>
      </div>

      {/* Police / Hazard Tape Diagonal 1 (Amber) */}
      <div className="hazard-ribbon ribbon-top">
        <div className="hazard-track">
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} className="hazard-text">
              ⚠ CAUTION // WEB RECONSTRUCTION IN PROGRESS // DO NOT CROSS //
            </span>
          ))}
        </div>
      </div>

      {/* Police / Hazard Tape Diagonal 2 (Magenta) */}
      <div className="hazard-ribbon ribbon-bottom sec-head">
        <div className="hazard-track rev">
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} className="hazard-text">
              ✦ SHIROO AT HACKATHON ✦ SYSTEM INTERCEPT ✦ SIGNAL 0451 ✦
            </span>
          ))}
        </div>
      </div>

      {/* Bracket Sudut Anime Trigger di 4 Penjuru */}
      <div className="hazard-corner tl" />
      <div className="hazard-corner tr" />
      <div className="hazard-corner bl" />
      <div className="hazard-corner br" />
    </div>
  );
}
