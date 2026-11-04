// All time values are positions in the educational narrative, not elapsed
// clinical time, millimetres of travel, or an interdental-brush size code.
const chapter = (id, label, start, end, at, reducedAt, title, text, extra = {}) => Object.freeze({
  id, key: id, label, start, from: start, end, at, reducedAt, title, text,
  description: text, note: '', hint: '', instructions: Object.freeze([]), ...extra,
});

export const DENTAL_CHAPTERS = Object.freeze([
  chapter('hero', 'Zub', 0, .10, 0, .045,
    'Začína sa to jedným zubom.',
    'Pozrite sa zblízka. Potom objavte priestor medzi zubami.'),
  chapter('space', 'Priestor', .10, .22, .210, .210,
    'Dôležité je aj to, čo je medzi nimi.',
    'Medzi dolnou šestkou a sedmičkou sa pri krčkoch zubov otvára medzizubný priestor.'),
  chapter('plaque', 'Povlak', .22, .34, .330, .330,
    'Povlak nemusí byť na prvý pohľad viditeľný.',
    'Baktérie v povlaku vytvárajú z cukrov kyseliny, ktoré môžu postupne poškodzovať sklovinu.', {
      note: 'Povlak je farebne zvýraznený pre názornosť.',
    }),
  chapter('caries', 'Kaz', .34, .48, .475, .475,
    'Keď sa poškodí samotný zub.',
    'Vzniknutú dutinu kefka neopraví. Vyžaduje odborné ošetrenie.', {
      note: 'Ilustrácia vývoja v čase, nie zmena počas jedného čistenia.',
    }),
  chapter('brush', 'Čistenie', .48, .72, .620, .620,
    'Odstraňujte povlak. Jemne a pravidelne.',
    'S výberom pomôže zubný lekár alebo dentálna hygienička.', {
      instructions: Object.freeze(['Zvoľte vhodnú veľkosť.', 'Zasuňte jemne, bez násilia.', 'Pohybujte kefkou tam a späť.']),
      note: 'Ďasná nie sú zobrazené pre lepšiu názornosť.',
    }),
  chapter('result', 'Výsledok', .72, .80, .760, .760,
    'Povlak sa odstráni. Dutina zostáva.',
    'V dosahu kefky ubudol povlak. Vzniknutá dutina zostáva.', {
      resultLabels: Object.freeze(['Vyčistený povrch', 'Kaz vyžaduje ošetrenie']),
    }),
  chapter('dentition', 'Chrup', .80, 1, .980, .980,
    'Malý návyk. Starostlivosť o celý chrup.',
    'Medzizubné priestory čistite každý deň. Zuby čistite dvakrát denne fluoridovou pastou.', {
      note: 'Pomôcku a jej veľkosť prispôsobte konkrétnemu priestoru.',
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
