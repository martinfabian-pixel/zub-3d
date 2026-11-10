/** Reveal the 3D canvas first, then release the chapter controls. */
export function createStartupHandoff(stage, onFinish, onSkip) {
  const document=stage.ownerDocument;
  const body=document.body;
  const window=document.defaultView;
  const loader=stage.querySelector('#journey-startup');
  const view=stage.querySelector('.view-shell');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let fade=null, skip=null, introListeners=null, viewWasInert=false;

  function finish() {
    const wasLoading=body.hasAttribute('data-journey-loading');
    const wasCinematic=body.dataset.journeyHandoff==='cinematic';
    const returnFocus=skip&&document.activeElement===skip&&skip.matches(':focus-visible');
    body.removeAttribute('data-journey-loading');
    body.removeAttribute('data-journey-handoff');
    fade?.cancel();fade=null;
    if(introListeners){
      introListeners.abort();introListeners=null;
      view?.toggleAttribute('inert',viewWasInert);
      skip.remove();skip=null;
    }
    if(wasCinematic&&!reducedMotion.matches){
      for(const item of stage.querySelectorAll('.site-header, .journey-copy, .journey-dock, .journey-footer')){
        item.animate?.([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'});
      }
    }
    if(returnFocus)stage.querySelector('#journey-home')?.focus({preventScroll:true});
    if(wasLoading)onFinish?.();
  }

  function fadeLoader(afterFade) {
    if(reducedMotion.matches||!loader?.animate){afterFade();return;}
    fade=loader.animate([{opacity:1},{opacity:0}],{duration:260,easing:'ease-out',fill:'forwards'});
    fade.finished.then(afterFade,()=>{});
  }

  return {
    start(){
      if(!body.hasAttribute('data-journey-loading')||body.hasAttribute('data-journey-handoff'))return;
      body.dataset.journeyHandoff='reveal';
      fadeLoader(finish);
    },
    startIntro(){
      if(!body.hasAttribute('data-journey-loading')||body.hasAttribute('data-journey-handoff'))return;
      body.dataset.journeyHandoff='cinematic';
      viewWasInert=Boolean(view?.hasAttribute('inert'));
      view?.setAttribute('inert','');
      introListeners=new AbortController();
      const {signal}=introListeners;
      skip=document.createElement('button');
      skip.id='journey-skip-intro';
      skip.className='outline-button startup-skip';
      skip.type='button';
      skip.textContent='Preskočiť úvod';
      skip.setAttribute('aria-keyshortcuts','Escape');
      stage.append(skip);
      skip.addEventListener('click',()=>onSkip?.(),{signal});
      window.addEventListener('keydown',event=>{
        if(event.key!=='Escape'||event.defaultPrevented)return;
        event.preventDefault();
        onSkip?.();
      },{signal});
      fadeLoader(()=>{if(loader)loader.hidden=true;});
    },
    finish,
    get active(){return body.hasAttribute('data-journey-loading');},
  };
}
