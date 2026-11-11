// FDI (ISO 3950). Right and left are from the patient's perspective.
const QUADRANTS = [
  { digit: 1, jaw: 'Horná čeľusť', side: 'pravá strana pacienta', upper: true },
  { digit: 2, jaw: 'Horná čeľusť', side: 'ľavá strana pacienta', upper: true },
  { digit: 3, jaw: 'Dolná čeľusť', side: 'ľavá strana pacienta', upper: false },
  { digit: 4, jaw: 'Dolná čeľusť', side: 'pravá strana pacienta', upper: false },
];

const TOOTH_POSITIONS = [
  { upper: 'Stredný horný rezák', lower: 'Stredný dolný rezák', type: 'Rezák', purpose: 'Odhryzovanie kúskov potravy.' },
  { upper: 'Bočný horný rezák', lower: 'Bočný dolný rezák', type: 'Rezák', purpose: 'Rezanie potravy pri odhryzovaní.' },
  { upper: 'Horný očný zub', lower: 'Dolný očný zub', type: 'Očný zub', purpose: 'Pridržanie a trhanie potravy.' },
  { upper: 'Prvý horný črenový zub', lower: 'Prvý dolný črenový zub', type: 'Črenový zub', purpose: 'Trhanie a drvenie potravy pri žuvaní.' },
  { upper: 'Druhý horný črenový zub', lower: 'Druhý dolný črenový zub', type: 'Črenový zub', purpose: 'Drvenie potravy pred jej rozomletím.' },
  { upper: 'Prvá horná stolička', lower: 'Prvá dolná stolička', type: 'Stolička', purpose: 'Drvenie a rozomieľanie potravy.' },
  { upper: 'Druhá horná stolička', lower: 'Druhá dolná stolička', type: 'Stolička', purpose: 'Rozomieľanie potravy v zadnej časti chrupu.' },
];

export const DENTAL_ATLAS_GROUPS = QUADRANTS.map(({ digit, jaw, side, upper }) => ({
  label: `${jaw} · ${side}`,
  teeth: TOOTH_POSITIONS.map((tooth, index) => ({
    fdi: digit * 10 + index + 1,
    name: upper ? tooth.upper : tooth.lower,
    jaw, side, type: tooth.type, purpose: tooth.purpose,
  })),
}));

export const DENTAL_ATLAS_TEETH = new Map(DENTAL_ATLAS_GROUPS.flatMap(({ teeth }) => teeth.map(tooth => [tooth.fdi, tooth])));

// Traverse each arch from the patient's right to left. The ends stay on
// their own arch; the FDI picker can still move between either jaw.
const adjacent = new Map();
for (const [right, left] of [[0, 1], [3, 2]]) {
  const arch = [...DENTAL_ATLAS_GROUPS[right].teeth].reverse().concat(DENTAL_ATLAS_GROUPS[left].teeth);
  arch.forEach(({ fdi }, i) => {
    adjacent.set(fdi, { previous: arch[i - 1]?.fdi, next: arch[i + 1]?.fdi });
  });
}

export function adjacentAtlasTooth(fdi, direction) {
  return adjacent.get(fdi)?.[direction];
}
