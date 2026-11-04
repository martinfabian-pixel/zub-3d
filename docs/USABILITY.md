# Interaktívna prehliadka od dolnej šestky po celý chrup

> Archív funkčnej verzie `333c359` pred rozšírením na sedem edukačných kapitol. Aktuálnu hlavnú stránku a alias `/experience/` opisuje [DENTAL_STORY.md](DENTAL_STORY.md). Nasledujúce počty krokov a výsledky testov sa vzťahujú na túto staršiu verziu.

[Hlavná stránka](https://martinfabian-pixel.github.io/zub-3d/) začína detailom **dolnej ľavej prvej stoličky FDI 36**. Tlačidlá umožňujú prejsť priamo na ľubovoľný krok; bežné posúvanie stránky zachováva plynulý pohyb kamery. Rovnaká prezentácia je dostupná aj na [`/experience/`](https://martinfabian-pixel.github.io/zub-3d/experience/). Predchádzajúci hlavný prehliadač je na [`/legacy/`](https://martinfabian-pixel.github.io/zub-3d/legacy/); jeho pôvodné modely zostávajú zachované. [Samostatný prototyp](https://martinfabian-pixel.github.io/zub-3d/prototype/) sa nezmenil.

| Krok | Čo návštevník vidí |
|---|---|
| **1 · Jeden zub** | FDI 36: dolná prvá stolička s dvoma pôvodnými koreňmi. |
| **2 · Susedia** | FDI 35–37: pred šestkou druhý črenový zub, za ňou druhá stolička. |
| **3 · Dolný oblúk** | Všetkých 14 dolných zubov, od stredných rezákov po druhé stoličky. |
| **4 · Celý chrup** | Pridá sa horný oblúk: 28 trvalých zubov bez osmičiek, bez ďasien a kostí. |

## Ovládanie

Štyri tlačidlá krokov sú stále k dispozícii. **Celý chrup** v hlavičke preskočí priamo na zostavu a značka **ZUB.** vráti prezentáciu na začiatok. Na počítači sú pri popise aj tlačidlá predchádzajúceho a ďalšieho kroku. **Ovládanie** otvorí stručnú pomoc. Aktuálny krok je označený pre čítačku obrazovky; zmena sa oznamuje pri prechode medzi krokmi.

Model sa dá **otáčať, približovať a resetovať v každom kroku**. Po voľbe **Otáčať model** ho na počítači otočíte ťahaním; na dotykovej obrazovke ťahom do strán. Koliesko myši a zvislý ťah naďalej posúvajú stránku. Na priblíženie a oddialenie slúžia tlačidlá **+ / −**. Šípka **↺** obnoví kameru aktuálneho kroku.

Pri zameraní 3D plochy klávesnicou ovládajú šípky otáčanie, **+ / −** vzdialenosť a **Home** pôvodný pohľad daného kroku. **Escape** ukončí ručné otáčanie; pomoc sa dá zavrieť aj klávesom Escape. Odkaz na preskočenie obsahu umožňuje prejsť priamo na model. Popis, navigácia a ovládacie prvky majú priestor mimo samotného 3D obrazu. Pri zmene veľkosti okna sa kamera rámuje podľa rozmerov dostupnej plochy modelu.

## Modely a načítanie

Úvodný zub aj jeho pravý náprotivok FDI 46 používajú geometriu dolnej šestky Dundee: **55 184 trojuholníkov**, rovnakých pre oba profily. Zdroj nemá samostatnú normálovú textúru. Výstup zachováva normály vrcholov, používa neutrálnu normálovú mapu **1 × 1** a mapu materiálových parametrov **2048² / 1024²**. [Pôvod zuba 36, licencia a kontrola geometrie](LOWER_HERO.md).

Horné prvé stoličky **26 a 16** naďalej používajú schválený model hornej šestky. Spoločný atlas obsahuje 13 predlôh; jeho jednoduchšiu 36 v scéne nahrádza nový detailný model. Výsledok má **14 rôznych anatomických tvarov**. Náprotivky na opačnej strane sú zrkadlené a majú vlastné polohy odvodené z celého chrupu Dundee. [Zdroje a vysvetlenie priradenia FDI](DENTITION_SOURCES.md).

Ako prvé sa načítajú úvodná šestka, rozloženie zubov a osvetlenie. Po prvom vykreslení sa načíta atlas a samostatná horná šestka. Všetky kroky používajú tú istú scénu a kameru. Pri pomalom spojení zostáva úvodný zub v zábere, kým sú ďalšie modely pripravené.

| Celá zobrazená zostava | Počítač | Menší profil |
|---|---:|---:|
| Trojuholníky povrchov, bez ďalšieho tieňového priechodu | 658 384 | 422 384 |
| Odhad dekódovaných RGBA8 textúr troch sád s mipmapami | 106,7 MiB | 26,7 MiB |

Pamäťový odhad nezahŕňa geometriu, HDR, framebuffer ani réžiu ovládača. V [kontrole skutočných exportov](lower-hero-review/contact-audit.json) sa pri uložených polohách a prezentačnom otvorení oblúkov 8 mm nezistil prienik v žiadnej zo 182 dvojíc v rovnakom oblúku ani 196 protiľahlých dvojíc; platí to pre oba profily. Výsledok neoveruje klinický zhryz. Materiály a mikropovrch sú výtvarnou aproximáciou. Nejde o meranú segmentáciu, plnohodnotnú simuláciu podpovrchového rozptylu ani o fotografické meranie skloviny.

## Spustenie a overenie

Z koreňa repozitára, s Node.js 22.12+ a pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Otvorte **[http://127.0.0.1:5173/](http://127.0.0.1:5173/)**. Produkčná zostava: `pnpm build`; lokálna kontrola zostavy: `pnpm preview`. Aplikácia používa Vite a Three.js r186 bez ďalšieho frameworku. Bežné spustenie nepotrebuje Blender ani Python.

Hlavné súbory: `index.html` a `experience/index.html` obsahujú rozhranie; `src/experience/interface.js` obsluhuje navigáciu a pomoc; `src/experience/config.js`, `arch.js`, `timeline.js` a `main.js` riadia zuby, kameru, načítanie a interakciu. `legacy/index.html` používa pôvodný prehliadač s upravenou základnou cestou k súborom. Nové exporty sú v `public/dentition-assets/hero-36*.glb`. Predchádzajúci stav označuje tag `backup/before-usable-lower-molar-2026-11-04`.

Geometriu a kameru možno skontrolovať cez `node scripts/validate-lower-hero.mjs` a `node scripts/test-journey.mjs`. Produkčnú prehliadačovú kontrolu dokumentuje [report konkrétnej zostavy](usability-review/report.json); úvodný stav ukazujú snímky [počítača](usability-review/desktop-hero.png) a [mobilného rozloženia](usability-review/mobile-hero.png). Mobilný viewport a dotyk sú emulované. Výkon fyzického telefónu ani vykreslenie v Safari na skutočnom zariadení sa tým nepotvrdzujú.

Finálna produkčná zostava prešla **216 kontrolami** vo vlastnom headless Chrome vrátane štyroch rozmerov 1280×900, 390×844, 844×390 a 320×568. Overené boli priame kroky, spätný scroll, reset každej kompozície, zoom, myš/dotyk/klávesnica, pomoc, znížený pohyb, chybové stavy, zrušenie načítania a uvoľnenie zdrojov. Pri dokončení preberania na pozadí ani pri obnovení stránky sa neprepíše ručne nastavená kamera. Kontrola zahŕňa aj opätovné zvolenie kroku na rovnakej pozícii posunu. Text, canvas a toolbar sa neprekrývajú; aktívny krok oznamuje správnu skupinu zubov.

[Test ciest](usability-review/prefix-smoke.json) aj celá prehliadačová súprava bežali na lokálnom serveri, ktorý povoľoval výlučne prefix `/zub-3d/`; mimo neho vracal 404. Hlavná stránka, alias, archív, prototyp a atribúcie sa načítali bez únikov do koreňa domény. [Samostatná regresia predchádzajúcich prehliadačov](usability-review/previous-viewers-regression.json) tiež prešla. V normálnych scenároch sa nezistili JavaScript chyby ani zlyhané požiadavky. V surovom reporte zostávajú nefatálne varovania presnosti ANGLE X4122.

Pri natívnom scrollovaní na **RTX 3060 Ti / ANGLE D3D11** bol medián 90 meraných rAF intervalov 16,7 ms; P95 16,9 ms desktop a 17,0 ms mobilná emulácia na tom istom GPU. Nie je to meranie výkonu telefónu ani GPU timer query. Stránka obmedzuje DPR, pri nečinnosti nekreslí a pozastaví vykresľovanie v skrytej karte.

Ďalšie skutočné snímky: [susedia](usability-review/desktop-neighbors.png), [dolný oblúk](usability-review/desktop-arch.png), [celý chrup](usability-review/desktop-full.png), [mobilný celý chrup](usability-review/mobile-full.png), [malý telefón](usability-review/small-phone-full.png). Skript `scripts/test-experience.mjs` umožňuje test zopakovať s Playwright/Chrome; `PLAYWRIGHT_MODULE_PATH`, `EXPERIENCE_TEST_URL` a `EXPERIENCE_REVIEW_DIR` nastavia miestne nástroje, server a výstup.
