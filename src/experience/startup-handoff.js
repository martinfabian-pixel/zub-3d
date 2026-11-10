/** Keep the loading curtain in place until the opening arch has rendered. */
export function createStartupHandoff(stage, onFinish) {
  const body=stage.ownerDocument.body;
  const loader=stage.querySelector('#journey-startup');
  const reducedMotion=stage.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)');
  let fade=null;

  function finish() {
    const wasLoading=body.hasAttribute('data-journey-loading');
    body.removeAttribute('data-journey-loading');
    body.removeAttribute('data-journey-handoff');
    fade?.cancel();fade=null;
    if(wasLoading)onFinish?.();
  }

  return {
    start(){
      if(!body.hasAttribute('data-journey-loading')||fade)return;
      if(reducedMotion.matches||!loader?.animate){finish();return;}
      body.dataset.journeyHandoff='reveal';
      fade=loader.animate([{opacity:1},{opacity:0}],{duration:260,easing:'ease-out',fill:'forwards'});
      fade.finished.then(finish,()=>{});
    },
    finish,
    get active(){return body.hasAttribute('data-journey-loading');},
  };
}
