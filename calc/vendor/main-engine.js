// Main pricing and simulation engine.
// Loaded before script.js and exposes global functions/state used by UI modules.

const CITY_ORDER = ['Tyre','Antioch','Damascus','Palmyra','Ctesiphon','Ecbatana'];
const CITY_NEIGHBORS = {
  Antioch:   ['Tyre','Damascus'],
  Tyre:      ['Antioch','Damascus'],
  Damascus:  ['Antioch','Tyre','Palmyra'],
  Palmyra:   ['Damascus','Ctesiphon'],
  Ctesiphon: ['Palmyra','Ecbatana'],
  Ecbatana:  ['Ctesiphon'],
};

let CITIES = {
  Antioch:   { culture:'Byzantine', language:'Greek',   traits:['Pentarchy','Earthquake Prone'],
    hasFireTemple:false, produced:['Sea Salt','Wool','Coriander','Byzantine Silk'] },
  Tyre:      { culture:'Byzantine', language:'Greek',   traits:['Port'],
    hasFireTemple:false, produced:['Olive Oil','Dried Fish','Sea Salt','Glassware','Linen'] },
  Damascus:  { culture:'Syriac',    language:'Aramaic', traits:['Desert','Cosmopolitan'],
    hasFireTemple:false, produced:['Iron Ingot','Copper Ingot','Weapons','Tools','Earthenware','Sesame'] },
  Palmyra:   { culture:'Syriac',    language:'Aramaic', traits:['Frontier'],
    hasFireTemple:false, produced:['Linen','Wool','Cotton Yarn','Wheat','Barley','Leather'] },
  Ctesiphon: { culture:'Persian',   language:'Persian', traits:['Capital'],
    hasFireTemple:true,  produced:['Wheat','Olive Oil','Cotton Yarn','Glassware','Earthenware','Tools','Iron Ingot','Coriander','Sesame','Persian Carpets'] },
  Ecbatana:  { culture:'Persian',   language:'Persian', traits:['Homogenous'],
    hasFireTemple:true,  produced:['Copper Ingot','Barley','Wool','Leather','Weapons','Saffron'] }
};

let GOODS = [
  {name:'Leather',      base:35,  type:'Textile',      hopPct:0.20},
  {name:'Wool',         base:35,  type:'Textile',      hopPct:0.20},
  {name:'Linen',        base:10,  type:'Textile',      hopPct:0.50},
  {name:'Cotton Yarn',  base:20,  type:'Textile',      hopPct:0.30},
  {name:'Iron Ingot',   base:35,  type:'Metal',        hopPct:0.20},
  {name:'Copper Ingot', base:130, type:'Metal',        hopPct:10/130},
  {name:'Earthenware',  base:10,  type:'Household',    hopPct:0.50},
  {name:'Glassware',    base:20,  type:'Household',    hopPct:0.30},
  {name:'Weapons',      base:35,  type:'Craft',        hopPct:0.20},
  {name:'Tools',        base:35,  type:'Craft',        hopPct:0.20},
  {name:'Olive Oil',    base:20,  type:'Agricultural', hopPct:0.30},
  {name:'Dried Fish',   base:100, type:'Agricultural', hopPct:0.09},
  {name:'Barley',       base:10,  type:'Agricultural', hopPct:0.50},
  {name:'Wheat',        base:10,  type:'Agricultural', hopPct:0.50},
  {name:'Sea Salt',     base:80,  type:'Spices',       hopPct:0.10},
  {name:'Coriander',    base:80,  type:'Spices',       hopPct:0.10},
  {name:'Sesame',       base:100, type:'Spices',       hopPct:0.09},
  {name:'Saffron',      base:200, type:'Spices',       hopPct:0.07},
  {name:'Byzantine Silk',   base:300, type:'Luxury',     hopPct:17/300},
  {name:'Persian Carpets',  base:300, type:'Luxury',     hopPct:17/300},
];

// Fast lookup for callers that pass a good name string.
let GOOD_BY_NAME = {};
function rebuildGoodLookup() {
  const m = {};
  for (const g of GOODS) m[g.name] = g;
  GOOD_BY_NAME = m;
}
function normalizeGood(good) {
  if (!good) return null;
  if (typeof good === "string") return GOOD_BY_NAME[good] || null;
  if (typeof good === "object" && good.name) return good;
  return null;
}

const FOOD_TYPES = new Set(['Agricultural']);
// These goods are sold by Spice Merchants in every city - can be bought anywhere (not just producing cities)
const SPICE_MERCHANT_GOODS = new Set(['Coriander','Sesame','Saffron']);
// Luxury goods are exclusive to one city - only available to buy there
const LUXURY_CITY = {'Byzantine Silk':'Antioch', 'Persian Carpets':'Ctesiphon'};

const BACKPACKS = {
  None:          {extraSlots:0},
  SmallSatchel:  {extraSlots:2},
  LargeSatchel:  {extraSlots:4},
  BasketBackpack:{extraSlots:6},
  FramePack:     {extraSlots:6},
};

const ANIMALS_DATA = {
  'None':                  {slots:0,  speed:0,  saddle:false},
  'Pack Mule':             {slots:1,  slotsSaddle:3, speed:1,  saddle:true},
  'Saddle Mule':           {slots:2,  slotsSaddle:4, speed:1,  saddle:true},
  'Dromedary Camel':       {slots:2,  slotsSaddle:4, speed:2,  saddle:true},
  'Dzungarian Horse':      {slots:1,  slotsSaddle:3, speed:3,  saddle:true},
  'Nisean Horse':          {slots:4,  speed:6,  saddle:false},
  'White Nisean Horse':    {slots:4,  speed:6,  saddle:false},
  'Red Chestnut Nisean':   {slots:4,  speed:6,  saddle:false},
};

const CULTURES = {
  Byzantine:{nativeLang:'Greek'},
  Syriac:   {nativeLang:'Aramaic'},
  Persian:  {nativeLang:'Persian'},
};

// Base travel times in minutes at walk speed 16. All values are estimates
// derived from in-game measurements (auto-walk speed varies ~10-15%).
// Direct legs measured at speed 26 then scaled; Damascus<->Antioch cross-validated
// at speed 20 -> best estimate 7.0 min at speed 16. Non-adjacent = sum of legs.
let TRAVEL_TIMES = {
  Antioch:  {Tyre:8.7, Damascus:7.0, Palmyra:13.5, Ctesiphon:19.3, Ecbatana:23.6},
  Tyre:     {Antioch:8.7, Damascus:6.2, Palmyra:12.7, Ctesiphon:18.5, Ecbatana:22.8},
  Damascus: {Antioch:7.0, Tyre:6.2,  Palmyra:6.5, Ctesiphon:12.3, Ecbatana:16.6},
  Palmyra:  {Antioch:13.5, Tyre:12.7, Damascus:6.5, Ctesiphon:5.8, Ecbatana:10.1},
  Ctesiphon:{Antioch:19.3, Tyre:18.5, Damascus:12.3, Palmyra:5.8,  Ecbatana:4.3},
  Ecbatana: {Antioch:23.6, Tyre:22.8, Damascus:16.6, Palmyra:10.1, Ctesiphon:4.3},
};

/* Warm-toned city palette to fit the parchment look */
const CITY_BADGE_COLORS = {
  Tyre:     '#5b9ec7',
  Antioch:  '#e08c6a',
  Damascus: '#d4a843',
  Palmyra:  '#c8853a',
  Ctesiphon:'#a87bc4',
  Ecbatana: '#7ab06a'
};

// ---------------------------------------------------------------------------
// Distance + producer caches
// ---------------------------------------------------------------------------
// These calculations are called many times during route generation and table
// rendering. We precompute hop distances and producer lookups so runtime work
// stays O(1) for the hot path.
let HOP_DISTANCE_CACHE = {};
let PRODUCER_CITY_CACHE = {};

function rebuildRouteCaches() {
  const cities = Object.keys(CITY_NEIGHBORS);
  const hopCache = {};

  for (const from of cities) {
    hopCache[from] = {};
    for (const to of cities) hopCache[from][to] = from === to ? 0 : 99;

    const queue = [from];
    let head = 0;
    while (head < queue.length) {
      const city = queue[head++];
      const baseHops = hopCache[from][city];
      for (const neighbor of (CITY_NEIGHBORS[city] || [])) {
        if (hopCache[from][neighbor] <= baseHops + 1) continue;
        hopCache[from][neighbor] = baseHops + 1;
        queue.push(neighbor);
      }
    }
  }

  const producerMap = {};
  for (const city of CITY_ORDER) {
    const produced = CITIES[city]?.produced || [];
    for (const goodName of produced) {
      if (!producerMap[goodName]) producerMap[goodName] = [];
      producerMap[goodName].push(city);
    }
  }

  HOP_DISTANCE_CACHE = hopCache;
  PRODUCER_CITY_CACHE = producerMap;
}

// Sell price distance is based on minimum hops from any city that locally produces the good
function getHopsBetween(from, to){
  return HOP_DISTANCE_CACHE[from]?.[to] ?? 99;
}

function getMinHopsFromProducers(good, targetCity){
  const producers = PRODUCER_CITY_CACHE[good.name] || [];
  let minHops = Infinity;
  for (const city of producers){
    const d = getHopsBetween(city, targetCity);
    if (d < minHops) minHops = d;
  }
  const hops = Number.isFinite(minHops) ? minHops : 0;
  return targetCity === 'Ecbatana' ? Math.min(hops, 2) : hops;
}

function calculateDistanceMultiplier(good, sellCity){
  return 1 + getMinHopsFromProducers(good, sellCity) * good.hopPct;
}

rebuildGoodLookup();
rebuildRouteCaches();

let TRAIT_EFFECTS = [
  { trait_name:'Port',             kind:null,   bonus:0.05,  cond_type:null,               cond_value:null },
  { trait_name:'Capital',          kind:null,   bonus:0.05,  cond_type:'good_type',        cond_value:'Luxury' },
  { trait_name:'Desert',           kind:'sell', bonus:0.05,  cond_type:'good_type_food',   cond_value:'Agricultural' },
  { trait_name:'Frontier',         kind:null,   bonus:0.05,  cond_type:'good_name',        cond_value:'Tools' },
  { trait_name:'Frontier',         kind:null,   bonus:0.05,  cond_type:'good_name',        cond_value:'Weapons' },
  { trait_name:'Earthquake Prone', kind:null,   bonus:0.05,  cond_type:'good_name',        cond_value:'Tools' },
  { trait_name:'Earthquake Prone', kind:null,   bonus:0.05,  cond_type:'good_name',        cond_value:'Weapons' },
  { trait_name:'Cosmopolitan',     kind:null,   bonus:0.05,  cond_type:'culture_mismatch', cond_value:null },
  { trait_name:'Pentarchy',        kind:null,   bonus:0.05,  cond_type:'religion',         cond_value:'Christianity' },
  { trait_name:'Homogenous',       kind:null,   bonus:-0.05, cond_type:'culture_mismatch', cond_value:null },
];
let RELIGION_PERKS = [
  { religion:'Christianity', min_level:3, perk_type:'reduce_negative',  multiplier:0.5 },
  { religion:'Judaism',      min_level:1, perk_type:'amplify_negative',  multiplier:2   },
  { religion:'Judaism',      min_level:3, perk_type:'amplify_positive',  multiplier:2   },
];

function calculateCityModifier(good, sellCity, culture, religion, religionLevel, kind='sell'){
  const city = CITIES[sellCity];
  if (!city) return 0;
  let b = 0;
  for (const ef of TRAIT_EFFECTS) {
    if (!city.traits.includes(ef.trait_name)) continue;
    if (ef.kind && ef.kind !== kind) continue;
    if (ef.cond_type === 'good_type'      && good.type !== ef.cond_value) continue;
    if (ef.cond_type === 'good_type_food' && !FOOD_TYPES.has(good.type)) continue;
    if (ef.cond_type === 'good_name'      && good.name !== ef.cond_value) continue;
    if (ef.cond_type === 'culture_mismatch' && city.culture === culture) continue;
    if (ef.cond_type === 'religion'       && religion !== ef.cond_value) continue;
    b += ef.bonus;
  }
  for (const pk of RELIGION_PERKS) {
    if (pk.religion !== religion || religionLevel < pk.min_level) continue;
    if (pk.perk_type === 'reduce_negative'  && b < 0) b *= pk.multiplier;
    if (pk.perk_type === 'amplify_negative' && b < 0) b *= pk.multiplier;
    if (pk.perk_type === 'amplify_positive' && b > 0) b *= pk.multiplier;
  }
  return b;
}

function calculateLanguageModifier(sellCity, culture, langLevel, religion, religionLevel){
  const native = CULTURES[culture].nativeLang;
  const cityLang = CITIES[sellCity].language;
  let pct = (native === cityLang) ? 0.05 : (langLevel===1 ? -0.05 : langLevel===3 ? 0.05 : 0);
  if (religion==='Judaism' && religionLevel>=2) pct *= 1.5;
  return pct;
}

function calculateReligionModifier(good, sellCity, religion, religionLevel){
  const city = CITIES[sellCity];
  let mod = 0;
  if (religion==='Christianity'){
    if (religionLevel>=1 && (city.traits.includes('Capital')||city.traits.includes('Cosmopolitan')))
      mod += 0.03;
  }
  if (religion==='Zoroastrianism'){
    if (religionLevel>=2 && city.hasFireTemple) mod += 0.05;
    if (religionLevel>=3 && (good.type==='Metal'||good.type==='Craft')) mod += 0.10;
  }
  return mod;
}

// Events
// Random events affect prices in a city for 1 hour. One per city at a time.
// Effect = base + (base * pct), signed by direction. Applied to BOTH buy & sell
// in the affected city (commodity scarcity raises both; abundance lowers both).
let EVENTS = {
  Conflict: { dir:+1, label:'Conflict', glyph:'⚔', goodTypes:['Metal'],                  goodNames:['Weapons'],   desc:'Increases value of Weapons & Metal' },
  Festival: { dir:+1, label:'Festival', glyph:'✿', goodTypes:['Craft','Household'],      goodNames:[],            desc:'Increases value of Craft & Household' },
  Drought:  { dir:+1, label:'Drought',  glyph:'☼', goodTypes:['Agricultural'],           goodNames:[],            desc:'Increases value of Agriculture' },
  Harvest:  { dir:-1, label:'Harvest',  glyph:'❀', goodTypes:['Agricultural'],           goodNames:[],            desc:'Decreases value of Agriculture' }
};
let EVENT_LEVELS = {
  1: { pct:0.025, base:3, label:{ Conflict:'Small', Festival:'Small', Drought:'Small',    Harvest:'Good'     } },
  2: { pct:0.05,  base:5, label:{ Conflict:'Local', Festival:'Local', Drought:'Moderate', Harvest:'Plentiful'} },
  3: { pct:0.10,  base:8, label:{ Conflict:'Major', Festival:'Major', Drought:'Severe',   Harvest:'Abundant' } }
};
const EVENT_DURATION_MS = 60 * 60 * 1000; // 1 hour

// State: { cityName: { type:'Conflict', level:2, startTime: 1700000000000 } }
let eventState = {};

function loadEventState(){
  const parsed = lsGetJson('srtc-events', null);
  if (!parsed) return;
  // Strip expired
  const now = Date.now();
  eventState = {};
  for (const [city, ev] of Object.entries(parsed)){
    if (ev && ev.type && ev.startTime && (now - ev.startTime) < (ev.durationMs || EVENT_DURATION_MS)){
      eventState[city] = ev;
    }
  }
}
function saveEventState(){
  lsSet('srtc-events', JSON.stringify(eventState));
}
function setCityEvent(city, type, level, durationMs){
  eventState[city] = { type, level, startTime: Date.now(), durationMs: durationMs || EVENT_DURATION_MS };
  saveEventState();
  updateAll();
  renderEventsTab();
  renderEventFloater();
}
function clearCityEvent(city){
  delete eventState[city];
  saveEventState();
  updateAll();
  renderEventsTab();
  renderEventFloater();
}
function getActiveEvent(city){
  const ev = eventState[city];
  if (!ev) return null;
  const dur = ev.durationMs || EVENT_DURATION_MS;
  const remaining = dur - (Date.now() - ev.startTime);
  if (remaining <= 0){ delete eventState[city]; saveEventState(); return null; }
  return { ...ev, remainingMs: remaining };
}
// Returns delta to add to a price for a (good, city) pair (signed).
function getActiveEventDelta(good, city){
  const ev = getActiveEvent(city);
  if (!ev) return 0;
  const def = EVENTS[ev.type];
  if (!def) return 0;
  const matches = def.goodTypes.includes(good.type) || (def.goodNames || []).includes(good.name);
  if (!matches) return 0;
  const lvl = EVENT_LEVELS[ev.level];
  if (!lvl) return 0;
  // increase: +base + base*pct  ;  decrease: -base - base*pct
  return def.dir * (lvl.base + good.base * lvl.pct);
}
function eventAffects(good, ev){
  if (!ev) return false;
  const def = EVENTS[ev.type];
  if (!def) return false;
  return def.goodTypes.includes(good.type) || (def.goodNames || []).includes(good.name);
}

function calculateImportCost(good, buyCity){
  const hops = getMinHopsFromProducers(good, buyCity);
  if (hops === 0) return 0;
  return Math.floor(good.base * hops * good.hopPct);
}

function calculateRepDiscount(buyCity, ps){
  const culture = CITIES[buyCity].culture;
  if (culture === 'Byzantine' && (ps.byzantineRank || 0) >= 6) return 0.10;
  if (culture === 'Persian'   && (ps.sassanidRank  || 0) >= 6) return 0.10;
  return 0;
}

function calculateBuyPrice(good, buyCity, ps){
  good = normalizeGood(good);
  if (!good) return 0;
  // Buy price is additive with floor per modifier - amounts < $1 are automatically zero.
  const rawCityMod = calculateCityModifier(good, buyCity, ps.culture, ps.religion, ps.religionLevel, 'buy');
  const langMod    = calculateLanguageModifier(buyCity, ps.culture, ps.langLevel, ps.religion, ps.religionLevel);
  const relMod     = calculateReligionModifier(good, buyCity, ps.religion, ps.religionLevel);
  const repMod     = calculateRepDiscount(buyCity, ps);
  // Each modifier applied with floor (matching game behavior, <$1 -> zero)
  const applyMod = (mod) => Math.floor(good.base * Math.abs(mod)) * (mod >= 0 ? -1 : 1);
  const importCost = calculateImportCost(good, buyCity);
  let price = good.base + importCost + applyMod(rawCityMod) + applyMod(langMod) + applyMod(relMod) + applyMod(repMod);
  price += getActiveEventDelta(good, buyCity);
  return Math.round(price);
}

function applySellMod(base, mod){ return Math.floor(base * Math.abs(mod)) * (mod >= 0 ? 1 : -1); }

function calculateSellPrice(good, buyCity, sellCity, ps){
  good = normalizeGood(good);
  if (!good) return 0;
  const hops    = getMinHopsFromProducers(good, sellCity);
  const distBonus = Math.floor(good.base * hops * good.hopPct);
  const cityMod = calculateCityModifier(good, sellCity, ps.culture, ps.religion, ps.religionLevel);
  const langMod = calculateLanguageModifier(sellCity, ps.culture, ps.langLevel, ps.religion, ps.religionLevel);
  const relMod  = calculateReligionModifier(good, sellCity, ps.religion, ps.religionLevel);
  let price = good.base + distBonus + applySellMod(good.base, cityMod) + applySellMod(good.base, langMod) + applySellMod(good.base, relMod);
  price += getActiveEventDelta(good, sellCity);
  return Math.round(price);
}

function isLuxuryAccessible(good, ps){
  if (good.type !== 'Luxury') return true;
  const producerCity = LUXURY_CITY[good.name];
  if (!producerCity) return true;
  const culture = CITIES[producerCity].culture;
  if (culture === 'Byzantine') return (ps.byzantineRank || 1) >= 4;
  if (culture === 'Persian')   return (ps.sassanidRank  || 1) >= 4;
  return true;
}

function generateRoutes(ps){
  const routes = [];
  for (const good of GOODS){
    if (!isLuxuryAccessible(good, ps)) continue;
    for (const buyCity of CITY_ORDER){
      const luxuryCity = LUXURY_CITY[good.name];
      if (luxuryCity && buyCity !== luxuryCity) continue;
      for (const sellCity of CITY_ORDER){
        if (sellCity === buyCity) continue;
        if (CITIES[sellCity].produced.includes(good.name)) continue;
        const buyPrice      = calculateBuyPrice(good, buyCity, ps);
        const sellPrice     = calculateSellPrice(good, buyCity, sellCity, ps);
        const profitPerUnit = sellPrice - buyPrice;
        routes.push({good:good.name, goodType:good.type, buyCity, sellCity, buyPrice, sellPrice, profitPerUnit});
      }
    }
  }
  return routes;
}

function getAnimalSlots(name, hasSaddle){
  const a = ANIMALS_DATA[name];
  if (!a || a.slots===0) return 0;
  return (a.saddle && hasSaddle && a.slotsSaddle) ? a.slotsSaddle : a.slots;
}

function calculateCaravanSlots(ps){
  let count = 3;
  if (ps.caravanGamepass) count++;
  if ((ps.byzantineRank||0) >= 8 || (ps.sassanidRank||0) >= 8) count++;
  return Math.min(count, 5);
}

function calculateStorage(ps){
  let slots = 3 + BACKPACKS[ps.backpack].extraSlots;
  if (ps.extraStorage) slots++;
  const caravan = calculateCaravanSlots(ps);
  for (let i=0;i<caravan;i++) slots += getAnimalSlots(ps.animals[i], ps.saddlebags[i]);
  return slots;
}

function calculateWalkspeed(ps){
  let speed = 16 + (ps.autoWalk ? 4 : 0);
  const active = ps.animals.filter(a => a!=='None');
  if (active.length>0){
    const avg = active.reduce((s,a)=>s+(ANIMALS_DATA[a]?.speed||0),0) / active.length;
    speed += avg;
  }
  return Math.round(speed*100)/100;
}

function calculateTravelTime(from, to, walkspeed){
  const base = TRAVEL_TIMES[from]?.[to] ?? 0;
  return Math.round(base * 16 / walkspeed * 10) / 10;
}

function fmtTime(mins){
  const m = Math.floor(mins);
  const s = Math.round((mins - m) * 60);
  return s === 0 ? `~${m}m` : `~${m}m ${s}s`;
}

function enrichRoutes(routes, ps){
  const slots     = calculateStorage(ps);
  const walkspeed = calculateWalkspeed(ps);
  return routes.map(r => {
    const profitPerTrip = r.profitPerUnit * slots;
    const time          = calculateTravelTime(r.buyCity, r.sellCity, walkspeed);
    const profitPerMin  = time>0 ? Math.round(profitPerTrip/time) : 0;
    return {...r, slots, walkspeed, time, profitPerTrip, profitPerMin, profitPerHour: profitPerMin*60};
  });
}

function attachReturnTrade(routes){
  const best = {};
  for (const r of routes){
    const k = r.buyCity + '|' + r.sellCity;
    if (!best[k] || r.profitPerUnit > best[k].profitPerUnit) best[k] = r;
  }
  return routes.map(r => {
    const retKey = r.sellCity + '|' + r.buyCity;
    const ret    = best[retKey];
    const returnObj = ret && ret.profitPerUnit > 0 ? ret : null;
    let loopProfitPerMin = r.profitPerMin;
    if (returnObj) {
      const totalProfit = r.profitPerTrip + returnObj.profitPerTrip;
      const totalTime = r.time + returnObj.time;
      loopProfitPerMin =
        totalTime > 0 ? Math.round(totalProfit / totalTime) : r.profitPerMin;
    }
    return { ...r, returnObj, loopProfitPerMin };
  });
}

/** Group routes by "buyCity|sellCity" for fast leg lookups */
function routesByDirectedLeg(routes) {
  const map = {};
  for (const r of routes) {
    const k = r.buyCity + "|" + r.sellCity;
    if (!map[k]) map[k] = [];
    map[k].push(r);
  }
  return map;
}

/**
 * True best round trip by profit / minute: try every outbound × return cargo
 * for each city pair (A→B coupled with B→A). Older code used max profit/trip per
 * leg independently, which misses the jointly optimal ppm.
 */
function computeBestRoundTrip(routes) {
  if (!routes?.length) return null;
  const byLeg = routesByDirectedLeg(routes);
  let best = null;
  for (const A of CITY_ORDER) {
    for (const B of CITY_ORDER) {
      if (A === B) continue;
      const outs = byLeg[A + "|" + B];
      const backs = byLeg[B + "|" + A];
      if (!outs || !backs) continue;
      for (const out of outs) {
        for (const back of backs) {
          const totalProfit = out.profitPerTrip + back.profitPerTrip;
          if (totalProfit <= 0) continue;
          const totalTime = out.time + back.time;
          if (totalTime <= 0) continue;
          const ppm = Math.round(totalProfit / totalTime);
          const better =
            !best ||
            ppm > best.ppm ||
            (ppm === best.ppm && totalProfit > best.totalProfit);
          if (better)
            best = { out, back, totalProfit, totalTime, ppm };
        }
      }
    }
  }
  return best;
}

let sortKey = 'profitPerMin';
let sortDir = -1;
let allRoutes = [];


