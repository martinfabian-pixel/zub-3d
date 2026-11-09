// All time values are positions in the educational narrative, not elapsed
// clinical time, millimetres of travel, or an interdental-brush size code.
const chapter = (id, label, start, end, at, reducedAt, titleLines, text, extra = {}) => Object.freeze({
  id, key: id, label, start, from: start, end, at, reducedAt,
  title: titleLines.join(' '), titleLines: Object.freeze(titleLines), text,
  description: text, note: '', hint: '', instructions: Object.freeze([]), ...extra,
});

export const DENTAL_CHAPTERS = Object.freeze([
  chapter('hero', 'Zub', 0, .10, 0, .045,
    ['Začína sa to', 'jedným zubom.'],
    'Pozrite sa bližšie.'),
  chapter('space', 'Priestor', .10, .22, .210, .210,
    ['Aj medzi', 'zubami.'],
    'Pozornosť si zaslúžia aj plochy medzi zubami.', {
      education:'Medzi dolnou šestkou a sedmičkou sa pri krčkoch zubov otvára medzizubný priestor. Ďasná nie sú zobrazené pre lepšiu názornosť.',
    }),
  chapter('plaque', 'Povlak', .22, .34, .330, .330,
    ['Nenápadný', 'povlak.'],
    'Na povrchu medzi zubami sa môže hromadiť povlak.', {
      note: 'Farebne zvýraznený pre názornosť.',
      education:'Baktérie v povlaku vytvárajú z cukrov kyseliny, ktoré môžu postupne poškodzovať sklovinu. Farba zvýrazňuje tenkú vrstvu povlaku; nejde o zubný kameň.',
    }),
  chapter('caries', 'Kaz', .34, .48, .475, .475,
    ['Keď sa', 'poškodí zub.'],
    'Vzniknutú dutinu kefka neopraví.', {
      note: 'Ilustrácia vývoja v čase, nie zmena počas jedného čistenia.',
      education:'Ilustrácia vývoja v čase, nie zmena počas jedného čistenia. Vzniknutá dutina vyžaduje odborné ošetrenie. Spätný scroll vracia výučbovú sekvenciu, neukazuje biologické liečenie kazu.',
    }),
  chapter('brush', 'Čistenie', .48, .72, .620, .620,
    ['Jemne tam', 'a späť.'],
    'Na zdravom zube ukazujeme, ako kefka odstraňuje povlak.', {
      instructions: Object.freeze(['Vhodná veľkosť.', 'Jemné zasunutie.', 'Pohyb tam a späť.']),
      note: 'Ďasná nie sú zobrazené pre lepšiu názornosť.',
      education:'S výberom vhodnej veľkosti pomôže zubný lekár alebo dentálna hygienička. Zasúvajte jemne, bez násilia. Počet pohybov v ukážke nie je univerzálny liečebný predpis. Ďasná nie sú zobrazené pre lepšiu názornosť; prázdny priestor medzi koreňmi nie je návod na zavádzanie kefky.',
    }),
  chapter('result', 'Výsledok', .72, .80, .760, .760,
    ['Čistý priestor.', 'Zdravý zub.'],
    'Kefka odstránila časť povlaku.', {
      resultLabels: Object.freeze(['Vyčistený povrch']),
      education:'Ide o ukážku prevencie na zdravom zube. Kefka odstraňuje povlak v dosahu štetiniek. Ak už v zube vznikla dutina, vyžaduje odborné ošetrenie.',
    }),
  chapter('dentition', 'Chrup', .80, 1, .995, .995,
    ['Malý návyk.', 'Veľký rozdiel.'],
    'Starostlivosť o celý chrup začína aj medzi zubami.', {
      note: 'Pomôcku a jej veľkosť prispôsobte konkrétnemu priestoru.',
      education:'Medzizubné priestory čistite každý deň. Zuby čistite dvakrát denne fluoridovou pastou. Pomôcku a jej veľkosť prispôsobte konkrétnemu priestoru. Medzizubná kefka nenahrádza bežné čistenie ani odborné ošetrenie a neprisľubuje úplnú ochranu pred kazom.',
    }),
]);

const range = (a, b) => Object.freeze([a, b]);
export const DENTAL_STORY = Object.freeze({
  chapters: DENTAL_CHAPTERS,
  fdi: Object.freeze({ hero: 36, distalNeighbor: 37, neighbors: Object.freeze([35, 36, 37]) }),
  neighbors: range(.10, .16), gapFocus: range(.16, .22), gapRelease: range(.80, .875),
  deposition: range(.22, .33), lesion: range(.34, .47),
  brush: Object.freeze({
    appear: range(.48, .502), align: range(.48, .515), enter: range(.515, .56),
    work: range(.56, .68), withdraw: range(.68, .714), fade: range(.708, .72),
    // Progress, normalized axial tip travel, normalized working articulation.
    // Third forward pass attains full reach only at the end of cleaning.
    keys: Object.freeze([
      [.515, 0, 0], [.56, .10, 0], [.58, .40, 1], [.60, .17, 0],
      [.62, .70, 1], [.64, .35, 0], [.68, 1, 1], [.714, 0, 0],
    ].map(Object.freeze)),
  }),
  lower: range(.80, .875), upper: range(.88, .96), fullHold: range(.96, 1),
});
