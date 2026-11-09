# Korunkové finále

Posledná kapitola používa dve reprezentácie existujúcej zostavy. „Anatómia“ zobrazuje pôvodné celé zuby. „Úsmev“ používa samostatný atlas 14 zdrojových koruniek, z ktorých sa zrkadlením a pôvodnými transformáciami skladá 28 pozícií. Morf kazu na zube 36 zostáva v anatomickom modeli a v predchádzajúcich kapitolách.

Atlas `public/dentition-assets/crowns.glb` je odvodený z modelov University of Dundee, School of Dentistry pod licenciou CC BY 4.0. [Úplná atribúcia](../ATTRIBUTION.md) a [pôvod modelov](DENTITION_SOURCES.md). Skript `scripts/prepare_crowns.py` používa Blender 4.5 a miestny odhad krčka každého zdrojového zuba. Korunky uzatvára a ich spodné plochy jemne modeluje. Ide o štylizovanú digitálnu zostavu, nie o zubné náhrady určené na klinické použitie.

`floating-teeth.js` vzorkuje rozptýlenie a dosadnutie z absolútneho progress, takže obrátený scroll reprodukuje rovnaké polohy. Kamera, nástroj, typografia a zuby používajú jeden zobrazovaný priebeh. Pri obmedzenom pohybe sa zobrazujú pokojné stavy.

## Overenie

`node scripts/test-smile-sequence.mjs` kontroluje krajné polohy a spätnú rekonštrukciu. `node scripts/test-smile-browser.mjs` používa Chrome s Playwrightom na kontrolu dvoch režimov, kazu, 28 pozícií, návratu z voľného 3D, zmeny orientácie a obrátenia príbehu. Rozmery mobilu a dotyk sú emulované. GLB validátor zaznamenal 0 chýb a 0 upozornení. Kontrola na fyzickom iPhone ani odborná klinická validácia sa nevykonala.

Korunková verzia je estetická aproximácia vytvorená z existujúcich anatomických tvarov. Dolný oblúk, povrch uzáverov pri otočení a kontakty vyžadujú ďalšie výtvarné doladenie. Označenie vyčisteného povrchu v kapitole 6 treba ešte presnejšie zosúladiť so zobrazeným zvyškom povlaku.

Chrome na desktopovej grafike NVIDIA GeForce RTX 3060 Ti nameral pri 120 intervaloch počas scrollu medián 16,7 ms a 95. percentil 17 ms. V desktopovom behu boli tri intervaly dlhšie než 33 ms, v emulovaných mobilných rozmeroch po jednom. Meranie nepredstavuje výkon fyzického telefónu.

## Skutočné zábery

| Stav | Desktop | Mobilná emulácia |
|---|---|---|
| Čistenie | [1440 px](crown-finale-review/1440-brush.jpg) | [390 px](crown-finale-review/390-brush.jpg) |
| Výsledok | [1440 px](crown-finale-review/1440-result.jpg) | [390 px](crown-finale-review/390-result.jpg) |
| Rozlet | [1440 px](crown-finale-review/1440-floating.jpg) | [390 px](crown-finale-review/390-floating.jpg) |
| Úsmev | [1440 px](crown-finale-review/1440-smile.jpg) | [390 px](crown-finale-review/390-smile.jpg) |
| Anatómia | [1440 px](crown-finale-review/1440-anatomy.jpg) | [390 px](crown-finale-review/390-anatomy.jpg) |

[Výsledky testov vrátane 360 px](crown-finale-review/report.json).
