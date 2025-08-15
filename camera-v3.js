
(function(){
  'use strict';
  function $(id){ return document.getElementById(id); }
  function create(t,p,s){ var e=document.createElement(t); if(p)Object.keys(p).forEach(function(k){e[k]=p[k];}); if(s)Object.keys(s).forEach(function(k){e.style[k]=s[k];}); return e; }
  function validEAN13(c){ if(!/^\d{13}$/.test(c)) return false; var s=c.split('').map(Number),sum=0; for(var i=0;i<12;i++) sum+=s[i]*(i%2?3:1); return ((10-(sum%10))%10)===s[12]; }
  function beepFx(ok){ try{ if(typeof window.beep==='function') window.beep(ok); else if(navigator.vibrate) navigator.vibrate(ok?[40]:[20,30,20]); }catch(_e){} }

  // === UI bootstrap ===
  function ensureUI(){
    if(!$('btnCamV3')){
      var b=create('button',{id:'btnCamV3',className:'btn primary'});
      b.style.marginLeft='8px';
      b.appendChild(create('i',{className:'fa-solid fa-camera'}));
      b.appendChild(document.createTextNode(' Kamera (Yeni)'));
      var bars=document.querySelectorAll('.control'); if(bars.length) bars[0].appendChild(b); else document.body.appendChild(b);
    }
    if(!$('mdlCamV3')){
      var o=create('div',{id:'mdlCamV3'},{position:'fixed',left:'0',top:'0',right:'0',bottom:'0',background:'rgba(0,0,0,.55)',display:'none',zIndex:'9998'});
      var box=create('div',{className:'box'},{width:'min(96vw,720px)',maxHeight:'92vh',overflow:'auto',padding:'10px',background:'#fff',borderRadius:'12px',margin:'4vh auto'});
      var h=create('h3',null,{margin:'6px 10px 10px'}); h.textContent='Barkod Tara (Yeni Motor)'; box.appendChild(h);
      var bar=create('div',null,{display:'flex',gap:'8px',alignItems:'center',margin:'0 10px 8px',flexWrap:'wrap'});
      var sel=create('select',{id:'camSelectV3',className:'input'},{minWidth:'220px',flex:'1'});
      var tw=create('label',null,{display:'flex',alignItems:'center',gap:'6px'});
      var torch=create('input',{id:'chkTorchV3',type:'checkbox'});
      tw.appendChild(torch); tw.appendChild(document.createTextNode('Flaş'));
      var zw=create('div',null,{display:'flex',alignItems:'center',gap:'6px'});
      zw.appendChild(document.createTextNode('Zoom'));
      var rng=create('input',{id:'rngZoomV3',type:'range'},{width:'140px'}); rng.min='1'; rng.max='1'; rng.step='0.1'; rng.value='1';
      var p=create('button',{id:'btnCamPauseV3',className:'btn neutral'}); p.textContent='Durdur';
      var c=create('button',{id:'btnCamCloseV3',className:'btn danger'}); c.textContent='Kapat';
      bar.appendChild(sel); bar.appendChild(tw); bar.appendChild(zw); zw.appendChild(rng); bar.appendChild(p); bar.appendChild(c); box.appendChild(bar);
      var area=create('div',null,{padding:'0 10px 10px'});
      var v=create('video',{id:'camVideoV3',playsInline:true,autoplay:true,muted:true},{width:'100%',border:'1px solid #d6dbe6',borderRadius:'12px',background:'#000'});
      var canvas=create('canvas',{id:'camCanvasV3'},{display:'none'});
      area.appendChild(v); area.appendChild(canvas); box.appendChild(area);
      var hint=create('small',{className:'hint'},{display:'block',margin:'0 12px 4px',color:'#64748b'});
      hint.textContent='İpucu: Okutunca kamera kapanır, seçim bitince otomatik tekrar açılır.'; box.appendChild(hint);
      o.appendChild(box);
      o.addEventListener('click', function(ev){ if(ev.target && ev.target.id==='mdlCamV3'){ stopAll(); }});
      document.body.appendChild(o);
    }
  }
  function show(){ $('mdlCamV3').style.display='block'; }
  function hide(){ $('mdlCamV3').style.display='none'; }

  // === Engine ===
  var stream=null,track=null,detector=null,running=false,paused=false,failCount=0,lastCode='',lastTs=0;
  var foundLock=false, resumeAfterProduct=false;

  function supported(){ try{ return ('BarcodeDetector' in window); }catch(_e){ return false; } }
  async function listCameras(){ var devs=await navigator.mediaDevices.enumerateDevices(); return devs.filter(function(d){ return d.kind==='videoinput'; }); }

  async function start(deviceId){
    if(stream) await stop();
    var cs={ audio:false, video:{ deviceId: deviceId? {exact:deviceId}:undefined, facingMode: deviceId? undefined : {ideal:'environment'}, width:{ideal:1920}, height:{ideal:1080}, frameRate:{ideal:30} } };
    stream=await navigator.mediaDevices.getUserMedia(cs);
    var v=$('camVideoV3'); v.srcObject=stream;
    track=stream.getVideoTracks()[0];
    var caps=track.getCapabilities?track.getCapabilities():{}; var sets=track.getSettings?track.getSettings():{};
    try{ await track.applyConstraints({ advanced:[{ focusMode:'continuous' }] }); }catch(_e){}
    var rng=$('rngZoomV3'); if(caps.zoom){ rng.min=caps.zoom.min||1; rng.max=caps.zoom.max||1; rng.step=caps.zoom.step||0.1; rng.value=sets.zoom||rng.min; rng.disabled=false; } else { rng.min='1'; rng.max='1'; rng.value='1'; rng.disabled=true; }
    $('chkTorchV3').disabled = !caps.torch;
    paused=false; running=true; $('btnCamPauseV3').textContent='Durdur';
    detector=null;
    if(supported()){ try{ var fmts=(BarcodeDetector.getSupportedFormats and await BarcodeDetector.getSupportedFormats())||[]; detector = (fmts && fmts.indexOf('ean_13')>-1)? new BarcodeDetector({formats:['ean_13','ean_8','code_128']}): new BarcodeDetector(); }catch(_e){ detector=null; } }
    requestAnimationFrame(loop);
  }

  async function stop(){
    running=false;
    try{ if(track) track.stop(); }catch(_e){}
    try{ if(stream) stream.getTracks().forEach(function(t){ try{t.stop();}catch(_e){} }); }catch(_e){}
    stream=null; track=null; detector=null;
  }
  async function stopAll(){ resumeAfterProduct=false; await stop(); hide(); }

  async function loop(){
    if(!running || paused){ return; }
    var v=$('camVideoV3'); if(v.readyState<2){ requestAnimationFrame(loop); return; }
    if(detector){
      try{ var arr=await detector.detect(v); if(arr && arr.length){ onCode(arr[0].rawValue||''); failCount=0; } else onFail(); }
      catch(_e){ onFail(); }
      requestAnimationFrame(loop); return;
    }
    onFail(); requestAnimationFrame(loop);
  }

  function onFail(){
    failCount++;
    if(track && track.getCapabilities){
      var caps=track.getCapabilities();
      if(caps.zoom && failCount % 40 === 0){
        var s=track.getSettings(); var step=caps.zoom.step||0.25;
        var next=Math.min((s.zoom||1)+step, caps.zoom.max||s.zoom||1);
        track.applyConstraints({ advanced:[{ zoom: next }] }).catch(function(){});
        $('rngZoomV3').value = String(next);
      }
    }
  }

  function onCode(text){
    if(foundLock) return;
    var now=Date.now(); var code=String(text||'').replace(/\D/g,'');
    if(!code) return;
    if(code===lastCode && (now-lastTs)<1200) return;
    lastCode=code; lastTs=now;
    if(/^\d{13}$/.test(code) && !validEAN13(code)){ beepFx(false); return; }

    var match=null;
    try{
      if(window.PRODUCTS && Array.isArray(PRODUCTS)){
        var norm=function(x){ return String(x||'').replace(/\D/g,''); };
        match = PRODUCTS.find(function(p){ return norm(p.barcode)===code; });
        if(!match){
          var last6=code.slice(-6);
          var cands=PRODUCTS.filter(function(p){ var b=norm(p.barcode); return b && b.slice(-6)===last6; });
          if(cands.length===1) match=cands[0];
        }
      }
    }catch(_e){}

    if(match){
      foundLock = true;
      resumeAfterProduct = true;  // seçim bitince otomatik yeniden başlat
      try{ beepFx(true); }catch(_e){}
      try{ hide(); }catch(_e){}
      try{ stop(); }catch(_e){}
      setTimeout(function(){
        try{ var ms=$('mdlSearch'); if(ms) ms.classList.remove('shown'); }catch(_e){}
        try{ if(typeof openProduct==='function') openProduct(match); }catch(_e){}
      }, 50);
      return;
    }

    var inp=$('inpBarcode');
    if(inp){ inp.value=code.slice(-6); try{ inp.dispatchEvent(new Event('input',{bubbles:true})); }catch(_e){} }
    beepFx(true);
  }

  // === Re-open camera when product popup closes ===
  function watchProductModal(){
    // id'niz farklıysa, buraya alternatifleri ekleyin:
    var ids = ['mdlProduct','productModal','product-popup'];
    var el = null;
    for (var i=0;i<ids.length;i++){ el = $(ids[i]); if(el) break; }
    if(!el) return;
    if(el.__v3obs) return;
    var obs = new MutationObserver(function(list){
      for(var i=0;i<list.length;i++){
        var m=list[i];
        if(m.type==='attributes' && m.attributeName==='class'){
          var shown = /(^|\s)shown(\s|$)/.test(el.className);
          if(!shown && resumeAfterProduct){
            resumeAfterProduct = false;
            foundLock = false;
            setTimeout(function(){ try{ openModal(); }catch(_e){} }, 120);
          }
        }
      }
    });
    obs.observe(el, { attributes:true, attributeFilter:['class'] });
    el.__v3obs = obs;
  }

  function bind(){
    var rng=$('rngZoomV3');
    rng.addEventListener('input', function(){
      if(!track || !track.applyConstraints) return;
      var z=parseFloat(rng.value||'1');
      track.applyConstraints({ advanced:[{ zoom:z }] }).catch(function(){});
    });
    $('chkTorchV3').addEventListener('change', function(){
      if(!track || !track.applyConstraints) return;
      var on=$('chkTorchV3').checked;
      track.applyConstraints({ advanced:[{ torch: !!on }] }).catch(function(){ $('chkTorchV3').checked=false; });
    });
    $('camVideoV3').addEventListener('click', function(){
      if(!track || !track.getCapabilities) return;
      var caps=track.getCapabilities(); if(!caps.zoom) return;
      var cur=parseFloat(($('rngZoomV3').value)||'1');
      var next=Math.min(cur+(caps.zoom.step||0.25), caps.zoom.max||cur);
      $('rngZoomV3').value=String(next);
      track.applyConstraints({ advanced:[{ zoom: next }] }).catch(function(){});
    });
  }

  async function openModal(){
    foundLock = false;
    show();
    try{
      var cams = await listCameras();
      var sel=$('camSelectV3'); sel.innerHTML='';
      cams.forEach(function(d,i){ var o=document.createElement('option'); o.value=d.deviceId; o.textContent=d.label||('Kamera '+(i+1)); sel.appendChild(o); });
      var back=cams.find(function(d){ return /back|arka|environment|rear/i.test(d.label||''); });
      sel.value = back ? back.deviceId : (cams[0]? cams[0].deviceId : '');
      await start(sel.value);
      sel.onchange = async function(){ await start(sel.value); };
    }catch(e){
      alert('Kamera listesi alınamadı. Tarayıcı izni gerekebilir.');
    }
  }

  function wire(){
    var b=$('btnCamV3'); if(b && !b.__wired){ b.__wired=true; b.addEventListener('click', function(){ openModal(); }); }
    var bc=$('btnCamCloseV3'); if(bc && !bc.__wired){ bc.__wired=true; bc.addEventListener('click', function(){ stopAll(); }); }
    var bp=$('btnCamPauseV3'); if(bp && !bp.__wired){ bp.__wired=true; bp.addEventListener('click', function(e){ if(!running) return; if(!paused){ paused=true; e.target.textContent='Devam Et'; } else { paused=false; e.target.textContent='Durdur'; requestAnimationFrame(loop); } }); }
    window.addEventListener('pagehide', stopAll);
  }

  document.addEventListener('DOMContentLoaded', function(){ ensureUI(); bind(); wire(); watchProductModal(); });
  var mo=new MutationObserver(function(){ wire(); watchProductModal(); });
  mo.observe(document.body,{childList:true,subtree:true});
})();
