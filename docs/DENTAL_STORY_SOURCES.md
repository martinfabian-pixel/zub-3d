# Medicínsky obsah príbehu: povlak, kaz a medzizubné čistenie

Príbeh rozlišuje **povlak na povrchu zuba** a **stratu tkaniva zuba**. Kefka zobrazená medzi dolnou ľavou šestkou a sedmičkou odstraňuje povlak iba zo zasiahnutého povrchu. Dutina v šestke zostáva po čistení rovnaká. Časť s rozvojom kazu zhusťuje dlhší biologický dej do ilustrácie; nejde o zmenu počas jedného čistenia.

## Čo podporujú zdroje

| Téma v prezentácii | Zdroj a jeho význam |
|---|---|
| Povlak, cukry, kyseliny a sklovina | [NIDCR: The Tooth Decay Process](https://www.nidcr.nih.gov/health-info/tooth-decay/more-info/tooth-decay-process). Povlak je priľnavý bakteriálny film. Baktérie využívajú cukry a produkujú kyseliny; pri opakovanom pôsobení môže sklovina strácať minerály. Povlak preto v príbehu zvýrazňujeme farbou, nie tvrdením, že normálne vyzerá ako hrubý farebný nános. |
| Skorá zmena verzus vzniknutá dutina | [NIDCR: vývoj kazu](https://www.nidcr.nih.gov/health-info/tooth-decay/more-info/tooth-decay-process) a [NHS: Tooth decay](https://www.nhs.uk/conditions/tooth-decay/). Skorá nekavitovaná lézia sa môže zastaviť alebo remineralizovať. Keď už tkanivo chýba, mechanické čistenie ho neobnoví. Zobrazený priebeh je jeden možný vývoj, nie nevyhnutný osud každej škvrny. Konkrétne ošetrenie posúdi zubný lekár. |
| Každodenná hygiena | [NHS: Tooth decay, prevencia](https://www.nhs.uk/conditions/tooth-decay/) odporúča denne čistiť medzizubné priestory a najmenej dvakrát denne používať fluoridovú pastu. [NHS: How to keep your teeth clean](https://www.nhs.uk/live-well/healthy-teeth-and-gums/how-to-keep-your-teeth-clean/) vysvetľuje bežné čistenie aj voľbu medzizubnej kefky či nite podľa priestoru. Jeden zobrazený nástroj nie je odporúčaním rovnakej pomôcky do každej medzery. |
| Jemné zavedenie a pohyb | [TePe: How to Use Interdental Brushes](https://www.tepeusa.com/collections/how-to-use-interdental-brushes). Návod výrobcu opisuje jemné zasunutie bez sily a krátky pohyb tam a späť. V animácii sa preto pohybuje kefka pozdĺž priestoru a povlak ustupuje iba v dosahu štetín; kefka nevŕta ani nevypĺňa dutinu. |
| Výber veľkosti | [TePe: Interdental Brushing Sizing Guide](https://www.tepeusa.com/pages/interdental-brushing-sizing-guide). Štetiny majú primerane priliehať a drôt nemá škrabať susedné zuby. Rôzne medzery môžu vyžadovať rôzne veľkosti; s výberom pomôže zubný lekár alebo dentálna hygienička. Fialová je farbou ilustrácie, nie všeobecným označením priemeru alebo veľkosti určenej pre konkrétneho človeka. |

Návody TePe sú zdrojom k spôsobu použitia. Do prezentácie sa z nich nepreberajú fotografie, produktové modely, video, logo ani tabuľka farebných veľkostí.

## Hranice ilustrácie

Ďasná a medzizubná papila nie sú zobrazené. Priestor medzi tvrdými povrchmi zubov preto nie je celý voľný priestor v ústach. Z tejto scény nemožno určiť bezpečnú hĺbku zasunutia pre človeka, silu pôsobenia ani veľkosť kefky. Kontrola kolízií s digitálnym zubom nenahrádza kontrolu kontaktu s mäkkými tkanivami. Pred použitím ako samostatného klinického návodu treba odborne posúdiť najmä dráhu kefky pri krčku, vedenie drôtu a dosah štetín.

Zvýraznenie povlaku, vývoj lézie a prechod medzi nimi sú výtvarné pomôcky, nie merania pacienta. Návrat na predošlú kapitolu vracia **rozprávanie** na skorší okamih; neznamená vyliečenie kazu kefkou. Záverečný otvorený chrup ukazuje polohy zubov a každodennú prevenciu, nie výsledok liečby.

## Kontrola tejto logiky v programe

[Texty a kapitoly](../src/experience/story-config.js) používajú jedinú normalizovanú polohu. [Stav scény](../src/experience/dental-story.js) sa z nej vypočíta priamo, aj pri preskočení alebo spätnom posune. Hrúbka či sfarbenie lézie nesmú byť naviazané na čistenie: `lesionProgress` dosiahne 1 pred kefkou a túto hodnotu si zachová až po posledný záber.

`plaqueDeposition` určuje pôvodné pokrytie. `cleaningProgress` postupuje iba tak ďaleko, ako sa pri troch zasunutiach dostala pracovná časť kefky. `plaqueCoverage` vyjadruje zostávajúci podiel **iba v dosiahnuteľnej časti**, nie množstvo povlaku v celých ústach. Pri vykreslení treba použiť lokálnu masku dosahu: mimo nej povlak zostáva. Pri obmedzenom pohybe sa ukáže sedem samostatných stavov vrátane kontaktu kefky a následného výsledku bez zabudnutia lézie.

Čistú logiku bez prehliadača overí `node scripts/test-dental-story.mjs`: sedem statických kapitol, 10 001 vzoriek pohybu, pretrvanie dutiny, hranice dosahu a rovnaký výsledok po spätnom posune či skoku. Tento test nehodnotí klinickú správnosť dráhy v 3D ani čitateľnosť konkrétneho renderu.
