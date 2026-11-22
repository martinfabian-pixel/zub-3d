// FDI (ISO 3950). Right and left are from the patient's perspective.
const QUADRANTS = [
  { digit: 1, jaw: 'Horná čeľusť', side: 'pravá strana pacienta', upper: true },
  { digit: 2, jaw: 'Horná čeľusť', side: 'ľavá strana pacienta', upper: true },
  { digit: 3, jaw: 'Dolná čeľusť', side: 'ľavá strana pacienta', upper: false },
  { digit: 4, jaw: 'Dolná čeľusť', side: 'pravá strana pacienta', upper: false },
];

const TOOTH_POSITIONS = [
  {
    ordinal: 'jednotka', type: 'Rezák', purpose: 'Odhryzovanie kúskov potravy.',
    upper: {
      name: 'Stredný horný rezák',
      landmark: 'Susedí s druhou jednotkou uprostred úsmevu. Široká predná plocha sa zužuje do tenkej reznej hrany.',
      fact: 'Na hrane čerstvo prerezaného rezáka bývajú tri malé oblúčiky. Pri používaní zuba sa postupne vyhladia.',
    },
    lower: {
      name: 'Stredný dolný rezák',
      landmark: 'Pri pohľade spredu má úzku korunku. Obe strany reznej hrany sú takmer zrkadlovo rovnaké.',
      fact: 'Dolné jednotky sú najužšie trvalé zuby. Zvyčajne sa prerezávajú už okolo šiesteho až siedmeho roku.',
    },
  },
  {
    ordinal: 'dvojka', type: 'Rezák', purpose: 'Rezanie potravy pri odhryzovaní.',
    upper: {
      name: 'Bočný horný rezák',
      landmark: 'Leží medzi širšou jednotkou a špicatou trojkou. Jeho korunka má oblejšie rohy než korunka jednotky.',
      fact: 'Horná dvojka má u rôznych ľudí veľmi odlišný tvar. Niekedy je jej korunka drobná a kužeľovitá.',
    },
    lower: {
      name: 'Bočný dolný rezák',
      landmark: 'Podobá sa na dolnú jednotku, ale je o niečo širší. Rezná hrana mierne klesá smerom k očnému zubu.',
      fact: 'Koniec reznej hrany pri trojke sa mierne stáča k jazyku. Kopíruje tak zakrivenie zubného oblúka.',
    },
  },
  {
    ordinal: 'trojka', type: 'Očný zub', purpose: 'Pridržanie a trhanie potravy.',
    upper: {
      name: 'Horný očný zub',
      landmark: 'Trojku spoznáte podľa jedného výrazného hrotu. Na prednej strane od neho smeruje ku krčku pozdĺžny hrebeň.',
      fact: 'Hoci pri úsmeve vidno iba korunku, horný očný zub má spravidla najdlhší koreň v celom chrupe.',
    },
    lower: {
      name: 'Dolný očný zub',
      landmark: 'Dolná trojka má jeden hrot a štíhlu korunku. Zo strany jazyka sú jej vyvýšeniny jemnejšie než pri hornej trojke.',
      fact: 'Očné zuby sú štyri. Hore majú čísla 13 a 23, dole 33 a 43. Všetky štyri trojky ležia medzi rezákmi a črenovými zubami.',
    },
  },
  {
    ordinal: 'štvorka', type: 'Črenový zub', purpose: 'Trhanie a drvenie potravy pri žuvaní.',
    upper: {
      name: 'Prvý horný črenový zub',
      landmark: 'Na žuvacej ploche sú dva hrbolčeky oddelené ryhou. Hrbolček bližšie k lícu býva vyšší než ten pri podnebí.',
      fact: 'Horná štvorka má často dva korene. Jeden smeruje k lícu a druhý k podnebiu.',
    },
    lower: {
      name: 'Prvý dolný črenový zub',
      landmark: 'Hrbolček na strane líca výrazne prevyšuje malý hrbolček pri jazyku. Zboku tak zub pripomína susednú trojku.',
      fact: 'Na mieste trvalej štvorky bola v detstve prvá mliečna stolička. Črenové zuby sa objavujú až v trvalom chrupe.',
    },
  },
  {
    ordinal: 'päťka', type: 'Črenový zub', purpose: 'Drvenie potravy pred jej rozomletím.',
    upper: {
      name: 'Druhý horný črenový zub',
      landmark: 'Dva hrbolčeky hornej päťky majú podobnú výšku. Medzi nimi sa drobné ryhy rozbiehajú do strán.',
      fact: 'Dva hrbolčeky na korunke ešte neurčujú počet koreňov. Horná päťka má najčastejšie jeden koreň.',
    },
    lower: {
      name: 'Druhý dolný črenový zub',
      landmark: 'Žuvacia plocha je širšia než na dolnej štvorke. Na strane jazyka môže mať jeden aj dva hrbolčeky.',
      fact: 'Ak má dolná päťka tri hrbolčeky, ryhy medzi nimi často pripomínajú písmeno Y.',
    },
  },
  {
    ordinal: 'šestka', type: 'Stolička', purpose: 'Drvenie a rozomieľanie potravy.',
    upper: {
      name: 'Prvá horná stolička',
      landmark: 'Otočte si zub žuvacou plochou k sebe. Dva protiľahlé hrbolčeky na širokej korunke spája šikmý hrebeň.',
      fact: 'Horná šestka má zvyčajne tri korene. Dva ležia pri líci a jeden pri podnebí.',
    },
    lower: {
      name: 'Prvá dolná stolička',
      landmark: 'Na širokej korunke býva päť hrbolčekov. Pod ňou sa obyčajne rozchádzajú dva korene, jeden smerom k päťke a druhý k sedmičke.',
      fact: 'Šestka vyrastá približne v šiestich až siedmich rokoch za poslednou mliečnou stoličkou. Na jej mieste predtým žiadny mliečny zub nebol.',
    },
  },
  {
    ordinal: 'sedmička', type: 'Stolička', purpose: 'Rozomieľanie potravy v zadnej časti chrupu.',
    upper: {
      name: 'Druhá horná stolička',
      landmark: 'Leží hneď za hornou šestkou. Zadný hrbolček na strane podnebia býva na sedmičke menší než na šestke.',
      fact: 'Horná sedmička sa zvyčajne prereže medzi dvanástym a trinástym rokom, o niekoľko rokov neskôr ako šestka.',
    },
    lower: {
      name: 'Druhá dolná stolička',
      landmark: 'Na korunke bývajú štyri podobne veľké hrbolčeky. Ryhy medzi nimi pri pohľade zhora často pripomínajú znamienko plus.',
      fact: 'Dolná sedmička má zvyčajne dva korene. Bývajú bližšie pri sebe než korene susednej šestky.',
    },
  },
];

export const DENTAL_ATLAS_GROUPS = QUADRANTS.map(({ digit, jaw, side, upper }) => ({
  label: `${jaw} · ${side}`,
  teeth: TOOTH_POSITIONS.map((tooth, index) => ({
    fdi: digit * 10 + index + 1,
    ...(upper ? tooth.upper : tooth.lower),
    patientName: [jaw.split(' ')[0], side.split(' ')[0], tooth.ordinal].join(' '),
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
