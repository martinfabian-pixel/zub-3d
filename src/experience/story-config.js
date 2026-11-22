// Every time below is a position on the same scroll timeline.
const range = (a, b) => Object.freeze([a, b]);

export function brushProgress(workingProgress) {
  return .78 + (workingProgress - .48) / (.72 - .48) * (.854 - .78);
}

export const STORY_TIMING = Object.freeze({
  atlas: range(0, .13),
  assemblyCrowns: range(.13, .164),
  assemblyClosure: range(.164, .190),
  flight: range(.164, .316),
  openingTooth: .322,
  teachingSite: Object.freeze({
    smileTurn: range(.038, .106),
    crownLocator: range(.083, .112),
    identify: range(.168, .195),
    identified: range(.233, .276),
    lift: range(.235, .348),
    background: range(.236, .316),
    releaseNeighbors: range(.252, .348),
    returnNeighbors: range(.596, .651),
    reseat: range(.590, .655),
    followSurface: .626,
    contactHold: range(.733, .780),
  }),
  heroHold: range(.364, .412),
  anatomy: Object.freeze({
    enamel: range(.466, .481),
    dentin: range(.493, .508),
    pulp: range(.523, .540),
    close: range(.568, .590),
  }),
  result: range(.854, .868),
  resultAt: .861,
  return: range(.868, .922),
  map: Object.freeze({
    lower: range(.868, .903),
    upper: range(.888, .922),
    hold: range(.922, .967),
    close: range(.967, .993),
    at: .941,
  }),
  finalClosure: range(.885, .903),
  finalCrowns: range(.882, .911),
  finalHold: range(.993, 1),
  finalCopy: range(.967, .993),
  manualReady: brushProgress(.504),
  manualAt: brushProgress(.62),
  manualCamera: brushProgress(.645),
});

const chapter = (id, label, start, end, at, reducedAt, titleLines, text, extra = {}) => Object.freeze({
  id, key: id, label, start, from: start, end, at, reducedAt,
  title: titleLines.join(' '), titleLines: Object.freeze(titleLines), text,
  description: text, note: '', hint: '', instructions: Object.freeze([]), ...extra,
});

export const FINAL_SMILE_COPY = Object.freeze({
  label: 'Záverečný úsmev',
  title: 'Aj priestor medzi zubami patrí k čisteniu.',
  titleLines: Object.freeze(['Aj priestor', 'medzi zubami', 'patrí k čisteniu.']),
  text: '',
  note: '',
});

export const DENTAL_CHAPTERS = Object.freeze([
  chapter('dentition', 'Celý chrup', 0, STORY_TIMING.atlas[1], 0, 0,
    ['Celý chrup.'],
    'Kde je dolná ľavá šestka? V režime Anatómia si môžete prezrieť každý z 28 zubov.', {
      note: 'Zobrazenie bez zubov múdrosti.',
    }),
  chapter('assembly', 'Poloha šestky', STORY_TIMING.atlas[1], .33, .216, .216,
    ['Šestka v oblúku.'],
    'Nájdete ju pred sedmičkou na ľavej strane dolného oblúka.'),
  chapter('hero', 'Detail šestky', .33, .43, .386, .386,
    ['Pozrite sa', 'pod povrch.'],
    'Prezrite si šestku od korunky až po konce oboch koreňov.'),
  chapter('anatomy', 'Stavba zuba', .43, .59, .555, .555,
    ['Čo je vo vnútri', 'zuba?'],
    'Posuvníkom postupne odkryjete vrstvy šestky.', {
      education: 'Ilustračný model zdravej dolnej stoličky ukazuje sklovinu, dentín, zubnú dreň a koreňové kanáliky.',
    }),
  chapter('space', 'Priestor', .59, .69, .680, .680,
    ['Ktoré miesto', 'práve čistíme?'],
    'Priestor medzi dolnou ľavou šestkou a sedmičkou.', {
      education: 'Medzi dolnou šestkou a sedmičkou sa pri krčkoch zubov otvára medzizubný priestor.',
    }),
  chapter('plaque', 'Povlak', .69, .78, .765, .765,
    ['Nenápadný', 'povlak.'],
    'Na povrchu medzi zubami sa môže hromadiť povlak.', {
      note: 'Farebne zvýraznený pre názornosť.',
      education: 'Baktérie v povlaku vytvárajú z cukrov kyseliny, ktoré môžu postupne poškodzovať sklovinu. Farba zvýrazňuje tenkú vrstvu povlaku.',
    }),
  chapter('brush', 'Čistenie', .78, STORY_TIMING.map.lower[0], STORY_TIMING.manualAt, STORY_TIMING.manualAt,
    ['Jemne tam', 'a späť.'],
    'Na zdravom zube ukazujeme, ako kefka odstraňuje povlak.', {
      instructions: Object.freeze(['Vhodná veľkosť.', 'Jemné zasunutie.', 'Pohyb tam a späť.']),
      note: 'Priestor medzi zubami je zobrazený schematicky.',
      resultLabels: Object.freeze(['Vyčistený povrch']),
      education: 'S výberom vhodnej veľkosti pomôže zubný lekár alebo dentálna hygienička. Zasúvajte jemne, bez násilia. Medzizubná kefka odstraňuje povlak v dosahu štetiniek a dopĺňa bežné čistenie.',
    }),
  chapter('map', 'Mapa chrupu', STORY_TIMING.map.lower[0], STORY_TIMING.map.close[0],
    STORY_TIMING.map.at, STORY_TIMING.map.at, ['Mapa chrupu.'], ''),
  chapter('closing', FINAL_SMILE_COPY.label, STORY_TIMING.map.close[0], 1, 1, 1,
    FINAL_SMILE_COPY.titleLines, FINAL_SMILE_COPY.text),
]);

const brushRange = (a, b) => range(brushProgress(a), brushProgress(b));
export const DENTAL_STORY = Object.freeze({
  chapters: DENTAL_CHAPTERS,
  fdi: Object.freeze({ hero: 36, distalNeighbor: 37, neighbors: Object.freeze([35, 36, 37]) }),
  // Centimetres in the native arch frame: buccal clearance and an occlusal lift.
  extractionOffset: Object.freeze([1.07, .63, .47]),
  gapFocus: range(.594, .680), gapRelease: STORY_TIMING.return,
  deposition: range(.690, .765),
  plaqueExit: range(.868, .879),
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
  lower: range(.868, .894), upper: range(.885, .910), fullHold: STORY_TIMING.finalHold,
});
