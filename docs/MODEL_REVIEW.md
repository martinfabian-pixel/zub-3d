# Technické posúdenie zdroja modelu

Posúdenie k 11. októbru 2026 sa týka jedného trvalého horného prvého molára, FDI 16 alebo 26. Porovnáva získané súbory aj perspektívne zdroje. Nehodnotí ešte konečný počet polygónov ani výslednú kvalitu pripravovaného GLB.

**Dundee UL6 je najlepší skutočne získaný základ v tejto rešerši, nie preukázateľne najlepší dostupný model na svete.** Má doloženú identitu, tri pôvodné korene, upraviteľnú geometriu, UV a licenciu umožňujúcu webovú redistribúciu. Melbourne FDI26 je sľubnejší kandidát na jemný skenovaný reliéf, ale jeho export sa bez prihlásenia nepodarilo získať.

## Porovnanie zdrojov

| Zdroj | Identita, geometria a okluzálny detail | Tri pôvodné korene | UV a textúry | Export a úpravy | Licencia a skutočný prístup |
|---|---|---|---|---|---|
| **Dundee UL6, 2015** | Výslovne ľavý horný prvý molár. ZBrush podľa CT, zdrojový export 57 008 trojuholníkov. Rozpoznateľné hrbolčeky, fossae a šikmý hrebeň; jemný reliéf je mäkký. | Áno, súčasť pôvodnej siete; nepridávali sa k dolnému zubu. | UV, tangenty, vertex colors, 4K base color a 4K normal mapa. Bez meranej vnútornej dentínovej vrstvy. | Získaný glTF/BIN cez VAMO; vhodný na Blender, lokálne úpravy a nový GLB. | University of Dundee, School of Dentistry; **CC BY 4.0**. Súbory aj atribúcia overené. |
| **Dundee Carabelli, 2016** | Ľavý horný prvý molár s doplnkovým hrbolčekom. Export 99 560 trojuholníkov. Širšie hladké fossae; vyššia hustota sama neznamená lepší detail. CT pôvod tohto variantu nie je výslovne potvrdený. | Áno, prirodzene asymetrické. | Vložené base color, normal a kombinované materiálové mapy. Redistribútor nastavil silu normal mapy na nulu. | Získaný Draco GLB cez TeethAtlas; tri objekty nepredstavujú automaticky tri anatomické tkanivá. | Dundee; **CC BY 4.0**, licencia a pôvod zachované v GLB. |
| **Melbourne FDI26** | Výslovne ľavý prvý trvalý horný molár, Bruker Skyscan microCT. API uvádza 2 554 761 trojuholníkov. Náhľad ukazuje jemnejší nerovný povrch; úplný okluzálny detail siete nebol overený. | Tri sú viditeľné v primárnom náhľade; sieť sa nekontrolovala. | Bez exportu nemožno potvrdiť UV, farebné textúry ani oddelené tkanivá. | Oficiálne stiahnuteľný model; potrebuje oprávnený download a následnú kontrolu, optimalizáciu a materiály. | Melbourne Dental School; **CC BY 4.0**. Tlačidlo download otvára login. Voliteľné prihlásenie používateľa zostáva možnou cestou získania. |
| **Aichi Kato FDI16** | Označený horný pravý prvý molár, microCT. Jemný detail exportu neoverený. | Bez úspešne získaného súboru nepotvrdené. | OBJ/STL, textúry nedoložené. | Stránka odkazuje na LZH archívy; pokus o OBJ download sa nedokončil. | Dr. Akiko Kato; výskumné zdieľanie, ale bez nájdenej explicitnej licencie na úpravy a verejnú webovú redistribúciu. |
| **UFSC 16a/16b** | Explicitné prvé horné pravé moláre; približne 103k/98k trojuholníkov. Prirodzený vzorkový vzhľad, geometria exportu neoverená. | Exportom neoverené. | Náhľad má farebný povrch; UV súbory neoverené. | Sketchfab označuje download, lokálny export nezískaný. | Ricardo Armini Caldas / Open Dentistry; **CC BY-NC-SA 4.0**, nekomerčné obmedzenie. |
| **ToothFairy3 F_026** | Skutočný segmentovaný chrup s označenými FDI16/26. Zdrojové voxely 0,3 mm; redistribúcia zjednodušená na približne 6k trojuholníkov/zub. Slabší základ pre jemné fisúry. | Úplnosť konkrétnej siete troch koreňov sa tu neoverovala. | Bez fotografickej farby, UV a enamel/dentin rozhrania. | Verejný buffer a manifest OMFAtlas umožňujú vybrať zub a konvertovať ho. | **CC BY-SA 4.0**; upravená geometria musí zachovať túto licenciu. |

Primárne stránky: [Dundee UL6](https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984), [Carabelli](https://sketchfab.com/3d-models/maxillary-first-molar-with-cusp-of-carabelli-9117c7a9bf0848f29bc4e85931697e7b), [Melbourne FDI26](https://sketchfab.com/3d-models/left-maxillary-first-permanent-molar-fdi-26-f4bfb39e47bd45448a8a26a4a9a8bbb1), [Aichi](https://a-kato.agu.ac.jp/English/bottom.html), [UFSC 16a](https://api.sketchfab.com/v3/models/31a5122c067a4db6823d4568feb0c90e), [ToothFairy3](https://ditto.ing.unimore.it/toothfairy3/).

Skutočne získateľné exporty: [Dundee glTF](https://vamo.invisu.ca/vamo/objets3D/sketchfab/maxillary_first_molar/scene.gltf), [Dundee BIN](https://vamo.invisu.ca/vamo/objets3D/sketchfab/maxillary_first_molar/scene.bin), [Carabelli GLB](https://www.teethatlas.com/models/maxillary_first_molar_with_cusp_of_carabelli.glb), [ToothFairy buffer](https://raw.githubusercontent.com/choxos/OMFAtlas/main/public/models/dental/toothfairy.bin) a [manifest](https://raw.githubusercontent.com/choxos/OMFAtlas/main/public/models/dental/manifest.json). Pôvod Dundee, licencie a kontrolné súčty uchováva [zdrojová dokumentácia](../assets/source/dundee/source-provenance.json).

## Čo sa na Dundee zmeralo

Diagnostika v `scripts/professional_model.py` hodnotila východiskovú vonkajšiu sieť pri ilustračnej celkovej výške **21 mm**. Medián dĺžky jedinečných hrán po zváraní UV švov je **0,1765 mm**. Nejde o rozlíšenie pôvodného CT ani o meranie extrahovaného zuba. Sieť bola po tomto zváraní uzavretá, mala konzistentnú orientáciu plôch a jednu spojenú komponentu.

Pri vzorkovaní pôvodnej normal mapy v UV súradniciach 6 490 vybraných okluzálnych vrcholov bol medián odklonu **1,30°**, 95. percentil **3,99°**. Okluzálna maska používa výšku, smer normály a farebné odlíšenie skloviny; nie je histologickou segmentáciou. Výsledok ukazuje slabý pridaný smerový reliéf v týchto vzorkách. Nehovorí, že každý texel alebo každá fisúra má takúto odchýlku. Označenie „4K“ preto samo nepreukazuje výrazný mikropovrch.

## Prečo môže povrch pôsobiť plastovo

Východiskový model tvorí jedna namaľovaná vonkajšia plocha. Chýba samostatný dentínový objem a priestorovo premenlivá vrstva skloviny, cez ktorú svetlo vstupuje a rozptyľuje sa. Mäkký geometrický reliéf, slabá normal mapa a podobná drsnosť veľkých plôch vytvárajú príliš súvislé odlesky. Násobenie base color ďalšími žltkastými vertex colors môže zároveň nechcene znížiť jas a posilniť farebný nádych. Ďalší lesk ani náhodný šum tieto príčiny spoľahlivo neodstránia.

Recenzovaná práca [Velinov a kol., Appearance Capture and Modeling of Human Teeth](https://la.disneyresearch.com/wp-content/uploads/Appearance-Capture-and-Modeling-of-Human-Teeth-Thumbnail.pdf) porovnáva fotografie s modelovaním odrazu a prenosu svetla cez sklovinu a dentín. [Meng a kol.](https://pubmed.ncbi.nlm.nih.gov/19566303/) poskytujú merania indexu lomu. Tieto zdroje podporujú vrstvenú optickú aproximáciu; nevytvárajú dôkaz, že výtvarne odvodená vnútorná vrstva je anatomicky nameraná.

## Referencie a podmienky ďalšieho hodnotenia

[Scheid/Woelfel, kapitola vydavateľa LWW](https://downloads.lww.com/wolterskluwer_vitalstream_com/sample-content/9781608317462_Scheid/samples/Chapter05.pdf), PDF strany 19–30, slúži na kontrolu rhomboidného obrysu, štyroch rozdielnych hlavných hrbolčekov, šikmého hrebeňa ML→DB a odlišných MB, DB a palatálneho koreňa. Tabuľka 5-7 poskytuje populačné rozmery, nie povinnú šablónu každého exemplára.

Makroreferencie: [Luong a kol., obrázok 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC7146590/) dokumentuje zdravú sklovinu v hodnotenom mieste; [Dresden OPARA-223](https://doi.org/10.25532/OPARA-223) poskytuje fotografie a [OPARA-225](https://doi.org/10.25532/OPARA-225) microCT, autori Grundmann a Golde, CC BY 4.0. Dresden zahŕňa podozrenie na kaz, preto jeho pigmentácie a poškodenia nemožno automaticky kopírovať do zdravého modelu. Fotografie sa tu nerepublikujú.

## Nezávislá kontrola vrstiev

Finálne GLB s AO prešli [auditom](review/geometry-audit.json); geometriu tretieho kandidáta zachovávajú oba exporty. Exportovaná sklovina a dentín sú po spojení totožných pozícií uzavreté, bez degenerovaných plôch, obráteného poradia vrcholov či otvorených švov. BVH test nezistil prieniky nepriľahlých trojuholníkov ani kríženie dentínu s vonkajším povrchom alebo vnútornou stenou skloviny. Cementum je otvorený povrch nad koreňmi; spolu s vonkajšou sklovinou tvorí uzavretý obal.

Najväčšia vzdialenosť vzorkovaných vonkajších vrcholov od zdroja je **0,1606 mm**, na koreňoch pod Y = 2,7 mm **0,0099 mm**. Zdroj aj oba exporty zachovávajú tri oddelené koreňové vetvy pod rovinou Y = −5 mm. Vnútorné vrstvy sú výtvarnou aproximáciou, nie nameranou segmentáciou. Úspešná geometrická kontrola sama nepotvrdzuje fotorealizmus; ten vyžaduje samostatné hodnotenie osvetlených pohľadov.
