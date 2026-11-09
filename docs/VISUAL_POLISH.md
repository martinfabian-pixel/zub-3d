# Ostrý detail, pracovná hlavička a produktový záver

Tento dokument zachytáva vydanie `3f52ac5`. [Novšie spoločné rozloženie modelu, textu a popisiek](SHARED_STAGE_QA.md).

Táto úprava nadväzuje na čistý aktuálny checkout `510a734`, ktorý uchováva tag `backup/before-visual-polish-2026-11-04`. Zachováva sedem kapitol, jednu scénu/kameru/canvas, FDI 36, fyzické polohy 35–37, celý 28-zubový model a funkčné priame ovládanie. Nevznikla nová stránka, kapitola, framework, platený asset ani dekoratívny efekt.

## Čo sa opravilo

Mäkkosť dutiny mala dva podstatné zdroje. Pôvodné dno malo iba 59 plôch, medián dĺžky hrany 0,193 mm a materiálový prechod sa interpoloval cez veľké pôvodné trojuholníky. Mobilný profil navyše aj v pokoji končil na DPR 1,35. Adaptívna kvalita sa vracala na svoj cieľ správne; nízky bol samotný cieľ, nie zaseknutý časovač. Nenachádza sa tu hĺbka ostrosti alebo postprocesové rozmazanie.

- **Dutina:** lokálna konformná predpripravená triangulácia má 1 267 plôch dna, medián hrany 0,048 mm. Pôvodná zdravá plocha ostáva základom, okolité plochy sa nemenia a 46 nedostáva morph. Per-fragmentová regionálna maska oddeľuje nepravidelný svetlý sklovinový okraj od matného hnedastého vnútra. Veľkosť 2,41 × 1,48 mm a hĺbka 0,769 mm sú prakticky rovnaké ako pred úpravou; nejde o ďalšie zväčšenie. [Neutrálny render](proximal-reframe-review/clay-refined-rim.jpg) oddeľuje geometriu od farebného účinku.
- **Makro:** kamera smeruje bližšie k normále poškodenej plochy. V desktopovej aj dvoch mobilných kompozíciách je viditeľný najhlbší bod a približne 99,6 % skúmanej plochy dna. To neznamená viditeľnosť každého pixelu okraja; strmá stena si môže časť vlastnej plochy prirodzene zakryť. Zub 37 sa neskrýva, neposúva ani nespriehľadňuje.
- **Čistenie:** samostatný bočný záber cieli na os vstupu a pracovné vlákna, nie na rukoväť alebo léziu. Os nástroja je v obraze zreteľne šikmá; rukoväť zostáva väčšinou mimo poľa. Rozmery, dráha, zavedenie a počet skutočných vlákien sa nemenia. Nylon má kontrolované svetlé odlesky a jemné tonálne odlíšenie od bielej skloviny. Kamera počas pracovných ťahov stojí.
- **Povlak:** pôvodné radiálne zvýraznenie okolo osi kefky vytváralo disk a zvyšný krúžok. Odstránilo sa zo vzhľadu pôvodného nánosu; polomer kefky naďalej obmedzuje výhradne odstránenie. Tenká nepravidelná vrstva sleduje skutočné aktuálne plochy aj počas morpha. Slabší výbežok pri krčku má pevnú menšiu intenzitu už pred čistením a zostáva tam, kde kefka nedosiahne. Žiadne globálne stmavenie/zmiznutie po čistení. [Skutočný pár z rovnakej kamery](INTERDENTAL_BRUSH.md).
- **Sklovina:** nezvyšovala sa expozícia ani biela farba. Odlesky a pozície mäkkých svetiel, variácia drsnosti a filtrované mikronormály dostali zreteľnejšiu štruktúru. Rovnaký materiál platí od začiatku; kefka nespôsobuje bielenie. Rozlíšenie dátových textúr sa plošne nezvyšovalo.
- **Mobil:** hlavná myšlienka ostala nad modelom, opakovaný horný počet/názov kapitoly a technické metaúdaje sa nezobrazujú druhý raz. Navigácia aj jedna lišta priameho ovládania zostávajú dostupné. Menšia hlavička dáva viac priestoru dôležitému záberu. Natívne lišty mobilného prehliadača sa nemenili.

## Úsmev bez hmly

Pôvodný `smile-framing.js` sa odstránil. V žiadnom pohľade nie je CSS alpha maska, gradient, fog, clipping plane alebo materiálové mazanie koreňov. **Úsmev je zámerný fotografický detail koruniek**, nie simulácia tváre či pacientovho úsmevu bez ďasien. Kamera používa natívne predné korunky a mierny čelný uhol. Skutočné nepriehľadné obrazové pole má pomer 2,7 : 1 na počítači a 2,32 : 1 v mobilnom profile. Je bez rámu či karty, na spojitej bielej ploche. Horná a dolná hranica fotografického detailu je skutočný orez kamerovým poľom; nič sa nevyhladzuje do bielej hmly.

Korunky vypĺňajú šírku detailu, horný rad tvorí jeho dominantnú časť a dolný ho dopĺňa. Korene pokračujú mimo tohto poľa. Všetkých 28 neorezaných mesh objektov a kaz na 36 zostáva v tej istej scéne. **Anatómia** a **Voľné 3D** obnovia celé vysoké pole pre kontrolu koreňov. Existujúce spoločné priblíženie horného oblúka o 5,8 mm sa zachovalo; žiadny jednotlivý zub sa vo finále nenarovnáva.

`viewport-composition.js` mení reálny rozmer kamery/canvasu v stabilnej scéne, nie priehľadnosť výsledku. Pri scrollovaní je pomer poľa priamou funkciou progress; krátky prechod sa týka iba explicitného prepnutia pohľadu. Zmena veľkosti renderera a projekcie prebehne pred kreslením, aby následný ResizeObserver nevymazal čerstvo vykreslený frame.

## Rozlíšenie a výkon

Pokojový limit DPR je 2,0 pre mobil a 1,75 pre desktop, vždy obmedzený skutočným DPR zariadenia. Interakcia používa najviac 1,35 a zachováva meranú adaptáciu pri pomalých snímkach. Po ukončení interakcie a tlmenia sa obnoví plné rozlíšenie. Prehliadačový test overuje aj riadené zníženie kvality a návrat podľa skutočného framebufferu, nie iba konfiguráciu. Osvetlenie ostáva deterministické podľa autorovej pózy.

Geometria sa pripravuje offline; nový zdravý lokálny podklad sa zostaví raz pri načítaní. Vo frame slučke nebeží CSG ani prepočítanie celého chrupu. Nové dáta majú približne 0,45 MB pred prenosovou kompresiou a okolo 114 kB po gzip. Textúry a celý anatomický atlas sa nenahrádzali. Interakcie a renderer sú naďalej spoločné pre všetky kapitoly.

## Skutočné porovnania a testy

[Galéria pred/po](visual-polish-review/README.md) obsahuje päť rovnakých bodov príbehu — úvod, kaz, kontakt kefky, výsledok a Úsmev — pri 360 × 780, 390 × 844 a 1280 × 900. Ide o skutočné Chrome/WebGL snímky, nie generované ilustrácie. Identické sú rozmery CSS viewportu a normalizovaná poloha príbehu. Browserové lišty z používateľových fotografií nie sú súčasťou viewportu stránky.

[Report](visual-polish-review/report.json) overuje skutočné udalosti myši, kolieska a emulovaných dotykov, obe osi vo Voľnom 3D, pinch, prirodzený scroll, návrat, resize, načítanie na pozadí, chyby dát, uvoľnenie prostriedkov, spätný scroll a podadresár GitHub Pages. [Izolované časovanie](visual-polish-review/performance.json) meria requestAnimationFrame na konkrétnom desktopovom GPU; nie výkon fyzického telefónu.

Geometrické a kontaktné kontroly: [nezávislý audit](proximal-reframe-review/GEOMETRY-AUDIT.md), [zrelá vrstva povlaku a finálny render](film-review/evidence.json) a [priblíženie oblúkov](proximal-reframe-review/smile-closure.json). Skúšajú obe LOD, päť morfologických stavov a 83 póz nástroja. Nie je to medicínska validácia kontaktu s nezobrazenou papilou/ďasnom.

## Zmenené súbory a spustenie

Kamera/zostava: `config.js`, `story-camera.js`, `arch.js`. Ostrý povrch: `caries.js`, nový `cavity-surface.js`, `public/story-assets/`, prípravné a validačné skripty. Povlak/nástroj: `plaque.js`, `interdental-brush.js`. Integrácia/layout: `main.js`, nový `viewport-composition.js`, `style.css`, `index.html`, `experience/index.html`; starý `smile-framing.js` odstránený. QA: `test-dental-story-browser.mjs`, `browser-camera-probes.mjs` a aktuálne auditné/review súbory. `view-controller.js` ani `gestures.js` sa neprepisovali.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Otvorte `http://127.0.0.1:5173/experience/` alebo hlavný koreň. Produkčne `pnpm build` a `pnpm preview`. Existujúce `/prototype/` a `/legacy/` zostávajú dostupné. Modely a odvodená anatómia naďalej Dundee **CC BY 4.0**, HDR Poly Haven **CC0**, autorský kód a nástroj **MIT**. [Atribúcia](../ATTRIBUTION.md).

Mobilné testy používajú emuláciu Chrome; fyzický iPhone a Safari sa netestovali. Zdroj zubov je hladká výučbová rekonštrukcia, nie kalibrovaný makrofotografický sken. Nevytvárali sa náhodné anatomické ryhy ani hrubý šum ako náhrada chýbajúcich údajov. Dutina a povlak sú autorské výučbové príklady, nie diagnostika pacienta. Fotografický záver zostáva produktovým detailom bez mäkkých tkanív; úplnú anatómiu ukazuje samostatný pohľad na tú istú scénu.
