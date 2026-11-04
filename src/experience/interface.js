/** Chapter navigation, content and help never own the Three.js scene. */
export function createInterface({config,section,stage,signal,navigate,explore,reset,zoom}) {
  const byId=id=>document.getElementById(id),steps=config.presentation.steps,help=byId('journey-help-dialog');
  const previous=byId('journey-previous'),next=byId('journey-next'),select=byId('journey-chapter-select');
  const nav=document.querySelector('.journey-steps'),buttons=[];
  nav.style.setProperty('--chapter-count',steps.length);
  const modelButtons=['journey-explore','journey-reset','journey-zoom-in','journey-zoom-out'].map(byId);
  let index=-1,liveReady=false,smallLayout,lastPhase;
  nav.replaceChildren();select.replaceChildren();
  for(const [i,step] of steps.entries()) {
    const button=document.createElement('button');button.className='journey-step';button.type='button';button.dataset.progress=step.at;
    const number=document.createElement('span');number.className='step-number';number.textContent=String(i+1).padStart(2,'0');
    const label=document.createElement('span');label.textContent=step.label;button.append(number,label);nav.append(button);buttons.push(button);
    button.addEventListener('click',()=>navigate(step.at),{signal});
    const option=document.createElement('option');option.value=i;option.textContent=(i+1)+' / '+steps.length+' · '+step.label;select.append(option);
  }
  select.addEventListener('change',()=>navigate(steps[Number(select.value)].at),{signal});
  const move=delta=>navigate(steps[Math.max(0,Math.min(steps.length-1,index+delta))].at);
  byId('journey-mobile-previous').addEventListener('click',()=>move(-1),{signal});
  byId('journey-mobile-next').addEventListener('click',()=>move(1),{signal});
  byId('journey-home').addEventListener('click',()=>navigate(0),{signal});
  byId('journey-show-all').addEventListener('click',()=>navigate(steps.at(-1).at),{signal});
  previous.addEventListener('click',()=>move(-1),{signal});
  next.addEventListener('click',()=>navigate(index===steps.length-1?steps.find(s=>s.id==='brush').at:steps[index+1].at),{signal});
  byId('journey-cleaning-link').addEventListener('click',()=>navigate(steps.find(s=>s.id==='brush').at),{signal});
  byId('journey-final-explore').addEventListener('click',explore,{signal});
  byId('journey-explore').addEventListener('click',explore,{signal});
  byId('journey-reset').addEventListener('click',reset,{signal});
  byId('journey-zoom-in').addEventListener('click',()=>zoom(.88),{signal});
  byId('journey-zoom-out').addEventListener('click',()=>zoom(1/.88),{signal});
  byId('journey-help').addEventListener('click',()=>help.showModal(),{signal});
  const close=()=>help.close();
  byId('journey-close-help').addEventListener('click',close,{signal});byId('journey-help-done').addEventListener('click',close,{signal});
  help.addEventListener('click',event=>{if(event.target===help){const r=help.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}},{signal});
  function update({progress,ready,complete,exploring,compact,state}) {
    const small=window.matchMedia('(max-width:700px)').matches;
    let active=0;while(active<steps.length-1&&progress>=steps[active+1].from)active++;
    const step=steps[active],phase=state?.brushPose?.phase??'hidden',final=active===steps.length-1;
    if(index!==active||smallLayout!==small) {
      index=active;smallLayout=small;lastPhase=undefined;
      byId('journey-step-number').textContent=String(index+1).padStart(2,'0')+' / '+String(steps.length).padStart(2,'0');
      byId('journey-eyebrow').textContent=step.eyebrow;byId('journey-title').textContent=small?step.mobileTitle:step.title;
      byId('journey-meta').textContent=step.meta;byId('journey-subject').textContent=step.subject;
      byId('journey-canvas').setAttribute('aria-label','3D výučbová scéna: '+step.title+' Zapnite preskúmanie a použite šípky, + a −.');
      next.textContent=step.next+(final?' ↶':' →');
      next.classList.toggle('final-back-button',final);
      previous.disabled=index===0;byId('journey-mobile-previous').disabled=index===0;byId('journey-mobile-next').disabled=final;
      byId('journey-final-explore').hidden=!final;byId('journey-cleaning-link').hidden=!final;
      select.value=index;
      buttons.forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      if(liveReady)byId('journey-stage-live').textContent='Kapitola '+(index+1)+' zo '+steps.length+'. '+step.title;
      const labels=byId('journey-result-labels');labels.classList.toggle('is-shown',step.id==='result');labels.setAttribute('aria-hidden',String(step.id!=='result'));
    }
    if(lastPhase!==phase) {
      lastPhase=phase;
      let text=step.text,note=step.note,instruction='';
      if(step.id==='brush') {
        const i=phase==='align'||phase==='hidden'?0:phase==='insert'?1:2;
        instruction=(i+1)+' / 3 · '+step.instructions[i];
        if(i===1)text='Kefka sa zavádza zboku pod kontaktom koruniek.';
        if(i===2)text=phase==='withdraw'?'Kefka sa vysúva rovnakou cestou.':'Štetinky priliehajú k susedným plochám. Počet pohybov je názorná ukážka.';
      }
      byId('journey-description').textContent=text;
      byId('journey-note').textContent=note;byId('journey-note').hidden=!note;
      byId('journey-instruction').textContent=instruction;byId('journey-instruction').hidden=!instruction;
    }
    liveReady=ready;
    for(const button of modelButtons)button.disabled=!ready;
    byId('journey-final-explore').disabled=!ready||!complete;
    byId('journey-explore').setAttribute('aria-pressed',String(exploring));
    byId('journey-explore').textContent=exploring?'Prezentácia':final?'Preskúmať chrup':'Preskúmať';
    byId('journey-orbit-hint').textContent=exploring?(compact?'Preskúmať · do strán otáčate, zvislo posúvate':'Preskúmať · šípky, + a − · Esc späť'):'Prezentácia · posúvajte stránku alebo vyberte kapitolu';
  }
  function scrollTo(progress,reducedMotion) {const rect=section.getBoundingClientRect(),travel=rect.height-stage.getBoundingClientRect().height;window.scrollTo({top:window.scrollY+rect.top+progress*travel,behavior:reducedMotion?'instant':'smooth'});}
  return {update,scrollTo,get index(){return index;},dispose(){if(help.open)help.close();}};
}
