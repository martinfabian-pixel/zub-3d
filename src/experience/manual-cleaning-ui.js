import './manual-cleaning-ui.css';

const INSTRUCTIONS = {
  ready: 'Posuňte kefku medzi zuby.',
  insert: 'Jemne, bez násilia.',
  clean: 'Pohybujte kefkou tam a späť.',
  result: 'Povlak sa odstránil zo zasiahnutých plôch.',
};

/** Screen-space controls for the existing scene. Only actual controls accept
 * pointer events; the moving grip is projected by the scene owner. */
export function createManualCleaningUI({stage, onStart, onExit, onReset, onPointerStart, onPointerMove, onPointerEnd, onKey}) {
  const doc=stage.ownerDocument, copy=stage.querySelector('.journey-copy');
  if(!copy) throw new Error('Manual cleaning needs the journey copy layer.');
  const abort=new AbortController(), signal=abort.signal;
  const entry=doc.createElement('button');
  entry.type='button';entry.className='primary-button manual-cleaning-start';
  entry.textContent='Vyskúšať čistenie';entry.hidden=true;

  const content=doc.createElement('div');content.className='manual-cleaning-content';content.hidden=true;
  const instruction=doc.createElement('h2');instruction.id='manual-cleaning-instruction';
  instruction.className='manual-cleaning-instruction';instruction.setAttribute('aria-live','polite');
  const note=doc.createElement('p');note.id='manual-cleaning-note';note.className='manual-cleaning-note';
  note.textContent='Ilustračná ukážka. Kefku zavádzajte jemne, bez násilia.';
  const actions=doc.createElement('div');actions.className='manual-cleaning-actions';
  const repeat=doc.createElement('button');repeat.type='button';repeat.className='outline-button manual-cleaning-repeat';
  repeat.textContent='Zopakovať';repeat.hidden=true;
  const exit=doc.createElement('button');exit.type='button';exit.className='primary-button manual-cleaning-exit';
  exit.textContent='Pokračovať v príbehu';
  actions.append(repeat,exit);content.append(instruction,note,actions);copy.append(entry,content);

  const grip=doc.createElement('button');grip.type='button';grip.className='manual-cleaning-grip';grip.hidden=true;
  grip.setAttribute('role','slider');grip.setAttribute('aria-label','Poloha medzizubnej kefky');
  grip.setAttribute('aria-describedby','manual-cleaning-grip-help');grip.setAttribute('aria-orientation','horizontal');
  grip.setAttribute('aria-valuemin','0');grip.setAttribute('aria-valuemax','100');
  const icon=doc.createElement('span');icon.setAttribute('aria-hidden','true');icon.textContent='↔';grip.append(icon);
  const help=doc.createElement('span');help.id='manual-cleaning-grip-help';help.className='sr-only';
  help.textContent='Potiahnite úchop dopredu alebo dozadu. Na klávesnici použite šípky.';
  stage.append(grip,help);

  let pointer=null, width=stage.clientWidth, height=stage.clientHeight;
  let lastPhase, lastActive, lastVisible, lastEnabled, lastStarted, lastResult, lastNow, lastX, lastY, lastAngle;
  let lastShowGrip, lastCanDrag;
  const originalLabel=copy.getAttribute('aria-labelledby');
  const observer=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(r){width=r.width;height=r.height;}});
  observer.observe(stage);
  entry.addEventListener('click',()=>onStart?.(),{signal});
  exit.addEventListener('click',()=>onExit?.(),{signal});
  repeat.addEventListener('click',()=>onReset?.(),{signal});
  grip.addEventListener('pointerdown',event=>{
    if(pointer!==null || !event.isPrimary || (event.pointerType==='mouse' && event.button!==0))return;
    pointer=event.pointerId;grip.setPointerCapture(pointer);event.preventDefault();event.stopPropagation();
    onPointerStart?.(event);
  },{signal});
  grip.addEventListener('pointermove',event=>{
    if(event.pointerId!==pointer)return;
    event.preventDefault();event.stopPropagation();onPointerMove?.(event);
  },{signal});
  function endPointer(event) {
    if(event.pointerId!==pointer)return;
    pointer=null;event.stopPropagation();onPointerEnd?.(event);
  }
  grip.addEventListener('pointerup',endPointer,{signal});
  grip.addEventListener('pointercancel',endPointer,{signal});
  grip.addEventListener('lostpointercapture',endPointer,{signal});
  grip.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();onKey?.(event.key,event);
  },{signal});

  return {
    update({chapterId,ready=true,active=false,phase='ready',started=false,gripX,gripY,position=0,canDrag=true,angle=0}) {
      const visible=chapterId==='brush'&&!active;
      if(lastVisible!==visible){entry.hidden=!visible;lastVisible=visible;}
      if(lastEnabled!==ready){entry.disabled=!ready;lastEnabled=ready;}
      if(lastActive!==active){
        content.hidden=!active;stage.dataset.manualCleaning=String(active);
        if(active)copy.setAttribute('aria-labelledby',instruction.id);
        else if(originalLabel)copy.setAttribute('aria-labelledby',originalLabel);
        else copy.removeAttribute('aria-labelledby');
        lastActive=active;
      }
      const text=INSTRUCTIONS[phase]??INSTRUCTIONS.ready;
      if(lastPhase!==text){instruction.textContent=text;lastPhase=text;}
      const result=phase==='result';
      if(lastResult!==result){repeat.hidden=!result;lastResult=result;}
      const showGrip=active&&!result;
      if(lastShowGrip!==showGrip){grip.hidden=!showGrip;lastShowGrip=showGrip;}
      if(lastCanDrag!==canDrag){grip.disabled=!canDrag;lastCanDrag=canDrag;}
      if(lastStarted!==started){grip.classList.toggle('has-moved',started);icon.textContent=started?'•••':'↔';lastStarted=started;}
      const rotation=Math.round(angle);
      if(rotation!==lastAngle){icon.style.transform=`rotate(${rotation}deg)`;lastAngle=rotation;}
      const now=Math.round(Math.max(0,Math.min(1,position))*100);
      if(now!==lastNow){grip.setAttribute('aria-valuenow',String(now));grip.setAttribute('aria-valuetext',`Zavedenie ${now} %`);lastNow=now;}
      if(showGrip){
        // Clamp only the handle, never its world-space path. It remains clear
        // of browser edges and the bottom controls on small viewports.
        const x=Math.max(42,Math.min(Math.max(42,width-42),Number.isFinite(gripX)?gripX:width*.22));
        const y=Math.max(Math.min(height*.37,height-115),Math.min(height-115,Number.isFinite(gripY)?gripY:height*.65));
        if(x!==lastX){grip.style.left=`${x}px`;lastX=x;}
        if(y!==lastY){grip.style.top=`${y}px`;lastY=y;}
      }
    },
    get grip(){return grip;},
    dispose(){observer.disconnect();abort.abort();entry.remove();content.remove();grip.remove();help.remove();delete stage.dataset.manualCleaning;
      if(originalLabel)copy.setAttribute('aria-labelledby',originalLabel);else copy.removeAttribute('aria-labelledby');},
  };
}
