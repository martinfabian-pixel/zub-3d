# Priame ovládanie, čitateľný kaz a záverečný úsmev

> Archív implementácie `510a734`. Opis okrajového maskovania nižšie sa vzťahuje iba na túto staršiu verziu. Aktuálna prezentácia maskovanie úplne odstránila a používa skutočné fotografické rámovanie kamerou: [VISUAL_POLISH.md](VISUAL_POLISH.md).

Úprava nadväzuje na aktuálny checkout `f3257d1`; nič sa nevracalo na staršiu verziu. Funkčný základ je uložený pod tagom `backup/before-controls-smile-2026-11-04`. Zachovaných je sedem kapitol, FDI 36, priestor 36–37, jedna scéna/kamera/canvas a 28 anatomických modelov. Nevznikla nová aplikácia ani dependency.

## Čo blokovalo ovládanie

Pôvodný `main.js` ponechával OrbitControls vypnuté až do stlačenia prepínača. Jeho wheel listener potom každé koliesko zmenil späť na príbeh a `setProgress()` ukončil preskúmanie už po pohybe stránky o jediný pixel. Timeline a ručné ovládanie tak nemali nezávislú základnú pózu a používateľský pohľad.

`camera.js` teraz v hlavnej prezentácii používa `sampleOnly`: vypočíta pózu a projekciu, ale nezapisuje polohu ani orientáciu výslednej kamery. **`view-controller.js` je jediný vlastník výslednej kamery**. K základnej póze pridáva používateľský azimut, eleváciu, mierku vzdialenosti a pri prerušenom návrate aj zachovaný posun bodu záujmu. Zmena veľkosti či načítanie nového atlasu preto nezmaže orbit/zoom. Tieto hodnoty sú dostupné aj cez `report().view` v QA režime.

`gestures.js` spracúva PointerEvents; nevytvára vlastný render loop ani nepíše kameru. Už od prvého zuba funguje:

| Vstup | Prezentácia | Voľné 3D |
|---|---|---|
| Myš, ľavé ťahanie | Obe osi otáčania | Obe osi otáčania |
| Koliesko nad modelom | Prirodzený posun stránky | Zoom, udalosť neposunie stránku |
| Jeden prst | Vodorovné otáčanie; zvislé gesto patrí stránke | Otáčanie v oboch osiach |
| Dva prsty | Pinch podľa vlastníctva natívneho gesta | Pinch zoom bez zoomovania stránky |
| + / − a klávesnica | Úprava pohľadu bez zmeny režimu | Úprava pohľadu pri pozastavenom deji |

`touch-action:pan-y` je pripravené pred prvým gestom. Iba explicitné Voľné 3D prepne interaktívny canvas na `none`; stránka mimo neho sa nemení. V tomto režime je držaný vzorkovaný stav príbehu vrátane kefky, povlaku, lézie a odhalených zubov. Aj keď sa stránka mimo canvasu posunie, nemení tým držaný dej. **Pokračovať v príbehu** obnoví pôvodnú polohu scrollu a vráti kameru počas 480 ms. Neexistuje automatický návrat po časovači.

Malý scroll zachová používateľský pohľad. Zámerný prechod do inej kapitoly po najmenej 64 CSS px od ručnej úpravy alebo priama navigácia začne plynulé odovzdanie. Sférický návrat drží kladnú vzdialenosť od bodu záujmu a vie pokračovať od práve zobrazenej polohy aj po uchopení uprostred návratu. Nepredstavuje matematickú záruku bezkolízneho obletu každého susedného zuba pri ľubovoľnom extrémnom pohľade.

## Kamera a zväčšená dutina

Priestor, povlak, kaz, čistenie a výsledok majú samostatné lokálne body, smery a vzdialenosti. Priestor ukazuje kontext; kaz smeruje na odhalené dno a nepravidelný okraj; stabilný čistiaci záber smeruje viac k bukálnemu vstupu. Záber sa počas pracovných ťahov nemení. Mobil má vlastné makrokompozície a bližšiu kameru kazu, nie len orez desktopu. Normálne zobrazenie susedného zuba sa nemuselo zoslabovať ani rozostupovať.

Lézia bola znovu pripravená z pôvodnej siete. Namiesto 39 sa posúva 95 vrcholov; riedky morph obsahuje 202 záznamov vrátane okolitých normál a masky. Pôdorys je **2,43 × 1,48 mm**, maximálna hĺbka **0,769 mm**, približne **1,74-násobok pôvodnej šírky**. Stred zostal na pôvodnej distálnej ploche 36. Obrys, jemne svetlejší okraj a matnejší hnedastý vnútorný povrch sú nepravidelné. Rozmery sú ilustračné, nie klinický predpis.

[Nezávislý geometrický audit](proximal-reframe-review/GEOMETRY-AUDIT.md) zahŕňa pôvodné dáta, normály a morph, obe LOD, 28 zubov, kamerové lúče a 83 polôh skutočne renderovaných pevných častí aj všetkých vlákien. Dráha nástroja a zdravé GLB sa nemenili. Žiadny testovaný pracovný pohyb nezasiahol tvrdé tkanivo; vlákna zasiahli povlak na 36 a 37. Maska povlaku bola regenerovaná tak, aby neprekrývala novú dutinu. Tá sa kefkou nemení a zrkadlená 46 zostáva zdravá.

## Svetlo a finálny úsmev

Sklovina má čistejší neutrálny odtieň `#f2f0eb`, jemne teplejšie matné korene a širšie mäkké odlesky. AO sa znížilo z 0,52 na 0,33; kľúčové, doplnkové a zadné svetlo sa prekomponovali. Expozícia sa nezvyšovala. Rovnaké materiály platia od prvého zuba po záver — čistenie nespôsobuje vybielenie. Nevzniká emissive/bloom, priehľadná sklovina alebo dekoratívne častice.

**Úsmev** rámuje predné korunky podľa natívneho krčkového rozhrania, nie podľa celého objemu koreňov. Horný oblúk sa v závere ako celok priblíži o 5,8 mm; dolná zostava a vyučovaný priestor sa nehýbu. [Celý pohyb horných trojuholníkov](proximal-reframe-review/smile-closure.json) bol overený proti protiľahlému oblúku na oboch LOD, aj so zrelou léziou na 36. Pozitívna kontrola pri 6,4 mm zachytí prienik rezákov, ktorý sa pri použitých 5,8 mm nevyskytol. Ide o prezentačné priblíženie, nie o klinicky validovaný zhryz. **Anatómia** obnoví širší pohľad a otvorenie s úplnými koreňmi.

V pokojnom pohľade Úsmev sa okraj výsledného obrazu jemne zlieva do bieleho pozadia. Je to fotografické rámovanie canvasu podľa premietnutých krčkov rezákov: plne nepriehľadný pás koruniek zostáva zachovaný. Žiadny koreň sa neodrezáva, nemaže ani nemení materiál. Pri ručnom otočení, zoome alebo Voľnom 3D sa toto rámovanie uvoľní, aby bolo možné skontrolovať celý objekt. V Anatómii je vždy vypnuté. Toto obmedzenie čistého úsmevu bez ďasien je zámerne zdokumentované; nejde o simuláciu pier alebo mäkkých tkanív.

## Súbory, spustenie a dôkazy

Hlavné zmeny: `main.js`, `camera.js`, `view-controller.js`, `gestures.js`, `inspection.js`, `interface.js`, `config.js`, `story-camera.js`, `arch.js`, `smile-framing.js`, `style.css` a oba hlavné HTML vstupy. Geometrické dáta a ich regenerácia: `public/story-assets/`, `scripts/prepare_proximal_story.py`, `validate-proximal-site.mjs` a `docs/proximal-reframe-review/`. Numerický test vlastníctva kamery: `node scripts/test-view-controller.mjs`. Existujúce kontroly príbehu a lokálneho čistenia sa zachovali.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Otvorte `http://127.0.0.1:5173/experience/`. Produkčne `pnpm build` a `pnpm preview`. Aktuálne skutočné snímky a testy vstupov: [INTERACTION_QA.md](INTERACTION_QA.md). Mobilné gestá/viewporty sa emulujú v Chrome na desktopovom GPU; nie je to test fyzického iPhonu alebo Safari. Pôvod modelov a licencie [zostávajú zachované](../ATTRIBUTION.md).
