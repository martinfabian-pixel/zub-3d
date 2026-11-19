# Odhryznutie a žuvanie v atlase

Vstup je priamo pri funkcii zuba 21 a 36 v existujúcom atlase. Obe ukážky používajú existujúci renderer, kameru, svetlá a ovládanie 3D. Ukážka dočasne skryje pôvodný oblúk; návrat obnoví jeho výber, vnútorné vrstvy a ručný pohľad. Pôvodné geometrie a nastavenia farieb skloviny sa nemenia.

## Priebeh a ovládanie

- Kamera sa presunie z detailu zuba do spoločného záberu protiľahlých koruniek. Pri šestke sa prvá časť vedeného pohľadu skláňa zhora k bočnému pohľadu.
- Po úvodnom presune nasleduje jedno desaťsekundové prehratie, bez opakovania.
- Posuvník má 1 001 polôh. Každá poloha určuje kompletný stav dolnej čeľuste, stlačenie jablka a oddelenie sústa. Výsledok nezávisí od smeru ani histórie posúvania.
- Malá šípka vedľa dolných zubov ukazuje smer pohybu aj pri zastavení. Miesto kontaktu ostáva nad ovládaním posuvníka.
- Pozastavenie, dotyk posuvníka alebo modelu zastaví vedenie kamery. Ručné otočenie a zoom zostávajú zachované pri ďalšom posune či prehrávaní.
- Šípky ovládajú zameraný posuvník alebo zameraný model. Na modeli klávesy + a − približujú a odďaľujú. Escape alebo „Späť na zub“ ukončí ukážku.
- Pri `prefers-reduced-motion` sa ukážka neprehráva automaticky. Pri skrytí karty sa prehrávanie pozastaví.

## Rozdelenie kódu

- `tooth-function-motion.js`: geometria, meranie modelov a deterministický stav ukážok.
- `tooth-function-controls.js` a CSS: natívny posuvník, prehrávanie, návrat a mobilné rozloženie.
- `full-arch-anatomy-controls.js`: vstupné tlačidlo len pri podporovaných zuboch.
- `main.js`: životný cyklus ukážky, spoločná renderovacia slučka, čas prehrávania a zachovanie pohľadu atlasu.

Ide o výučbový pohyb autorsky usadených modelov, nie o simuláciu konkrétneho pacientovho zhryzu alebo fyzikálny model potraviny. Geometrické kontroly a mobilná emulácia overujú technické vlastnosti ilustrácie.

## Overenie

`node scripts/test-tooth-function-motion.mjs` načíta skutočné korunky z GLB a kontroluje 1 001 polôh každej ukážky: nemennú hornú čeľusť, oddelenie povrchov protiľahlých zubov, plynulosť a presnú obnovu vrcholov jablka a matíc po posune späť. Kontrola je súčasťou existujúceho workflow Pages.

Dosadnutie jablka na 36 sa odvodzuje z lúča do skutočného trojuholníka žuvacej plochy pod sústom; nejde len o celkovú výšku obálky zuba. Kontrola oddelenia tvrdých povrchov je samostatná. Pred poklesom oddeleného sústa 21 sa kontroluje jeho voľná poloha pred dolnými rezákmi.

`scripts/test-tooth-function-browser.mjs` používa rovnaký lokálny Chrome postup ako ostatné browser testy projektu. Overuje mobil 390 × 844 a desktop, jednorazové prehratie, klávesnicu, dotyk, otočenie, zoom, presné opakovanie stavu a návrat na zub. Režim `--record-only` cez existujúci `recordBrowserInteraction` uloží dve MP4 z reálnych kompozitorových snímok prehliadača. Výstup sa nastavuje cez `DENTAL_STORY_REVIEW_DIR`, FFmpeg cez `FFMPEG_PATH` a Playwright cez `PLAYWRIGHT_MODULE_PATH`.

Regresná kontrola pôvodného atlasu, rezu zdravou šestkou a ručného medzizubného čistenia používa existujúce `test-dental-atlas-browser.mjs`, `test-healthy-anatomy-browser.mjs` a `test-manual-cleaning-browser.mjs`. Produkčná zostava je `pnpm build`.
