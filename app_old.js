// Encore Solo – PWA JS
// Porttaus Pygamesta: satunnaiset flipit, väripermutaatio, 1/3/6 tähdet (backtracking), Solo 30 kierrosta

// Asetukset
const GRID_W=15, GRID_H=7, H_COL=7; // 0-indeksoitu H
const STRICT_STARS=true; const SOLO_TURNS=30; const JOKER_POOL=8;
const COLOR_NAMES=["Sininen","Keltainen","Vihreä","Oranssi","Purppura"];
const COLORS=[[51,142,193],[235,178,51],[51,177,143],[221,126,51],[214,148,185]];
const NUMBER_SIDES=[1,2,3,4,5,'JOKER'];
const COLOR_SIDES=[0,1,2,3,4,'JOKER'];
const COL_FIRST=[5,3,3,3,2,2,2,1,2,2,2,3,3,3,5];
const COLOR_BONUS_FIRST=5;

// Oletuslauta (jos template puuttuu)
const DEFAULT_TEMPLATE = [
  "v v v k k k k v s s s o k k k",
  "o v k v k k o o p s s o o v v",
  "s v p v v v v p p p k k o v v",
  "s p p v o o s s v v k k o p s",
  "p o o o o o s s o o o p p p p",
  "p s s p p p p k k o p s s s o",
  "k k s s s s p k k k v v v o o",
];
const LETTER_TO_ID={s:0,k:1,v:2,o:3,p:4};

function parseTemplate(lines){
  const grid=[]; const W=GRID_W, H=GRID_H;
  for(let r=0;r<H;r++){
    const cols=lines[r].trim().split(/\s+/);
    if(cols.length!==W) throw new Error("template: väärä sarakemäärä");
    grid.push(cols.map(ch=>{ const id=LETTER_TO_ID[ch]; if(id==null) throw new Error('Tuntematon kirjain'); return id; }));
  }
  return grid;
}

function loadTemplate(){ return parseTemplate(DEFAULT_TEMPLATE); }

// RNG\ nfunction randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
// RNG
function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function shuffleInPlace(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

// Muunnokset
const hflip = g => g.map(row=>row.slice().reverse());
const vflip = g => g.slice().reverse();
const rot180 = g => vflip(hflip(g));

function recolorGrid(grid, perm){ return grid.map(row=>row.map(v=>perm[v])); }
function randomTransformAndRecolor(base){
  const ops=[g=>g, hflip, vflip, rot180];
  const op=randChoice(ops); const g2=op(base);
  const perm=shuffleInPlace([0,1,2,3,4]);
  return recolorGrid(g2, perm);
}

// Naapurit
function neighbors4(r,c){ return [[r+1,c],[r-1,c],[r,c+1],[r,c-1]].filter(([rr,cc])=> rr>=0&&rr<GRID_H&&cc>=0&&cc<GRID_W ); }

function isConnected(cells){
  // cells: Set of "r,c" strings
  if(cells.size===0) return true;
  const start=[...cells][0];
  const q=[start];
  const seen=new Set([start]);
  while(q.length){
    const k=q.shift();
    const [r,c]=k.split(',').map(Number);
    for(const [nr,nc] of neighbors4(r,c)){
      const nk = `${nr},${nc}`;
      if(cells.has(nk) && !seen.has(nk)){
        seen.add(nk);
        q.push(nk);
      }
    }
  }
  return seen.size===cells.size;
}


// Alueet väreittäin
function computeRegions(grid){
  const seen=Array.from({length:GRID_H},()=>Array(GRID_W).fill(false));
  const regions=new Map();
  for(let color=0;color<5;color++) regions.set(color, []);
  for(let r=0;r<GRID_H;r++) for(let c=0;c<GRID_W;c++){
    if(seen[r][c]) continue; const color=grid[r][c];
    const q=[[r,c]]; seen[r][c]=true; const comp=[];
    while(q.length){ const [rr,cc]=q.shift(); comp.push([rr,cc]);
      for(const [nr,nc] of neighbors4(rr,cc)) if(!seen[nr][nc] && grid[nr][nc]===color){ seen[nr][nc]=true; q.push([nr,nc]); }
    }
    regions.get(color).push(comp);
  }
  return regions; }

function orthAdjacent(a,b){ return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])===1; }

function placeStarsBacktrack(regionsByColor, targetSizesByColor, allowAnyIfMissing=false){
  const colors=[0,1,2,3,4];
  const orderPairs=[];
  for(const c of colors){
    const sizes=targetSizesByColor[c];
    const pairs=[]; 
    for(const s of sizes){
      let regs=[]; const list=regionsByColor.get(c)||[];
      list.forEach((reg,idx)=>{ if(reg.length===s) regs.push(idx); });
      if(regs.length===0 && allowAnyIfMissing){ regs= list.map((_,i)=>i); }
      pairs.push([c,s,regs]);
    }
    pairs.sort((a,b)=>a[2].length-b[2].length);
    orderPairs.push(...pairs);
  }
  orderPairs.sort((a,b)=>a[2].length-b[2].length);

  const stars=new Set(); // as "r,c"
  const usedRegionIdx=new Map([[0,new Set()],[1,new Set()],[2,new Set()],[3,new Set()],[4,new Set()]]);

  function candidatesFor(c,s){
    const list=regionsByColor.get(c)||[]; let idxs=[];
    list.forEach((reg,idx)=>{ if(reg.length===s) idxs.push(idx); });
    if(idxs.length===0 && allowAnyIfMissing){ idxs=list.map((_,i)=>i); }
    return idxs;
  }

  function backtrack(i){ if(i===orderPairs.length) return true; const [c,s]=orderPairs[i];
    const idxs=candidatesFor(c,s).filter(idx=>!usedRegionIdx.get(c).has(idx));
    idxs.sort((ia,ib)=>{ const A=regionsByColor.get(c)[ia]; const B=regionsByColor.get(c)[ib];
      function freeCount(reg){ let n=0; for(const cell of reg){ const key=cell+''; let ok=true; for(const st of stars){ const [sr,sc]=st.split(',').map(Number); if(orthAdjacent(cell,[sr,sc]) || (key===st)) {ok=false; break;} } if(ok) n++; } return n; }
      return freeCount(B)-freeCount(A);
    });
    for(const idx of idxs){
      const cells=regionsByColor.get(c)[idx].slice(); shuffleInPlace(cells);
      for(const cell of cells){ const [r,c2]=cell; const key=r+','+c2;
        let ok=true; for(const st of stars){ const [sr,sc]=st.split(',').map(Number); if(orthAdjacent([r,c2],[sr,sc]) || st===key){ ok=false; break; } }
        if(!ok) continue;
        stars.add(key); usedRegionIdx.get(c).add(idx);
        if(backtrack(i+1)) return true;
        usedRegionIdx.get(c).delete(idx); stars.delete(key);
      }
    }
    return false;
  }

  if(backtrack(0)) return stars; return null;
}

function generateStars(grid, strict=true){
  const regions=computeRegions(grid); const target={0:[1,3,6],1:[1,3,6],2:[1,3,6],3:[1,3,6],4:[1,3,6]};
  let stars=placeStarsBacktrack(regions,target,false);
  if(stars) return {stars, usedFallback:false};
  if(!strict){ stars=placeStarsBacktrack(regions,target,true); if(stars) return {stars, usedFallback:true}; }
  throw new Error("Tarkka tähtien sijoittelu (1/3/6) ei onnistu tämän laudan kokojakaumalla.");
}

// Peli‑tila
const state={ grid:[], stars:new Set(), marked:new Set(), turn:1, ended:false, msg:"", chosenColor:null, chosenNumber:null, chosenColorIdx:null, chosenNumberIdx:null, pending:new Set(), allowPick:false, colorDice:[], numberDice:[], score:{ columnsClaimed:Array(GRID_W).fill(false), columnsPoints:0, colorCompleted:Array(5).fill(false), colorPoints:0, starsChecked:0, jokersUsed:0 } };

function totalScore(){ const totalStars=state.stars.size; const starPenalty=(totalStars - state.score.starsChecked)*2; const jokerBonus=(JOKER_POOL - state.score.jokersUsed); return state.score.columnsPoints + state.score.colorPoints + jokerBonus - starPenalty; }

// UI elementit
const gridEl=document.getElementById('grid');
const colorRow=document.getElementById('colorRow');
const numRow=document.getElementById('numRow');
const msgEl=document.getElementById('msg');
const colPtsEl=document.getElementById('colPts');
const starsLineEl=document.getElementById('starsLine');
const turnEl=document.getElementById('turn');
const colorPtsEl=document.getElementById('colorPts');
const jokersEl=document.getElementById('jokers');
const totalEl=document.getElementById('total');

// Piirto
function cellKey(r,c){ return r+","+c; }
function parseKey(k){ const [r,c]=k.split(',').map(Number); return [r,c]; }

function drawGrid(){
  gridEl.innerHTML="";
  gridEl.style.setProperty('--hcol', H_COL);
  for(let r=0;r<GRID_H;r++){
    for(let c=0;c<GRID_W;c++){
      const div=document.createElement('div'); div.className='cell';
      const color=state.grid[r][c]; const [R,G,B]=COLORS[color]; div.style.background=`rgb(${R} ${G} ${B})`;
      const k=cellKey(r,c);
      if(state.marked.has(k)){
        const mark=document.createElement('div'); mark.className='mark'; div.appendChild(mark);
      }
      if(state.pending.has(k)) div.classList.add('pending');
      if([...state.stars].includes(k)){
        // piirrä tähti SVG:nä
        const star=document.createElementNS('http://www.w3.org/2000/svg','svg');
        star.setAttribute('viewBox','0 0 100 100'); star.style.position='absolute'; star.style.inset='15%';
        const p=document.createElementNS('http://www.w3.org/2000/svg','polygon');
        p.setAttribute('points','50,5 61,35 95,35 67,55 78,88 50,70 22,88 33,55 5,35 39,35');
        p.setAttribute('fill','#fff'); p.setAttribute('stroke','#000'); p.setAttribute('stroke-width','2');
        star.appendChild(p); div.appendChild(star);
      }
      div.addEventListener('click',()=>onCellClick(r,c));
      gridEl.appendChild(div);
    }
  }
}

function updateStatus(){
  colPtsEl.textContent=state.score.columnsPoints;
  starsLineEl.textContent=`−2 × ${state.stars.size - state.score.starsChecked}`;
  turnEl.textContent = `${state.turn} / ${SOLO_TURNS}`;
  colorPtsEl.textContent=state.score.colorPoints;
  jokersEl.textContent= (JOKER_POOL - state.score.jokersUsed);
  totalEl.textContent= totalScore();
  msgEl.textContent= state.msg || '';
}

function drawDiceRow(container, arr, isColor, selectedIdx){
  container.innerHTML='';
  const count=arr && arr.length ? arr.length : 2;
  for(let i=0;i<count;i++){
    const die=document.createElement('div'); die.className='die';
    if(arr && selectedIdx===i) die.classList.add('selected');
    if(arr && arr[i]!==undefined){ const v=arr[i];
      if(v==='JOKER'){
        die.textContent='JOKERI';
      }else if(isColor){
        const sw=document.createElement('div'); sw.className='swatch'; const [R,G,B]=COLORS[v]; sw.style.background=`rgb(${R} ${G} ${B})`;
        die.appendChild(sw); const label=document.createElement('span'); label.textContent=COLOR_NAMES[v]; die.appendChild(label);
      }else{ die.textContent=String(v); }
    }else{ die.textContent='—'; }
    die.addEventListener('click',()=>{
      if(!state.allowPick) return;
      if(isColor){ setColorChoice(i); } else { setNumberChoice(i); }
      redraw();
    });
    container.appendChild(die);
  }
}

function redraw(){ drawGrid(); updateStatus(); drawDiceRow(colorRow, state.colorDice, true, state.chosenColorIdx); drawDiceRow(numRow, state.numberDice, false, state.chosenNumberIdx); }

// Pelilogiikka
function buildRandomizedBoard(){
  const base=loadTemplate();
  const grid=randomTransformAndRecolor(base);
  let usedFallback=false; let stars;
  try{ const res=generateStars(grid, STRICT_STARS); stars=res.stars; usedFallback=res.usedFallback; }
  catch(e){ stars=new Set(); state.msg = `Tähtien sijoittelu epäonnistui: ${e.message}`; }
  return {grid, stars, usedFallback};
}

function resetGame(){
  const {grid, stars, usedFallback}=buildRandomizedBoard();
  state.grid=grid; state.stars=stars; state.marked=new Set(); state.turn=1; state.ended=false; state.msg="";
  state.chosenColor=null; state.chosenNumber=null; state.chosenColorIdx=null; state.chosenNumberIdx=null; state.pending=new Set(); state.allowPick=false; state.colorDice=[]; state.numberDice=[];
  state.score={ columnsClaimed:Array(GRID_W).fill(false), columnsPoints:0, colorCompleted:Array(5).fill(false), colorPoints:0, starsChecked:0, jokersUsed:0 };
  state.msg = usedFallback? "Huom: 1/3/6 ei onnistunut kaikille väreille, käytettiin lähimpiä alueita (ei vierekkäin)." : "Heitä nopat. Valitse väri + lukumäärä → maalaa klöntti → Vahvista. Ensimmäinen siirto sisältää H‑sarakkeen.";
}

function roll(){
  state.msg=""; state.pending.clear(); state.chosenColor=null; state.chosenNumber=null; state.chosenColorIdx=null; state.chosenNumberIdx=null;
  if(state.ended) return; if(state.turn>SOLO_TURNS){ endGame("30 kierrosta täynnä (SOLO)"); return; }
  const nColor=2, nNumber=2; state.colorDice=Array.from({length:nColor},()=>randChoice(COLOR_SIDES)); state.numberDice=Array.from({length:nNumber},()=>randChoice(NUMBER_SIDES)); state.allowPick=true;
}

function setColorChoice(idx){ if(!state.allowPick) return; if(idx<0||idx>=state.colorDice.length) return; const v=state.colorDice[idx]; state.chosenColor=v; state.chosenColorIdx=idx; state.msg=`Väri: ${v==='JOKER'?'Jokeri':COLOR_NAMES[v]}`; state.pending.clear(); }
function setNumberChoice(idx){ if(!state.allowPick) return; if(idx<0||idx>=state.numberDice.length) return; const v=state.numberDice[idx]; state.chosenNumber=v; state.chosenNumberIdx=idx; state.msg=`Lukumäärä: ${v==='JOKER'?'Jokeri':v}`; state.pending.clear(); }

function canMarkCell(r,c){ const color=state.grid[r][c]; const chosen=state.chosenColor; if(chosen!=='JOKER' && chosen!==color) return false; const k=cellKey(r,c); if(state.marked.has(k)) return false; if(state.pending.size===0) return true; const comp=new Set(state.pending); comp.add(k); return isConnected(comp); }

function onCellClick(r,c){ if(!state.allowPick || state.chosenColor===null || state.chosenNumber===null) return; const k=cellKey(r,c);
  const required = state.chosenNumber==='JOKER'? null : state.chosenNumber;
  if(state.pending.has(k)){ state.pending.delete(k); redraw(); return; }
  if(!canMarkCell(r,c)) return; state.pending.add(k);
  if(state.pending.size>5){ state.pending.delete(k); return; }
  if(required!=null && state.pending.size>required){ state.pending.delete(k); return; }
  redraw();
}

function confirmMove(){ if(!state.allowPick) return; if(state.chosenColor===null || state.chosenNumber===null){ state.msg='Valitse väri- ja lukumääränoppa.'; redraw(); return; }
  const nsel=state.pending.size;
  if(state.chosenNumber==='JOKER'){ if(nsel<1||nsel>5){ state.msg='Jokeri-numero: valitse 1–5 ruutua.'; redraw(); return; } }
  else { if(nsel!==state.chosenNumber){ state.msg=`Valittava määrä on ${state.chosenNumber}.`; redraw(); return; } }
  if(state.marked.size===0){ let hasH=false; for(const k of state.pending){ const [r,c]=parseKey(k); if(c===H_COL) {hasH=true; break;} } if(!hasH){ state.msg='Ensimmäisellä vuorolla valinnan on sisällettävä sarake H.'; redraw(); return; } }
  if(state.marked.size>0){ let touches=false; for(const k of state.pending){ const [r,c]=parseKey(k); for(const [nr,nc] of neighbors4(r,c)){ if(state.marked.has(cellKey(nr,nc))) {touches=true; break;} } if(touches) break; }
    if(!touches){ state.msg='Valinnan on liityttävä aiempiin merkintöihin.'; redraw(); return; } }
  const colors=new Set([...state.pending].map(k=>{ const [r,c]=parseKey(k); return state.grid[r][c]; })); if(colors.size!==1){ state.msg='Kaikki valitut ruudut oltava samaa väriä.'; redraw(); return; }
  const selColor=[...colors][0]; if(state.chosenColor!=='JOKER' && state.chosenColor!==selColor){ state.msg='Valitun värin tulee vastata värinoppaa.'; redraw(); return; }
  // yhteys tarkistus
  const comp=new Set(state.pending); if(!isConnected(comp)){ state.msg='Valinnan tulee olla yhtenäinen \'klöntti\'.'; redraw(); return; }

  // Merkitään
  for(const k of state.pending) state.marked.add(k);

  let usedJ=0; if(state.chosenColor==='JOKER') usedJ++; if(state.chosenNumber==='JOKER') usedJ++;
  if(state.score.jokersUsed + usedJ > JOKER_POOL){ for(const k of state.pending) state.marked.delete(k); state.msg='Ei jäljellä huutomerkkejä (jokereita).'; redraw(); return; }
  state.score.jokersUsed += usedJ;

  // Tähdet
  let gained=0; for(const k of state.pending) if(state.stars.has(k)) gained++; state.score.starsChecked += gained;

  // Sarakkeet
  for(let c=0;c<GRID_W;c++) if(!state.score.columnsClaimed[c]){ let full=true; for(let r=0;r<GRID_H;r++){ if(!state.marked.has(cellKey(r,c))){ full=false; break; } } if(full){ state.score.columnsClaimed[c]=true; state.score.columnsPoints += COL_FIRST[c]; } }

  // Värit
  for(let color=0;color<5;color++) if(!state.score.colorCompleted[color]){ let allCells=[]; for(let r=0;r<GRID_H;r++) for(let c=0;c<GRID_W;c++) if(state.grid[r][c]===color) allCells.push(cellKey(r,c)); if(allCells.every(k=>state.marked.has(k))){ state.score.colorCompleted[color]=true; state.score.colorPoints += COLOR_BONUS_FIRST; } }

  if(state.score.colorCompleted.filter(Boolean).length>=2){ endGame('Kaksi väriä täynnä – peli päättyy.'); redraw(); return; }

  state.turn+=1; state.pending.clear(); state.allowPick=false; state.msg='Siirto merkitty. Heitä nopat seuraavalla vuorolla.';
  if(state.turn>SOLO_TURNS) endGame('30 kierrosta täynnä (SOLO).');
  redraw();
}

function endGame(why){ state.ended=true; state.msg=`Peli päättyi: ${why}  Pisteet: ${totalScore()}`; }

// Dialogi: uusi peli
const dlgMask=document.getElementById('dlgMask');
const dlgYes=document.getElementById('dlgYes');
const dlgNo=document.getElementById('dlgNo');
function openDialog(){ dlgMask.style.display='flex'; }
function closeDialog(){ dlgMask.style.display='none'; }

dlgYes.addEventListener('click',()=>{ closeDialog(); resetGame(); redraw(); });

dlgNo.addEventListener('click',()=>{ closeDialog(); state.msg='Uutta peliä ei aloitettu.'; redraw(); });

document.getElementById('newBtn').addEventListener('click', openDialog);

document.getElementById('rollBtn').addEventListener('click',()=>{ roll(); redraw(); });

document.getElementById('confirmBtn').addEventListener('click',()=>{ confirmMove(); });

// PWA Install nappi
let deferredPrompt=null; const installBtn=document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt=e; installBtn.style.display='inline-block'; });
installBtn.addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt=null; installBtn.style.display='none'; });
window.addEventListener('appinstalled', ()=>{ installBtn.style.display='none'; });

// SW rekisteröinti
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>{ navigator.serviceWorker.register('service-worker.js'); }); }

// Init
resetGame(); redraw();