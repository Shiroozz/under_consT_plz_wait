const DRINKS_KEY = 'shiroo.drinks';
export const BACKROOM_KEY = 'shiroo.backroom';

export function getDrinkCount() {
  try {
    return parseInt(localStorage.getItem(DRINKS_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function addDrink() {
  const next = getDrinkCount() + 1;
  try {
    localStorage.setItem(DRINKS_KEY, String(next));
  } catch {
    /* private mode: the count still returns for this session */
  }
  return next;
}

export function isBackroomUnlocked() {
  try {
    return localStorage.getItem(BACKROOM_KEY) === '1';
  } catch {
    return false;
  }
}

export function unlockBackroom() {
  try {
    localStorage.setItem(BACKROOM_KEY, '1');
  } catch {
    /* ignore */
  }
}

const HISTORY_KEY = 'shiroo.terminal.history';
export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').slice(-40);
  } catch {
    return [];
  }
}

export function pushHistory(line) {
  const next = [...getHistory(), line].slice(-40);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

const INTRO_KEY = 'shiroo.capri.introSeen';

export function hasSeenIntro() {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* private mode: she'll grab the screen again next visit, fine */
  }
}

