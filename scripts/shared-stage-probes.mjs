// Browser-only measurements from the delivered renderer and semantic copy.
// CSS text ranges exclude the unoccupied space around a heading or paragraph.
export async function measureSharedStage(page) {
  return page.evaluate(()=>{
    const app=window.__dentalExperience, state=app.report(), camera=app.rig.camera;
    const element=app.renderer.domElement, canvas=element.getBoundingClientRect();
    const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
    const shown=e=>e?.checkVisibility({visibilityProperty:true,opacityProperty:true})&&!e.closest('[aria-hidden=true],[hidden],[inert]');
    const headings=[...document.querySelectorAll('h1,h2,[role=heading]')].filter(e=>shown(e)&&e.closest('.journey-copy'));
    const copy=headings[0]?.closest('.journey-copy')??document.querySelector('.journey-copy');
    const ranges=[];
    if(copy){
      const tree=document.createTreeWalker(copy,NodeFilter.SHOW_TEXT);
      for(let node=tree.nextNode();node;node=tree.nextNode()){
        const parent=node.parentElement;
        if(!node.textContent.trim()||!shown(parent)||parent.closest('button,a,.sr-only'))continue;
        const range=document.createRange();range.selectNodeContents(node);
        for(const r of range.getClientRects())if(r.width>1&&r.height>1)ranges.push({...rect(r),text:node.textContent.trim()});
      }
    }
    const stage=rect(document.querySelector('#journey-stage').getBoundingClientRect());
    app.scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const point=camera.position.clone(),subjects=[];
    const target=app.rig.target.clone().project(camera), pose=app.rig.pose;
    function sample(name){
      const ndc=point.clone().project(camera);
      const x=canvas.left+(ndc.x+1)*canvas.width*.5,y=canvas.top+(1-ndc.y)*canvas.height*.5;
      const covers=ranges.filter(r=>x>r.left-1&&x<r.right+1&&y>r.top-1&&y<r.bottom+1).map(r=>r.text);
      subjects.push({name,x,y,clipped:Math.max(Math.abs(ndc.x),Math.abs(ndc.y),Math.abs(ndc.z))>1.002,covers});
    }
    const chapter=state.story.chapterId;
    const host=app.arch.teeth.get(36).mesh;
    if(chapter==='hero'){
      host.geometry.computeBoundingBox();host.geometry.boundingBox.getCenter(point).applyMatrix4(host.matrixWorld);sample('FDI36 center');
      const p=host.geometry.attributes.position,box=host.geometry.boundingBox;
      let mostCrown=0,mostRoot=0;
      for(let i=1;i<p.count;i++){if(p.getY(i)>p.getY(mostCrown))mostCrown=i;if(p.getY(i)<p.getY(mostRoot))mostRoot=i;}
      for(const [name,id] of [['cusp',mostCrown],['root apex',mostRoot]]){host.getVertexPosition(id,point).applyMatrix4(host.matrixWorld);sample(name);}
    } else if(chapter==='space'){
      point.fromArray(app.site.tightestGapFocusWorldCm);sample('36/37 contact');
    } else if(chapter==='plaque'){
      for(const patch of app.site.plaque.patches){
        const m=app.arch.teeth.get(patch.fdi).mesh;
        const eligible=patch.edgeWeight.map((w,i)=>w>.65&&patch.pathDistanceMm[i]<.65?i:-1).filter(i=>i>=0);
        const v=camera.position.clone();point.set(0,0,0);
        for(const i of eligible)point.add(v.fromArray(patch.positions,i*3));
        if(eligible.length){point.multiplyScalar(1/eligible.length).applyMatrix4(m.matrixWorld);sample('reachable deposit '+patch.fdi);}
      }
    } else if(chapter==='caries'||chapter==='result'){
      const region=host.geometry.getAttribute('lesionRegion');
      for(let i=0;i<region.count;i+=5)if(region.getY(i)>.55){host.getVertexPosition(i,point).applyMatrix4(host.matrixWorld);sample('cavity floor');}
    } else if(chapter==='brush'){
      point.fromArray(app.site.brush.centerline[0].position);sample('buccal shaft entry');
      if(state.story.brush.tipWorld){point.fromArray(state.story.brush.tipWorld);sample('brush tip');}
    } else if(chapter==='dentition'){
      for(const fdi of [11,12,13,21,22,23,31,32,33,41,42,43]){
        const item=app.arch.teeth.get(fdi),m=item.crown?.visible?item.crown:item.mesh;
        if(!m?.visible)continue;
        const attrs=m.geometry.attributes.position;
        let y=-Infinity;
        for(let i=0;i<attrs.count;i++){const height=attrs.getY(i);if(height>y){y=height;point.fromBufferAttribute(attrs,i);}}
        point.applyMatrix4(m.matrixWorld);sample('incisal edge '+fdi);
      }
    }
    const controls=[...document.querySelectorAll('#journey-stage button,#journey-stage select,#journey-stage a')]
      .filter(shown).map(e=>rect(e.getBoundingClientRect()));
    const inViewport=r=>r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;
    const blocked=ranges.flatMap(r=>controls.filter(c=>Math.min(c.right,r.right)-Math.max(c.left,r.left)>1&&Math.min(c.bottom,r.bottom)-Math.max(c.top,r.top)>1).map(()=>r.text));
    const title=headings[0];
    const hit=title?(()=>{const t=ranges.find(r=>title.innerText?.includes(r.text.slice(0,5)));if(!t)return null;const x=(t.left+t.right)*.5,y=(t.top+t.bottom)*.5;
      return {x,y,node:document.elementFromPoint(x,y)?.id??'',isCanvas:document.elementFromPoint(x,y)===element};})():null;
    const region=subjects.reduce((b,p)=>({left:Math.min(b.left,p.x),right:Math.max(b.right,p.x),top:Math.min(b.top,p.y),bottom:Math.max(b.bottom,p.y)}),
      {left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity});
    const visible=e=>Boolean(e?.checkVisibility({visibilityProperty:true,opacityProperty:true})&&!e.closest('[hidden],[inert]'));
    const describe=e=>({id:e.id,visible:visible(e),tag:e.tagName,name:e.getAttribute('aria-label')||e.textContent.trim(),
      current:e.getAttribute('aria-current')==='step',disabled:e.disabled});
    const final=document.querySelector('#journey-final-views');
    return {stage,canvas:rect(canvas),headingCount:headings.length,heading:title?.innerText,role:title?.tagName,
      titleLines:[...document.querySelectorAll('#journey-title > span')].map(e=>({text:e.textContent.trim(),display:getComputedStyle(e).display})),
      navigation:{dots:[...document.querySelectorAll('.journey-step')].map(describe),
        counter:document.querySelector('#journey-step-number')?.textContent.trim().replace(/\s+/g,' '),
        arrows:['#journey-mobile-previous','#journey-mobile-next'].map(s=>document.querySelector(s)).filter(Boolean).map(describe)},
      surface:{webglAlpha:app.renderer.getContext().getContextAttributes().alpha,clearAlpha:app.renderer.getClearAlpha(),
        sceneBackground:app.scene.background?.getHexString()??null,stageColor:getComputedStyle(document.querySelector('#journey-stage')).backgroundColor,
        stageBackground:getComputedStyle(document.querySelector('#journey-stage')).backgroundImage,
        sceneColorToken:getComputedStyle(document.querySelector('#journey-stage')).getPropertyValue('--scene-bg').trim().toLowerCase(),
        canvasColor:getComputedStyle(element).backgroundColor},
      controls:{heroVisible:visible(document.querySelector('#journey-hero-explore')),finalVisible:visible(final),
        finalInCopy:Boolean(final?.closest('.journey-copy')),noteVisible:visible(document.querySelector('#journey-note'))},
      framing:{projectedFocus:[(target.x+1)*.5,(1-target.y)*.5],requested:[pose.screenX,pose.screenY],view:camera.view&&{...camera.view}},
      textRanges:ranges,hit,blockedControls:[...new Set(blocked)],unclippedCopy:ranges.length>0&&ranges.every(inViewport),
      protected:{sampleCount:subjects.length,covered:subjects.filter(p=>p.covers.length).slice(0,3),clipped:subjects.filter(p=>p.clipped).length,region},
      overflow:document.documentElement.scrollWidth-innerWidth};
  });
}

/** Render synchronously before reading the WebGL drawing buffer. Reading the
 * actual canvas keeps DOM copy, labels and navigation out of image tests. */
export async function readWebGLPixels(page,{ png=false }={}) {
  return page.evaluate(png=>{
    const a=window.__dentalExperience,r=a.renderer,canvas=r.domElement;
    r.render(a.scene,a.rig.camera);
    if(png)return canvas.toDataURL('image/png').split(',')[1];
    const width=Math.min(canvas.width,360),height=Math.max(1,Math.round(canvas.height*width/canvas.width));
    const buffer=new OffscreenCanvas(width,height),ctx=buffer.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(canvas,0,0,width,height);
    const data=ctx.getImageData(0,0,width,height).data;let body=0;
    for(let i=0;i<data.length;i+=4)if(data[i+3]>128&&Math.min(data[i],data[i+1],data[i+2])<239)body++;
    return body/(width*height);
  },png);
}

/** Sample the copy compositing during native scrolling in both directions.
 * The heading remains semantic HTML throughout; no helper sets its styles. */
export async function sampleCopyTransition(page) {
  return page.evaluate(async()=>{
    const section=document.querySelector('#dental-journey'),stage=document.querySelector('#journey-stage');
    const origin=section.getBoundingClientRect().top+scrollY,travel=section.getBoundingClientRect().height-stage.clientHeight;
    const requested=[.193,.204,.212,.217,.22,.223,.229,.235,.244];
    const frame=()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    async function at(p) {
      window.scrollTo({top:origin+travel*p,behavior:'instant'});await frame();
      const deadline=performance.now()+2000;
      while(performance.now()<deadline) {
        const state=window.__dentalExperience.report();
        if(Math.abs(state.renderProgress-state.storyProgress)<.00002)break;
        await frame();
      }
      const title=document.querySelector('#journey-title');
      let opacity=1;const transforms=[];
      for(let e=title;e&&e!==stage;e=e.parentElement){const s=getComputedStyle(e);opacity*=Number(s.opacity);transforms.push(s.transform);}
      const box=title.getBoundingClientRect();
      return {p,title:title.textContent,opacity,transforms,position:[box.x,box.y],count:document.querySelectorAll('.journey-copy h1').length};
    }
    const forward=[],reverse=[];
    for(const p of requested)forward.push(await at(p));
    for(const p of requested.toReversed())reverse.unshift(await at(p));
    return {forward,reverse};
  });
}
