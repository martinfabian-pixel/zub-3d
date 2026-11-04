# Kefka a čistenie medzi 36 a 37

Kefka vstupuje z lícnej strany po priamke určenej zo skutočných usadených plôch dolných zubov. Geometria zubov sa kvôli nástroju neposúva. Dáta koridoru a povrchových vrstiev sú v [site.json](../public/story-assets/site.json), výpočet a pôvod anatomických podkladov v [PROXIMAL_SITE.md](PROXIMAL_SITE.md) a [atribúcii](../public/story-assets/credits.txt).

| Rozmer v tejto ilustrácii | Hodnota |
|---|---:|
| Celý zmeraný lícno-jazykový koridor | 14,345 mm |
| Predvedený maximálny posun špičky od vstupu | 11,7 mm |
| Oceľový drôt / vonkajší nezaťažený priemer vlákien | 0,18 / 1,20 mm |
| Dĺžka osadenej časti / voľná špička pred vláknami | 8,0 / 0,45 mm |
| Špička až predná hrana objímky / priemer objímky | 13,1 / 1,6 mm |
| Dĺžka tvarovanej fialovej rukoväti | 18 mm |

Zmeraný koridor je dlhší než predvedený pracovný pohyb. Na konci tohto pohybu je predná hrana objímky ešte 1,4 mm pred začiatkom zmeranej osi. Vlákna zostávajú lepšie viditeľné pri bočnej stene zuba. Zmena predvedenej dráhy mení aj výpočet odstránenej vrstvy; čistenie nesmie predbehnúť doteraz dosiahnutú polohu vlákien.

Na drôte sú dva stočené kovové pramene. Protiľahlé páry tenkých nepravidelne dlhých nylonových vlákien vytvárajú pozdĺžne mierne zúženú hlavu. Renderuje sa 344 vlákien na počítači alebo 208 v kompaktnej verzii; každé má dva krátke segmenty v jedinom instancovanom vykreslení. Pri stene sa skrátia v radiálnom smere a mierne sklonia pozdĺž osi podľa miestnych kontaktných rovín oboch LOD. Ide o ilustratívny ohyb, nie o simuláciu materiálových síl. Kefka sa počas ťahov nekrúti okolo osi.

Povlak kopíruje trojuholníky priľahlých plôch zubov 36 a 37. Jeho matný krémový odtieň, nepravidelný okraj a meniaca sa hustota ukazujú tenkú vrstvu pri kontakte a smerom ku krčku. Krátky výbežok na lícnej strane leží na skutočnom povrchu zuba. Polomer kefky vstupuje až do výpočtu odstránenia povlaku.

Pri vzniku dutiny na 36 používa vrstva rovnaké jemné trojuholníky ako povrch pod ňou. Každý jej vrchol sleduje polohu aj normálu zodpovedajúceho vrcholu zuba. Päť stavov priehlbiny, od zdravého po zrelý, malo odstup vrstvy 0,020–0,036 mm. V zrelej verzii zodpovedá povrchu na 36 všetkých 4 033 trojuholníkov vrstvy.

Pri každom vzorkovaní sa odstránenie vypočíta z najvzdialenejšej už dosiahnutej polohy. Závisí aj od nábehu prvej časti kužeľovito osadených vlákien. Fragment mimo polomeru vlákien alebo pred pracovným čelom sa neodstráni. Krátky spätný ťah už vyčistené miesto nezafarbí, no spätné posunutie celého príbehu obnoví príslušný skorší stav. Otvorená lézia má vlastnú výluku v nanesenej vrstve: vyčistenie nezmení jej hĺbku ani tvar.

| Pred prejdením štetinami | Po prejdení štetinami |
| --- | --- |
| ![Matný povlak pod dutinou na 36 a pri susednej 37](film-review/before.jpg) | ![Odhalený povrch pri kontakte, zachovaná dutina a tenký zvyšok mimo dosahu](film-review/after.jpg) |

V oboch výrezoch z WebGL je totožná kamera, zrelá dutina a osvetlenie. Mení sa iba dosiahnutá dráha čistenia. Rozdiel vidno tesne pri susednej 37. Zvyšok na lícnej strane leží mimo dosahu vlákien. [Podmienky snímania a odtlačky súborov](film-review/evidence.json)

`node scripts/test-cleaning-path.mjs` kontroluje oba skutočné GLB modely, registráciu povrchu, stopku objímky, priestorový dosah, zvyškovú vrstvu a reprodukovateľnosť dopredných/spätných stavov. Voliteľný `node scripts/audit-brush-contact.mjs` vyžaduje Blender (`BLENDER_BIN` alebo Blender na PATH). Kontroluje prienik renderovaných trojuholníkov s tvrdými povrchmi 35/36/37 v 83 polohách na každý LOD a overuje aj fyzický kontakt vlákien s vystúpenou vrstvou na oboch zuboch. Je to konečný vzorkový test; samostatný spojitý certifikát v `site.json` sa týka tuhého drôtu v zmeranom koridore.

Voliteľné `node docs/proximal-reframe-review/run-audit.mjs` skontroluje aj zrelú dutinu a jej priľahlú vrstvu. Na oboch úrovniach detailu sa vlákna dotkli vrstvy na 36 aj 37. V 83 polohách na každú úroveň sa nezaznamenal prienik do tvrdých tkanív a drôt ani rukoväť nezasiahli povlak. [Geometrický audit](proximal-reframe-review/independent-geometry.json)

Kód nástroja a procedurálny vzhľad sú pôvodné pre túto prezentáciu (MIT repozitára), bez zakúpeného modelu alebo loga výrobcu. Anatomické siete a odvodené údaje si ponechávajú pôvodnú licenciu. Rozmery, odtiene a ukážkové ťahy opisujú túto konkrétnu scénu; nie sú odporúčaním veľkosti pomôcky pre jednotlivca. Mäkké tkanivá ani pacientsky stav sa nesimulujú.
