
// camx.js — Clean Quagga2 camera integration (fresh reset)
(function(){
  var quaggaLoaded=false, quaggaLoading=false, quaggaRunning=false, initLock=false;
  var lastCode=null, lastHit=0; var camSheet=null, camMount=null;

// === Global Modal Watcher: reopen camera ONLY after all modals are closed ===
var resumeAfter=false, resumeDebounce=null;
function isShown(node){
  if(!node || node.nodeType!==1) return false;
  if(node.hidden) return false;
  var cs=getComputedStyle(node);
  return !(cs.display==='none' || cs.visibility==='hidden' || parseFloat(cs.opacity)===0);
}
function countOpenModals(){
  var nodes=document.querySelectorAll('.modal,[role=\"dialog\"],.popup,#popupOverlay,#branchPopupOverlay,#errorOverlay,#searchPopup,#exportPopup,#importPopup,#overwritePopup,.swal2-container,.swal2-shown,#mdlProduct,#mdlPdf');
  var c=0; nodes.forEach(function(n){ if(isShown(n)) c++; });
  return c;
}
function tryResume(){
  clearTimeout(resumeDebounce);
  resumeDebounce=setTimeout(function(){
    if(!resumeAfter) return;
    if(countOpenModals()===0){
      resumeAfter=false;
      try{ /*keep last mode*/ }catch(e){}
      openCamSheet();
    }
  }, 300);
}
var mo1=new MutationObserver(function(){ if(resumeAfter) tryResume(); });
var mo2=new MutationObserver(function(){ if(resumeAfter) tryResume(); });
try{
  mo1.observe(document.body,{subtree:true, attributes:true, attributeFilter:['class','style','hidden']});
  mo2.observe(document.body,{subtree:true, childList:true});
}catch(e){}


  function $(id){ return document.getElementById(id); }

  function ensureButtons(){
    var btnPrint = $('btnPrint'); if(!btnPrint) return;
    if(!$('btnCamX')){
      var cam = document.createElement('button'); cam.id='btnCamX'; cam.className='btn primary'; cam.style.fontSize='16px';
      cam.innerHTML='<i class="fa-solid fa-camera"></i> Kamera Aç';
      btnPrint.insertAdjacentElement('afterend', cam);
      cam.addEventListener('click', openCamSheet);
    }
    if(!$('btnPriceView')){
      var pv = document.createElement('button'); pv.id='btnPriceView'; pv.className='btn warning'; pv.style.fontSize='16px';
      pv.innerHTML='<i class="fa-solid fa-tag"></i> Fiyat Gör';
      btnPrint.insertAdjacentElement('afterend', pv);
      pv.addEventListener('click', function(){ window.__priceViewMode=true; openCamSheet(); });
    }
  }

  function injectSheet(){
    if(camSheet) return;
    camSheet = document.createElement('div');
    camSheet.id='camSheet';
    camSheet.innerHTML = '\
    <style>\
    #camSheet{position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:9999;display:none}\
    #camBox{position:absolute;left:50%;top:8%;transform:translateX(-50%);width:min(96vw,720px);background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.25);overflow:hidden}\
    #camHead{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e5e7eb}\
    #camMount{position:relative;width:100%;height:380px;background:#000}\
    #camMount video,#camMount canvas,#camMount #interactive{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}\
    #camFoot{display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;border-top:1px solid #e5e7eb;background:#fafafa}\
    </style>\
    <div id="camBox">\
      <div id="camHead"><b>Kamera</b><div>\
        <button id="camClose" class="btn">Kapat</button>\
      </div></div>\
      <div id="camMount"></div>\
      <div id="camFoot">\
        <button id="camStop" class="btn">Durdur</button>\
      </div>\
    </div>';
    document.body.appendChild(camSheet);
    $('camClose').addEventListener('click', closeCamSheet);
    $('camStop').addEventListener('click', stopQuagga);
    camMount = $('camMount');
  }

  function loadQuagga(){
    return new Promise(function(resolve, reject){
      if(quaggaLoaded) return resolve();
      if(quaggaLoading) return resolve();
      quaggaLoading = true;
      var s=document.createElement('script');
      s.src='https://unpkg.com/@ericblade/quagga2/dist/quagga.js';
      s.onload=function(){ quaggaLoaded=true; resolve(); };
      s.onerror=function(){ alert('Quagga kütüphanesi yüklenemedi'); reject(); };
      document.head.appendChild(s);
    });
  }

  function openCamSheet(){
    window.__priceViewMode = !!window.__priceViewMode;
    injectSheet();
    camSheet.style.display='block';
    startQuagga();
  }

  function closeCamSheet(){
    stopQuagga().then(function(){ closeCamSheet(); });
  }

  function startQuagga(){
    if(initLock) return;
    initLock = true;
    loadQuagga().then(async function(){
      try{
        camMount.innerHTML='';
        var tries=0;
        while((camMount.offsetWidth<100 || camMount.offsetHeight<100) && tries<12){
          await new Promise(r=>requestAnimationFrame(r)); tries++;
        }
        if(camMount.offsetWidth<100 || camMount.offsetHeight<100) camMount.style.height='380px';

        var cfg={
          inputStream:{ type:'LiveStream', target:camMount,
            constraints:{ facingMode:'environment', width:{ideal:1280}, height:{ideal:720} },
            area:{ top:'20%', right:'10%', left:'10%', bottom:'20%' } },
          locator:{ patchSize:'large', halfSample:false },
          numOfWorkers: Math.max(1,(navigator.hardwareConcurrency||2)-1),
          frequency:12,
          decoder:{ readers:['ean_reader','ean_8_reader','code_128_reader'] },
          locate:true
        };
        Quagga.init(cfg, function(err){
          initLock=false;
          if(err){ alert('Kamera başlatma hatası: '+err); return; }
          Quagga.start(); quaggaRunning=true;
          try{ var track=Quagga.cameraAccess.getActiveTrack();
            if(track&&track.applyConstraints){ track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{}); }
          }catch(e){}
          try{ Quagga.offDetected && Quagga.offDetected(); }catch(e){}
          Quagga.onDetected(onDetected);
        });
      }catch(e){ initLock=false; alert('Kamera başlatılamadı: '+e); }
    });
  }

  function stopQuagga(){
    return new Promise(function(resolve){
      try{ Quagga && Quagga.offDetected && Quagga.offDetected(); }catch(e){}
      try{ quaggaRunning && Quagga.stop(); quaggaRunning=false; }catch(e){}
      try{ camMount && (camMount.innerHTML=''); }catch(e){}
      resolve();
    });
  }

  function isValidEAN13(code){
    if(!/^\\d{13}$/.test(code)) return false;
    var sum=0; for(var i=0;i<12;i++) sum += parseInt(code[i],10)*(i%2===0?1:3);
    return ((10-(sum%10))%10) === parseInt(code[12],10);
  }

  function findProductByBarcode(code){
    try{
      var arr = window.PRODUCTS || [];
      return arr.find(function(p){ return p.barcode===code; });
    }catch(e){ return null; }
  }

  function onDetected(result){
    var code = result && result.codeResult && result.codeResult.code ? result.codeResult.code : null;
    if(!code) return;
    var now=Date.now(); if(code===lastCode && (now-lastHit)<900) return; lastCode=code; lastHit=now;
    if(code.length===13 && !isValidEAN13(code)) return;

    stopQuagga().then(function(){ closeCamSheet();
      var p = findProductByBarcode(code);
      resumeAfter=true; tryResume();
      if (window.__priceViewMode && typeof window.openPriceView==='function' && p){
        window.openPriceView(p);
      } else if (typeof window.openProduct==='function' && p){
        window.openProduct(p);
      } else {
        var inp = $('inpBarcode'); if(inp){ inp.value=code.slice(-6); try{ inp.dispatchEvent(new Event('input',{bubbles:true})); }catch(e){} }
      }
      try{ if(navigator.vibrate) navigator.vibrate(35); }catch(e){}
    });
  }

  function init(){ ensureButtons(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
