# Kontrola finálnej edukačnej prezentácie

Skutočné snímky WebGL v headless Chrome 156.0.8078.80, 4. novembra 2026. Testovaný modul `main-DyDA6a-O.js`, štýly `main-CeQb4Gdb.css`. Celý [report](report.json) zaznamenáva **389 úspešných kontrol**, žiadne nové chyby JS/WebGL, neúspešné či externé požiadavky alebo 404. Jedno nefatálne upozornenie natívneho ANGLE X4122 na presnosť shaderového výpočtu je v reporte zachované.

| Kapitola | Desktop 1280 × 900 | Emulovaný mobil 390 × 844 |
|---|---|---|
| Zub 36 | [Snímka](desktop-hero.png) | [Snímka](mobile-hero.png) |
| Priestor 36–37 | [Snímka](desktop-space.png) | [Snímka](mobile-space.png) |
| Povlak | [Snímka](desktop-plaque.png) | [Snímka](mobile-plaque.png) |
| Dutina | [Snímka](desktop-caries.png) | [Snímka](mobile-caries.png) |
| Kontakt kefky | [Snímka](desktop-brush.png) | [Snímka](mobile-brush.png) |
| Výsledok | [Snímka](desktop-result.png) | [Snímka](mobile-result.png) |
| Celý chrup | [Snímka](desktop-full.png) | [Snímka](mobile-full.png) |

V adresári je spolu **33 snímok**, vrátane ďalších polôh kefky, dolného oblúka a všetkých siedmich kapitol v rozmeroch 844 × 390 a 320 × 568. [Porovnanie povlaku pred a po](../proximal-story-review/brush-cleaning-pair.jpg) má tú istú kameru a osvetlenie; výrez je zväčšený. Dutina má stále rovnakú geometriu. Nános mimo dosahu sa nestlmí počas čistenia.

Kontroly zahŕňajú skutočné navigačné kliknutia, zvislý aj spätný posun, vzdialené skoky, nemennú identitu a polohu zuba 36, zdravú 46, lokálne odstránenie povlaku, pretrvávajúcu dutinu, 28 zubov v závere, myš, emulovaný dotyk, klávesnicu, reset, zoom, sedem stavov obmedzeného pohybu, ručnú kameru pri resize a 34 medzipolôh návratu z preskúmania.

Vynútená chyba údajov kazu po prevzatí 28 anatomických objektov ponechala zdravý hlavný zub použiteľný, upozornenie čitateľné a tlačidlo obnovenia dostupné. Po uvoľnení scény bolo 0 sledovaných GPU geometrií a textúr; opakované uvoľnenie stav nezmenilo a žiadny ImageBitmap sa nezavrel dvakrát. Skúška skutočnej straty WebGL kontextu počas oneskoreného načítania ponechala správny chybový text a neobnovila príznak pripravenosti.

Produkčný `dist` bol podaný aj pod striktným prefixom `/zub-3d/`: hlavná adresa, `/experience/`, `/prototype/` a `/legacy/` načítali správne modely a moduly bez úniku ciest na koreň servera. Pôvodné assety a rozmiestnenie chrupu zostali binárne zhodné s funkčným základom.

[Samostatné izolované meranie](performance.json) uvádza zostavu, GPU, zahrievanie a 120 meraných intervalov pre každý zo štyroch priechodov. Ide o intervaly requestAnimationFrame pri prirodzenom posune na desktopovom GPU, nie o čas GPU shaderov alebo výkon fyzického telefónu.

Mobilný rozmer, DPR a dotyk sú **emulované na desktopovom GPU**. Test nepotvrdzuje výkon či Safari na fyzickom iPhone. Priestorové kontroly tvrdých povrchov a [odborné referencie](../DENTAL_STORY_SOURCES.md) nevytvárajú klinickú validáciu použitia pomôcky v živých ústach.
