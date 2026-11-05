// Capri's roaming engine — near-verbatim port of capri-desktop-0.4.0
// src/renderer/js/capri.js (1653 lines). Where the browser cannot do what the desktop
// does, the line carries an `adaptation:` note; nothing here talks to AI or APIs.
//
// Her life: on-twos drawing loop (on-ones while moving/falling, 6fps asleep), twitch/shed/
// gaze/wander timers, pointer notice with the menace, drag with a 5px threshold, throw and
// gravity drop onto ledges, teleport with slit/beam/streak and two impact frames, fold into
// her biochip, dissolve to her mask when she sleeps too long, the satellite and the red
// light she sends up, possession of the window she sits on, and showing you things with a
// reticle.

import { SPRITE } from './capriSprite.js';
import { ACTS, Player, NEUTRAL } from './capriActing.js';
import { hitAt, buildAlphaMap } from './capriHit.js';
import {
  wanderChoice, dropAction, noticeDecision, shouldSleep, shouldDoze, SLEEP_AFTER, DOZE_AFTER,
} from './capriBehave.js';
import { rand, pick, clamp, lerp, ease, tween, sleep, reducedMotion } from './capriUtil.js';
import { fxReduced } from './capriFx.js';
import { Mask } from './capriChip.js';

const ON_TWOS = 1000 / 12;
const ON_ONES = 1000 / 24;
const ASLEEP = 1000 / 6;
const GRAVITY = 2600; // px/s²
const THIGH = 73;     // hip to knee, sprite px (see capriSprite.js)

const GREEN = [0.21, 1, 0.48];
const INK = [0.08, 0.06, 0.11];
const RED = [1, 0.13, 0.32];

const UPLINK_DAY = 'shiroo.capri.uplinkDay'; // the last day she sent the red light up
// the local date, YYYY-MM-DD (desktop util.today)
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// adaptation: the desktop overlays the whole OS with no chrome; this page has a header
// bar she must not slide under and a bottom marquee/mobile bar she stands above.
const headerH = () => (window.innerWidth <= 640 ? 50 : 56);
const barH = () => (window.innerWidth <= 900 ? 96 : 92); // keeps her feet clear of the footer line

const LEDGE_SELECTOR = [
  '.lm-row', '.landing-kicker', '.sec-head', '.work-head', '.quirk-tab',
  '.stack-group h3', '.fact h3', '.terminal-bar', '.idcard', '.order h3',
  '.bottle', '.contact-card',
].join(',');

let ledgeSeq = 0;

export class Roamer {
  constructor({ root, canvas, maskCanvas, image, scale, voice, getFx, chipAt, onPoke, onStow, onMove }) {
    this.root = root;
    this.canvas = canvas;
    this.sprite = canvas.__capriSprite; // set by the shell after SpriteRenderer init
    this.voice = voice;
    this.getFx = getFx;               // fx loads its cels async; never assume it exists
    this.chipAt = chipAt;             // () => her biochip's middle on screen
    this.onPoke = onPoke;
    this.onStow = onStow;
    this.onMove = onMove;

    this.scale = scale;
    this.view = { w: window.innerWidth, h: window.innerHeight, floor: window.innerHeight - barH() };
    this.pos = { x: this.view.w - 200, y: this.view.floor }; // her feet
    this.facing = 1;
    this.mode = 'idle'; // idle | sleep (work/alert were Claude's; there is no Claude here)
    this.stance = 'stand';
    this.perch = null;    // { id, dx }
    this.peekSide = null;
    this.busy = false;
    this.hidden = false;
    this.stowed = false;
    this.stowing = false;
    this.dormant = false; // asleep, down to her mask
    this.dragging = false;

    this.p = {
      seed: 0, boil: 0.9, hair: 0, head: 0, mane: 0, armL: 0, armR: 0, longL: 1, longR: 1,
      sit: 0, kickL: 0, kickR: 0,
      smear: [0, 0], echo: [0, 0],
      glitch: 0, glitchSeed: 0, split: 0, collapse: 0, dissolve: 0, sparkle: 1, grade: 1,
      sil: INK, silAmount: 0, misreg: [-2.6, 2.2], alpha: 1,
    };
    this.bob = 0;
    this.tilt = 0;
    this.sx = 1;
    this.sy = 1;
    this.base = new Player('stand');
    this.baseIndex = -1;
    this.act = null;
    this.lastDraw = 0;
    this.dead = false;

    const now = performance.now();
    this.lastActivity = now;
    this.nextTwitch = now + rand(1500, 3500);
    this.nextMove = now + rand(2500, 5000);
    this.nextGaze = now + rand(20000, 45000);
    this.nextShed = now + rand(2000, 5000);
    this.nextNotice = 0;
    this.peekUntil = 0;
    this.sleptAt = 0;
    this.uplinkDue = false;
    this.pointing = null;
    this.mouse = null;
    this.sky = null;
    this.zapAt = null;
    this.dozedOn = null;
    this.unstowAfter = false;
    this.pending = null;
    this.lastTap = 0;

    this.onTeleport = null;
    this.onDoze = null;
    this.onSpeak = null;

    this.alphaMap = buildAlphaMap(image);
    this.mask = maskCanvas ? new Mask(maskCanvas) : null;
    this.maskStir = 0;

    this.pivot();
    this.bindPointer();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- geometry ----------

  setView(w, h, floor = h) {
    this.view = { w, h, floor };
    if (this.stance === 'stand') {
      this.pos.x = clamp(this.pos.x, 60, w - 60);
      this.pos.y = clamp(this.pos.y, SPRITE.height * this.scale + headerH(), floor - 4);
    }
    this.place();
  }

  // Flip, lean and squash all pivot on her feet, or on her seat when she sits on a ledge
  // (so a squash presses her onto it instead of pulling her down through it).
  pivot() {
    const s = this.scale;
    const fx = (SPRITE.pad + SPRITE.feet.x) * s;
    const fy = (SPRITE.pad + (this.stance === 'sit' ? SPRITE.hip : SPRITE.feet.y)) * s;
    this.canvas.style.transformOrigin = `${fx}px ${fy}px`;
  }

  get upside() {
    return this.stance === 'peek' && this.peekSide === 'top';
  }

  get floor() {
    return this.view.floor - 6;
  }

  place() {
    if (this.dead) return;
    const s = this.scale;
    const left = this.pos.x - (SPRITE.pad + SPRITE.feet.x) * s;
    const top = this.pos.y - (SPRITE.pad + SPRITE.feet.y) * s + this.bob;
    const turn = (this.upside ? 180 : 0) + this.tilt;
    this.root.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    this.canvas.style.transform = `rotate(${turn.toFixed(2)}deg) scale(${(this.facing * this.sx).toFixed(3)}, ${this.sy.toFixed(3)})`;
    this.onMove?.(this.head());
  }

  // her face on screen, plus `top`: the tips of her mane
  head(at = this.pos, facing = this.facing) {
    const s = this.scale;
    const bob = at === this.pos ? this.bob : 0;
    const dx = (SPRITE.head.x - SPRITE.feet.x) * s * facing;
    const dy = (SPRITE.feet.y - SPRITE.head.y) * s;
    if (at === this.pos && this.upside) {
      const y = at.y + dy + bob;
      return { x: at.x - dx, y, top: y - 30 * s };
    }
    return { x: at.x + dx, y: at.y - dy + bob, top: at.y - SPRITE.feet.y * s + bob };
  }

  hit(x, y, radius) {
    if (this.hidden || this.stowed || this.dormant) return false;
    const r = radius ?? (this.scale < 0.7 ? 20 : 8);
    return hitAt(this.alphaMap, x, y, {
      pos: this.pos, bob: this.bob, scale: this.scale, facing: this.facing,
      upside: this.upside, sit: this.p.sit, alpha: this.p.alpha, hidden: this.hidden,
    }, r);
  }

  faceCenter() {
    this.facing = this.pos.x > this.view.w / 2 ? 1 : -1;
  }

  towardCenter() {
    return this.pos.x > this.view.w / 2 ? -1 : 1;
  }

  faceToward(x) {
    this.facing = x < this.pos.x ? 1 : -1;
  }

  // A point of the sprite (sprite px) on screen, where she stands, the way she faces.
  toScreen(sx, sy) {
    const s = this.scale;
    return {
      x: this.pos.x + (sx - SPRITE.feet.x) * s * this.facing,
      y: this.pos.y - (SPRITE.feet.y - sy) * s + this.bob,
    };
  }

  // Which arm points to screen side `dir`: 'L' or 'R' (the sprite may be mirrored).
  armToward(dir) {
    return dir * this.facing < 0 ? 'L' : 'R';
  }

  // Shoulder and hand of one arm on screen, at the arm's current angle (same turn as the shader).
  limb(side) {
    const { shoulder, hand, mirror } = SPRITE;
    const a = side === 'L' ? this.p.armL : this.p.armR;
    const k = side === 'L' ? this.p.longL : this.p.longR;
    const vx = (hand.x - shoulder.x) * k, vy = (hand.y - shoulder.y) * k;
    let hx = shoulder.x + Math.cos(a) * vx - Math.sin(a) * vy;
    const hy = shoulder.y + Math.sin(a) * vx + Math.cos(a) * vy;
    let sx = shoulder.x;
    if (side === 'R') {
      hx = mirror - hx;
      sx = mirror - sx;
    }
    return { shoulder: this.toScreen(sx, shoulder.y), hand: this.toScreen(hx, hy) };
  }

  // Points on her mane, where her white specks are (for the stars that lift off it).
  manePoints(n) {
    const s = this.scale;
    const h = this.head();
    return Array.from({ length: n }, () => {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
      return { x: h.x + Math.cos(a) * r * 92 * s, y: h.y - 44 * s + Math.sin(a) * r * 66 * s };
    });
  }

  // How far her head has moved since her stars lifted off it.
  moved() {
    const was = this.sky?.head;
    if (!was) return [0, 0];
    const h = this.head();
    return [h.x - was.x, h.y - was.y];
  }

  spot(name) {
    const { w } = this.view;
    const s = this.scale;
    const side = 150 * s + 30;
    switch (name) {
      case 'post':
        return { x: w - side - 30, y: this.floor };
      case 'stage':
        return { x: w * 0.5 + rand(-w * 0.12, w * 0.12), y: this.floor };
      case 'chip': // next to her biochip, bottom left
        return { x: side + 30, y: this.floor };
      default: {
        const y = Math.random() < 0.65 ? this.floor : rand(SPRITE.height * s + 200 + headerH(), this.floor);
        let x = rand(side, w - side);
        if (Math.abs(x - this.pos.x) < w * 0.2) x = clamp(w - x, side, w - side);
        return { x, y };
      }
    }
  }

  // ---------- ledges ----------

  // adaptation: the desktop asks Windows which windows are open. Here the portfolio's own
  // DOM elements are the windows: her screen is the page.
  findWins() {
    const out = [];
    for (const el of document.querySelectorAll(LEDGE_SELECTOR)) {
      if (!el.dataset.capriId) el.dataset.capriId = `l${ledgeSeq++}`;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > this.view.h || r.right < 0 || r.left > this.view.w) continue;
      out.push({ id: el.dataset.capriId, el, x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return out;
  }

  perchWin(id, wins = this.findWins()) {
    return wins.find((w) => w.id === id) || null;
  }

  // Where her feet go so that her hips rest on the window's top edge.
  seat(win, dx) {
    return { x: win.x + dx, y: win.y + 3 + (SPRITE.feet.y - SPRITE.hip) * this.scale };
  }

  canSit(win) {
    const roomAbove = SPRITE.hip * this.scale + 12;
    return win.w > 260 && win.y > Math.max(roomAbove, headerH()) && win.y < this.view.floor - 80;
  }

  // adaptation: DOM has no stacking order worth modelling — nothing covers her seat.
  covered() {
    return false;
  }

  pickSeat({ except = null, wins = this.findWins() } = {}) {
    for (const win of wins) {
      if (win.id === except || !this.canSit(win)) continue;
      const dx = clamp(rand(win.w * 0.18, win.w * 0.6), 60, Math.max(60, win.w - 190));
      return { win, dx };
    }
    return null;
  }

  // Where she'd end up falling straight down from here: a free ledge under her, or the floor.
  landing() {
    const hip = this.pos.y - (SPRITE.feet.y - SPRITE.hip) * this.scale;
    let best = null;
    for (const win of this.findWins()) {
      if (!this.canSit(win) || win.y < hip - 4) continue;
      if (this.pos.x < win.x + 40 || this.pos.x > win.x + win.w - 40) continue;
      if (!best || win.y < best.y) best = win;
    }
    if (best) {
      const dx = this.pos.x - best.x;
      return { y: this.seat(best, dx).y, stance: 'sit', perch: { id: best.id, dx } };
    }
    return { y: this.floor, stance: 'stand', perch: null };
  }

  // ---------- frame loop ----------

  interval() {
    if (this.busy || this.stance === 'fall' || this.act?.player.act.fps === 24) return ON_ONES;
    return this.mode === 'sleep' ? ASLEEP : ON_TWOS;
  }

  loop(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.hidden || this.stowed || this.dormant) return;
    if (now - this.lastDraw < this.interval() - 1) {
      this.updateFallStepping(now);
      return;
    }
    this.drawFrame(now);
    this.behave(now);
  }

  // falling keeps its physics at display rate; only the drawings step
  updateFallStepping(now) {
    if (this.stance === 'fall') this.updateFall(now);
  }

  drawFrame(now = performance.now()) {
    if (this.dead) return;
    this.lastDraw = now;
    this.animate(now);
    this.sprite?.draw(this.p);
    this.place();
  }

  // Pick the drawing: the stance's cycle underneath, the current act on top.
  animate(now) {
    const p = this.p;
    p.seed = Math.random() * 100; // a fresh drawing, so the line boils

    // adaptation: ride her ledge as the page scrolls (the desktop's windows only move
    // when their owner moves them; setWindows did the same job there).
    if (this.stance === 'sit' && this.perch) {
      const win = this.perchWin(this.perch.id);
      if (!win || !this.canSit(win)) this.fall();
      else {
        const dx = clamp(this.perch.dx, 50, Math.max(50, win.w - 60));
        const to = this.seat(win, dx);
        if (to.x !== this.pos.x || to.y !== this.pos.y) this.pos = to;
      }
    }

    const under = this.base.sample(now);
    const base = under ? this.base.resolve(under.pose, this.facing) : {};
    let act = null;
    let cue = null;
    if (under && under.index !== this.baseIndex) {
      this.baseIndex = under.index;
      if (!this.act) cue = under.cue; // the stance's own cues, when no act is on top
    }
    if (this.act) {
      const drawing = this.act.player.sample(now);
      if (drawing) {
        act = this.act.player.resolve(drawing.pose, this.facing);
        if (drawing.index !== this.act.index) {
          this.act.index = drawing.index;
          cue = drawing.cue;
        }
      } else {
        this.endAct(true);
      }
    }
    const pose = { ...NEUTRAL, ...base, ...act };
    if (this.mode === 'sleep' && this.stance === 'sit' && !act) {
      Object.assign(pose, { head: 0.12, mane: -0.1, kickL: 0.03, kickR: 0.03, armL: -0.45, armR: -0.45 }); // dozing on the ledge
    }

    p.head = pose.head;
    p.mane = pose.mane;
    p.hair = pose.hair;
    p.armL = pose.armL;
    p.armR = pose.armR;
    p.longL = pose.longL;
    p.longR = pose.longR;
    p.kickL = pose.kickL;
    p.kickR = pose.kickR;
    p.smear = pose.smear;
    p.echo = pose.echo;
    // on a ledge she stays seated: no lifting off it, no sinking through it
    const bob = this.stance === 'sit' ? clamp(pose.bob, -3, 2) : pose.bob;
    this.bob = this.dragging ? 0 : bob;
    this.tilt = this.dragging ? 0 : pose.tilt;
    this.sx = pose.sx;
    this.sy = pose.sy;
    if (cue) this.onCue(cue);
  }

  // ---------- behaviour ----------

  behave(now) {
    if (this.stance === 'fall') return; // updateFall runs at display rate in loop()
    if (this.busy || this.dragging) return;

    if (now > this.nextTwitch) {
      this.nextTwitch = now + rand(2000, 5000);
      if (!reducedMotion.matches && this.mode !== 'sleep') this.twitch();
    }

    // a shard of her mane breaks off now and then and drifts away
    if (now > this.nextShed) {
      this.nextShed = now + rand(3000, 7000) * (this.mode === 'sleep' ? 2.5 : 1);
      if (!reducedMotion.matches && this.stance !== 'peek') this.shed();
    }

    if (this.mode === 'idle' && this.stance !== 'peek' && now > this.nextGaze) {
      this.nextGaze = now + rand(40000, 80000);
      this.gaze();
    }

    if (this.mode === 'idle' && shouldSleep(now, this.lastActivity)) this.setMode('sleep');
    if (this.mode === 'sleep' && shouldDoze(now, this.sleptAt)) {
      this.doze();
      return;
    }

    if (this.stance === 'peek' && now > this.peekUntil) {
      this.unpeek();
      return;
    }

    if (this.mode === 'idle' && now > this.nextMove) {
      this.nextMove = now + rand(3000, 6500);
      this.wanderStep();
    }
  }

  // What she does with herself when nobody needs her: petakilan / lively.
  wanderStep() {
    if (this.stance === 'peek' || this.busy) return;
    const r = Math.random();
    if (r < 0.28) {
      this.perform(pick(['hop', 'hop', 'victory']));
    } else if (r < 0.52) {
      this.perform(pick(['spin', 'curious', 'turn', 'split']), this.towardCenter());
    } else if (r < 0.78) {
      this.teleport(this.spot('random'));
    } else {
      this.peek();
    }
  }

  flourish() {
    if (this.stance === 'sit') this.perform(pick(['look', 'look', 'split']));
    else this.perform(pick(['spin', 'look', 'hop', 'curious', 'split', 'victory']), this.towardCenter());
  }

  // ---------- acting ----------

  // Play an act from acting.js. Resolves when it's over (or cut off by a stronger one).
  perform(name, dir = 0, { reach = 1 } = {}) {
    if (this.stowed || this.dormant) return Promise.resolve(); // nobody to act: she's in her biochip, or just her mask
    const act = ACTS[name];
    if (reducedMotion.matches && act.fps === 24) {
      if (act.flip) this.facing *= -1;
      return Promise.resolve();
    }
    const next = new Player(name, { dir, reach });
    if (this.act && this.act.player.priority > next.priority) return Promise.resolve();
    this.endAct(false);
    this.onAct?.(name);
    return new Promise((done) => {
      this.act = { player: next, done, index: -1 };
    });
  }

  endAct(completed) {
    const current = this.act;
    if (!current) return;
    this.act = null;
    this.onAct?.(null);
    if (completed && current.player.act.flip) this.facing *= -1;
    current.done();
  }

  setStance(stance, { perch = null, peekSide = null, dir = 0 } = {}) {
    this.stance = stance;
    this.perch = perch;
    this.peekSide = peekSide;
    this.p.sit = stance === 'sit' ? 1 : 0;
    this.base = this.restBase(dir);
    this.pivot();
  }

  // The cycle under her acts: her stance's, or holding her arm out at what she's showing you.
  restBase(dir = 0) {
    const pt = this.pointing;
    if (pt && (this.stance === 'stand' || this.stance === 'sit')) return new Player('pointing', { dir: pt.dir, reach: pt.reach });
    const name = this.baseAct();
    const peekDir = this.stance === 'peek' ? (this.peekSide === 'left' ? 1 : this.peekSide === 'right' ? -1 : this.towardCenter()) : dir;
    return new Player(name, { dir: name === 'peek' ? peekDir : dir });
  }

  baseAct() {
    if (this.stance === 'sit') return 'sit';
    if (this.stance === 'peek') return 'peek';
    if (this.stance === 'fall') return 'fall';
    return this.mode === 'sleep' ? 'sleep' : 'stand';
  }

  // ---------- modes ----------

  setMode(mode) {
    const now = performance.now();
    if (mode !== 'sleep') this.lastActivity = now;
    // after anything happens, stay put a while (so she doesn't wander off right after "done")
    this.nextMove = Math.max(this.nextMove, now + rand(55000, 120000));
    this.nextGaze = Math.max(this.nextGaze, now + rand(30000, 70000));
    if (this.mode === mode) return;
    const prev = this.mode;
    this.mode = mode;
    if (mode === 'sleep') this.sleptAt = now;
    if (this.stance === 'stand') this.base = this.restBase();
    const p = this.p;
    if (mode === 'sleep') tween(p, { alpha: 0.55, sparkle: 0.35, boil: 0.4 }, 900, ease.inOut);
    else tween(p, { alpha: 1, sparkle: 1, boil: 0.9 }, 250, ease.out);
    this.onMode?.(mode, prev);
  }

  wake() {
    if (this.mode === 'sleep') this.setMode('idle');
    this.lastActivity = performance.now();
    if (this.dormant) this.rouse(); // down to her mask: she comes back
  }

  // Claude did something — here, the page did something: come out of hiding.
  attend() {
    this.wake();
    if (this.stance === 'peek' && !this.busy) this.teleport(this.spot('post'));
  }

  // ---------- idle life ----------

  twitch() {
    const p = this.p;
    p.glitchSeed = Math.random() * 100;
    p.glitch = rand(0.15, 0.3);
    p.split = 2;
    setTimeout(() => {
      p.glitch = 0;
      p.split = 0;
    }, ON_TWOS * 2);
  }

  // a small jolt each time something happens on the page
  pulse() {
    if (this.busy || reducedMotion.matches) return;
    const p = this.p;
    p.glitchSeed = Math.random() * 100;
    p.glitch = 0.12;
    setTimeout(() => { p.glitch = 0; }, ON_TWOS);
  }

  shed() {
    const fx = this.getFx();
    if (!fx) return;
    const s = this.scale;
    const h = this.head();
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05); // somewhere on the upper rim of the mane
    const r = rand(70, 100) * s;
    fx.drift(h.x + Math.cos(a) * r, h.y - 40 * s + Math.sin(a) * r * 0.85, a);
  }

  // ---------- the satellite ----------

  gaze({ big } = {}) {
    const fx = this.getFx();
    if (!fx || this.busy || this.hidden || this.act || this.stance === 'peek' || this.stance === 'fall') return false;
    if (fxReduced()) return false; // no satellite, no strobe: she just looks elsewhere
    big ??= this.uplinkDue || this.lastUplinkDay() !== today();
    if (reducedMotion.matches) big = false; // no strobing bolt
    if (big) {
      this.uplinkDue = false;
      try {
        localStorage.setItem(UPLINK_DAY, today());
      } catch {
        // no storage: she'll just do it again next launch
      }
    }
    const dir = this.towardCenter();
    const { w } = this.view;
    const side = this.armToward(dir);
    const { shoulder } = this.limb(side);
    // up and well off to the side, so her arm points at it clear of her mane
    const y = clamp(shoulder.y - rand(280, 400), 50, shoulder.y - 180);
    const x = clamp(shoulder.x + dir * rand(380, 520), 40, w - 40);
    const to = { x: clamp(x + dir * rand(170, 260), 30, w - 30), y: y - rand(10, 40) };
    const sat = fx.satellite({ x, y }, to, { duration: 9500 });
    // how far up the arm must come to point at it right now (it hangs ~30 degrees low at rest)
    const reach = () => {
      const at = sat.pos();
      const sh = this.limb(side).shoulder;
      return clamp(Math.atan2(sh.y - at.y, Math.abs(at.x - sh.x)) + 0.52, 0.5, 1.6);
    };
    // from her fingertips to it
    const road = () => [this.limb(side).hand, sat.pos()];
    this.sky = { sat, road, dir, side, motes: null, surge: null, head: null };
    this.perform(big ? 'uplink' : 'gaze', dir, { reach }).then(() => {
      this.clearSky();
    });
    return true;
  }

  lastUplinkDay() {
    try {
      return localStorage.getItem(UPLINK_DAY);
    } catch {
      return null;
    }
  }

  // something just finished: the next time she looks up, once things have settled, it's the whole thing.
  earnUplink() {
    this.uplinkDue = true;
    this.nextGaze = performance.now() + rand(25000, 40000);
  }

  clearSky() {
    if (!this.sky) return;
    const { sat, motes, surge } = this.sky;
    surge?.break();
    motes?.home(...this.moved());
    sat.fade();
    this.sky = null;
    tween(this.p, { sparkle: this.mode === 'sleep' ? 0.35 : 1 }, 400, ease.out);
  }

  // ---------- the menace ----------

  zap(x, y) {
    if (this.busy || this.hidden || this.act || reducedMotion.matches || this.stance !== 'stand') return false;
    const dir = x < this.pos.x ? -1 : 1;
    const side = this.armToward(dir);
    const reach = () => {
      const sh = this.limb(side).shoulder;
      return clamp(Math.atan2(sh.y - y, Math.abs(x - sh.x)) + 0.52, -0.3, 1.6);
    };
    this.zapAt = { x, y, side, dir };
    this.perform('zap', dir, { reach });
    return true;
  }

  // Where a cut-in goes: next to her head on the `dir` side, else on the other side
  // (unless `flip` is off because something is going on there), else over her mane.
  cutinAt(dir, { flip = true } = {}) {
    const s = this.scale;
    const h = this.head();
    const gap = 85 * s + 24, width = 274; // the band plus its slant, see fx.js
    const fits = (d) => (d > 0 ? h.x + gap + width < this.view.w - 8 : h.x - gap - width > 8);
    if (fits(dir)) return [h.x + dir * gap, h.y - 18, dir];
    if (flip && fits(-dir)) return [h.x - dir * gap, h.y - 18, -dir];
    return [clamp(h.x - width / 2, 8, this.view.w - width - 8), Math.max(headerH(), h.top - 58), 1];
  }

  // Flat-colour impact frames, one drawing each.
  async flash(colors) {
    const p = this.p;
    for (const color of colors) {
      p.sil = color;
      p.silAmount = 1;
      this.drawFrame();
      await sleep(ON_ONES);
      if (this.dead) return;
    }
    p.silAmount = 0;
  }

  // Effects and sounds pinned to drawings of an act (the third item of a key in acting.js).
  onCue(cue) {
    const fx = this.getFx();
    if (!fx) return;
    // adaptation: the desktop's fx.js never checked the OS motion setting; on the web a
    // strobe of shards and bolts is what that setting exists to stop.
    if (fxReduced()) return;
    const s = this.scale;
    const h = this.head();
    const mane = { x: h.x, y: h.y - 40 * s };
    const { voice } = this;
    switch (cue) {
      case 'gather': // shards sucked into the mane before it blows
        fx.burst(mane.x, mane.y, { count: 18, inward: true, power: 0.7, spread: 170 * s });
        break;
      case 'launch':
        voice.play('rise');
        fx.slices(h.x - 70 * s, h.y - 40 * s, 170 * s, 300 * s, { count: 5 });
        break;
      case 'peak':
        voice.play('done');
        fx.lines(mane.x, mane.y, { inner: 150 * s + 30 });
        fx.ring(mane.x, mane.y);
        fx.burst(mane.x, mane.y, { count: 34, power: 1.2, spread: 140 * s });
        setTimeout(() => this.flash([GREEN, INK, GREEN]), 0);
        break;
      case 'speak':
        this.fireSpeak();
        break;
      case 'laugh':
        fx.cutin(...this.cutinAt(this.act?.player.dir || this.towardCenter()), { kind: pick(['laugh', 'grin']) });
        break;
      case 'stare': // every eye she has, on you
        fx.cutin(...this.cutinAt(this.act?.player.dir || this.towardCenter()), { kind: 'many', life: 640 });
        break;
      case 'notice':
        this.twitch();
        break;
      case 'zap':
        if (this.zapAt) {
          const { x, y, side } = this.zapAt;
          fx.bolt(this.limb(side).hand, { x, y }, { life: 240, forks: 2, width: 3 });
          fx.burst(x, y, { count: 8, power: 0.35, spread: 16 });
          fx.ring(x, y, { size: 0.22 });
          voice.play('bolt');
        }
        break;
      case 'grin':
        if (this.zapAt && Math.random() < 0.6) fx.cutin(...this.cutinAt(-this.zapAt.dir), { kind: 'look', life: 560 });
        this.zapAt = null;
        break;
      // pointing at something (pointAt)
      case 'spot': // her head snaps to it: a glint where she's looking
        if (this.pointing) {
          const { aim } = this.pointing;
          fx.ring(aim.x, aim.y, { size: 0.18 });
          voice.play('tick');
        }
        break;
      case 'coil': // winding up: shards pulled into her, a crackle
        fx.burst(h.x, h.y + 40 * s, { count: 10, inward: true, power: 0.45, spread: 90 * s });
        voice.play('bolt', { soft: true });
        break;
      case 'lock': { // the strike: lightning off her fingertip, the reticle slams onto it
        const pt = this.pointing;
        if (pt && !pt.pointer) {
          const hand = this.limb(pt.side).hand;
          pt.pointer = fx.pointer(() => this.limb(pt.side).hand, pt.rect, pt.aim, { label: pt.label });
          if (!reducedMotion.matches) {
            fx.bolt(hand, pt.aim, { life: 260, forks: 3, width: 3 });
            fx.ring(pt.aim.x, pt.aim.y, { size: 0.55 });
            fx.burst(pt.aim.x, pt.aim.y, { count: 12, power: 0.5, spread: 20 });
            // her eyes lock on, on the side away from it
            fx.cutin(...this.cutinAt(-pt.dir, { flip: false }), { kind: 'eyes', life: 480 });
          }
          voice.play('bolt');
        }
        break;
      }
      case 'tap':
        this.pointing?.pointer?.tap();
        break;
      case 'minds':
        this.twitch();
        break;
      case 'snap':
        this.twitch();
        voice.play('tick');
        break;
      default:
        if (this.sky) this.skyCue(cue);
        break;
    }
  }

  // The satellite's cues (acting.js "gaze" and "uplink").
  skyCue(cue) {
    const fx = this.getFx();
    if (!fx || fxReduced()) return;
    const s = this.scale;
    const sky = this.sky;
    const { voice } = this;
    const hand = () => this.limb(sky.side).hand;
    switch (cue) {
      case 'glint':
        voice.play('star');
        break;
      case 'starlight': // her specks catch its light
        tween(this.p, { sparkle: 1.8 }, 500, ease.out);
        break;
      case 'stars': // they lift off and become a sky; her mane goes dark without them
        sky.head = this.head();
        sky.motes = fx.motes(this.manePoints(30), { lift: 230 * s + 60, spread: 320 * s + 80 });
        tween(this.p, { sparkle: 0.15 }, 500, ease.out);
        break;
      case 'align': // into a road, from her fingers to it
        sky.motes?.align(sky.road);
        voice.play('tick');
        break;
      case 'charge': {
        fx.crackle(hand, { life: 640, radius: 70 * s + 14, count: 3 });
        const at = hand();
        fx.burst(at.x, at.y, { count: 14, inward: true, power: 0.5, spread: 90 * s });
        fx.cutin(...this.cutinAt(-sky.dir, { flip: false }), { kind: 'eyes', life: 600 }); // never over the road
        voice.play('charge');
        break;
      }
      case 'surge': { // the red light goes up
        const at = hand();
        sky.surge = fx.surge(sky.road, {
          onHit: () => {
            const top = sky.sat.pos();
            sky.sat.twinkle(1.25);
            fx.ring(top.x, top.y, { size: 0.55 });
            fx.lines(top.x, top.y, { inner: 60, life: 460 });
            voice.play('star');
          },
        });
        sky.motes?.light(125);
        fx.ring(at.x, at.y, { size: 0.6 });
        this.flash([INK, RED]);
        voice.play('bolt');
        voice.play('rise');
        break;
      }
      case 'break':
        sky.surge?.break();
        sky.surge = null;
        sky.motes?.dim();
        voice.play('tick');
        break;
      case 'twinkle': { // and it answers
        const at = sky.sat.pos();
        sky.sat.twinkle(1);
        fx.ring(at.x, at.y, { size: 0.4 });
        voice.play('star');
        break;
      }
      case 'glimmer':
        sky.sat.twinkle(0.55);
        if (!sky.motes) voice.play('star');
        break;
      case 'home': // her stars come back to her, and her mane lights up with them
        sky.motes?.home(...this.moved());
        sky.motes = null;
        tween(this.p, { sparkle: 1.7 }, 400, ease.out).then(() => tween(this.p, { sparkle: 1 }, 700, ease.inOut));
        break;
    }
  }

  fireSpeak() {
    const fn = this.onSpeak;
    this.onSpeak = null;
    fn?.();
  }

  // Job done (a drink poured, the door found): the victory sequence, its effects on cue.
  // onSpeak runs when she comes back down, or at the end if anything cut it short.
  async celebrate({ onSpeak } = {}) {
    this.onSpeak = onSpeak;
    if (reducedMotion.matches || this.stowed || this.dormant) {
      this.voice.play('done');
      this.fireSpeak();
      return;
    }
    this.wake();
    await this.perform('victory', this.towardCenter());
    this.fireSpeak();
  }

  // ---------- moving around ----------

  // Collapse into a line of light and go. Leaves her invisible; the caller puts her somewhere.
  async vanish({ beam = true } = {}) {
    const fx = this.getFx();
    const p = this.p;
    const s = this.scale;
    const from = { ...this.pos };
    const head = this.head();
    if (this.sky) this.endAct(false); // the satellite stays here, she doesn't
    this.stopPointing(); // nor does what she was showing you
    if (reducedMotion.matches) {
      await tween(p, { alpha: 0 }, 160, ease.linear);
      return head;
    }
    this.voice.play('teleport-out');
    p.glitchSeed = Math.random() * 100;
    await tween(p, { glitch: 0.35, split: 3 }, 90, ease.linear);
    fx?.burst(head.x, head.y + 70 * s, { count: 22, spread: 150 * s });
    fx?.slices(head.x - 70 * s, head.y - 40 * s, 170 * s, 320 * s);
    await tween(p, { collapse: 1, glitch: 1, dissolve: 0.5, split: 9 }, 170, ease.in);
    p.alpha = 0;
    const ground = from.y - (p.sit ? (SPRITE.feet.y - SPRITE.hip) * s : 0);
    if (!this.upside && fx) {
      // the void she leaves behind, like in the show: a black slit with a red line in it
      fx.slit(from.x - 10 * s * this.facing, head.top, ground, { width: 56 * s + 10 });
      if (beam) fx.beam(from.x, ground, { width: 40 * s + 8 });
    }
    return head;
  }

  // Come back at `to`: a column of light down to her, the body unfolding, two impact frames.
  async arrive(to, { face = null, stance = 'stand', perch = null, peekSide = null, dir = 0, fromHead = null, beam = true } = {}) {
    const fx = this.getFx();
    const p = this.p;
    const s = this.scale;
    const facing = face ?? (to.x > this.view.w / 2 ? 1 : -1);
    const toHead = this.head(to, facing);
    if (fromHead && !reducedMotion.matches && fx) {
      fx.streak(fromHead.x, fromHead.y, toHead.x, toHead.y);
      await sleep(60);
    }
    this.pos = { ...to };
    this.facing = facing;
    this.setStance(stance, { perch, peekSide, dir });
    this.place();

    if (reducedMotion.matches) {
      p.collapse = 0;
      p.dissolve = 0;
      await tween(p, { alpha: this.mode === 'sleep' ? 0.55 : 1 }, 160, ease.linear);
      return;
    }
    const ground = stance === 'sit' ? to.y - (SPRITE.feet.y - SPRITE.hip) * s : to.y;
    if (beam) fx?.beam(to.x, ground, { down: true, width: 40 * s + 8 });
    // her pieces spiral back in, mane shards and green eye-stars
    fx?.vortex(toHead.x, toHead.y + 30 * s, { radius: 170 * s + 40 });
    this.voice.play('teleport-in');
    await sleep(50);

    p.alpha = this.mode === 'sleep' ? 0.55 : 1;
    p.glitchSeed = Math.random() * 100;
    await tween(p, { collapse: 0, dissolve: 0, glitch: 0.6, split: 6 }, 200, ease.out);

    // two impact frames, the anime way
    p.sil = GREEN;
    p.silAmount = 1;
    this.drawFrame();
    await sleep(ON_ONES);
    p.sil = INK;
    this.drawFrame();
    await sleep(ON_ONES);
    p.silAmount = 0;
    fx?.burst(toHead.x, toHead.y + 60 * s, { count: 10, power: 0.55, spread: 110 * s });
    if (stance === 'sit') this.perform('plop');
    await tween(p, { glitch: 0, split: 0 }, 220, ease.out);
  }

  // Leave in a column of light, reappear somewhere else.
  async teleport(to, opts = {}) {
    if (this.stowed) return; // put away: she stays in her biochip
    if (this.busy || this.dormant) {
      this.pending = { to, opts };
      if (this.dormant) this.rouse(); // asleep, down to her mask: she comes back first, then goes
      return;
    }
    this.busy = true;
    this.wake();
    this.onTeleport?.('start');
    const fromHead = await this.vanish();
    await sleep(70);
    await this.arrive(to, { ...opts, fromHead });
    await this.settle();
  }

  // After a move: free again, stay put a little, then keep active.
  async settle() {
    this.busy = false;
    this.nextMove = performance.now() + rand(2500, 5000);
    this.onTeleport?.('end');
    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      await this.teleport(next.to, next.opts);
    }
  }

  // She folds herself into her biochip (a little cock of the head, in tight, then the streak
  // down to the corner). Asleep down to her mask, it's the mask that goes.
  async stow() {
    if (this.stowed || this.stowing) return;
    this.stowing = true;
    this.dragging = false; // put away mid-drag: let go first, or she keeps following the pointer
    for (let i = 0; this.busy && i < 30; i++) await sleep(100); // let a move finish
    this.busy = true;
    this.endAct(false);
    this.onTeleport?.('start');
    const fx = this.getFx();
    let from = null;
    if (this.dormant) {
      from = this.head();
      this.dormant = false;
      this.mask?.hide(); // the sleep mask is a separate canvas: it must go too, or it floats beside the chip
      this.onDoze?.('end');
    }
    if (reducedMotion.matches || !fx) {
      await tween(this.p, { alpha: 0 }, 160, ease.linear);
    } else {
      if (!from) {
        await this.perform('fold');
        from = await this.vanish({ beam: false });
      }
      const chip = this.chipAt();
      fx.streak(from.x, from.y, chip.x, chip.y);
      await sleep(60);
      fx.burst(chip.x, chip.y, { count: 12, inward: true, power: 0.45, spread: 40 });
      fx.ring(chip.x, chip.y, { size: 0.3 });
      this.voice.play('land');
    }
    this.setStance('stand');
    this.stowed = true;
    this.stowing = false;
    this.hidden = true;
    this.root.hidden = true;
    this.onStow?.();
    this.busy = false;
    if (this.unstowAfter) this.unstow(); // called back out while she was folding herself away
  }

  // Out of her biochip: a streak from the chip, and she arrives next to it.
  async unstow() {
    this.unstowAfter = this.stowing;
    if (!this.stowed) return;
    this.stowed = false;
    this.busy = true;
    this.hidden = false;
    this.root.hidden = false;
    if (this.mode === 'sleep') this.setMode('idle');
    this.lastActivity = performance.now();
    Object.assign(this.p, { alpha: 0, collapse: 1, dissolve: 0.5, glitch: 0, split: 0 });
    const fx = this.getFx();
    const chip = this.chipAt();
    const to = this.spot('chip');
    const face = to.x > this.view.w / 2 ? 1 : -1;
    if (fx && !reducedMotion.matches) {
      const toHead = this.head(to, face);
      fx.burst(chip.x, chip.y, { count: 10, power: 0.5, spread: 30 });
      fx.streak(chip.x, chip.y, toHead.x, toHead.y);
      await sleep(60);
    }
    await this.arrive(to, { face, beam: false });
    await this.settle();
  }

  // Asleep a while: her mane and her body come apart (shards drifting down, the drawing
  // dissolving) and all that's left is her mask, floating there, eyes shut.
  async doze() {
    if (this.busy || this.dormant || this.stowed || this.hidden) return;
    this.busy = true;
    this.endAct(false);
    this.onTeleport?.('start');
    this.dozedOn = this.stance === 'sit' ? { ...this.perch } : null;
    const s = this.scale;
    const h = this.head();
    const fx = this.getFx();
    if (!reducedMotion.matches) {
      for (let i = 0; i < 10; i++) this.shed();
      fx?.burst(h.x, h.y + 60 * s, { count: 10, power: 0.3, spread: 120 * s });
      this.p.glitchSeed = Math.random() * 100;
      await tween(this.p, { dissolve: 0.9, glitch: 0.25, sparkle: 0 }, 700, ease.in);
    }
    this.setStance('stand'); // no ledge to fall off while she's away
    Object.assign(this.p, { alpha: 0, dissolve: 0, glitch: 0 });
    this.hidden = true;
    this.root.hidden = true;
    this.dormant = true;
    if (this.mask) {
      this.mask.place(h.x, h.y, this.scale * 1.1);
      this.mask.show();
    }
    this.onDoze?.('start', h);
    this.busy = false;
  }

  // Back from her mask: her eyes snap open, then she comes back together around it,
  // on her ledge again if it's still there.
  async rouse() {
    if (!this.dormant) return;
    this.dormant = false;
    this.busy = true;
    this.mask?.wake();
    this.onDoze?.('waking');
    if (this.mode === 'sleep') this.setMode('idle');
    this.lastActivity = performance.now();
    await sleep(reducedMotion.matches ? 0 : 280);
    this.mask?.hide();
    this.onDoze?.('end');
    if (this.dead) return;
    this.hidden = false;
    this.root.hidden = false;
    Object.assign(this.p, { alpha: 0, collapse: 0.6, dissolve: 0.5, glitch: 0, split: 0, sparkle: 1 });
    const win = this.dozedOn && this.perchWin(this.dozedOn.id);
    if (win && this.canSit(win)) {
      await this.arrive(this.seat(win, this.dozedOn.dx), { face: this.facing, stance: 'sit', perch: this.dozedOn, beam: false });
    } else {
      await this.arrive({ x: this.pos.x, y: this.dozedOn ? this.floor : this.pos.y }, { face: this.facing, beam: false });
    }
    this.dozedOn = null;
    await this.settle();
  }

  sitOn({ win, dx }) {
    return this.teleport(this.seat(win, dx), { stance: 'sit', perch: { id: win.id, dx }, face: this.facing });
  }

  canPossess() {
    return !this.busy && !this.hidden && this.stance === 'sit' && !reducedMotion.matches
      && Boolean(this.getFx()) && Boolean(this.perchWin(this.perch?.id));
  }

  // Like in the show, she gets into things: she dives into the element she sits on and takes
  // it over (its frame crackles, it looks at you with her eyes), then comes out of another
  // ledge, or further along this one if there's no other.
  async possess() {
    if (!this.canPossess()) return false;
    const fx = this.getFx();
    const s = this.scale;
    const id = this.perch.id;
    const win = this.perchWin(id);
    const entry = this.pos.x - win.x;
    this.busy = true;
    this.wake();
    this.onTeleport?.('start');
    await this.perform('dive');
    const head = await this.vanish({ beam: false });
    fx.streak(head.x, head.y, this.pos.x, win.y + 40 * s);

    const rect = () => {
      const w = this.perchWin(id);
      return w ? { x: w.x, y: w.y, w: w.w, h: w.h } : null;
    };
    const taken = fx.possess(rect, { covers: () => [], entry, look: () => this.mouse });
    this.voice.play('bolt');
    await sleep(300);
    this.voice.play('possess');
    await sleep(1600);
    taken.leave();
    await sleep(260);
    if (this.dead) return true;

    const here = this.perchWin(id);
    let seat = this.pickSeat({ except: id });
    if (!seat && here && this.canSit(here)) {
      const dx = clamp(here.w - entry + rand(-60, 60), 60, Math.max(60, here.w - 190)); // the other end of it
      seat = { win: here, dx };
    }
    const to = seat ? this.seat(seat.win, seat.dx) : this.spot('random');
    const toHead = this.head(to);
    if (here) {
      // out through the system, from the middle of it to where she comes out
      fx.streak(here.x + here.w / 2, here.y + here.h * 0.46, toHead.x, toHead.y);
      await sleep(60);
    }
    if (seat) fx.slit(to.x, toHead.top, seat.win.y, { width: 56 * s + 10 }); // the void she climbs out of
    await this.arrive(to, seat ? { stance: 'sit', perch: { id: seat.win.id, dx: seat.dx }, beam: false } : {});
    await this.settle();
    return true;
  }

  // Lean in from an edge of the screen: vanish, then slide in on twos, three drawings.
  async peek(side = pick(['left', 'right', 'top'])) {
    if (this.busy) return;
    const s = this.scale;
    const { w, h } = this.view;
    const headRise = (SPRITE.feet.y - SPRITE.head.y) * s;
    let at, from, facing, dir;
    if (side === 'left') {
      const y = rand(h * 0.55, this.floor);
      facing = -1;
      dir = 1;
      at = { x: 14 * s, y };
      from = { x: -170 * s, y };
    } else if (side === 'right') {
      const y = rand(h * 0.55, this.floor);
      facing = 1;
      dir = -1;
      at = { x: w - 14 * s, y };
      from = { x: w + 170 * s, y };
    } else {
      // hanging upside down from the top edge, only the head and the mane showing.
      // adaptation: below the page header instead of below the top of the screen.
      const x = rand(w * 0.2, w * 0.8);
      facing = pick([1, -1]);
      dir = x > w / 2 ? -1 : 1;
      at = { x, y: headerH() + 12 - headRise };
      from = { x, y: at.y - 244 * s };
    }

    this.busy = true;
    this.wake();
    this.onTeleport?.('start');
    if (this.p.alpha > 0) await this.vanish();
    this.pos = { ...from };
    this.facing = facing;
    this.setStance('peek', { peekSide: side, dir });
    this.p.collapse = 0;
    this.p.dissolve = 0;
    this.p.glitch = 0;
    this.p.split = 0;
    this.p.alpha = this.mode === 'sleep' ? 0.55 : 1;
    if (reducedMotion.matches) {
      this.pos = at;
    } else {
      for (const k of [0.45, 0.8, 1]) {
        this.pos = { x: lerp(from.x, at.x, k), y: lerp(from.y, at.y, k) };
        this.drawFrame();
        await sleep(ON_TWOS);
      }
    }
    this.peekFrom = from;
    this.peekUntil = performance.now() + rand(3500, 6500);
    this.busy = false;
    this.onTeleport?.('end');
  }

  // Duck back out of view, then show up somewhere else (or peek from another edge, if shy).
  async unpeek({ shy = false } = {}) {
    if (this.busy || this.stance !== 'peek') return;
    this.busy = true;
    const at = { ...this.pos };
    const from = this.peekFrom || at;
    if (!reducedMotion.matches) {
      for (const k of [0.4, 0.8, 1]) {
        this.pos = { x: lerp(at.x, from.x, k), y: lerp(at.y, from.y, k) };
        this.drawFrame();
        await sleep(ON_TWOS);
      }
    }
    this.p.alpha = 0;
    this.p.collapse = 1;
    this.p.dissolve = 0.5;
    this.busy = false;
    const side = this.peekSide;
    this.setStance('stand');
    if (shy && Math.random() < 0.6) {
      this.peek(pick(['left', 'right', 'top'].filter((x) => x !== side)));
      return;
    }
    this.busy = true;
    this.onTeleport?.('start');
    const seat = this.pickSeat();
    if (seat && Math.random() < 0.4) {
      await this.arrive(this.seat(seat.win, seat.dx), { stance: 'sit', perch: { id: seat.win.id, dx: seat.dx } });
    } else {
      await this.arrive(this.spot('random'));
    }
    this.busy = false;
    this.onTeleport?.('end');
  }

  fall() {
    if (this.stance === 'fall') return;
    if (this.sky) this.endAct(false);
    this.landingSpot = this.landing();
    this.setStance('fall');
    this.vy = 0;
    this.lastFall = performance.now();
    if (reducedMotion.matches) this.updateFall(this.lastFall + 10000);
  }

  updateFall(now) {
    if (this.stance !== 'fall') return;
    const target = this.landingSpot;
    const dt = Math.min(0.05, (now - this.lastFall) / 1000);
    this.lastFall = now;
    this.vy = Math.min(this.vy + GRAVITY * dt, 1900);
    const y = reducedMotion.matches ? target.y : this.pos.y + this.vy * dt;
    if (y < target.y) {
      this.pos.y = y;
      return;
    }
    this.pos.y = target.y;
    this.setStance(target.stance, { perch: target.perch });
    const s = this.scale;
    const fx = this.getFx();
    if (target.stance === 'sit') {
      this.perform('plop');
    } else {
      this.perform('land');
      fx?.burst(this.pos.x, this.pos.y - 20 * s, { count: 12, power: 0.6, spread: 60 * s });
    }
    this.voice.play('land');
    const p = this.p;
    p.glitchSeed = Math.random() * 100;
    p.glitch = 0.3;
    setTimeout(() => { p.glitch = 0; }, ON_ONES * 3);
  }

  // First appearance: beam down from the top of the screen and unfold.
  async materialize(at = this.spot('random')) {
    const p = this.p;
    this.pos = { ...at };
    this.faceCenter();
    this.setStance('stand');
    if (reducedMotion.matches) {
      p.alpha = 0;
      this.place();
      await tween(p, { alpha: 1 }, 300, ease.linear);
      return;
    }
    this.busy = true;
    p.alpha = 0;
    p.collapse = 1;
    p.dissolve = 0.5;
    this.place();
    await sleep(250);
    this.getFx()?.beam(at.x, at.y, { down: true, width: 40 * this.scale + 8, life: 260 });
    this.voice.play('teleport-in');
    await sleep(80);
    p.alpha = 1;
    await tween(p, { collapse: 0, dissolve: 0, glitch: 0.5, split: 5 }, 240, ease.out);
    await tween(p, { glitch: 0, split: 0 }, 260, ease.out);
    this.busy = false;
  }

  // Her intro: she grabs your screen by its edges, huge, says hi, then her hands slip
  // and she dives down to where she stands (fx.intro).
  async intro(at = this.spot('random'), { label = 'hi', caption = 'PROJECT CAPRICORN', still = reducedMotion.matches } = {}) {
    const fx = this.getFx();
    if (!fx) return this.materialize(at);
    const p = this.p;
    this.pos = { ...at };
    this.faceCenter();
    this.setStance('stand');
    this.busy = true;
    p.alpha = 0;
    p.collapse = 1;
    p.dissolve = 0.5;
    this.place();
    const head = this.head(at, this.facing);
    await fx.intro({
      to: { x: head.x, y: head.y, size: 100 * this.scale },
      label,
      caption,
      still,
      onCue: (cue) => {
        if (cue === 'open') this.voice.play('charge'); // the edges of the screen crackling
        else if (cue === 'hand') this.voice.play('land'); // a hand on the edge
        else if (cue === 'wave') this.voice.play('rise'); // a hand off it, to wave
        else if (cue === 'grab') {
          this.voice.play('land'); // she slams into it
          this.voice.play('bolt');
        } else if (cue === 'hi') this.voice.play('hello');
        else if (cue === 'slip') this.voice.play('teleport-out');
      },
    });
    if (this.dead) return;
    await this.arrive(at, { face: this.facing, beam: false });
    this.busy = false;
  }

  // ---------- showing you things ----------

  // The point of `rect` she aims at from where she is: its closest point, a little inside.
  aimPoint(rect) {
    const { w, h } = this.view;
    const sh = this.limb(this.armToward(rect.x + rect.w / 2 < this.pos.x ? -1 : 1)).shoulder;
    const inset = Math.min(24, rect.w / 3, rect.h / 3);
    return {
      x: clamp(clamp(sh.x, rect.x + inset, rect.x + rect.w - inset), 6, w - 6),
      y: clamp(clamp(sh.y, rect.y + inset, rect.y + rect.h - inset), 6, h - 4),
    };
  }

  // Where to stand to point at `rect`: beside it, on the side with more room, her shoulder
  // a bit below its middle (on the floor for things low on the screen).
  spotNear(rect) {
    const s = this.scale;
    const { w, h } = this.view;
    const side = 150 * s + 30;
    const reach = 230 * s + 90;
    const roomLeft = rect.x, roomRight = w - (rect.x + rect.w);
    let x;
    if (Math.max(roomLeft, roomRight) >= side + 40) {
      x = roomRight >= roomLeft ? rect.x + rect.w + reach : rect.x - reach;
    } else {
      x = rect.x + rect.w / 2 < w / 2 ? w - side : side;
    }
    x = clamp(x, side, w - side);
    const cy = clamp(rect.y + rect.h / 2, 0, h);
    const shoulderToFeet = (SPRITE.feet.y - SPRITE.shoulder.y) * s;
    const y = cy > h * 0.6 ? this.floor : clamp(cy + shoulderToFeet + 50, SPRITE.height * s + 40 + headerH(), this.floor);
    return { x, y, face: rect.x + rect.w / 2 < x ? 1 : -1 };
  }

  // Go and point at `rect`, and keep pointing (a dashed line from her finger, brackets,
  // `label`) until stopPointing(). Resolves once she's there with her arm out.
  async pointAt(rect, { label = '' } = {}) {
    if (this.stowed) return false;
    this.stopPointing();
    const spot = this.spotNear(rect);
    if (this.stance !== 'stand' || Math.hypot(spot.x - this.pos.x, spot.y - this.pos.y) > 140) {
      await this.teleport({ x: spot.x, y: spot.y }, { face: spot.face });
    }
    if (this.stowed || this.hidden) return false;
    const aim = this.aimPoint(rect);
    const dir = aim.x < this.pos.x ? -1 : 1;
    const side = this.armToward(dir);
    const reach = () => {
      const sh = this.limb(side).shoulder;
      return clamp(Math.atan2(sh.y - aim.y, Math.abs(aim.x - sh.x)) + 0.52, -0.6, 1.7);
    };
    this.pointing = { rect, aim, dir, side, reach, label, pointer: null };
    this.base = this.restBase();
    await this.perform('point', dir, { reach });
    if (this.pointing && !this.pointing.pointer) this.onCue('lock'); // the act was cut short
    return true;
  }

  // Done showing: the line reels back into her finger, the reticle lets go, the arm snaps back.
  stopPointing() {
    const pt = this.pointing;
    if (!pt) return;
    this.pointing = null;
    pt.pointer?.retract();
    this.base = this.restBase();
    if (!this.busy && !this.hidden && this.stance === 'stand') this.perform('unpoint', pt.dir);
  }

  // ---------- pointer ----------

  bindPointer() {
    let down = null;
    this.onDown = (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      const isTouch = e.pointerType === 'touch';
      const hitRadius = isTouch ? 28 : 8;
      if ((!isTouch && e.button !== 0) || this.busy || !this.hit(e.clientX, e.clientY, hitRadius)) return;
      if (e.cancelable) e.preventDefault(); // adaptation: touch would scroll the page instead of lifting her
      down = { x: e.clientX, y: e.clientY, pos: { ...this.pos }, t: performance.now(), pointerId: e.pointerId };
      try {
        e.target?.setPointerCapture?.(e.pointerId);
      } catch {
        // capture is a nicety
      }
    };
    this.onMoveWin = (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      // hovering her mask for a moment stirs her
      if (this.dormant && this.mask?.visible) {
        if (this.mask.contains(e.clientX, e.clientY, 30)) {
          this.mask.pointer = this.mouse;
          if (!this.maskStir) this.maskStir = performance.now();
          else if (performance.now() - this.maskStir > 400) this.rouse();
        } else {
          this.maskStir = 0;
          this.mask.pointer = null;
        }
        return;
      }
      if (down) {
        if (e.cancelable) e.preventDefault();
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!this.dragging && Math.hypot(dx, dy) > (e.pointerType === 'touch' ? 3 : 5) && !this.busy) {
          this.dragging = true;
          this.wasDragging = true;
          if (this.upside) {
            // flip back upright under the pointer
            down.pos = { x: down.pos.x, y: down.pos.y + (SPRITE.feet.y - SPRITE.head.y) * this.scale };
          }
          this.endAct(false);
          this.setStance('stand');
          this.p.glitch = 0.18;
          this.p.split = 2;
        }
        if (this.dragging) {
          const minY = headerH() + 12 + (SPRITE.feet.y - SPRITE.head.y) * this.scale; // her head under the header
          this.pos = {
            x: clamp(down.pos.x + dx, 40, this.view.w - 40),
            y: clamp(down.pos.y + dy, minY, this.floor),
          };
          this.p.glitchSeed = Math.random() * 100;
          this.place();
        }
        return;
      }
      this.notice(e.clientX, e.clientY);
    };
    this.onUpWin = (e) => {
      if (!down) return;
      const wasDragging = this.dragging;
      const quick = performance.now() - down.t < 350;
      const still = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 14;
      down = null;
      this.dragging = false;
      setTimeout(() => { this.wasDragging = false; }, 120);
      if (wasDragging) {
        tween(this.p, { glitch: 0, split: 0 }, 200, ease.out);
        this.drop();
      } else if (quick && still) {
        this.onClick();
      }
    };
    // a cancelled pointer (pinch-zoom, a system gesture) never fires pointerup: without
    // this she would stay glued to every later pointermove with no button held
    this.onCancelWin = () => {
      if (!down) return;
      down = null;
      if (this.dragging) {
        this.dragging = false;
        setTimeout(() => { this.wasDragging = false; }, 120);
        tween(this.p, { glitch: 0, split: 0 }, 200, ease.out);
        this.drop();
      }
    };
    window.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMoveWin, { passive: false });
    window.addEventListener('pointerup', this.onUpWin);
    window.addEventListener('pointercancel', this.onCancelWin);
  }

  // web convention (the user asked for it): quick tap = a poke, double tap = into the chip
  onClick() {
    const now = performance.now();
    if (now - this.lastTap < 360) {
      this.lastTap = 0;
      this.stow();
      return;
    }
    this.lastTap = now;
    this.wake();
    if (this.stance === 'peek') {
      this.unpeek({ shy: true });
      return;
    }
    this.voice.play('star');
    this.perform(pick(['curious', 'hop', 'spin', 'victory']), this.towardCenter());
    this.onPoke?.();
  }

  // Let go of her: onto a ledge if her hips are right at one, otherwise she falls.
  drop() {
    const s = this.scale;
    const hip = this.pos.y - (SPRITE.feet.y - SPRITE.hip) * s;
    let snapTo = null, minDist = 26.0001;
    for (const win of this.findWins()) {
      if (!this.canSit(win)) continue;
      const dist = Math.abs(hip - win.y);
      if (dist > 26) continue;
      if (this.pos.x < win.x + 40 || this.pos.x > win.x + win.w - 40) continue;
      if (dist < minDist) { minDist = dist; snapTo = win; }
    }
    if (snapTo && dropAction(minDist) === 'snap') {
      const dx = this.pos.x - snapTo.x;
      this.pos = this.seat(snapTo, dx);
      this.setStance('sit', { perch: { id: snapTo.id, dx } });
      this.perform('plop');
      this.voice.play('land');
      return;
    }
    if (this.pos.y < this.floor - 2) this.fall();
    else this.perform('land');
  }

  // When the pointer comes close she turns to face it and cocks her head;
  // if she's peeking, she's shy and ducks away.
  notice(x, y) {
    if (this.busy || this.hidden || this.stance === 'fall' || this.sky || this.dormant) return; // the satellite has all her attention
    const h = this.head();
    if (Math.hypot(x - h.x, y - h.y) > 230) return;
    const now = performance.now();
    if (this.mode === 'sleep') this.wake();
    if (now < this.nextNotice) return;
    this.nextNotice = now + 15000;
    if (this.stance === 'peek') {
      this.unpeek({ shy: true });
      return;
    }
    const wanted = x < this.pos.x ? 1 : -1;
    if (wanted !== this.facing && this.stance === 'stand') {
      this.perform('turn');
      return;
    }
    if (this.mode !== 'idle') return;
    if (noticeDecision(Math.random()) === 'zap' && this.zap(x, y)) return;
    this.perform('curious', x < h.x ? -1 : 1);
  }

  // Reacting to the page: a line came from the visitor's action — talk, and a small jolt.
  speaking(active) {
    if (!active) return;
    this.pulse();
    if (this.stance !== 'peek') this.perform('talk');
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMoveWin);
    window.removeEventListener('pointerup', this.onUpWin);
    window.removeEventListener('pointercancel', this.onCancelWin);
    this.mask?.hide();
    if (this.sky) {
      const { sat, motes, surge } = this.sky;
      surge?.break();
      motes?.home(...this.moved());
      sat.fade();
      this.sky = null;
    }
    this.pointing?.pointer?.fade();
  }
}
