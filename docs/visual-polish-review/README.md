# Skutočné porovnania pred/po

Pred: čistá verzia `510a734`, modul `main-dlYl-gm6.js`. Po: modul `main-ewRyFOB0.js`, štýly `main-Bra_o7jm.css`. Chrome 156.0.8078.80 na Windows, snímané 4. novembra 2026. Všetky obrázky zobrazujú reálny WebGL renderer aplikácie; nevznikli generovaním ilustrácií. Vo všetkých pároch je rovnaká veľkosť CSS viewportu a ten istý bod príbehu. Mobilné viewporty a gestá sú emulované na desktopovom GPU, nie na fyzickom iPhone.

| Záber / progress | 360 × 780 | 390 × 844 | 1280 × 900 |
|---|---|---|---|
| Úvod / 0 | [Pred](before/360x780-hero.png) · [Po](after/360x780-hero.png) | [Pred](before/390x844-hero.png) · [Po](after/390x844-hero.png) | [Pred](before/1280x900-hero.png) · [Po](after/1280x900-hero.png) |
| Dutina / 0,475 | [Pred](before/360x780-caries.png) · [Po](after/360x780-caries.png) | [Pred](before/390x844-caries.png) · [Po](after/390x844-caries.png) | [Pred](before/1280x900-caries.png) · [Po](after/1280x900-caries.png) |
| Kontakt kefky / 0,62 | [Pred](before/360x780-brush.png) · [Po](after/360x780-brush.png) | [Pred](before/390x844-brush.png) · [Po](after/390x844-brush.png) | [Pred](before/1280x900-brush.png) · [Po](after/1280x900-brush.png) |
| Výsledok / 0,76 | [Pred](before/360x780-result.png) · [Po](after/360x780-result.png) | [Pred](before/390x844-result.png) · [Po](after/390x844-result.png) | [Pred](before/1280x900-result.png) · [Po](after/1280x900-result.png) |
| Produktový Úsmev / 0,98 | [Pred](before/360x780-final.png) · [Po](after/360x780-final.png) | [Pred](before/390x844-final.png) · [Po](after/390x844-final.png) | [Pred](before/1280x900-final.png) · [Po](after/1280x900-final.png) |

Rýchle kontaktné listy, vždy stará verzia hore a nová dole: [360 px](360x780-comparison.jpg) · [390 px](390x844-comparison.jpg) · [Desktop](1280x900-comparison.jpg). Originálne PNG ostávajú samostatne v tabuľke; kontaktné listy ich iba rovnako zmenšujú pre porovnanie. [Pred metadata](before/capture.json) · [Po metadata](after/capture.json).

Finálna verzia prešla **543/543 funkčnými kontrolami** a **7/7 kontrolami samostatného merania**. [Report](report.json) zahŕňa skutočné pointer, touch a wheel udalosti, sedem kapitol, 360/390/320 px aj landscape, nezmenený zub 36 a zdravý 46, trvalú dutinu, lokálne čistenie, plné Voľné 3D, načítanie na pozadí, resize, návrat bez tvrdého skoku a všetky štyri routy pod `/zub-3d/`. Žiadna nová chyba JS/WebGL ani neúspešná sieťová požiadavka. V reporte zostáva jedno nefatálne upozornenie ovládača ANGLE X4122.

Ostrý pokojový framebuffer na 390 px sa skutočne obnovil zo zníženej adaptívnej kvality na DPR 2: 752 × 1100 px v pokoji, 507 × 742 počas interakcie, 341 × 499 pri riadene injektovaných pomalých intervaloch a znova 752 × 1100 po ukončení. Nejde o meranie výkonu telefónu. [Izolované časovanie](performance.json) použilo štyri priechody po 120 intervalov na NVIDIA RTX 3060 Ti: medián 16,7 ms a 95. percentil 16,8–17,0 ms. Rastrové snímky, hlboká geometrická diagnostika ani iné GPU úlohy počas merania nebežali.

Úsmev je úmyselný fotografický detail s hranicou obrazu, bez hmly, CSS masky, priehľadných zubov alebo odrezávania ich geometrie. Pre všetky zachované korene je určený pohľad Anatómia a Voľné 3D. [Zmeny a zostávajúce obmedzenia](../VISUAL_POLISH.md).
