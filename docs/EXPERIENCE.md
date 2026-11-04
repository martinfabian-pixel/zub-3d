# Súvislý scrollový zážitok s 28 zubami

**Archív predchádzajúcej verzie s úvodnou hornou šestkou**, zodpovedajúci commitu `7b3c789`. Aktuálna hlavná stránka začína **dolnou šestkou FDI 36**, má navigáciu, opisy a priebežné ovládanie: [aktuálne rozhranie a spustenie](USABILITY.md). Nižšie uvedené rozmery zostavy, trasa kamery a snímky opisujú starší stav; jeho kód zostáva v Git histórii.

[Publikovaná stránka](https://martinfabian-pixel.github.io/zub-3d/experience/) · [Samostatný schválený zub](https://martinfabian-pixel.github.io/zub-3d/prototype/) · [Pôvodná prezentácia](https://martinfabian-pixel.github.io/zub-3d/)

Nová stránka `/experience/` používa **jednu scénu, jeden canvas a jednu kameru**. Zo schváleného horného ľavého prvého molára FDI 26 sa pohľad rozšíri na 25–27, štrnásť horných zubov a nakoniec všetkých 28 trvalých zubov bez osmičiek. V scéne nie sú ďasná, kosť ani ďalšie predmety. Horné korunky smerujú nadol, dolné nahor; oba oblúky zostávajú počas celej sekvencie na konečných miestach.

Pôvodné dva prehliadače, ich zdrojový kód a modely ostali zachované. Záloha pred novou fázou je Git tag `backup/before-dentition-experience-2026-11-04` na `0afbe635277f5fdf7b9f42b89ca8feb3e2599651`.

## Spustenie

Z koreňa repozitára, Node.js 22.12+ a pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Otvorte **http://127.0.0.1:5173/experience/**. Produkčný náhľad:

```sh
pnpm build
pnpm preview --port 4173
```

Otvorte **http://127.0.0.1:4173/experience/**. Normálna stránka nemá testovacie rozhranie. Opt-in `?qa=1` sprístupní lokálnu diagnostiku cez `window.__dentalExperience`; `?qa=1&material=clay` zobrazí neutrálny kontrolný materiál. Bežné spustenie ani build nepotrebujú Blender, Python, prihlásenie, platenú službu ani externé CDN.

## Kamera a scroll

Natívny posun stránky riadi normalizovaný parameter `progress` od 0 do 1. Konfigurovateľné autorské koncové body `story.startProgress/endProgress` ho mapujú na kameru aj reveal; aktuálne sú 0/1. Ich budúca výmena umožní opačný príbeh v tej istej architektúre bez druhého zloženého chrupu. Verejný prepínač poradia nie je pridaný. Sticky plocha zaberá viewport; celá sekcia má 480 svh na počítači a 440 svh na mobile, vrátane úvodného viewportu. Nezachytáva koliesko ani dotyk na posúvanie stránky. Preto sa nepoužíva scroll lock, vlastná zotrvačnosť ani ďalšia knižnica. Táto implementácia je alternatívou k GSAP/ScrollTrigger v zachovanom vanilla Vite + Three.js stacku.

| Priebeh | Stav na konci úseku |
|---|---|
| 0–0,055 | Jeden veľký FDI 26 |
| 0,12–0,34 | Susedia FDI 25 a 27, spolu 3 zuby |
| 0,34–0,64 | Celý horný oblúk, 14 zubov |
| 0,66–0,88 | Druhý oblúk, spolu 28 zubov |
| 0,88–1 | Pokojný finálny záber |

Pozícia, vzdialenosť, azimut, elevácia a cieľ kamery vychádzajú zo štyroch konfigurovateľných landmarkov. Používa sa tvar zachovávajúca kubická Hermitova interpolácia; vzdialenosť sa interpoluje logaritmicky, cieľ a orientácia spojito. Kamera meria skutočný hero povrch a transformované lokálne hranice ostatných modelov. Perspektívne centrovanie a malá vyhradená spodná plocha udržiavajú celé zuby v zábere aj na nízkych obrazovkách. Výpočet opakovane využíva jednu výstupnú pose.

Zuby sa nepremiestňujú, nezmenšujú ani nevymieňajú. Mení sa ich viditeľnosť v pevných anatomických polohách. Iba počas príchodu sa používa štandardné alpha zloženie s už vykreslenou scénou; zápis hĺbky zostáva zapnutý kvôli vzájomnému zakrývaniu uzavretých povrchov. Nie je to simulácia priehľadnosti skloviny. Dočasný hĺbkový materiál používa vstavaný `alphaHash` výlučne v tieňovej mape, ktorú filtruje PCF; intenzita tieňa tak rastie spolu s odhalením zuba. Na viditeľnom povrchu sa zrnitý hash nepoužíva. Po dokončení sa obnoví opaque PBR s opacity 1 a bežný úplný tieň. Nevykresľuje sa nepriehľadná biela silueta, ktorá by vybielila predchádzajúci zub. Návrat na rovnakú scrollovú pozíciu určuje rovnaký stav nezávisle od smeru a rýchlosti posúvania.

Na konci možno zapnúť **Preskúmať 3D**. OrbitControls dovolí otáčanie a pinch; pan je vypnutý. Zvislý dotyk zostáva vyhradený stránke a bežné koliesko okamžite vráti prezentáciu do scrollového režimu. Tlačidlo obnoví pohľad. Pri `prefers-reduced-motion` sa namiesto plynulého pohybu používajú štyri statické kompozície s rovnakými anatomickými stavmi a kratšou sekciou.

## Anatómia, materiály a osvetlenie

**Štrnásť skutočne odlišných predlôh Dundee** pokrýva rezáky, očné zuby, črenové zuby a stoličky zvlášť pre hornú a dolnú čeľusť. Pravé tvary sú zrkadlené ľavé predlohy, samostatne usadené podľa pravých pozícií v autorskej zostave. Nie sú to 28 nezávisle skenovaných zubov. Pri zrkadlení sa opraví poradie indexov aj orientácia tangentov normálovej mapy. FDI 26 zachováva schválený povrch a mapy; ani pri oddialení sa nenahrádza lacnejšou sieťou. Rovnaký tvar slúži aj zrkadlene pre 16.

[Dokumentácia všetkých zdrojov, autorov a licencií](DENTITION_SOURCES.md) obsahuje aj overené počty koreňov, nezrovnalosti pôvodných názvov dolných rezákov a hranice výučbovej predlohy. [Zdrojové súbory a reprodukcia](../assets/source/dentition/README.md) uchovávajú pôvodné matice, malé prezentačné korekcie, kontrolné súčty aj audit skutočných exportov. Po korekcii kontaktov a otvorení oblúkov o 8 mm sa na oboch odovzdaných geometriách nezistili pretínajúce sa povrchy v žiadnej zo 182 dvojíc v rovnakom oblúku ani 196 protiľahlých dvojíc. Toto nie je klinická validácia zhryzu.

Opätovne sa používa schválený opaque MeshPhysicalMaterial: metalness 0, opacity 1, transmission 0 a clearcoat 0. Sklovina je slonovinová s kontrolovanou lokálnou drsnosťou; korene teplejšie a matnejšie. Dve zdieľané atlasové textúry prenášajú pôvodné normály a dáta regiónov, drsnosti, tónovej variácie a ambientnej viditeľnosti. Dátové mapy majú `NoColorSpace`, výstup sRGB. Jemné mikropovrchy a 6,5 % priameho difúzneho wrap osvetlenia zostávajú aproximáciou schváleného materiálu, **nie plnohodnotným objemovým SSS**.

Lokálne HDR **Studio Small 09** prechádza PMREM filtrom. Tri mäkké plošné zdroje a slabší tieňujúci smerový zdroj sa prispôsobujú sledovanej oblasti; nepohybujú zubami. Výstup používa Neutral tone mapping, expozíciu 1,08 a čisto biele pozadie. Nie je pridaný bloom, depth of field, farebné efekty ani postprocessing. Referenciu [Raspberry](https://raspberry.luruke.com/) sme tentoraz skutočne otvorili a vizuálne preskúmali; jej assety ani shadery sa nekopírovali.

## Dáta a výkon

| Profil | Hero GLB | Atlas 13 ďalších typov | Celý viditeľný chrup | Dátové mapy | Limit DPR |
|---|---:|---:|---:|---|---:|
| Desktop | 3,51 MB | 9,38 MB | 592 016 trojuholníkov | Hero 2×2048², atlas 2×2048² | 1,5 |
| Mobil | 2,72 MB | 4,23 MB | 333 016 trojuholníkov | Hero 2×1024², atlas 2×1024² | 1,35 |

Počty sa vzťahujú na povrchy, nie súčet farebného a tieňového priechodu. Vo finále je 28 farebných draw calls a samostatný tieňový priechod. Súbory GLB majú vložené komprimované PNG textúry; pri načítaní netreba runtime Draco dekodér. Mipované RGBA textúry oboch materiálových sád zaberú približne 85,3 MiB desktop / 21,3 MiB mobil; nejde o celkovú GPU pamäť, pretože to nezahŕňa geometriu, HDR, PMREM, tiene, framebuffery a režijné náklady prehliadača.

Hero a prostredie sa načítajú ako prvé. Atlas sa začne preberať po prvom vykreslenom snímku, ešte pred tým, ako ho scroll potrebuje. Materiály sa predkompilujú. Pri veľmi pomalom spojení a okamžitom preskočení stránky zostáva zub v zábere s informáciou o načítaní; nevznikne prázdna vzdialená scéna. Jedna úroveň detailu sa vyberie pri načítaní a počas scrollu sa nemení.

Kreslí sa iba po zmene scrollu, veľkosti alebo počas ručnej interakcie a tlmenia. Skrytá karta nekreslí. Adaptívne DPR reaguje na merané rAF intervaly pri pohybe, po ukončení sa obnoví plné povolené rozlíšenie; topológia zostáva rovnaká. Dispose ruší downloady, listenery, observer, animáciu, ovládanie, geometriu, materiály, textúry a PMREM/tieňové targets.

## Kontrola výsledku

Skutočné WebGL rendery boli skontrolované vo všetkých štyroch fázach, na emulovanom mobilnom portréte a na šírku. Dodatočne sa preskúmala žuvacia plocha v makre a bočný, zadný a okluzálny pohľad vrátane neutrálneho materiálu. Po prvej kontrole sa opravil výpočet svetových matíc pomocnej geometrie pre rámovanie v Three.js r186 a odstup ovládania na krátkych obrazovkách.

- Produkčný build; Khronos validácia oboch atlasov bez chýb a varovaní; nezávislá kontrola koreňových vetiev a geometrie. Pôvodné dva hero GLB ostali bajtovo nezmenené.
- Numerické testy kamery: projekcie, spojitosť, presné spätné vyhodnotenie 501 pozícií, pevné manuálne matice, posledný hold, znížený pohyb, zrušenie scroll drivera.
- [Produkčné WebGL QA](experience-review/report.json): **115 úspešných kontrol** vrátane počtov 1/3/14/28, jednej scény/canvasu, stále rovnakej matice hero, skutočných projekcií viditeľných vrcholov, rýchlych skokov a spätného scrollu, touch/wheel, idle, reduced motion, pomalých/chýbajúcich dát, WebGL fallbacku, abortu a dispose. V 43 porovnaniach kritických začiatkov, dokončení alpha prechodu a pôvodných tieňových prahov pri nehybnej kamere neprekročila zmena žiadneho pixela 7/255 na farebný kanál. Tým sa overila oprava krátkeho vybielenia a skokov tieňa v týchto konkrétnych prechodoch, nie všeobecná záruka všetkých rendererov.
- Regresné QA pôvodnej stránky a schváleného `/prototype/` prešlo vrátane ovládania a chybových stavov. Pri normálnom používaní sa nezistili JavaScript chyby ani chybné assetové požiadavky. Nefatálne varovanie ANGLE/D3D11 X4122 o presnosti výpočtu zostáva v surovom reporte; neskrýva sa.

Meranie na **RTX 3060 Ti / ANGLE D3D11**, vlastný headless Chrome: počas natívneho scrollovania median rAF približne **16,7 ms**, P95 približne **17,0 ms**, 90 meraných intervalov na viewport. Mobilný viewport používa ten istý desktopový GPU. Nie je to meranie telefónu ani GPU timer query. Fyzický iPhone a Safari na reálnom zariadení neboli dostupné; ich výkon sa preto nepotvrdzuje.

Na opakovanie browser QA treba vývojársky nainštalovaný Playwright a Chrome. Balík nie je runtime závislosťou stránky. Cestu možno zadať cez `PLAYWRIGHT_MODULE_PATH`; test spúšťa vlastný headless proces a povoľuje iba localhost.

```sh
node scripts/validate-dentition.mjs
node scripts/test-journey.mjs
# Samostatne spustený pnpm preview na porte 4173:
# EXPERIENCE_TEST_URL=http://127.0.0.1:4173
node scripts/test-experience.mjs
```

Snímky: [jeden zub](experience-review/desktop-hero.png), [susedia](experience-review/desktop-neighbors.png), [horný oblúk](experience-review/desktop-upper.png), [celý chrup](experience-review/desktop-full.png), [mobil](experience-review/mobile-full.png), [detail korunky](experience-review/hero-crown.png).

## Zmenené súbory a obmedzenia

- `experience/index.html` a `src/experience/`: konfigurácia, scéna, načítanie, pevná anatómia, materiál, svetlá, kamera/timeline, scroll, lifecycle a minimálne štýly.
- `public/dentition-assets/` a `assets/source/dentition/`: dva atlasy, manifest, pôvodné predlohy, licencie a geometrické audity; `scripts/prepare_dentition.py` a requirements reprodukujú exporty.
- `scripts/test-journey.mjs`, `test-experience.mjs`, `validate-dentition.mjs`; Vite má tretí samostatný HTML vstup, GitHub Actions overuje aj nový atlas a kamerovú matematiku.
- Táto dokumentácia, zdroje, skutočné snímky a odkazy v README/ATTRIBUTION. Existujúce prehliadače sa neprepisovali.

**Zostávajúce hranice:** Dundee je výučbová rekonštrukcia, nie individuálny pacientsky sken alebo nová microCT akvizícia. Časť fisúr je mäkšia, symetria opačných strán je založená na zrkadlení, materiálové masky a optické parametre nie sú merané tkanivové dáta. Pri makre je táto hranica viditeľná; výsledok sa nevydáva za nerozoznateľný od fotografie. Mierka a otvorenie oblúkov sú ilustračné. Prípadná ďalšia výmena presnejšieho modelu sa dá vykonať cez geometriu/mapy a FDI manifest bez prepisovania scrollovej scény.

Geometria a odvodené mapy: **CC BY 4.0, University of Dundee** s menovanými prispievateľmi. HDR: **CC0, Sergej Majboroda / Poly Haven**. Kód: MIT. Neboli použité platené assety ani služby.
