import { createStageTypography } from './stage-typography.js';

/** Chapter navigation and screen-space type share the story sampler, never the camera. */
export function createInterface({config,section,stage,signal,navigate,explore,reset,zoom,finalView:chooseFinalView}) {
  const byId=id=>document.getElementById(id),steps=config.presentation.steps,help=byId('journey-help-dialog');
  const typography=createStageTypography(stage,document.querySelector('.journey-copy'));
  const nav=document.querySelector('.journey-steps'),buttons=[];
  const heroExplore=byId('journey-hero-explore'),freeExplore=byId('journey-explore');
  const modelButtons=['journey-hero-explore','journey-explore','journey-reset','journey-zoom-in','journey-zoom-out'].map(byId);
  let index=-1,liveReady=false,smallLayout,lastPhase;
  let wasExploring;
  nav.replaceChildren();
  for(const [i,step] of steps.entries()) {
    const button=document.createElement('button');button.className='journey-step';button.type='button';button.dataset.progress=step.at;
    const label=document.createElement('span');label.className='sr-only';label.textContent=`${i+1}. ${step.label}`;
    button.title=step.label;button.append(label);nav.append(button);buttons.push(button);
    button.addEventListener('click',()=>navigate(step.at),{signal});
  }
  const move=delta=>navigate(steps[Math.max(0,Math.min(steps.length-1,index+delta))].at);
  byId('journey-mobile-previous').addEventListener('click',()=>move(-1),{signal});
  byId('journey-mobile-next').addEventListener('click',()=>move(1),{signal});
  byId('journey-home').addEventListener('click',()=>navigate(0),{signal});
  byId('journey-show-all').addEventListener('click',()=>navigate(steps.at(-1).at),{signal});
  byId('journey-view-smile').addEventListener('click',()=>chooseFinalView('smile'),{signal});
  byId('journey-view-anatomy').addEventListener('click',()=>chooseFinalView('anatomy'),{signal});
  heroExplore.addEventListener('click',explore,{signal});
  freeExplore.addEventListener('click',()=>{explore();if(freeExplore.hidden)heroExplore.focus({preventScroll:true});},{signal});
  byId('journey-reset').addEventListener('click',reset,{signal});
  byId('journey-zoom-in').addEventListener('click',()=>zoom(.88),{signal});
  byId('journey-zoom-out').addEventListener('click',()=>zoom(1/.88),{signal});
  byId('journey-help').addEventListener('click',()=>help.showModal(),{signal});
  byId('journey-notes').addEventListener('click',()=>{byId('journey-education').open=true;help.showModal();byId('journey-education').scrollIntoView({block:'nearest'});},{signal});
  const close=()=>help.close();
  byId('journey-close-help').addEventListener('click',close,{signal});byId('journey-help-done').addEventListener('click',close,{signal});
  help.addEventListener('click',event=>{if(event.target===help){const r=help.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}},{signal});
  function update({progress,ready,complete,exploring,finalView,compact,state,reducedMotion=false}) {
    const small=window.matchMedia('(max-width:700px)').matches;
    // Delayed assets and reduced-motion states use the actually rendered chapter.
    const active=state?.chapterIndex??0;
    const step=steps[active],phase=state?.brushPose?.phase??'hidden',final=active===steps.length-1;
    if(index!==active||smallLayout!==small) {
      index=active;smallLayout=small;lastPhase=undefined;
      const lines=step.titleLines.map(text=>{
        const line=document.createElement('span');
        line.textContent=text;
        return line;
      });
      byId('journey-title').replaceChildren(lines[0],' ',lines[1]);
      byId('journey-step-number').textContent=`${String(index+1).padStart(2,'0')} / ${String(steps.length).padStart(2,'0')}`;
      byId('journey-meta').textContent=step.meta;byId('journey-subject').textContent=step.subject;
      byId('journey-canvas').setAttribute('aria-label','3D výučbová scéna: '+step.title+' Ťahaním otáčate. Šípky, + a − upravia pohľad.');
      byId('journey-mobile-previous').disabled=index===0;byId('journey-mobile-next').disabled=final;
      buttons.forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      if(liveReady)byId('journey-stage-live').textContent='Kapitola '+(index+1)+' zo '+steps.length+'. '+step.title;
      const labels=byId('journey-result-labels');labels.textContent=step.resultLabels?.join('. ')??'';labels.setAttribute('aria-hidden',String(step.id!=='result'));
      byId('journey-education-current').textContent=step.education??step.text;
    }
    if(lastPhase!==phase) {
      lastPhase=phase;
      const text=step.text,note=step.id==='plaque'?step.note:'';
      let instruction='';
      if(step.id==='brush') {
        const i=phase==='align'||phase==='hidden'?0:phase==='insert'?1:2;
        instruction=phase==='withdraw'?'Jemné vysunutie.':step.instructions[i];
      }
      byId('journey-description').textContent=text;
      byId('journey-note').textContent=note;byId('journey-note').hidden=!note;
      byId('journey-instruction').textContent=instruction;byId('journey-instruction').hidden=!instruction;
    }
    byId('journey-final-views').hidden=!final || (!reducedMotion && (state?.sceneProgress??0)<.978);
    typography.update(step,state?.progress??progress,{mobile:small,reducedMotion,free:exploring});
    heroExplore.hidden=active!==0||exploring;
    freeExplore.hidden=active===0&&!exploring;
    liveReady=ready;
    for(const button of modelButtons)button.disabled=!ready;
    for(const name of ['smile','anatomy']){
      const button=byId('journey-view-'+name);button.disabled=!ready||!complete;button.setAttribute('aria-pressed',String(finalView===name));
    }
    if(wasExploring!==exploring){
      wasExploring=exploring;
      freeExplore.setAttribute('aria-pressed',String(exploring));
      freeExplore.textContent=exploring?'Pokračovať v príbehu':'Voľné 3D';
      freeExplore.classList.toggle('is-free',exploring);
    }
    byId('journey-orbit-hint').textContent=exploring?'Voľné 3D · otáčajte v oboch osiach · pinch alebo koliesko približuje':compact?'Ťah do strán otáča · zvislo pokračujete v príbehu':'Ťahaním otáčate · kolieskom pokračujete v príbehu';
  }
  function scrollTo(progress,reducedMotion) {const rect=section.getBoundingClientRect(),travel=rect.height-stage.getBoundingClientRect().height;window.scrollTo({top:window.scrollY+rect.top+progress*travel,behavior:reducedMotion?'instant':'smooth'});}
  return {update,scrollTo,report:()=>typography.report(),get index(){return index;},dispose(){if(help.open)help.close();}};
}
