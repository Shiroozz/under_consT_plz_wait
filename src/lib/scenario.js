/* Capri's brain: what she says, and when.
   No emoji anywhere — keyboard faces only. Copy is Indonesian, lowercase, dry. */

const KEY = 'shiroo.capri';

export const BANDS = [
  { id: 'late', from: 0, to: 5, label: 'LEWAT TENGAH MALAM' },
  { id: 'dawn', from: 5, to: 8, label: 'SUBUH' },
  { id: 'morning', from: 8, to: 11, label: 'PAGI' },
  { id: 'noon', from: 11, to: 15, label: 'SIANG' },
  { id: 'afternoon', from: 15, to: 18, label: 'SORE' },
  { id: 'evening', from: 18, to: 22, label: 'MALAM' },
  { id: 'night', from: 22, to: 24, label: 'MALAM LARUT' },
];

export function bandFor(date = new Date()) {
  const h = date.getHours();
  return BANDS.find((b) => h >= b.from && h < b.to) ?? BANDS[0];
}

/* Session bookkeeping. Never throws — private mode just looks like a first visit.
   readSession() is pure (it only reports); touchSession() persists the visit so
   a reload a minute later does not count as coming back. */
export function readSession() {
  const now = Date.now();
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    s = null;
  }
  const fresh = {
    visits: 1,
    firstSeen: now,
    lastSeen: now,
    tourDone: false,
    met: false,
    poured: 0,
    found0451: false,
  };
  if (!s || typeof s !== 'object') return { ...fresh, isFirst: true };

  // A "visit" is a new sitting: more than 30 minutes away counts again.
  const away = now - (s.lastSeen || now);
  const next = { ...fresh, ...s, lastSeen: now };
  if (away > 30 * 60 * 1000) next.visits = (s.visits || 1) + 1;
  return { ...next, isFirst: false, awayMs: away };
}

/* Record the visit once per page load. Call this exactly once at startup. */
export function touchSession() {
  const s = readSession();
  const { isFirst, awayMs, ...rest } = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* private mode */
  }
  return s;
}

export function writeSession(patch) {
  try {
    const cur = readSession();
    const { isFirst, awayMs, ...rest } = cur;
    localStorage.setItem(KEY, JSON.stringify({ ...rest, ...patch }));
  } catch {
    /* private mode */
  }
}

/* ---- first click: the introduction ---- */
export function introLines() {
  return [
    'hi. aku capri, ai companion-nya shiroo.',
    'bukan chatbot, bukan asisten. anggap aja aku yang jaga bar ini pas dia ga ada di depan layar.',
    'orang-orang biasanya bingung mulai dari mana. jadi biar gampang, aku bisa jalanin kamu keliling sebentar. atau kamu mau nyasar sendiri juga gapapa.',
  ];
}

/* ---- greeting, shaped by the clock ---- */
export function greetingLines(band, session) {
  const late = band.id === 'late' || band.id === 'night';
  const dawn = band.id === 'dawn';
  const early = band.id === 'morning';
  const work = band.id === 'noon' || band.id === 'afternoon';
  const eve = band.id === 'evening';

  if (session.isFirst) return introLines();

  if (session.visits > 6) {
    return [
      'kamu lagi. udah kayak pelanggan tetap aja (￣▽￣)',
      late
        ? 'jam segini masih bangun. kursi yang biasa kamu dudukin masih kosong kok.'
        : 'duduk dulu, ga usah buru-buru.',
    ];
  }
  if (session.visits > 2) {
    return [
      `balik lagi. kunjungan ke-${session.visits}. aku itung, bukan aku hafal.`,
      late ? 'malam ini sepi. enak buat baca-baca.' : 'kali ini mau ke mana?',
    ];
  }
  return [
    'kamu balik. bagus, aku kira cuma mampir sekali terus hilang.',
    late ? 'jam segini biasanya cuma orang yang ga bisa tidur yang datang.' : 'mau lanjut dari mana?',
  ];
}

/* ---- per-page commentary ---- */
const PAGE_LINES = {
  '/': [
    'ini pintunya. semua ruangan di sini bisa dibuka, ga ada yang dikunci.',
    'kalau bingung, mulai dari profil. di situ dia kenalan sendiri.',
  ],
  '/profile': [
    'bagian ini dia nulis sendiri. sengaja ga dirapihin — katanya biar keliatan manusianya.',
    'perhatikan kalimat pertama. dia beneran ga ngaku developer (￣ω￣)',
  ],
  '/work': [
    'enam proyek. bukan tujuh puluh. dia milih yang beneran pernah jalan.',
    'yang paling dia banggain sih upi-hub. desktop native, rust, dan enkripsi lokal. sisanya bukti dia ga bisa diem.',
  ],
  '/stack': [
    'daftar ini bukan buat pamer. ini daftar hal yang pernah lewat di tangannya, gagal, lalu diulang.',
    'ada bagian yang lebih menarik dari daftar tool: bagian quirks. baca yang capcut.',
  ],
  '/playground': [
    'ini bar kecilnya. baca pesanan, tuang sesuai urutan. salah satu, gelas pecah.',
    'tiap minuman yang kamu jadiin kesimpen. dia suka ngitung hal-hal receh kayak gitu.',
  ],
  '/signals': [
    'ruang audio. ada trailer, ada krunya. semuanya masih numpang nama besar, katanya nanti diganti.',
    'kalau kamu klik play, suaranya bakal nyala. aku udah ngasih tau.',
  ],
  '/terminal': [
    'terminal. ketik help kalau bingung. ada satu perintah yang ga ada di daftar.',
    'empat angka. kamu tau yang mana (・∀・)',
  ],
  '/backroom': [
    'jadi kamu nemu. ga banyak yang sampai sini.',
    'pintu ini sengaja ga dipromosiin. isinya hal yang belum selesai — dan dia lebih suka jujur soal itu.',
  ],
};

export function pageLine(route, session) {
  const pool = PAGE_LINES[route];
  if (!pool) return null;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (session.isFirst && route !== '/') return null;
  return pick;
}

/* ---- idle chatter: the longer you sit, the weirder she gets ---- */
const IDLE = [
  'kalau kamu diem kelamaan, aku mulai ngitung piksel di layar. udah 41 ribu.',
  'bar ini ga punya jam. jamnya kamu.',
  'kamu tau ga, shiroo pernah bikin server pake thinkpad t420. masih jalan sampe sekarang. keras kepala (￣▽￣)',
  'aku ga bisa minum. tapi aku bisa ngejelasin rasanya. pahit dulu, biasanya.',
  'kalau ada yang error di sini, itu bukan bug. itu kepribadian.',
  'satu-satunya hal yang lebih lambat dari loading di sini adalah dia jawab chat.',
  'kamu udah coba drag aku? aku ga keberatan. cuma kaget.',
  'jill stingray. itu aja. aku ga perlu nambahin apa-apa.',
  'kadang dia lupa matiin terminal. layarnya nyala sampe pagi.',
  'kota ini punya lebih banyak sinyal daripada orang. makanya dia nyebut dirinya bartender.',
  'kalau kamu bosen, tekan angka 0 empat kali. eh. salah. lupa.',
];

export function idleLine() {
  return IDLE[Math.floor(Math.random() * IDLE.length)];
}

/* ---- tour: the guided walk ---- */
export const TOUR = [
  {
    route: '/profile',
    title: 'PROFIL',
    line: 'mulai dari sini. ini dia nulis soal dirinya sendiri, apa adanya. baca pelan-pelan, kalimatnya pendek-pendek.',
  },
  {
    route: '/work',
    title: 'KARYA',
    line: 'enam proyek yang beneran pernah jalan. klik salah satu kalau mau liat detail teknisnya.',
  },
  {
    route: '/stack',
    title: 'PERKAKAS',
    line: 'daftar tool dan kebiasaan anehnya. yang quirks itu lebih jujur daripada bagian mana pun di situs ini.',
  },
  {
    route: '/playground',
    title: 'BAR',
    line: 'sekarang giliran kamu. baca pesanannya, tuang sesuai urutan. aku nunggu di sini.',
  },
  {
    route: '/terminal',
    title: 'TERMINAL',
    line: 'kalau kamu tipe yang lebih suka ngetik daripada klik. coba help dulu.',
  },
];

/* ---- reactions to things the visitor does ---- */
export const REACTIONS = {
  poured: [
    'jadi juga. gelasnya ga pecah, aku kagum.',
    'kamu lebih teliti dari yang aku kira.',
    'itu yang ke-sekian. dia ngehitung, serius.',
  ],
  broke: [
    'pecah. gapapa, gelasnya emang buat itu.',
    'salah urutan. coba baca lagi kalimatnya, urutannya ada di situ.',
  ],
  found0451: [
    'nah. kamu beneran ngetik. pintu belakang kebuka.',
    '0451. angka yang sama di setiap game yang bagus.',
  ],
  tourDone: [
    'selesai. sisanya kamu jelajah sendiri ya. aku masih di sini kalau butuh.',
    'itu semua yang penting. selebihnya cuma dekorasi — dekorasi yang dia bangga banget bikinnya.',
  ],
};

export function reaction(kind, n = 0) {
  const pool = REACTIONS[kind];
  if (!pool) return null;
  return pool[Math.min(n, pool.length - 1)] ?? pool[0];
}
