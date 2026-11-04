# Overenie ovládania kamery a záverečných pohľadov

Pri prvom zobrazení zuba netreba zapínať samostatný režim. Test používa skutočný WebGL render v lokálnom Chrome, udalosti myši a emulované dotykové vstupy. Porovnáva polohu, smer a otočenie vykreslenej kamery pred gestom a po ňom. Samostatne číta stav povlaku, dutiny, kefky a zobrazených zubov, aby zmena kamery nemohla skryto posunúť lekciu.

| Situácia | Overovaná reakcia |
|---|---|
| Myš v prezentácii | Prvý vodorovný aj zvislý ťah otáča model. Tlačidlá +/− menia priblíženie bez prepnutia režimu. Koliesko posúva stránku. |
| Dotyk v prezentácii | Vodorovný ťah otáča model. Zvislý ťah posúva stránku. |
| Voľné 3D | Myš aj prst otáčajú model v oboch osiach. Koliesko alebo dva prsty menia zväčšenie modelu. Mierka stránky zostáva rovnaká. |
| Posun stránky počas voľného pohľadu | Aj keď sa dokument posunie mimo plátna, stav povlaku, priehlbiny, štetín a zubov zostane na okamihu vstupu. Pokračovanie vráti stránku na tento okamih. Priama voľba kapitoly prejde na zvolený cieľ. |
| Zmena veľkosti okna alebo dokončenie načítania | Ručné otočenie a priblíženie sa zachovajú. Pri úmyselnom prechode na ďalšiu kapitolu prevezme pohľad vedená kamera. Kontrola sleduje jednotlivé snímky prechodu. |

## Výsledok produkčného zostavenia

V Chrome 156 prešlo 433 z 433 kontrol zostavenia `main-dlYl-gm6.js` s CSS `main-C9gYhmTA.css`. V bežných scenároch sa nevyskytla konzolová chyba ani neúspešná požiadavka. Kompilátor shaderov ANGLE zaznamenal upozornenie o zaokrúhľovaní X4122. Lokálna kópia zostavenia pod prefixom `/zub-3d/` načítala príslušné modely na hlavnej stránke aj na cestách `experience/`, `prototype/` a `legacy/`.

Na počítači prvý vodorovný ťah otočil model o 42,4° a zvislý ťah o 28,8°. Koliesko následne posunulo stránku o 200 CSS pixelov. V mobilnej emulácii vodorovný ťah otočil model o 44,0° a zvislý ťah posunul stránku o 95 CSS pixelov. Vo voľnom 3D dokázal prst zmeniť zvislý uhol o 55,4°. Gesto dvoma prstami skrátilo vzdialenosť kamery na 68 % pôvodnej hodnoty pri nezmenenej mierke stránky.

Počas čistenia zostal príbeh na pozícii 0,620 aj po posunutí dokumentu na 0,200 mimo plátna. Pokračovanie obnovilo pôvodnú pozíciu príbehu. Pri kliknutí zostala kamera na mieste a v ďalších 29 snímkach plynulo zmenila pohľad. Po návrate k dutine z blízkeho aj vzdialeného miesta sa zhodovali parametre svetiel vrátane tieňov. V dvoch záberoch s 418 000 pixelmi bol najväčší rozdiel jedného farebného kanála 1 z 255.

Po uvoľnení 3D scény klesli interné počty GPU geometrií a textúr z 36 a 13 na nulu. Pri zámerne poškodenej definícii kazu zostal zdravý zub 36 interaktívny. Po uvoľnení scény aj v tomto stave klesli počty z 1 a 8 na nulu.

## Geometria v zábere

Kontrolujú sa vrcholy zuba 36, ktoré vytvárajú dutinu. Priehlbina zostáva po očistení povrchu. Zrkadlený zub 46 nepreberie jej deformáciu. Po dvoch stlačeniach + sa projekcia 32 vrcholov dna dutiny zväčšila na počítači zo 46 × 41 na 59 × 52 CSS pixelov. Na mobilnom rozložení sa zväčšila zo 42 × 36 na 53 × 46. Rozmery vyjadrujú projekciu pred testom hĺbky. Čitateľnosť možno posúdiť na snímke, pretože susedný zub môže časť povrchu zakrývať.

Vo finále zostáva všetkých 28 samostatných zubov. Pohľad **Úsmev** približuje predné korunky. **Anatómia** otvorí chrup a ukáže celé korene. Porovnanie svetových matíc všetkých zubov potvrdilo pohyb horného oblúka ako celku o 5,8 mm na ilustračnej mierke. Tento údaj opisuje animáciu a nemeria zhryz pacienta.

V ustálenom pohľade Úsmev sa horný a dolný okraj obrazu zľahka strácajú do pozadia. Pri prechode do voľného 3D tento efekt zmizne. Dva skutočné zábery pred prechodom a po ňom mali rovnakú kameru a rozlíšenie plátna. Farba každého zo 165 584 pixelov chrupu v strednom pásme na počítači a 48 559 na mobilnom rozložení zostala presne rovnaká.

## Snímky a opakovanie kontroly

| Pohľad | Počítač | Mobilné rozloženie |
|---|---|---|
| Úvodná dolná šestka | [Snímka](interaction-review/desktop-hero.png) | [Snímka](interaction-review/mobile-hero.png) |
| Medzizubný kaz | [Vedený pohľad](interaction-review/desktop-caries.png) · [dve stlačenia +](interaction-review/desktop-caries-macro.png) | [Vedený pohľad](interaction-review/mobile-caries.png) · [dve stlačenia +](interaction-review/mobile-caries-macro.png) |
| Pracovná poloha kefky | [Snímka](interaction-review/desktop-brush.png) | [Snímka](interaction-review/mobile-brush.png) |
| Úsmev | [Snímka](interaction-review/desktop-full.png) | [Snímka](interaction-review/mobile-full.png) |
| Otvorená anatómia | [Snímka](interaction-review/desktop-anatomy.png) | [Snímka](interaction-review/mobile-anatomy.png) |

Test zachytil 37 snímok vrátane polohy pri čistení, krajinky a malého displeja. V repozitári je 12 vybraných obrázkov uvedených vyššie. Záznamy obsahujú aj výsledky pre ostatné stavy, rozmery plátna a kontrolu chybových scenárov. [Strojový záznam kontrol](interaction-review/report.json)

V samostatnom behu prešlo 7 zo 7 kontrol merania. Počas každého zo štyroch úsekov sa odčítalo 120 intervalov `requestAnimationFrame`. Na GeForce RTX 3060 Ti bol medián 16,7 ms a 95. percentil 16,8–16,9 ms. Žiadny interval neprekročil 33 ms. Meranie zahŕňa prechod celým príbehom a pracovné pohyby kefky pri oboch veľkostiach okna. [Meranie plynulosti](interaction-review/performance.json)

Po `pnpm build` spustite `pnpm preview --port 4173`. V ďalšom termináli použite `node scripts/test-dental-story-browser.mjs`. Potrebný je lokálny Playwright a Chrome. Cestu k existujúcemu modulu možno zadať cez `PLAYWRIGHT_MODULE_PATH`. `DENTAL_STORY_REVIEW_DIR` zvolí výstupný adresár a `DENTAL_STORY_BENCHMARK_ONLY=1` spustí izolované meranie bez snímania obrazoviek. Prehliadačové testy povoľujú iba loopback HTTP(S).

Mobilné dotyky a veľkosti okien 390 × 844, 320 × 568 a 844 × 390 sa emulujú na desktopovom GPU. Výsledok nepotvrdzuje výkon fyzického telefónu ani správanie Safari na zariadení. [Medicínsky rámec](DENTAL_STORY_SOURCES.md) a [overenie povrchu a dráhy kefky](PROXIMAL_SITE.md) uvádzajú samostatné hranice anatomickej ilustrácie.
