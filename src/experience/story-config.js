// Every time below is a position on the same scroll timeline.
const range = (a, b) => Object.freeze([a, b]);

export function brushProgress(workingProgress) {
  return .78 + (workingProgress - .48) / (.72 - .48) * (.898 - .78);
}

export const STORY_TIMING = Object.freeze({
  flight: range(.016, .185),
  assemblyCrowns: range(.185, .220),
  assemblyClosure: range(.158, .185),
  atlas: range(.220, .314),
  archRelease: range(.314, .364),
  heroHold: range(.364, .412),
  anatomy: Object.freeze({
    enamel: range(.468, .497),
    dentin: range(.498, .526),
    pulp: range(.527, .554),
    close: range(.560, .593),
  }),
  result: range(.898, .918),
  resultAt: .908,
  return: range(.918, .980),
  finalClosure: range(.957, .975),
  finalCrowns: range(.971, .991),
  finalHold: range(.991, 1),
  finalCopy: range(.950, .989),
  manualReady: .792,
  manualAt: brushProgress(.62),
  manualCamera: brushProgress(.645),
});

const chapter = (id, label, start, end, at, reducedAt, titleLines, text, extra = {}) => Object.freeze({
  id, key: id, label, start, from: start, end, at, reducedAt,
  title: titleLines.join(' '), titleLines: Object.freeze(titleLines), text,
  description: text, note: '', hint: '', instructions: Object.freeze([]), ...extra,
});

export const FINAL_SMILE_COPY = Object.freeze({
  title: 'Malý návyk. Veľký rozdiel.',
  titleLines: Object.freeze(['Malý návyk.', 'Veľký rozdiel.']),
  text: 'Starostlivosť o celý chrup začína aj medzi zubami.',
  note: '',
});

export const DENTAL_CHAPTERS = Object.freeze([
  chapter('assembly', 'Skladanie', 0, .20, .145, STORY_TIMING.flight[1],
    ['Jeden po', 'druhom.'],
    'Zuby sa postupne spájajú do dvoch oblúkov.'),
  chapter('dentition', 'Chrup', .20, .33, .265, .265,
    ['Celý chrup.'],
    'Preskúmajte 28 trvalých zubov. V režime Anatómia si môžete vybrať každý z nich.', {
      note: 'Zobrazenie bez zubov múdrosti.',
    }),
  chapter('hero', 'Zub', .33, .43, .386, .386,
    ['Začína sa to', 'jedným zubom.'],
    'Pozrite sa bližšie.'),
  chapter('anatomy', 'Stavba zuba', .43, .59, .555, .555,
    ['Stavba', 'zdravého zuba'],
    'Preskúmajte, čo sa skrýva pod povrchom zdravej stoličky.', {
      education: 'Ilustračný model zdravej dolnej stoličky ukazuje sklovinu, dentín, dreň a koreňové kanáliky.',
    }),
  chapter('space', 'Priestor', .59, .69, .680, .680,
    ['Aj medzi', 'zubami.'],
    'Pozornosť si zaslúžia aj plochy medzi zubami.', {
      education: 'Medzi dolnou šestkou a sedmičkou sa pri krčkoch zubov otvára medzizubný priestor. Ďasná nie sú zobrazené pre lepšiu názornosť.',
    }),
  chapter('plaque', 'Povlak', .69, .78, .765, .765,
    ['Nenápadný', 'povlak.'],
    'Na povrchu medzi zubami sa môže hromadiť povlak.', {
      note: 'Farebne zvýraznený pre názornosť.',
      education: 'Baktérie v povlaku vytvárajú z cukrov kyseliny, ktoré môžu postupne poškodzovať sklovinu. Farba zvýrazňuje tenkú vrstvu povlaku.',
    }),
  chapter('brush', 'Čistenie', .78, 1, STORY_TIMING.manualAt, STORY_TIMING.manualAt,
    ['Jemne tam', 'a späť.'],
    'Na zdravom zube ukazujeme, ako kefka odstraňuje povlak.', {
      instructions: Object.freeze(['Vhodná veľkosť.', 'Jemné zasunutie.', 'Pohyb tam a späť.']),
      note: 'Ďasná nie sú zobrazené pre lepšiu názornosť.',
      resultLabels: Object.freeze(['Vyčistený povrch']),
      education: 'S výberom vhodnej veľkosti pomôže zubný lekár alebo dentálna hygienička. Zasúvajte jemne, bez násilia. Medzizubná kefka odstraňuje povlak v dosahu štetiniek a dopĺňa bežné čistenie.',
    }),
]);

const brushRange = (a, b) => range(brushProgress(a), brushProgress(b));
export const DENTAL_STORY = Object.freeze({
  chapters: DENTAL_CHAPTERS,
  fdi: Object.freeze({ hero: 36, distalNeighbor: 37, neighbors: Object.freeze([35, 36, 37]) }),
  neighbors: range(.583, .644), gapFocus: range(.644, .680), gapRelease: STORY_TIMING.return,
  deposition: range(.690, .765),
  plaqueExit: range(.922, .947),
  brush: Object.freeze({
    appear: brushRange(.48, .502), align: brushRange(.48, .515), enter: brushRange(.515, .56),
    work: brushRange(.56, .68), withdraw: brushRange(.68, .714), fade: brushRange(.708, .72),
    // Progress, normalized axial tip travel, normalized working articulation.
    // The third forward pass attains full reach at the end of cleaning.
    keys: Object.freeze([
      [.515, 0, 0], [.56, .10, 0], [.58, .40, 1], [.60, .17, 0],
      [.62, .70, 1], [.64, .35, 0], [.68, 1, 1], [.714, 0, 0],
    ].map(([at, travel, stroke]) => Object.freeze([brushProgress(at), travel, stroke]))),
  }),
  lower: range(.923, .968), upper: range(.933, .971), fullHold: STORY_TIMING.finalHold,
});
