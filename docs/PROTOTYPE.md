# Samostatný prototyp jedného zuba

Implementácia z 28. októbra 2026. Prototyp je oddelený od pôvodnej prezentácie: **`/prototype/`**. Pôvodné `index.html`, `src/main.js`, `src/style.css`, `src/tooth-material.js`, modely v `public/models/` a zdroj Dundee sa nemenili. Vite má dva HTML vstupy; pôvodná stránka sa stále zostavuje a bola otvorená v regresnom teste.

[Povrchové doladenie zo 4. novembra 2026](REFINEMENT_2026-11-04.md) zachováva schválený tvar a paletu; dopĺňa korektnejší výpočet jemného reliéfu a ohraničenú lokálnu variáciu povrchu. GLB aj ich rozlíšenie zostali rovnaké. Nové snímky a funkčné testy sú oddelené od pôvodného záznamu nižšie.

## Spustenie

Z koreňa repozitára `zub-3d`:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Otvoriť **http://127.0.0.1:5173/prototype/**. Produkčná zostava: `pnpm build`; náhľad: `pnpm preview`, potom **http://127.0.0.1:4173/prototype/**. Publikovaný prototyp: https://martinfabian-pixel.github.io/zub-3d/prototype/.

Neutrálny materiál na kontrolu geometrie: `/prototype/?material=clay`. Úvodný pohľad na korunu: `/prototype/?view=crown`. Tieto parametre nepridávajú ďalší objekt. Bežné rozhranie obsahuje iba zoom, žuvaciu plochu, reset a povinný kredit modelu.

## Geometria a dôvod výberu

Zub je horná ľavá prvá trvalá stolička **FDI 26 / UL6**, tri pôvodné korene. Používa spojitý vonkajší povrch modelu Dundee, nie primitíva, skombinované typy zubov alebo novovymyslené korene. Anatomické referencie a kandidáti sú v [predchádzajúcom porovnaní](MODEL_REVIEW.md), najmä kapitola vydavateľa LWW/Scheid/Woelfel o horných molároch.

Predchádzajúce procedurálne prehĺbenie úzkych konkávnych oblastí vytvorilo hranaté, zvlnené dráhy fisúr. Sú viditeľné už v [neutrálnom kontrolnom renderi predchádzajúcej verzie](prototype-review/previous-clay-top.png), teda ich nespôsobuje len lesk či osvetlenie. [Pôvodný povrch](prototype-review/source-clay-top.png) je plynulejší. Numerické [porovnanie](prototype-review/geometry-comparison.json) zaznamenáva nárast ostrých okluzálnych hrán starej adaptácie; tento ukazovateľ sám nehodnotí anatomickú presnosť.

Pre prototyp sa preto zachovali pôvodné pozície a trojuholníky po orientácii a zmene ilustračnej mierky. Bez prehlbovania, subdivision, zjednodušovania alebo vnútorných uzáverov. Sklovina a korene sú súčasťou jednej siete a odlišuje ich plynulá maska. Zvarenie UV švov dáva uzavretý, konzistentne orientovaný povrch. Normály a tangenty pochádzajú zo zdroja. Oba exporty majú **57 008 trojuholníkov a 28 875 vrcholov s UV švami**.

Tým sa odstránili umelé geometrické ryhy a obruba, ale **nevznikli nové namerané anatomické detaily**. Dundee je ZBrush rekonštrukcia podľa CT, s miestami široko vyhladenou žuvacou plochou. Pri extrémnom priblížení je to podstatné obmedzenie.

## Materiál a svetlo

Jeden `MeshPhysicalMaterial`, `metalness = 0`, `opacity = 1`, `transmission = 0`, `clearcoat = 0`. Korunka a korene majú lokálne odlišnú farbu, IOR, drsnosť a silu normálovej mapy. Sklovina má slonovinový odtieň a kontrolovaný odlesk; korene sú teplejšie a matnejšie. Nepriehľadná aproximácia nepoužíva vnútornú sklenenú vrstvu ani vzorkovanie priehľadného pozadia.

RGBA dátová mapa: R = sklovinová maska, G = miestna drsnosť, B = jemná zdrojová tónová variácia, A = lokálna ambientná viditeľnosť. Pôvodný normálový reliéf ostáva anatomickým podkladom. Dodaný veľmi slabý, priestorovo spojitý mikroreliéf je **autorský materiálový detail**, nie sken. Je filtrovaný podľa derivácií pixelu, aby pri vzdialení nevytváral výrazný šum. Prvá príliš smerová verzia vytvárala pravidelné prúžky; po skutočnom renderi bola nahradená slabšou nepravidelnou mikroštruktúrou.

Jemná 6,5 % zmes normalizovaného wrapped diffuse sa uplatňuje iba na priame bodové/smerové svetlo korunky. Ide o **vzhľadovú aproximáciu rozptylu**, nie plnohodnotný subsurface scattering, optickú segmentáciu ani dôkaz nameraných vlastností. Neobsahuje emisívny alebo svietiaci okrajový člen. Plošné LTC a IBL ostávajú štandardné Three.js PBR.

HDR **Studio Small 09** sa filtruje cez PMREM. Dopĺňajú ho plošné reflektory a smerový zdroj so statickým PCF tieňom. Plošné svetlá samy nevytvárajú shadow mapu. Veľmi slabý kontaktný tieň vzniká projekciou konkrétneho povrchu zuba. Pozadie je biele, bez horizontu. Nepridali sa postprocessing, bloom ani hĺbka ostrosti.

Farby v konfigurácii sa čítajú ako sRGB a prevedú na pracovné lineárne hodnoty; normálové a parameter mapy majú `NoColorSpace`. Výstup je sRGB, Neutral tone mapping sa vykoná raz. Všetky vzhľadové a výkonové nastavenia sú v [`config.js`](../src/prototype/config.js).

## Architektúra a výmena modelu

- `prototype/index.html` a `src/prototype/style.css`: samostatná minimálna stránka.
- `main.js`: inicializácia, loading/error, demand rendering, viditeľnosť, vlastníctvo zdrojov a okamžite dostupný `dispose()`; `ready` je samostatná promise.
- `scene.js`: renderer, color management a spoločné uvoľnenie GPU objektov.
- `binary.js`, `model.js`: abortovateľné načítanie a kontrola kontraktu modelu.
- `materials.js`: priestorovo meniaci sa PBR a zdokumentovaná aproximácia.
- `lighting.js`, `shadow.js`: HDR/PMREM, svetlá, kontaktný tieň a ich teardown.
- `camera.js`: kamera, OrbitControls, rámovanie zo skutočných vrcholov, presný reset a bezpečné limity.
- `quality.js`: voľba profilu a zníženie rozlíšenia podľa nameraných intervalov rámcov.

Výmena modelu mení cesty v konfigurácii a asset. Kontrakt: jeden vonkajší mesh, korunka +Y, UV0, embedded tangent-space normal a RGBA parametre pripojené ako metallicRoughnessTexture. Kovovosť je nulová, modrý kanál sa preto nepoužíva na metalness. Referenčné hodnoty máp sú tiež v konfigurácii. Nie je potrebné prepisovať scénu, svetlá alebo ovládanie.

## Webový rozpočet a meranie

| | Desktop | Mobil |
|---|---:|---:|
| GLB | 3 510 564 B | 2 716 748 B |
| Geometria | 57 008 trojuholníkov | rovnaká |
| Normal a parameter mapy | 2 × 2048 px | 2 × 1024 px |
| Odhad RGBA8 textúr s mipmapami | 42,7 MiB | 10,7 MiB |
| Predvolený limit DPR | 1,75 | 1,5 |

Textúrový odhad nezahŕňa PMREM, shadow/render targets, geometriu ani réžiu ovládača. Mobilný profil mení textúry a rozlíšenie, nie dôležitú geometriu. Pri pomalších nameraných interakčných rámcoch sa najprv znižuje DPR. Po dobehnutí damping sa vracia kvalita profilu. Scéna v pokoji nevytvára nekonečnú render slučku; pri `document.hidden` ruší a blokuje rAF.

Skutočný localhost test produkčnej zostavy používal **vlastný headless Chrome, NVIDIA RTX 3060 Ti, ANGLE/D3D11**. Počas núteného otáčania bol medián intervalu približne **16,7 ms**, teda približne 60 rAF/s, na 1280 × 900, DPR1. Nejde o meranie GPU timer query ani záruku výkonu na inom počítači. Mobilný viewport bežal na tom istom GPU; **30 FPS na fyzickom mobile sa netvrdí**.

## Vykonané testy

[Automatizovaný záznam](prototype-review/report.json) pochádza z `scripts/test-prototype.mjs`, ktorý spúšťa vlastný headless proces iba proti localhostu. Nepripája sa k používateľovmu Chrome ani neobchádza zastavené desktopové ovládanie.

- Produkčný build oboch HTML vstupov; pôvodná stránka načíta svoj pôvodný model s 388 032 trojuholníkmi.
- Khronos validátor a SHA256 pre oba nové GLB: 0 chýb / 0 varovaní; samostatne aj validácia pôvodných GLB.
- Skutočný WebGL render neutrálny, základný, bočný, zadný, okluzálny a detailný; žiadny druhý zub.
- Mouse drag, klávesy, zoom, presný reset, bezpečný minimum distance, zastavenie rAF v pokoji.
- Emulácia 390 × 844, 844 × 390, vysoké DPR3 s limitom na1,5; simulované jedno dotykové gesto aj pinch.
- Loading failure, nedostupné WebGL2, zrušenie počas načítania, opakovaný `dispose()`.
- Po teardown nula vlastných geometrií a uvoľnené mapy/PMREM/tiene. Interné dve LTC tabuľky a DFG LUT Three.js ostávajú v jeho zdieľanej cache; nie sú súčasťou textúr zuba.
- Bežné načítanie bez JS/shader chýb a bez404. D3D11 hlási nefatálny `X4122` o konštantách približne1e−17; celý text zostáva v reporte. Varovania sa nepotláčajú. Build uvádza aj upozornenie na veľký spoločný Three.js/LTC chunk.

Headless Chrome v teste nehlásil ostatné karty ako skryté, takže skutočné prepnutie viditeľnosti karty nebolo end-to-end overené; implementovaný guard sa dá skontrolovať v `main.js`. Fyzický telefón, reálny dotykový displej a pomalšie GPU neboli dostupné.

Snímky skutočného Three.js renderu: [základný pohľad](prototype-review/default.png), [detail](prototype-review/detail.png), [koruna](prototype-review/crown.png), [bok](prototype-review/side.png), [zadná strana](prototype-review/back.png), [mobil](prototype-review/mobile.png), [neutrálny materiál](prototype-review/clay-crown.png). Samostatné Cycles clay porovnania sú výslovne odlíšené od webových screenshotov.

## Pôvod, licencia a hranice

[Dundee Maxillary First Molar](https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984): Emily McDougall, Dr. Andrew Mason, Mark Roughley, University of Dundee, **CC BY 4.0**. Model, zdrojový normálový podklad a odvodené mapy sú distribuované s touto atribúciou. [Studio Small 09](https://polyhaven.com/a/studio_small_09), Sergej Majboroda / Poly Haven, **CC0**. Nový kód a shader sú MIT. Žiadne nákupy ani platené služby. Presné údaje: [credits](../public/prototype-assets/credits.txt), [provenance](../public/prototype-assets/provenance.json).

Referenciu **raspberry.luruke.com sa nepodarilo vizuálne preskúmať**: webový text zostal na „loading raspberry“ a desktopové ovládanie skončilo pri overovaní URL. Jej assety, shadery ani povrch neboli prevzaté. Zábery prototypu boli vytvorené až samostatným lokálnym vývojovým testom.

Výsledok je funkčný interaktívny materiálový prototyp, **nie dokončený nerozoznateľne fotorealistický sken**. Zdrojová anatomická rekonštrukcia má jemnosťou limitované fisúry a široké hladké plochy; shader chýbajúci nameraný tvar neobnoví. Na ďalší podstatný posun treba kvalitnejší legálne získaný anatomický povrch a kalibrovaný materiálový záznam zdravej vzorky. Kontrakt na jeho výmenu je pripravený.

Reprodukcia assetov: Python balíky z `scripts/requirements-model.txt`, Blender4.5LTS v `PATH` alebo `BLENDER_BIN`, potom `python scripts/prepare_prototype.py`. Bežné spustenie webu Blender nepotrebuje. Validácia: `node scripts/validate-prototype.mjs`. Pre testy nainštalujte Playwright mimo runtime aplikácie, prípadne nastavte `PLAYWRIGHT_MODULE_PATH` na existujúci modul, a spustite `node scripts/test-prototype.mjs` pri bežiacom localhost serveri; `PROTOTYPE_TEST_URL` môže ukazovať na lokálny produkčný preview.
