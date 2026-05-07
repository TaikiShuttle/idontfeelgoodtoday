// silkroadcalc-lite — tools-only: setup + courier route planner.
// Depends on:
// - ../silkroadcalc.eu/frontend/assets/js/main-utils.js
// - ../silkroadcalc.eu/frontend/assets/js/main-engine.js

const LS_KEY = "silkroadcalc_lite_tools_v1";
const LS_DONE_KEY = "silkroadcalc_lite_done_v1";

function setDoneCount(n) {
  const el = document.getElementById("doneCount");
  if (el) el.textContent = String(n);
}

function getDoneCount() {
  const raw = localStorage.getItem(LS_DONE_KEY) || "0";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}


function getPlayerState() {
  const getVal = (id, fallback = "") =>
    document.getElementById(id)?.value ?? fallback;
  const getNum = (id, fallback = 0) => {
    const v = document.getElementById(id)?.value;
    const n = parseInt(v ?? "", 10);
    return Number.isFinite(n) ? n : fallback;
  };

  // Tools-only: keep only the modifiers that affect pricing.
  // Provide defaults for the rest so engine helpers can run safely.
  return {
    culture: getVal("culture", "Byzantine"),
    religion: getVal("religion", "Christianity"),
    religionLevel: getNum("religionLevel", 0),
    langLevel: getNum("langLevel", 2),

    backpack: "None",
    extraStorage: false,
    caravanGamepass: false,
    autoWalk: false,
    byzantineRank: 1,
    sassanidRank: 1,
    currentCity: "",
    sellInCity: "",
    animals: ["None", "None", "None", "None", "None"],
    saddlebags: [false, false, false, false, false],
  };
}

function applyState(s) {
  if (!s) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && v != null) el.value = v;
  };
  set("culture", s.culture);
  set("religion", s.religion);
  set("religionLevel", s.religionLevel);
  set("langLevel", s.langLevel);
}

function autoSave() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(getPlayerState()));
  } catch (_) {}
}

function updateAll() {
  autoSave();
}

function onCourierQuestChange() {
  const shortCheck = document.getElementById("shortQuestCheck");
  const longCheck = document.getElementById("longQuestCheck");
  const shortDest = document.getElementById("shortQuestDest");
  const longDest = document.getElementById("longQuestDest");
  if (shortCheck && shortDest) shortDest.disabled = !shortCheck.checked;
  if (longCheck && longDest) longDest.disabled = !longCheck.checked;
  const out = document.getElementById("courierResult");
  if (out) out.innerHTML = "";
}

let _courierData = null;

function getCourierRank(ps, city) {
  const culture = CITIES?.[city]?.culture;
  if (culture === "Byzantine") return ps.byzantineRank || 1;
  if (culture === "Persian") return ps.sassanidRank || 1;
  return Math.max(ps.byzantineRank || 1, ps.sassanidRank || 1);
}

function packageRewardAmount(type, ps, deliveryCity) {
  const base = type === "short" ? 30 : 100;
  const rank = getCourierRank(ps, deliveryCity);
  return Math.round(base * Math.pow(1.5, rank - 1));
}

function shortestCityPath(from, to) {
  if (!from || !to) return [from, to].filter(Boolean);
  if (from === to) return [from];
  const neighbors = CITY_NEIGHBORS || {};
  const q = [from];
  const prev = { [from]: null };
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    for (const n of neighbors[cur] || []) {
      if (prev[n] !== undefined) continue;
      prev[n] = cur;
      if (n === to) {
        head = q.length;
        break;
      }
      q.push(n);
    }
  }
  if (prev[to] === undefined) return [from, to];
  const path = [];
  let cur = to;
  while (cur) {
    path.push(cur);
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

function fmtPath(path) {
  return (path || []).filter(Boolean).join(" → ");
}

function confirmCourierDelivery() {
  if (!_courierData) return;
  if (!_courierData._counted) {
    const next = getDoneCount() + 1;
    localStorage.setItem(LS_DONE_KEY, String(next));
    setDoneCount(next);
    _courierData._counted = true;
  }
  _courierData.phase = "delivered";
  renderCourierUI(document.getElementById("courierResult"), _courierData);
}

function runCourierPlanner() {
  const start = document.getElementById("courierStart")?.value || "";
  const mustReturn = document.getElementById("courierReturn")?.checked !== false;
  const shortOn = document.getElementById("shortQuestCheck")?.checked === true;
  const longOn = document.getElementById("longQuestCheck")?.checked === true;
  const shortDest = document.getElementById("shortQuestDest")?.value || "";
  const longDest = document.getElementById("longQuestDest")?.value || "";
  const out = document.getElementById("courierResult");
  if (!out) return;

  if (!start) {
    out.innerHTML = `<div class="planner-empty">Pick a starting city.</div>`;
    return;
  }
  if (!shortOn && !longOn) {
    out.innerHTML = `<div class="planner-empty">Enable at least one courier quest.</div>`;
    return;
  }

  const stops = [];
  if (shortOn && shortDest && shortDest !== start)
    stops.push({ type: "short", city: shortDest });
  if (longOn && longDest && longDest !== start)
    stops.push({ type: "long", city: longDest });
  if (!stops.length) {
    out.innerHTML = `<div class="planner-empty">Pick destinations for your enabled quests.</div>`;
    return;
  }

  const ps = getPlayerState();

  // Simple route: visit in the order selected, then optionally return.
  const legs = [];
  let cur = start;
  for (const s of stops) {
    legs.push({ from: cur, to: s.city, deliver: s });
    cur = s.city;
  }
  if (mustReturn && cur !== start) legs.push({ from: cur, to: start, deliver: null });

  _courierData = { start, mustReturn, stops, legs, phase: "plan", ps };
  _courierData._counted = false;
  renderCourierUI(out, _courierData);
  autoSave();
}

function renderCourierUI(out, data) {
  if (!out) return;
  const { legs, phase } = data;
  const ps = data.ps || getPlayerState();

  // Best "carry" suggestion per directed leg (from|to)
  const bestByLeg = {};
  try {
    const enriched = enrichRoutes(generateRoutes(ps), ps);
    for (const r of enriched) {
      if (r.profitPerTrip <= 0) continue;
      const k = r.buyCity + "|" + r.sellCity;
      if (!bestByLeg[k] || r.profitPerTrip > bestByLeg[k].profitPerTrip)
        bestByLeg[k] = r;
    }
  } catch (_) {}

  // Expand each "delivery leg" into concrete hop legs, so the numbering and order
  // matches the old UI (one line per hop).
  const hopLegs = [];
  for (const leg of legs) {
    const path = shortestCityPath(leg.from, leg.to);
    if (path.length < 2) continue;
    for (let i = 0; i < path.length - 1; i++) {
      hopLegs.push({
        from: path[i],
        to: path[i + 1],
        deliver: i === path.length - 2 ? leg.deliver : null, // only on final hop
      });
    }
  }

  const legHtml = hopLegs
    .map((leg, idx) => {
      const best = bestByLeg[leg.from + "|" + leg.to];
      const carryHtml = `<div class="trip-leg-hint">Carry: <b>${best?.good || "—"}</b></div>`;
      const del = leg.deliver
        ? (() => {
            const reward = packageRewardAmount(leg.deliver.type, ps, leg.to);
            const label = leg.deliver.type === "short" ? "Short" : "Long";
            return `<div class="courier-delivery-event">Deliver <span class="courier-quest-badge ${leg.deliver.type}" style="margin:0 6px">${label}</span> package <span class="pkg-reward">+$${reward}</span></div>`;
          })()
        : "";
      return `
        <div class="trip-leg">
          <div class="trip-leg-num">${idx + 1}</div>
      <div class="trip-leg-body">
            <div class="trip-leg-route"><b>${leg.from}</b> → <b>${leg.to}</b></div>
            ${carryHtml}
            ${del}
      </div>
        </div>
        ${idx < hopLegs.length - 1 ? `<div class="trip-arrow">↓</div>` : ""}
      `;
    })
    .join("");

  const doneBtn =
    phase === "plan"
      ? `<div class="courier-deliver-wrap">
          <button class="btn btn-gold" onclick="confirmCourierDelivery()">done</button>
    </div>`
      : `<div class="courier-complete-msg">congrats</div>`;

  out.innerHTML = `
    <div class="trip-card">
      <div class="courier-section-label">Outbound journey</div>
      ${legHtml}
      ${doneBtn}
      </div>
    `;
}

// Init
document.getElementById("culture")?.addEventListener("change", updateAll);
document.getElementById("religion")?.addEventListener("change", updateAll);
document.getElementById("religionLevel")?.addEventListener("change", updateAll);
document.getElementById("langLevel")?.addEventListener("change", updateAll);

setDoneCount(getDoneCount());

try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
  if (saved) applyState(saved);
  } catch (_) {}

