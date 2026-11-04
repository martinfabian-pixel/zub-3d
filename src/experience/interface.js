/** DOM navigation and descriptions are independent of the WebGL lifecycle. */
export function createInterface({config,section,stage,signal,navigate,explore,reset,zoom}) {
  const byId=(id)=>document.getElementById(id);
  const steps=config.presentation.steps;
  const buttons=[...document.querySelectorAll('.journey-step')];
  const help=byId('journey-help-dialog');
  const previous=byId('journey-previous'),next=byId('journey-next');
  const modelButtons=['journey-explore','journey-reset','journey-zoom-in','journey-zoom-out'].map(byId);
  let index=-1,liveReady=false,smallLayout;
  buttons.forEach((button,i)=>button.addEventListener('click',()=>navigate(steps[i].at),{signal}));
  byId('journey-home').addEventListener('click',()=>navigate(0),{signal});
  byId('journey-show-all').addEventListener('click',()=>navigate(steps.at(-1).at),{signal});
  previous.addEventListener('click',()=>navigate(steps[Math.max(0,index-1)].at),{signal});
  next.addEventListener('click',()=>navigate(index===steps.length-1?0:steps[index+1].at),{signal});
  byId('journey-explore').addEventListener('click',explore,{signal});
  byId('journey-reset').addEventListener('click',reset,{signal});
  byId('journey-zoom-in').addEventListener('click',()=>zoom(.88),{signal});
  byId('journey-zoom-out').addEventListener('click',()=>zoom(1/.88),{signal});
  byId('journey-help').addEventListener('click',()=>help.showModal(),{signal});
  const close=()=>help.close();
  byId('journey-close-help').addEventListener('click',close,{signal});
  byId('journey-help-done').addEventListener('click',close,{signal});
  help.addEventListener('click',(event)=>{if(event.target===help){const r=help.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}},{signal});

  function update({progress,ready,exploring,compact}) {
    const small=window.matchMedia('(max-width:700px)').matches;
    let active=0;
    while(active<steps.length-1&&progress>=steps[active+1].from)active++;
    if(index!==active||smallLayout!==small) {
      index=active;
      smallLayout=small;
      const step=steps[index];
      byId('journey-step-number').textContent=`0${index+1} / 04`;
      byId('journey-eyebrow').textContent=step.eyebrow;
      byId('journey-title').textContent=small?step.mobileTitle:step.title;
      byId('journey-description').textContent=small?step.mobileDescription:step.description;
      byId('journey-meta').textContent=step.meta;
      byId('journey-subject').textContent=step.subject;
      byId('journey-canvas').setAttribute('aria-label',`3D model: ${step.subject}. Zapnite otáčanie a použite šípky, + a −.`);
      next.replaceChildren(document.createTextNode(step.next+' '),Object.assign(document.createElement('span'),{textContent:index===3?'↺':'→'}));
      if(liveReady)byId('journey-stage-live').textContent=`Krok ${index+1} zo 4. ${step.subject}.`;
      buttons.forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      previous.disabled=index===0;
    }
    liveReady=ready;
    for(const button of modelButtons)button.disabled=!ready;
    byId('journey-explore').setAttribute('aria-pressed',String(exploring));
    byId('journey-explore').textContent=exploring?'Späť na prezentáciu':'Otáčať model';
    byId('journey-orbit-hint').textContent=exploring
      ?(compact?'Ťah do strán otáča · zvislý ťah posúva stránku':'Ťahaním otáčate · šípky, + a − · Esc späť')
      :'Zapnite otáčanie alebo pokračujte posunutím stránky.';
  }
  function scrollTo(progress,reducedMotion) {
    const rect=section.getBoundingClientRect();
    const travel=rect.height-stage.getBoundingClientRect().height;
    window.scrollTo({top:window.scrollY+rect.top+progress*travel,behavior:reducedMotion?'instant':'smooth'});
  }
  return {update,scrollTo,get index(){return index;},dispose(){if(help.open)help.close();}};
}
