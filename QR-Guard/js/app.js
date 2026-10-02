const KEY = "qrGuardHistory";
const SETTINGS = "qrGuardSettings";

function getHistory(){ try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return[]} }
function saveHistory(list){localStorage.setItem(KEY,JSON.stringify(list))}
function getSettings(){try{return JSON.parse(localStorage.getItem(SETTINGS)||'{"saveHistory":true,"showReasons":true}')}catch{return {saveHistory:true,showReasons:true}}}
function saveSettings(s){localStorage.setItem(SETTINGS,JSON.stringify(s))}

function analyzeContent(raw){
  const text=(raw||"").trim();
  let score=0, reasons=[];
  if(!text){return {score:100,level:"danger",title:"No content detected",text:"No QR content was provided.",reasons:["Add a QR image or paste a URL/text to analyze."]}}
  const lower=text.toLowerCase();
  const url=lower.match(/https?:\/\/[^\s]+/);
  if(url){
    const u=url[0];
    if(u.startsWith("http://")){score+=25; reasons.push("The link uses HTTP instead of HTTPS.");}
    if(/^https?:\/\/(\d{1,3}\.){3}\d{1,3}/.test(u)){score+=35; reasons.push("The destination uses a raw IP address instead of a normal domain.");}
    const risky=["login","verify","urgent","password","wallet","free-prize","claim","gift","otp","payment"];
    const found=risky.filter(w=>lower.includes(w));
    if(found.length){score+=Math.min(30,found.length*8); reasons.push("The content contains words commonly used in high-pressure or sensitive-data scams: "+found.slice(0,4).join(", ")+".");}
    const suspicious=/[a-z0-9-]+\.(?:tk|ml|ga|cf|gq)(?:\/|$)/.test(lower);
    if(suspicious){score+=30; reasons.push("The domain uses a free/less-established top-level domain that deserves extra verification.");}
    if(!reasons.length) reasons.push("No basic warning sign was detected by the local rules.");
  }else{
    if(/upi|upi:\/\/|paytm|phonepe|gpay|payment|bank/i.test(text)){score+=35; reasons.push("The QR content appears payment-related. Verify the payee and amount in your payment app.");}
    if(/password|otp|pin|secret/i.test(text)){score+=45; reasons.push("The content mentions credentials or sensitive information. Never share OTPs or PINs.");}
    if(!reasons.length) reasons.push("The QR contains plain text rather than a web destination.");
  }
  score=Math.min(100,score);
  const level=score>=70?"danger":score>=35?"warning":"safe";
  const title=level==="danger"?"High-risk indicators found":level==="warning"?"Review before opening":"No obvious warning signs";
  return {score,level,title,text,reasons};
}

function addScan(raw, result){
  const s=getSettings(); if(!s.saveHistory)return;
  const list=getHistory();
  list.unshift({id:Date.now(),content:raw,score:result.score,level:result.level,title:result.title,date:new Date().toLocaleString()});
  saveHistory(list.slice(0,50));
}

function goToResult(content){
  const result=analyzeContent(content);
  sessionStorage.setItem("qrGuardResult",JSON.stringify(result));
  addScan(content,result);
  location.href="result.html";
}

function runDemo(type){
  const sample=type==="safe"?"https://example.com":"http://192.168.0.12/login?verify=urgent";
  goToResult(sample);
}

function renderDashboard(){
  const list=getHistory();
  const counts={total:list.length,safe:list.filter(x=>x.level==="safe").length,danger:list.filter(x=>x.level==="danger").length,warn:list.filter(x=>x.level==="warning").length};
  for(const [id,val] of Object.entries(counts)){const el=document.getElementById(id+"Scans");if(el)el.textContent=val}
  const box=document.getElementById("recentScans"); if(!box)return;
  if(!list.length){box.innerHTML='<div class="recent-item"><div class="left"><strong>No scans yet</strong><small>Start a scan to build your local security history.</small></div><a class="text-link" href="scan.html">Scan now →</a></div>';return}
  box.innerHTML=list.slice(0,5).map(x=>`<div class="recent-item"><div class="left"><strong>${escapeHtml(x.content)}</strong><small>${escapeHtml(x.date)}</small></div><span class="badge ${x.level}">${x.score}/100 · ${x.level}</span></div>`).join("");
}

function renderResult(){
  const raw=sessionStorage.getItem("qrGuardResult");
  if(!raw)return;
  const r=JSON.parse(raw);
  const score=document.getElementById("score"), badge=document.getElementById("riskBadge");
  if(score)score.textContent=r.score;
  if(badge){badge.className="badge "+r.level;badge.textContent=r.level==="safe"?"Low risk":r.level==="warning"?"Needs review":"High risk"}
  const title=document.getElementById("resultTitle");if(title)title.textContent=r.title;
  const url=document.getElementById("resultUrl");if(url)url.textContent=r.text;
  const reasons=document.getElementById("reasons");
  if(reasons){
    const show=getSettings().showReasons;
    reasons.innerHTML=show?r.reasons.map((x,i)=>`<div class="reason"><strong>${String(i+1).padStart(2,"0")} · ${r.level==="safe"?"Check passed":"Check to review"}</strong><p>${escapeHtml(x)}</p></div>`).join(""):"<p class='muted'>Detailed reasons are disabled in Settings.</p>";
  }
  document.getElementById("copyResult")?.addEventListener("click",()=>navigator.clipboard?.writeText(r.text));
  document.getElementById("openResult")?.addEventListener("click",()=>{
    const m=r.text.match(/https?:\/\/[^\s]+/); if(m)window.open(m[0]," _blank","noopener,noreferrer"); else alert("This QR does not contain a web URL.");
  });
  const ring=document.querySelector(".score-ring"); if(ring)ring.style.borderColor=r.level==="danger"?"#f05f67":r.level==="warning"?"#d5a83f":"#16a893";
}

function renderHistory(){
  const box=document.getElementById("historyList");if(!box)return;
  const list=getHistory();
  if(!list.length){box.innerHTML='<div class="empty-state"><h3>No scan history</h3><p class="muted">Your analyzed QR codes will appear here.</p></div>';return}
  box.innerHTML=list.map(x=>`<div class="history-item"><div><strong>${escapeHtml(x.content)}</strong><small>${escapeHtml(x.date)} · Score ${x.score}/100</small></div><span class="badge ${x.level}">${x.level}</span></div>`).join("");
}

function setupScan(){
  const input=document.getElementById("qrText"), btn=document.getElementById("analyzeBtn"), file=document.getElementById("qrFile"), msg=document.getElementById("scanMessage");
  btn?.addEventListener("click",()=>{if(!input.value.trim()){msg.textContent="Enter QR content first.";return}goToResult(input.value)});
  file?.addEventListener("change",async e=>{
    const f=e.target.files[0]; if(!f)return;
    if(f.size>10*1024*1024){msg.textContent="File is larger than 10 MB.";return}
    if(typeof jsQR==="undefined"){msg.textContent="Image scanner library could not load. Paste the QR content instead.";return}
    const img=new Image();
    img.onload=()=>{const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height);const code=jsQR(data.data,data.width,data.height);if(code)goToResult(code.data);else msg.textContent="No readable QR code found in this image.";};
    img.src=URL.createObjectURL(f);
  });
  const cameraBox=document.getElementById("cameraBox"), video=document.getElementById("camera");
  document.getElementById("cameraBtn")?.addEventListener("click",async()=>{
    cameraBox.classList.remove("hidden");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      video.srcObject=stream;await video.play();
      const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
      const tick=()=>{if(cameraBox.classList.contains("hidden"))return;if(video.readyState>=2){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0);if(typeof jsQR!=="undefined"){const code=jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);if(code){stream.getTracks().forEach(t=>t.stop());goToResult(code.data);return}}}requestAnimationFrame(tick)};tick();
    }catch(e){msg.textContent="Camera access was blocked. You can upload a QR image instead."}
  });
  document.getElementById("closeCamera")?.addEventListener("click",()=>{cameraBox.classList.add("hidden");if(video.srcObject)video.srcObject.getTracks().forEach(t=>t.stop())});
}

function setupGenerator(){
  const output=document.getElementById("qrOutput"), text=document.getElementById("generateText");
  document.getElementById("sampleGenerate")?.addEventListener("click",()=>{text.value="https://example.com";generate()});
  document.getElementById("generateBtn")?.addEventListener("click",generate);
  function generate(){if(!text.value.trim())return;output.innerHTML="";new QRCode(output,{text:text.value.trim(),width:220,height:220,colorDark:"#111111",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});}
  document.getElementById("downloadQr")?.addEventListener("click",()=>{const img=output.querySelector("img");const canvas=output.querySelector("canvas");const src=img?.src||canvas?.toDataURL();if(!src)return;const a=document.createElement("a");a.href=src;a.download="qr-guard-code.png";a.click()});
}

function setupSettings(){
  const s=getSettings();
  const save=document.getElementById("saveHistory"), reasons=document.getElementById("showReasons");
  if(save){save.checked=s.saveHistory;save.addEventListener("change",()=>{s.saveHistory=save.checked;saveSettings(s)})}
  if(reasons){reasons.checked=s.showReasons;reasons.addEventListener("change",()=>{s.showReasons=reasons.checked;saveSettings(s)})}
  const clear=()=>{if(confirm("Delete all local scan history?")){localStorage.removeItem(KEY);location.reload()}};
  document.getElementById("clearHistory")?.addEventListener("click",clear);
  document.getElementById("clearSettingsHistory")?.addEventListener("click",clear);
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

document.addEventListener("DOMContentLoaded",()=>{
  if(document.body.dataset.page==="home")renderDashboard();
  if(document.body.dataset.page==="scan")setupScan();
  if(document.body.dataset.page==="result")renderResult();
  if(document.body.dataset.page==="history"){renderHistory();document.getElementById("clearHistory")?.addEventListener("click",()=>{if(confirm("Clear all scan history?")){localStorage.removeItem(KEY);renderHistory()}})}
  if(document.body.dataset.page==="generator")setupGenerator();
  if(document.body.dataset.page==="settings")setupSettings();
});
