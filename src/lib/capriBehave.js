// The pure decision tables behind her behaving, from capri-desktop-0.4.0
// capri.js wanderStep/drop/notice/behave — probabilities and thresholds verbatim.
// The component reads the clock and the DOM; these functions get tested without either.

export const SLEEP_AFTER = 10 * 60 * 1000; // idle this long, she falls asleep
export const DOZE_AFTER = 20 * 1000;       // asleep this long, she comes apart down to her mask

// r: the wanderStep roll (0..1). stance: 'sit' | 'stand' | 'peek'. canPossess: the ledge
// allows it. hasSeat: there is a free ledge to sit on. Returns what to do.
export function wanderChoice(r, stance, canPossess, hasSeat = false) {
  if (stance === 'sit') {
    if (r < 0.3) return 'flourish';
    if (r < 0.5 && canPossess) return 'possess';
    if (r < 0.75) return 'fall'; // just hops off the ledge
    return 'teleport';
  }
  if (r < 0.35 && hasSeat) return 'sit';
  if (r < 0.6) return 'peek';
  if (r < 0.85) return 'teleport';
  return 'flourish';
}

// Let go of her: her hips within 26 px of a ledge top snap onto it, else gravity.
export function dropAction(minDistanceToLedgeTop) {
  return minDistanceToLedgeTop <= 26 ? 'snap' : 'fall';
}

// The pointer came close: now and then she's a little menace about it (30%).
export function noticeDecision(r) {
  return r < 0.3 ? 'zap' : 'curious';
}

export function shouldSleep(now, lastActivity) {
  return now - lastActivity > SLEEP_AFTER;
}

export function shouldDoze(now, sleptAt) {
  return now - sleptAt > DOZE_AFTER;
}
