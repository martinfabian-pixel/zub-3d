# Čo sa deje medzi zubami

Na hlavnej stránke aj v `/experience/` spája jedno priehľadné plátno zuby, nástroj a sedem kapitol nad ľadovomodrým pozadím. Názov kapitoly je dvojriadkový HTML nadpis priamo nad scénou. V priestore medzi 36 a 37 pribúdajú popisky naviazané na konkrétne plochy zubov. Ich poloha sa mení spolu s pohľadom. [Otvoriť príbeh](https://martinfabian-pixel.github.io/zub-3d/experience/) · [Aktuálne snímky a overenie](SHARED_STAGE_QA.md).

| Kapitola | Poloha príbehu | Akcia v scéne |
|---|---:|---|
| Zub | 0–0,10 | Tá istá dolná ľavá prvá stolička FDI 36 s dvoma koreňmi. |
| Priestor | 0,10–0,22 | Susedia 35 a 37 v pôvodných polohách; kamera prejde ku konkrétnemu priestoru 36–37. |
| Povlak | 0,22–0,34 | Tenká vrstva na skutočných protiľahlých povrchoch, farebne zvýraznená pre názornosť. |
| Kaz | 0,34–0,48 | Skorá kriedová zmena a následná lokálna priestorová kavitácia iba na 36. |
| Čistenie | 0,48–0,72 | Fialová medzizubná kefka sa zarovná zboku, jemne zasunie, urobí tri ilustračné axiálne priechody a vysunie sa. Kamera počas pracovných pohybov stojí. |
| Výsledok | 0,72–0,80 | V dosahu kefky ubudol povlak, nezasiahnutý zvyšok aj vzniknutá dutina zostávajú. |
| Chrup | 0,80–1 | Od rovnakého miesta cez 14 dolných zubov k obom oblúkom s 28 zubami. Lézia sa nevymaže. |

## Spustenie a ovládanie

Node.js 22.12+ a pnpm 10, z koreňa repozitára:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Otvorte `http://127.0.0.1:5173/` alebo `http://127.0.0.1:5173/experience/`. Produkčná zostava: `pnpm build`, náhľad: `pnpm preview`. Blender ani Python nie sú potrebné na spustenie či build.

Zvislý posun stránky riadi celý príbeh bez zachytávania scrollu. Na každom rozmere obrazovky je sedem bodiek na priamy výber kapitoly a dve šípky pre susedné kapitoly. Číslo pri nadpise ukazuje aktívny krok. Priame ťahanie funguje bez prepínača. Na dotyku je v základnom režime vodorovné, aby zvislý pohyb zostal stránke. **Preskúmať v 3D** pri prvom zube a **Voľné 3D** v ďalších kapitolách držia aktuálny dej a umožnia obe osi aj pinch či koliesko na zoom; iba táto 3D plocha používa `touch-action:none`. **Pokračovať v príbehu** alebo Escape obnoví držanú polohu stránky a plynulo odovzdá kameru príbehu. Malý scroll, resize ani načítanie ručný pohľad nerušia. Pri zámernom prechode do inej kapitoly sa kamera preberie plynulo. Pri obmedzenom pohybe je návrat okamžitý a príbeh používa sedem pokojných stavov.

Šípky na zameranej 3D ploche otáčajú, +/− približujú, Home resetuje pohľad. Tlačidlá zoomu nemenia režim. Záver ponúka **Úsmev**, **Anatómia** a to isté **Voľné 3D**. K čisteniu sa možno vrátiť jeho bodkou.

## Architektúra a zmenené súbory

- `src/experience/story-config.js`: sedem kapitol, slovenské texty a hranice jednotlivých dejov; `config.js`: spoločné materiálové a kamerové parametre.
- `dental-story.js`: čisté `sampleDentalStory(progress, out)` a znížený pohyb. Oddelené `plaqueDeposition`, `plaqueCoverage`, `lesionProgress`, `brushPose` a `cleaningProgress`; žiadny spoločný parameter „špiny“.
- `arch.js`: pôvodné pevné anatomické transformácie a odhaľovanie zostavy. Spravuje vlastníctvo vypožičaných GLTF zdrojov aj pri čiastočnej chybe načítania.
- `story-camera.js` vychádza zo zmeraného miesta záujmu. `timeline.js` a `camera.js` vzorkujú umiestnenie objektu v obraze, optické zväčšenie a kamerovú pózu. Posun projekcie zachováva celé plátno. `view-controller.js` zapisuje výslednú polohu a orientáciu kamery a pridáva ručné otáčanie, priblíženie aj návrat podľa `inspection.js`. Gestá spracúva `gestures.js`.
- `caries.js`: súkromná kópia geometrie a shaderové rozšírenie iba zuba 36. Zdravý pôvodný súbor a zrkadlená 46 sa nemenia.
- `plaque.js`: priliehajúce povrchové výrezy a deterministická priestorová maska zásahu. `cleaning-path.js`: zmeraná dráha a dosah; `interdental-brush.js`: vlastný neznačkový model, instancované vlákna a obmedzené ohnutie.
- `main.js`, `assets.js`, `scene.js`: jedna renderovacia slučka, postupné načítanie, synchronizácia všetkých vrstiev a uvoľnenie zdrojov vrátane troch svetelných LUT v pripnutej verzii Three.js.
- `stage-typography.js` odvodzuje polohu, veľkosť, priehľadnosť a nepatrný zvislý posun nadpisu z rovnakého priebehu ako kamera. `interface.js` aktualizuje jeden sémantický nadpis, ovládanie a podrobnosti v poznámkach. `stage.css` vrství tieto prvky nad plátno. `scroll.js` používa prirodzený posun dokumentu a zachováva polohu pri zmene rozmerov.
- `annotation-surfaces.js` získava kotvy z trojuholníkov živých povrchov. `annotations.js` premieta kotvy cez aktuálnu kameru, kontroluje ich zakrytie a umiestňuje HTML popisky s čiarami SVG. Architektúru používajú oba vstupy `index.html` aj `experience/index.html`.
- `public/story-assets/`: údaje miesta, riedky morph a kredity; `assets/source/proximal-story/`, prípravné a validačné skripty: reprodukovateľný pôvod priestorových úprav. `vite.config.js` verzionuje tieto údaje samostatným obsahovým hashom.
- `.github/workflows/pages.yml`: pôvodné validačné kroky doplnené o údaje lézie, stav príbehu a lokálny dosah čistenia.

Pri rovnakom progress vznikne rovnaký stav, bez kreslenia do trvalej textúry alebo jednorazových udalostí. Načítanie na pozadí nemení progress ani ručne nastavenú kameru. Pri rýchlom preskočení na ešte nenačítanú časť zostáva prvý zub s načítacou informáciou; po dokončení sa zobrazí požadovaný stav.

## Dutina, povlak a dráha kefky

[Geometrický rozbor](PROXIMAL_SITE.md) uvádza súradnice, mierku, údaje o kontrolách aj obmedzenia merania. Základné GLB sú v metroch, spoločná scéna v centimetroch a rozmery pomôcky v milimetroch. Všetky nové kotvy vychádzajú z jedného overeného `site.json`, nie z nesúvisiacich súradníc v rôznych moduloch.

Kaz má riedky relatívny morph so zmenou pozícií a normál, bez výpočtu CSG počas renderovania. Teraz sa pôvodná lokálna sieť predpočíta jemnejšie: 4 197 nových stredových bodov hrán, spolu 31 938 vrcholov a 63 578 trojuholníkov na súkromnej kópii 36. Morph posúva 1 236 vrcholov a 1 904 záznamov nesie aj susedné normály a materiálovú masku. Dno má 1 267 plôch namiesto pôvodných 59. Rozsah približne 2,41 × 1,48 mm a hĺbka 0,769 mm zachovávajú veľkosť a stred verzie `510a734`; účelom je ostrý okraj a hĺbka, nie ďalšie zväčšovanie. Po kapitole kazu zostáva geometrický aj materiálový stav konštantný počas čistenia a záveru. [Aktuálne priestorové kontroly](proximal-reframe-review/GEOMETRY-AUDIT.md).

Povlak používa pôvodné trojuholníky zubov s posunom 20–36 µm nad povrch. Pevná nepravidelná hustota zvýrazňuje pracovný pás; mimo neho zostáva slabší, ale nenulový film. Táto počiatočná hustota sa pri čistení nemení. Odstránenie má samostatnú masku podľa vzdialenosti od dráhy a najhlbšieho dovtedy dosiahnutého bodu. Mimo polomeru štetín sa neodstraňuje nič. Dutina má vlastnú masku, aby cez ňu neležala pôvodná zdravá plocha povlaku. Nejde o globálne stlmenie vrstvy ani zmenu tkaniva kefkou.

Os kefky bola vybraná pod kontaktom koruniek pri krčkovej oblasti. Úplný overený priamy koridor má 14,35 mm; **zobrazený zdvih je kratší, 11,7 mm**, aby pracovná hlava zostala čitateľná. Kratší zdvih sa používa aj v maske dosahu povlaku. Drôt má priemer 0,18 mm a voľný priemer štetín je 1,2 mm. Objímka a rukoväť zostávajú na vstupnej strane. Stred dutiny je mimo dosahu štetín: nástroj sa nezasúva do kazu. Geometrické kontroly nepovažujú všetok priestor bez zobrazeného ďasna za dostupný priestor v skutočných ústach. [Model kefky, deformácia a kontakt](INTERDENTAL_BRUSH.md).

## Výkon a overenie

Prvý zub nečaká na nové príbehové údaje ani celý atlas. Tie sa preberajú po prvom vykreslení. Existujúce kompaktné atlasové mapy, PMREM, limit DPR a adaptívne rozlíšenie zostávajú zachované. Zub 36 má rovnakú geometriu a léziu na oboch profiloch; kompaktnejšia 37 má vlastný registrovaný výrez povlaku. Kefka používa 344 fyzických vlákien na počítači a 208 v menšom profile, cez 688/416 instancovaných segmentov. Nevzniká samostatný mesh a draw call pre každé vlákno.

Renderovanie je podľa potreby, pokračuje počas interakcie a tlmenia a zastaví sa pri skrytej karte. Kamera pri čistení stojí. Vo frame slučke sa nevypočítava CSG ani celý chrup. Geometrie, materiály, textúry, ImageBitmap, ovládanie a poslucháče sa uvoľňujú pri zrušení scény.

Reprodukovateľné numerické kontroly:

```sh
node scripts/validate-model.mjs
node scripts/validate-prototype.mjs
node scripts/validate-dentition.mjs
node scripts/validate-lower-hero.mjs
node scripts/test-journey.mjs
node scripts/validate-proximal-site.mjs
node scripts/test-dental-story.mjs
node scripts/test-stage-typography.mjs
node scripts/test-cleaning-path.mjs
node scripts/test-inspection-return.mjs
node scripts/test-view-controller.mjs
pnpm build
```

Prehliadačová kontrola vyžaduje lokálny Playwright a Chrome. Pri spustenom produkčnom náhľade:

```sh
node scripts/test-dental-story-browser.mjs
```

Premenné `DENTAL_STORY_TEST_URL`, `DENTAL_STORY_REVIEW_DIR`, `PLAYWRIGHT_MODULE_PATH` a `DENTAL_STORY_BENCHMARK_ONLY=1` umožňujú zvoliť lokálnu adresu, výstup a samostatné meranie časovania. Skript používa vlastný nový profil a povoľuje iba loopback preview. Nevyužíva osobný profil používateľa. [Výsledný report a snímky](story-review/README.md) odlišujú skutočné renderovanie na desktopovom GPU od emulácie rozmerov a dotyku mobilu.

Aktuálne kontroly pokrývajú rozloženie, nadpisy, kotvy popisiek, gestá a prechody kamery. Mobilné rozmery aj dotyk emuluje Chrome na počítači. Predchádzajúce vydania majú vlastné samostatné záznamy. [Aktuálne QA](SHARED_STAGE_QA.md) · [Podrobná dutina vo verzii `3f52ac5`](VISUAL_POLISH.md) · [Ovládanie verzie `510a734`](INTERACTION_QA.md).

Voliteľné priestorové overenie všetkých reálnych vlákien a pevných častí používa `node scripts/audit-brush-contact.mjs` s Blenderom; podrobnosti a výsledky sú v dokumente kefky. Nezávislý offline audit morpha skúša viac stavov dutiny a obe úrovne detailu. Nie je to náhrada vizuálnej kontroly webu.

## Zdroje a zostávajúce hranice

Zuby a odvodené anatomické údaje: University of Dundee, Emily McDougall, Dr. Andrew Mason a Mark Roughley, **CC BY 4.0**. HDR Studio Small 09: Sergej Majboroda / Poly Haven, **CC0**. Vlastná neznačková kefka, shaderové materiály a kód: **MIT**. Žiadne platené podklady ani prevzaté produktové modely. [Úplná atribúcia](../ATTRIBUTION.md), [kredity nových úprav](../public/story-assets/credits.txt).

[Medicínsky obsah a odkazy NIDCR, NHS, TePe](DENTAL_STORY_SOURCES.md) sú súčasťou dokumentácie. Farba povlaku, zhusťovanie času, lézia a deformácia štetín sú ilustračné. Rozptyl v sklovine je obmedzená real-time aproximácia; nejde o meranú optiku tkanív. Lesia na 36 je nová autorská hypotéza, nie patológia z pôvodného modelu.

Prezentácia nie je klinicky validovaná. Pred použitím ako samostatného klinického návodu má zubný lekár alebo dentálna hygienička posúdiť najmä miesto lézie, vhodnosť dráhy a veľkosti kefky, kontakt pri nezobrazených mäkkých tkanivách a zrozumiteľnosť rozlíšenia povlaku od chýbajúceho tkaniva. Kontrola proti digitálnym tvrdým povrchom nepotvrdzuje bezpečné zasunutie v konkrétnych ústach. Na fyzickom iPhone ani v jeho Safari sa táto verzia zatiaľ netestovala.
