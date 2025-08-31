// Encore Solo – app.js (täydellinen PWA-logiikka + tähdet 1/3/6)
// --------------------------------------------------------------
// Toimii sekä täydellä PWA-näkymällä (roll/confirm/new/dice/status)
// että minimalistisella sivulla, jossa on vain #grid.

// =================== ASETUKSET ===================
const GRID_W=15, GRID_H=7, H_COL=7; // 0-indeksoitu H
const STRICT_STARS=true;
const SOLO_TURNS=30;
const JOKER_POOL=8;

const COLOR_NAMES=["Sininen","Keltainen","Vihreä","Oranssi","Purppura"];
const COLORS=[
  [51,142,193],   // 0
  [235,178,51],   // 1
  [51,177,143],   // 2
  [221,126,51],   // 3
  [214,148,185],  // 4
];

const NUMBER_SIDES=[1,2,3,4,5,'JOKER'];
const COLOR_SIDES=[0,1,2,3,4,'JOKER'];

const COL_FIRST=[5,3,3,3,2,2,2,1,2,2,2,3,3,3,5];
const COLOR_BONUS_FIRST=5;

// Oletuslauta (kirjain -> väri-ID)
const DEFAULT_TEMPLATE = [
  "v v v k k k k v s s s o k k k",
  "o v k v k k o o p s s o o v v",
  "s v p v v v v p p p k k o v v",
  "s p p v o o s s v v k k o p s",
  "p o o o o p s s o o o p p p p",
  "p s s p p p p k k o p s s s o",
  "k k s s s s p k k k v v v o o",
];
const LETTER_TO_ID={s:0,k:1,v:2,o:3,p:4};

// =================== TILA ===================
const state={
  grid:[],
  stars:new Set(),          // "r,c"
  marked:new Set(),         // "r,c"
  pending:new Set(),        // "r,c"
  turn:1,
  ended:false,
  msg:"",
  chosenColor:null,
  chosenNumber:null,
  chosenColorIdx:null,
  chosenNumberIdx:null,
  allowPick:false,
  colorDice:[],
  numberDice:[],
  score:{
    columnsClaimed:Array(GRID_W).fill(false),
    columnsPoints:0,
    colorCompleted:Array(5).fill(false),
    colorPoints:0,
    starsChecked:0,
    jokersUsed:0,
  }
};

// =================== DOM-HOOKIT (valinnainen) ===================
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
const rollBtn=document.getElementById('rollBtn');
const confirmBtn=document.getElementById('confirmBtn');
const newBtn=document.getElementById('newBtn');
const dlgMask=document.getElementById('dlgMask');
const dlgYes=document.getElementById('dlgYes');
const dlgNo=document.getElementById('dlgNo');
const installBtn=document.getElementById('installBtn'); // voi olla null

// =================== APUFUNKTIOITA ===================
function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function shuffleInPlace(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function cellKey(r,c){ return `${r},${c}`; }
function parseKey(k){ const [r,c]=k.split(',').map(Number); return [r,c]; }

function parseTemplate(lines){
  const grid=[];
  for(let r=0;r<GRID_H;r++){
    const cols=lines[r].trim().split(/\s+/);
    if(cols.length!==GRID_W) throw new Error(`template: rivillä ${r+1} ${cols.length} saraketta`);
    grid.push(cols.map(ch=>{
      const id=LETTER_TO_ID[ch];
      if(id==null) throw new Error(`template: tuntematon kirjain ${ch}`);
      return id;
    }));
  }
  return grid;
}

function loadTemplate(){ return parseTemplate(DEFAULT_TEMPLATE); }

// Muunnokset
const hflip = g => g.map(row=>row.slice().reverse());
const vflip = g => g.slice().reverse();
const rot180 = g => vflip(hflip(g));
function recolorGrid(grid, perm){ return grid.map(row=>row.map(v=>perm[v])); }
function randomTransformAndRecolor(base){
  const ops=[g=>g,hflip,vflip,rot180];
  const op=randChoice(ops);
  const g2=op(base);
  const perm=shuffleInPlace([0,1,2,3,4]);
  return recolorGrid(g2, perm);
}

// Naapurit & yhteys
function neighbors4(r,c){ return [[r+1,c],[r-1,c],[r,c+1],[r,c-1]].filter(([rr,cc])=>rr>=0&&rr<GRID_H&&cc>=0&&cc<GRID_W); }
function orthAdjacent(a,b){ return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])===1; }

// cells: Set("r,c")
function isConnected(cells){
  if(cells.size===0) return true;
  const start=[...cells][0];
  const q=[start]; const seen=new Set([start]);
  while(q.length){
    const k=q.shift();
    const [r,c]=parseKey(k);
    for(const [nr,nc] of neighbors4(r,c)){
      const nk=cellKey(nr,nc);
      if(cells.has(nk) && !seen.has(nk)){
        seen.add(nk); q.push(nk);
      }
    }
  }
  return seen.size===cells.size;
}

// Alueet
function computeRegions(grid){
  const seen=Array.from({length:GRID_H},()=>Array(GRID_W).fill(false));
  const regions=new Map(); for(let c=0;c<5;c++) regions.set(c, []);
  for(let r=0;r<GRID_H;r++) for(let c=0;c<GRID_W;c++){
    if(seen[r][c]) continue;
    const color=grid[r][c];
    const q=[[r,c]]; seen[r][c]=true; const comp=[];
    while(q.length){
      const [rr,cc]=q.shift(); comp.push([rr,cc]);
      for(const [nr,nc] of neighbors4(rr,cc)){
        if(!seen[nr][nc] && grid[nr][nc]===color){
          seen[nr][nc]=true; q.push([nr,nc]);
        }
      }
    }
    regions.get(color).push(comp);
  }
  return regions;
}

// Tähtien sijoittelu: 1,3,6 eri alueille, ei vierekkäisiä
function placeStarsBacktrack(regionsByColor, allowAnyIfMissing=false){
  const target={0:[1,3,6],1:[1,3,6],2:[1,3,6],3:[1,3,6],4:[1,3,6]};
  const order=[];
  for(const c of [0,1,2,3,4]){
    const pairs=[];
    for(const s of target[c]){
      const regs=(regionsByColor.get(c)||[])
        .map((reg,i)=>[i,reg.length])
        .filter(([,len])=>len===s)
        .map(([i])=>i);
      pairs.push([c,s,regs]);
    }
    pairs.sort((a,b)=>a[2].length-b[2].length);
    order.push(...pairs);
  }
  order.sort((a,b)=>a[2].length-b[2].length);

  const stars=new Set();
  const usedRegionIdx=new Map([[0,new Set()],[1,new Set()],[2,new Set()],[3,new Set()],[4,new Set()]]);

  function candidatesFor(c,s){
    const list=regionsByColor.get(c)||[];
    let idxs=[];
    list.forEach((reg,idx)=>{ if(reg.length===s) idxs.push(idx); });
    if(!idxs.length && allowAnyIfMissing) idxs=list.map((_,i)=>i);
    return idxs;
  }

  function freeCount(reg){
    let n=0;
    for(const cell of reg){
      const k=cell+'';
      let ok=true;
      for(const st of stars){
        const [sr,sc]=parseKey(st);
        if(orthAdjacent(cell,[sr,sc]) || st===k){ ok=false; break; }
      }
      if(ok) n++;
    }
    return n;
  }

  function backtrack(i){
    if(i===order.length) return true;
    const [c,s]=order[i];
    const idxs=candidatesFor(c,s).filter(idx=>!usedRegionIdx.get(c).has(idx));
    idxs.sort((ia,ib)=> freeCount(regionsByColor.get(c)[ib]) - freeCount(regionsByColor.get(c)[ia]) );
    for(const idx of idxs){
      const cells=regionsByColor.get(c)[idx].slice(); shuffleInPlace(cells);
      for(const cell of cells){
        const k=cell+'';
        let ok=true;
        for(const st of stars){
          const [sr,sc]=parseKey(st);
          if(orthAdjacent(cell,[sr,sc]) || st===k){ ok=false; break; }
        }
        if(!ok) continue;
        stars.add(k); usedRegionIdx.get(c).add(idx);
        if(backtrack(i+1)) return true;
        usedRegionIdx.get(c).delete(idx); stars.delete(k);
      }
    }
    return false;
  }

  if(backtrack(0)) return {stars, usedFallback:false};
  if(allowAnyIfMissing) return null;
  return placeStarsBacktrack(regionsByColor,true); // fallback
}

function generateStars(grid, strict=true){
  const regions=computeRegions(grid);
  let res=placeStarsBacktrack(regions,false);
  if(res) return res;
  if(!strict){
    res=placeStarsBacktrack(regions,true);
    if(res) return {...res, usedFallback:true};
  }
  throw new Error("Tarkka tähtien sijoittelu (1/3/6) ei onnistu tämän laudan kokojakaumalla.");
}

// =================== PIIRTO ===================
function drawGrid(){
	gridEl.style.setProperty('--hcol', H_COL);

  if(!gridEl) return;
  gridEl.innerHTML="";
  for(let r=0;r<GRID_H;r++){
    for(let c=0;c<GRID_W;c++){
      const div=document.createElement('div');
      div.className='cell';
      const [R,G,B]=COLORS[state.grid[r][c]];
      // Yhteensopiva syntaksi (kommat)
      div.style.background=`rgb(${R},${G},${B})`;
      const k=cellKey(r,c);
      // Tähti
      if(state.stars.has(k)){
        const holder=document.createElement('div');
        holder.className='star';
        holder.innerHTML=`<svg viewBox="0 0 100 100" aria-hidden="true">
          <polygon points="50,5 61,35 95,35 67,55 78,88 50,70 22,88 33,55 5,35 39,35"
                   fill="white" stroke="black" stroke-width="4"/>
        </svg>`;
        div.appendChild(holder);
      }
      // Merkintä (X)
      if(state.marked.has(k)){
        const mark=document.createElement('div');
        mark.innerHTML=`<svg viewBox="0 0 100 100" style="position:absolute;inset:0;">
          <line x1="12" y1="12" x2="88" y2="88" stroke="black" stroke-width="8" />
          <line x1="12" y1="88" x2="88" y2="12" stroke="black" stroke-width="8" />
        </svg>`;
        div.appendChild(mark);
      }
      // Pending-outline (jos sivusi CSS ei määritä .pending, annetaan inline)
      if(state.pending.has(k)){
        div.classList.add('pending');
        div.style.outline='2px solid #fff';
        div.style.outlineOffset='-2px';
      }

      div.addEventListener('click',()=>onCellClick(r,c));
      gridEl.appendChild(div);
    }
  }
}

function drawDiceRow(container, arr, isColor, selectedIdx){
  if(!container) return;
  container.innerHTML='';
  const count=arr && arr.length ? arr.length : 2;
  for(let i=0;i<count;i++){
    const die=document.createElement('div');
    die.className='die';
    // jos sivusi CSS:ssä ei ole .die-tyylejä, annetaan kevyet inline-tyylit
    die.style.cssText='flex:0 0 120px;height:40px;border-radius:8px;background:#e0e0e0;border:1px solid #555;display:flex;align-items:center;gap:8px;padding:6px 10px;box-sizing:border-box;cursor:pointer;';
    if(arr && selectedIdx===i) die.style.outline='3px solid #1459d9';

if(arr && arr[i]!==undefined){
  const v=arr[i];
if(v==='JOKER'){
  // Jokerille isompi symboli
  const span = document.createElement('span');
  span.textContent = '◉';   // valitse esim. '◉', '♦', 'J', '♛'
  span.style.fontSize = '22px';   // tee isoksi
  die.appendChild(span);
  die.style.justifyContent = 'center';
}
else if(isColor){
    // Näytä vain värilaatta
    const sw=document.createElement('div');
    sw.style.cssText='width:20px;height:20px;border-radius:4px;border:1px solid #000;';
    const [R,G,B]=COLORS[v]; 
    sw.style.background=`rgb(${R},${G},${B})`;
    die.appendChild(sw);
    die.style.justifyContent='center';
  }else{
    // Numeronoppa: näytä vain numero
    die.textContent=String(v);
    die.style.justifyContent='center';
  }
}

	else{
      die.textContent='—';
    }

    die.addEventListener('click', ()=>{
      if(!state.allowPick) return;
      if(isColor) setColorChoice(i); else setNumberChoice(i);
      redraw();
    });

    container.appendChild(die);
  }
}

function updateStatus(){
  if(colPtsEl) colPtsEl.textContent=state.score.columnsPoints;
  if(starsLineEl) starsLineEl.textContent=`${state.stars.size - state.score.starsChecked}`;
if (turnEl) {
  const shownTurn = Math.min(state.turn ?? 0, SOLO_TURNS);
  turnEl.textContent = `${shownTurn} / ${SOLO_TURNS}`;
}

  if(colorPtsEl) colorPtsEl.textContent=state.score.colorPoints;
  if(jokersEl) jokersEl.textContent=(JOKER_POOL - state.score.jokersUsed);
  if(totalEl) totalEl.textContent=totalScore();
  if(msgEl) msgEl.textContent=state.msg || '';
}

function redraw(){
  drawGrid();
  updateStatus();
  drawDiceRow(colorRow, state.colorDice, true, state.chosenColorIdx);
  drawDiceRow(numRow, state.numberDice, false, state.chosenNumberIdx);
}

function totalScore(){
  const totalStars=state.stars.size;
  const starPenalty=(totalStars - state.score.starsChecked)*2;
  const jokerBonus=(JOKER_POOL - state.score.jokersUsed);
  return state.score.columnsPoints + state.score.colorPoints + jokerBonus - starPenalty;
}

// =================== PELILOGIIKKA ===================
function buildRandomizedBoard(){
  const base=loadTemplate();
  const grid=randomTransformAndRecolor(base);
  let stars=new Set(), usedFallback=false;
  try{
    const res=generateStars(grid, STRICT_STARS);
    stars=res.stars; usedFallback=!!res.usedFallback;
  }catch(e){
    try{
      const res2=generateStars(grid, false);
      stars=res2.stars; usedFallback=!!res2.usedFallback;
      state.msg="Huom: 1/3/6 ei onnistunut kaikille väreille, käytettiin lähimpiä alueita (ei vierekkäin).";
    }catch(err){
      state.msg=`Tähtien sijoittelu epäonnistui: ${e.message}`;
    }
  }
  return {grid, stars, usedFallback};
}

function resetGame(){
  const {grid, stars, usedFallback}=buildRandomizedBoard();
  state.grid=grid; state.stars=stars;
  state.marked=new Set(); state.pending=new Set();
  state.turn=1; state.ended=false;
  state.msg = usedFallback
    ? "Huom: 1/3/6 ei onnistunut kaikille väreille, käytettiin lähimpiä alueita (ei vierekkäin)."
    : "Heitä nopat. Valitse väri + lukumäärä → Rastita alue → Vahvista. Ensimmäinen siirto aloitetaan keskimmäiseen sarakkeen. Rastien tulee aina olla vierekkäisiä.";
  state.chosenColor=null; state.chosenNumber=null; state.chosenColorIdx=null; state.chosenNumberIdx=null;
  state.allowPick=false; state.colorDice=[]; state.numberDice=[];
  state.score={ columnsClaimed:Array(GRID_W).fill(false), columnsPoints:0, colorCompleted:Array(5).fill(false), colorPoints:0, starsChecked:0, jokersUsed:0 };
// resetGame(): varmista että peli on auki ja napit käytettävissä
state.ended = false;
state.allowPick = false;

if (typeof rollBtn !== 'undefined' && rollBtn)    rollBtn.disabled = false;
if (typeof confirmBtn !== 'undefined' && confirmBtn) confirmBtn.disabled = false;

}

function roll(){
  state.msg = '';
  state.pending.clear();
  state.chosenColor = null;
  state.chosenNumber = null;
  state.chosenColorIdx = null;
  state.chosenNumberIdx = null;

  // Estä heitto jos peli on päättynyt
  if (state.ended) return;

  // Jos jostain syystä ollaan jo viimeisen jälkeen, katkaise
  if (state.turn > SOLO_TURNS) {
    endGame('30 kierrosta täynnä (SOLO).');
    return;
  }

  const nColor = 2, nNumber = 2;
  state.colorDice = Array.from({length:nColor},()=>randChoice(COLOR_SIDES));
  state.numberDice = Array.from({length:nNumber},()=>randChoice(NUMBER_SIDES));
  state.allowPick = true;
}


function setColorChoice(idx){
  if(!state.allowPick) return;
  if(idx<0 || idx>=state.colorDice.length) return;
  const v=state.colorDice[idx];
  state.chosenColor=v; state.chosenColorIdx=idx;
  state.msg=`Väri: ${v==='JOKER' ? 'Jokeri' : COLOR_NAMES[v]}`;
  state.pending.clear();
}

function setNumberChoice(idx){
  if(!state.allowPick) return;
  if(idx<0 || idx>=state.numberDice.length) return;
  const v=state.numberDice[idx];
  state.chosenNumber=v; state.chosenNumberIdx=idx;
  state.msg=`Lukumäärä: ${v==='JOKER' ? 'Jokeri' : v}`;
  state.pending.clear();
}

function canMarkCell(r,c){
  const color=state.grid[r][c];
  const chosen=state.chosenColor;
  if(chosen!=='JOKER' && chosen!==color) return false;
  const k=cellKey(r,c);
  if(state.marked.has(k)) return false;
  if(state.pending.size===0) return true;
  const comp=new Set(state.pending); comp.add(k);
  return isConnected(comp);
}

function onCellClick(r,c){
  if(!state.allowPick || state.chosenColor===null || state.chosenNumber===null) return;
  const k=cellKey(r,c);
  const required = state.chosenNumber==='JOKER' ? null : state.chosenNumber;

  if(state.pending.has(k)){ state.pending.delete(k); redraw(); return; }
  if(!canMarkCell(r,c)) return;
  state.pending.add(k);

  if(state.pending.size>5){ state.pending.delete(k); return; }
  if(required!=null && state.pending.size>required){ state.pending.delete(k); return; }

  redraw();
}
// Palauttaa true jos nykyisillä nopilla on olemassa vähintään yksi laillinen siirto
function hasAnyLegalMove(){
  // Jos ei vielä heitetty nopat, ei estetä heittoa
  if(!state.colorDice?.length || !state.numberDice?.length) return false;

  // Sallitut värit kahdesta värinopasta (jokeri sallii kaikki)
  const colorOptions = new Set();
  for(const v of state.colorDice){
    if(v === 'JOKER') { [0,1,2,3,4].forEach(c=>colorOptions.add(c)); }
    else if(v != null) colorOptions.add(v);
  }
  if(colorOptions.size === 0) return false;

  // Sallitut määrät kahdesta numeronopasta (jokeri = 1..5)
  const numberOptions = new Set();
  for(const n of state.numberDice){
    if(n === 'JOKER'){ [1,2,3,4,5].forEach(x=>numberOptions.add(x)); }
    else if(n != null) numberOptions.add(n);
  }
  if(numberOptions.size === 0) return false;

  // Apuri: BFS-yhtenäisyys + kosketus
  function componentInfo(color, startR, startC, seen){
    const q=[[startR,startC]];
    seen.add(`${startR},${startC}`);
    let size=0, touchesMarked=false, hasH=false;
    while(q.length){
      const [r,c]=q.shift();
      size++;
      if(c===H_COL) hasH=true;
      for(const [nr,nc] of neighbors4(r,c)){
        const k=`${nr},${nc}`;
        if(state.grid[nr]?.[nc]===color && !state.marked.has(k) && !seen.has(k)){
          seen.add(k); q.push([nr,nc]);
        }
      }
      for(const [nr,nc] of neighbors4(r,c)){
        if(state.marked.has(`${nr},${nc}`)){ touchesMarked=true; break; }
      }
    }
    return {size, touchesMarked, hasH};
  }

  const firstMove = state.marked.size === 0;

  // Käy läpi kaikki värit × kaikki numero­nopat
  for(const color of colorOptions){
    const seen = new Set();
    for(let r=0;r<GRID_H;r++){
      for(let c=0;c<GRID_W;c++){
        const k=`${r},${c}`;
        if(state.grid[r][c]!==color || state.marked.has(k) || seen.has(k)) continue;

        const info = componentInfo(color, r, c, seen);
        const adjacencyOk = firstMove ? info.hasH : info.touchesMarked;
        if(!adjacencyOk) continue;

        // nyt tarkistetaan jokaista sallittua numeroa erikseen
        for(const n of numberOptions){
          if(info.size >= n){
            return true;   // jollakin nopalla onnistuu → true
          }
        }
      }
    }
  }

  return false; // kaikki väri × numero -yhdistelmät epäonnistuivat
}


function confirmMove(){
  if(!state.allowPick) return;
  if(state.chosenColor===null || state.chosenNumber===null){ state.msg="Valitse väri- ja lukumääränoppa."; redraw(); return; }

  const nsel=state.pending.size;
  if(state.chosenNumber==='JOKER'){
    if(nsel<1||nsel>5){ state.msg='Jokeri-numero: valitse 1–5 ruutua.'; redraw(); return; }
  }else{
    if(nsel!==state.chosenNumber){ state.msg=`Valittava määrä on ${state.chosenNumber}.`; redraw(); return; }
  }

  if(state.marked.size===0){
    let hasH=false; for(const k of state.pending){ const [,c]=parseKey(k); if(c===H_COL){ hasH=true; break; } }
    if(!hasH){ state.msg='Ensimmäisellä vuorolla valinnan on sisällettävä sarake H.'; redraw(); return; }
  }

  if(state.marked.size>0){
    let touches=false;
    for(const k of state.pending){
      const [r,c]=parseKey(k);
      for(const [nr,nc] of neighbors4(r,c)){
        if(state.marked.has(cellKey(nr,nc))){ touches=true; break; }
      }
      if(touches) break;
    }
    if(!touches){ state.msg='Valinnan on liityttävä aiempiin merkintöihin.'; redraw(); return; }
  }

  const colors=new Set([...state.pending].map(k=>{ const [r,c]=parseKey(k); return state.grid[r][c]; }));
  if(colors.size!==1){ state.msg='Kaikki valitut ruudut oltava samaa väriä.'; redraw(); return; }
  const selColor=[...colors][0];
  if(state.chosenColor!=='JOKER' && state.chosenColor!==selColor){ state.msg='Valitun värin tulee vastata värinoppaa.'; redraw(); return; }
  if(!isConnected(new Set(state.pending))){ state.msg="Valinnan tulee olla yhtenäinen 'klöntti'."; redraw(); return; }

  // Merkitään
  for(const k of state.pending) state.marked.add(k);

  let usedJ=0; if(state.chosenColor==='JOKER') usedJ++; if(state.chosenNumber==='JOKER') usedJ++;
  if(state.score.jokersUsed + usedJ > JOKER_POOL){
    for(const k of state.pending) state.marked.delete(k);
    state.msg='Ei jäljellä huutomerkkejä (jokereita).'; redraw(); return;
  }
  state.score.jokersUsed += usedJ;

  // Tähdet
  let gained=0; for(const k of state.pending) if(state.stars.has(k)) gained++;
  state.score.starsChecked += gained;

  // Sarakkeet
  for(let c=0;c<GRID_W;c++) if(!state.score.columnsClaimed[c]){
    let full=true; for(let r=0;r<GRID_H;r++){ if(!state.marked.has(cellKey(r,c))){ full=false; break; } }
    if(full){ state.score.columnsClaimed[c]=true; state.score.columnsPoints += COL_FIRST[c]; }
  }

  // Värit
  for(let color=0;color<5;color++) if(!state.score.colorCompleted[color]){
    const allCells=[];
    for(let r=0;r<GRID_H;r++) for(let c=0;c<GRID_W;c++) if(state.grid[r][c]===color) allCells.push(cellKey(r,c));
    if(allCells.every(k=>state.marked.has(k))){
      state.score.colorCompleted[color]=true; state.score.colorPoints += COLOR_BONUS_FIRST;
    }
  }

  if(state.score.colorCompleted.filter(Boolean).length>=2){ endGame('Kaksi väriä täynnä – peli päättyy.'); redraw(); return; }

  state.turn+=1; state.pending.clear(); state.allowPick=false; state.msg='Siirto merkitty. Heitä nopat seuraavalla vuorolla.';
  // --- tähän asti pisteytykset on tehty ---

  // Päätä peli heti 30. vahvistetun siirron jälkeen
  if (state.turn === SOLO_TURNS) {
    endGame('30 kierrosta täynnä (SOLO).');
    redraw();
    return;
  }

  // Muuten siirrytään seuraavaan vuoroon
  state.turn += 1;
  state.pending.clear();
  state.allowPick = false;
  state.msg = 'Siirto merkitty. Heitä nopat seuraavalla vuorolla.';
  redraw();

}

// 6-portainen palaute pisteistä
function getScoreFeedback(score){
  if (score <= -10) return { name: "Katastrofi",            desc: "Paljon tähtiä jäi peittämättä.", emoji:"💥" };
  if (score <=  -1) return { name: "Heikko yritys",        desc: "Sakkoja kertyi enemmän kuin bonuksia.", emoji:"🌧️" };
  if (score <=   4) return { name: "Tasapeli nopan kanssa", desc: "Pysyit pinnalla nollan tuntumassa.", emoji:"⚖️" };
  if (score <=   9) return { name: "Kelpo suoritus",        desc: "Hyvää sarake- ja tähtipeliä.", emoji:"👍" };
  if (score <=  14) return { name: "Huippupeli",            desc: "Loistavaa optimointia ja ajoitusta.", emoji:"🏅" };
  return               { name: "Legendaarinen mestari",     desc: "Harvinainen täysosuma!", emoji:"🌟" };
}

function endGame(why){
  // Merkitse peli päättyneeksi
  state.ended = true;
  state.allowPick = false;

  // Näytettävä vuoro ei saa ylittää SOLO_TURNS-arvoa
  state.turn = Math.min(state.turn ?? 0, SOLO_TURNS);

  // Tyhjennä mahdollinen keskeneräinen valinta
  if (state.pending && typeof state.pending.clear === 'function') {
    state.pending.clear();
  }

  // Viesti ja lopulliset pisteet + palaute
  const score = (typeof totalScore === 'function') ? totalScore() : 0;
  const fb = getScoreFeedback(score);
  state.msg = `Peli päättyi: ${why}\nPisteet: ${score} — ${fb.emoji} ${fb.name}\n${fb.desc}`;

  // Lukitse napit, jos ovat olemassa
  if (typeof rollBtn !== 'undefined' && rollBtn)    rollBtn.disabled = true;
  if (typeof confirmBtn !== 'undefined' && confirmBtn) confirmBtn.disabled = true;

  // Sulje mahdollinen dialogi
  if (typeof closeDialog === 'function') {
    try { closeDialog(); } catch(_) {}
  } else if (typeof dlgMask !== 'undefined' && dlgMask) {
    dlgMask.style.display = 'none';
  }

  // Päivitä UI
  if (typeof redraw === 'function') {
    redraw();
  } else if (typeof updateStatus === 'function') {
    updateStatus();
  }
}



// =================== DIALOGI & NAPIT ===================
function openDialog(){ if(dlgMask) dlgMask.style.display='flex'; }
function closeDialog(){ if(dlgMask) dlgMask.style.display='none'; }

if(newBtn) newBtn.addEventListener('click', ()=>{ openDialog(); scheduleMeasure(); });
if(dlgYes) dlgYes.addEventListener('click', ()=>{ closeDialog(); resetGame(); redraw(); scheduleMeasure(); });
if(dlgNo)  dlgNo.addEventListener('click', ()=>{ closeDialog(); state.msg='Uutta peliä ei aloitettu.'; redraw(); scheduleMeasure(); });

if(rollBtn) rollBtn.addEventListener('click', ()=>{
  // Jos nopat on jo heitetty ja valintavaihe käynnissä,
  // sallitaan ilmainen uudelleenheitto VAIN jos siirtoa ei ole.
  if(state.allowPick && state.colorDice.length && state.numberDice.length){
    if(hasAnyLegalMove()){
      state.msg = 'Siirto on mahdollinen näillä nopilla – et voi heittää uudelleen.';
      redraw();
      return;
    } else {
      state.msg = 'Ei laillista siirtoa – ilmainen uudelleenheitto.';
    }
  }
  roll();
  redraw();
});

if(confirmBtn) confirmBtn.addEventListener('click', ()=>{ confirmMove(); scheduleMeasure(); });

// =================== PWA: INSTALL (valinnainen) ===================
let deferredPrompt=null;
if(installBtn){
  window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt=e; installBtn.style.display='inline-block'; });
  installBtn.addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt=null; installBtn.style.display='none'; });
  window.addEventListener('appinstalled', ()=>{ installBtn.style.display='none'; });
}

// --- iPhone auto-fit: skaalataan --cell niin että 15x7 + status mahtuu ruudulle ---
function setCellSizeForPhone() {
  // Näytön mitat
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Sama kuin CSS:ssäsi: grid-gap = 1px -> 14 välikköä vaakaan, 6 pystyyn
  const GAP_X = 14, GAP_Y = 6;
  const gap = 1;

  // Kehyksiä/paddingeja (nykyisestä CSS:stäsi): .wrap padding ~16, .board padding ~8
  const WRAP_PAD = 16, BOARD_PAD = 8;

  // Arvio status-alueen korkeus (sinulla kaksi riviä tekstiä): ~90 px
  const STATUS_H = 90;

  // Otsikon ja yläpalkin arvio: ~56 px
  const HEADER_H = 56;

  // Leveyden mukaan sallittu solukoko
  const cellByW = Math.floor(
    (vw - 2*WRAP_PAD - 2*BOARD_PAD - GAP_X*gap) / 15
  );

  // Korkeuden mukaan sallittu solukoko
  const cellByH = Math.floor(
    (vh - HEADER_H - 2*WRAP_PAD - 2*BOARD_PAD - STATUS_H - GAP_Y*gap) / 7
  );

  // Rajoita järkevään haarukkaan (voit tiukentaa tarvittaessa)
  const cell = Math.max(22, Math.min(44, cellByW, cellByH));

// Leveys: laske yksi solun leveys täsmälleen gridin leveydestä (100%) ja 14:stä 1px-raosta
const widthCalc = `calc((100% - ${(GRID_W - 1) * gap}px) / ${GRID_W})`;
// Korkeus: käytettävä korkeus jaetaan 7:llä → px
const heightPx = Math.floor(availH / GRID_H);
// Aseta --cell = min(leveyslasku, korkeuskatto) suoraan #gridille (tarkempi kuin :root)
grid.style.setProperty('--cell', `min(${widthCalc}, ${heightPx}px)`);

}

// Kutsu käynnistyksessä ja kun ruutu vaihtaa suuntaa / kokoaan
window.addEventListener('resize', setCellSizeForPhone);
window.addEventListener('orientationchange', setCellSizeForPhone);

// --- iPhone auto-fit (turvallinen mitoitus, ei leikkauksia) ---
function getVV() {
  // VisualViewport kun saatavilla, muuten fallback
  const vv = window.visualViewport;
  return {
    width: Math.floor(vv ? vv.width : document.documentElement.clientWidth),
    height: Math.floor(vv ? vv.height : window.innerHeight),
    scale: vv ? vv.scale : 1
  };
}

function px(n){ return isNaN(n) ? 0 : n; }

function measureAndSetCell() {
  const board = document.querySelector('.board');
  const grid  = document.getElementById('grid');
  if (!board || !grid) return;

  // Saatavilla oleva LEVEYS: boardin sisältöleveys
  const boardRect = board.getBoundingClientRect();
  const csBoard = getComputedStyle(board);
  const padX = px(parseFloat(csBoard.paddingLeft)) + px(parseFloat(csBoard.paddingRight));

  const csGrid = getComputedStyle(grid);
  // grid-gap
  const gap = px(parseFloat(csGrid.gap)) || 1;
  const gapsX = (15 - 1) * gap;   // 14 väliä
  const gapsY = (7  - 1) * gap;   // 6 väliä

  const availW = Math.floor(boardRect.width - padX - gapsX);

  // Saatavilla oleva KORKEUS: visual viewport - header - wrap padding - board padding - status
  const vv = getVV();

  // Mitataan header + status oikeasti DOM:ista (tarkempi kuin arvaus)
  const header = document.querySelector('header');
  const status = document.querySelector('.status');
  const wrap   = document.querySelector('.wrap');

  const headerH = header ? header.getBoundingClientRect().height : 0;
  const statusH = status ? status.getBoundingClientRect().height : 0;

  const csWrap  = wrap ? getComputedStyle(wrap) : null;
  const wrapPadY = wrap ? (px(parseFloat(csWrap.paddingTop)) + px(parseFloat(csWrap.paddingBottom))) : 0;
  const padY = px(parseFloat(csBoard.paddingTop)) + px(parseFloat(csBoard.paddingBottom));

  // Jätä hieman varaa iOS:n työkalurivien vaihtelulle (safe margin)
  const SAFE = 6;

  const availH = Math.floor(vv.height - headerH - wrapPadY - padY - statusH - gapsY - SAFE);

  // Solukoko molempien suuntien mukaan
  const cellByW = Math.floor(availW / 15);
  const cellByH = Math.floor(availH / 7);

  // Rajaa järkevään haitariin ja ota varmuusvähennys, ettei vuoda yli iOS:ssa
  const cell = Math.max(18, Math.min(44, cellByW, cellByH) - 1);

 // Leveys: yksi solun leveys täsmälleen gridin leveydestä ja raoista
const widthCalc = `calc((100% - ${(GRID_W - 1) * gap}px) / ${GRID_W})`;
// Korkeus: käytettävä korkeus jaettuna riveillä
const heightPx  = Math.floor(availH / GRID_H);
// Aseta suoraan #gridille: min(leveyslasku, korkeuskatto)
grid.style.setProperty('--cell', `min(${widthCalc}, ${heightPx}px)`);

}

// Debounce iOS:n pienet “resize”‑triggerit (esim. napin painallus)
let _resizeT = null;
function scheduleMeasure() {
  if (_resizeT) cancelAnimationFrame(_resizeT);
  _resizeT = requestAnimationFrame(measureAndSetCell);
}

// Reagoi vain olennaisiin muutoksiin
window.addEventListener('resize', scheduleMeasure);
window.addEventListener('orientationchange', () => {
  setTimeout(measureAndSetCell, 250); // odota kääntöä
});
document.addEventListener('visibilitychange', ()=> {
  if (document.visibilityState === 'visible') scheduleMeasure();
});
// =================== INIT ===================
function init(){
  measureAndSetCell();  // laske --cell heti
  resetGame();
  redraw();
}


window.addEventListener('load', init);
