/* Run dashboard front end: static JSON from dashboard.py, Plotly (cartesian bundle) for charts. */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const S = (i) => css("--series-" + i);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 0) => (v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const sci = (v) => (v == null ? "–" : Math.abs(v) >= 0.01 || v === 0 ? Number(v).toFixed(4) : Number(v).toExponential(1));
  const bust = () => "?t=" + Math.floor(Date.now() / 60000);
  function ago(t) {
    if (!t) return "–";
    const s = Date.now() / 1000 - t;
    if (s < 90) return "just now";
    if (s < 5400) return Math.round(s / 60) + " min ago";
    if (s < 172800) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " d ago";
  }
  const stamp = (t) => (t ? new Date(t * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");
  function chip(state, extra) {
    const st = String(state || "UNKNOWN").toUpperCase();
    return `<span class="chip st-${esc(st)}"><span class="dot"></span>${esc(st.toLowerCase().replace(/_/g, " "))}${extra ? " · " + esc(extra) : ""}</span>`;
  }
  const tag = (t) => (t ? `<span class="chip">${esc(t)}</span>` : "");

  // ----------------------------------------------------------------- Plotly helpers
  function base(extra) {
    const ax = { gridcolor: css("--grid"), zerolinecolor: css("--border"), linecolor: css("--border"), tickfont: { size: 11 }, automargin: true };
    const L = {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: css("--text-secondary"), size: 12, family: getComputedStyle(document.body).fontFamily },
      margin: { l: 52, r: 12, t: 28, b: 40 }, hovermode: "x unified",
      hoverlabel: { bgcolor: css("--surface-1"), bordercolor: css("--border"), font: { color: css("--text-primary") } },
      legend: { orientation: "h", y: 1.12, x: 0, font: { size: 11 } },
      xaxis: Object.assign({}, ax), yaxis: Object.assign({}, ax),
    };
    for (const k in extra || {}) {
      if (typeof extra[k] === "object" && !Array.isArray(extra[k]) && L[k]) L[k] = Object.assign(L[k], extra[k]);
      else L[k] = extra[k];
    }
    return L;
  }
  const CFG = { responsive: true, displaylogo: false, displayModeBar: false };
  function plot(id, traces, layout) {
    const el = document.getElementById(id);
    if (el) Plotly.newPlot(el, traces, base(layout), CFG);
  }
  const line = (x, y, name, color, o) => Object.assign({ x, y, name, type: "scatter", mode: "lines", line: { color, width: 2 }, connectgaps: false }, o || {});
  const seqScale = () => [[0, css("--surface-0")], [0.5, css("--series-4")], [1, css("--series-8")]];
  const divScale = () => [[0, css("--div-neg")], [0.5, css("--div-mid")], [1, css("--div-pos")]];

  function card(id, title, sub, body) {
    return `<section class="card" id="${id}"><h2>${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ""}${body || ""}</section>`;
  }
  const chartDiv = (id, cls) => `<div class="chart ${cls || ""}" id="${id}"></div>`;

  // ----------------------------------------------------------------- index page
  async function index() {
    let D;
    try {
      D = await (await fetch("data/index.json" + bust())).json();
    } catch (e) {
      $("#app").innerHTML = `<p class="bad">Could not load data/index.json (${esc(e)})</p>`;
      return;
    }
    $("#gen").textContent = `updated ${ago(D.generated)} (${stamp(D.generated)})` + (D.hpc12_reachable ? "" : " · hpc12 not reachable");
    const state = { filter: localStorage.getItem("dash.filter") || "active", q: "", sort: "last_update", dir: -1 };
    const now = Date.now() / 1000;
    const live = (r) => ["RUNNING", "PENDING", "EXITING"].includes(r.state) || now - r.last_update < 86400;
    const keep = (r) => {
      if (state.q && !(r.name + " " + r.drag + " " + r.concept + " " + r.host).toLowerCase().includes(state.q)) return false;
      if (state.filter === "active") return live(r);
      if (state.filter === "14d") return now - r.last_update < 14 * 86400;
      return true;
    };
    const nRun = D.runs.filter((r) => r.state === "RUNNING").length;
    const nStall = D.runs.filter((r) => r.stalled).length;
    const nQ = D.queued.filter((q) => q.state !== "RUNNING").length;
    $("#app").innerHTML =
      `<div class="tiles" style="margin-bottom:12px">
        <div class="tile"><div class="k">Running</div><div class="v">${nRun}</div><div class="s">${nStall ? `<span class="warn">⚠ ${nStall} no new iteration for a while</span>` : "all progressing"}</div></div>
        <div class="tile"><div class="k">Queued jobs</div><div class="v">${nQ}</div><div class="s">no run folder yet</div></div>
        <div class="tile"><div class="k">Runs on record</div><div class="v">${D.runs.length}</div><div class="s">Delft Blue + hpc12</div></div>
        <div class="tile"><div class="k">Best-design tolerance</div><div class="v">g ≤ ${D.feas_tol}</div><div class="s">largest constraint value</div></div>
      </div>
      <div class="controls">
        <input type="search" id="q" placeholder="Filter runs (name, VLM, rev, hpc12…)">
        <div class="seg" id="seg"><button data-f="active">Active</button><button data-f="14d">14 days</button><button data-f="all">All</button></div>
      </div>
      <div id="pairs"></div><div id="runs"></div><div id="queued"></div><div id="fail"></div>`;
    const draw = () => {
      document.querySelectorAll("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.f === state.filter));
      const runs = D.runs.filter(keep);
      const names = new Set(runs.map((r) => r.name));
      const P = D.pairs.filter((p) => names.has(p.conv) || names.has(p.rev));
      $("#pairs").innerHTML = P.length
        ? card("pairsc", "Conventional vs reversal-enabled", "Best design of each run (largest payload with g ≤ tolerance). Gap = reversal-enabled − conventional.",
            `<div class="scroll"><table><tr><th>Pair</th><th class="num">Conventional</th><th class="num">Reversal-enabled</th><th class="num">Gap [kg]</th><th class="num hide-sm">Iterations</th></tr>` +
            P.map((p) => `<tr><td>${esc(p.family)}</td>
              <td class="num"><a href="run.html?r=${encodeURIComponent(p.conv)}">${p.conv_best ? num(p.conv_best.obj) + ` <span class="muted">(it ${p.conv_best.it})</span>` : "–"}</a></td>
              <td class="num"><a href="run.html?r=${encodeURIComponent(p.rev)}">${p.rev_best ? num(p.rev_best.obj) + ` <span class="muted">(it ${p.rev_best.it})</span>` : "–"}</a></td>
              <td class="num">${p.gap == null ? "–" : (p.gap > 0 ? "+" : "") + num(p.gap)}</td>
              <td class="num hide-sm">${p.conv_it} / ${p.rev_it}</td></tr>`).join("") + `</table></div>`)
        : "";
      const col = [
        ["name", "Run"], ["state", "Status"], ["drag", "Drag"], ["concept", "Concept", "hide-sm"], ["host", "Host", "hide-sm"],
        ["it", "It.", "num"], ["best", "Best design [kg]", "num"], ["obj_last", "Latest [kg]", "num hide-sm"],
        ["maxg_last", "Max g", "num hide-sm"], ["s_per_it", "s/it.", "num hide-sm"], ["eta_h", "Left [h]", "num hide-sm"], ["last_update", "Updated", "num"],
      ];
      const val = (r, k) => (k === "best" ? (r.best ? r.best.obj : -1e99) : r[k]);
      runs.sort((a, b) => {
        const x = val(a, state.sort), y = val(b, state.sort);
        return (x > y ? 1 : x < y ? -1 : 0) * state.dir;
      });
      $("#runs").innerHTML = card("runsc", `Runs (${runs.length})`, "Tap a run for convergence, constraints, design variables and structure. Tap a column to sort.",
        `<div class="scroll"><table><tr>${col.map((c) => `<th class="${c[2] || ""}" data-k="${c[0]}">${c[1]}${state.sort === c[0] ? (state.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr>` +
        runs.map((r) => `<tr class="click" data-r="${esc(r.name)}">
          <td>${esc(r.name.replace(/_\d{8}_\d{6}_(job|pbs)\d+$/, ""))} <span class="muted mono">${esc(r.jobid)}</span>${r.sized ? " " + tag("sized") : ""}</td>
          <td>${chip(r.state)}${r.stalled ? ' <span class="warn" title="no new iteration for more than 3 iteration times">⚠ stalled?</span>' : ""}</td>
          <td>${esc(r.drag)}</td><td class="hide-sm">${esc(r.concept)}</td><td class="hide-sm">${esc(r.host)}</td>
          <td class="num">${r.it}${r.maxit ? `<span class="muted">/${r.maxit}</span>` : ""}</td>
          <td class="num">${r.best ? num(r.best.obj) + ` <span class="muted">(${r.best.it})</span>` : "–"}</td>
          <td class="num hide-sm">${num(r.obj_last)}</td>
          <td class="num hide-sm ${r.maxg_last > r.feas_tol ? "warn" : ""}">${sci(r.maxg_last)}</td>
          <td class="num hide-sm">${num(r.s_per_it)}</td><td class="num hide-sm">${num(r.eta_h, 1)}</td>
          <td class="num">${ago(r.last_update)}</td></tr>`).join("") + `</table></div>`);
      document.querySelectorAll("#runs th").forEach((th) => th.addEventListener("click", () => {
        const k = th.dataset.k;
        state.dir = state.sort === k ? -state.dir : -1;
        state.sort = k;
        draw();
      }));
      document.querySelectorAll("#runs tr.click").forEach((tr) => tr.addEventListener("click", () => (location.href = "run.html?r=" + encodeURIComponent(tr.dataset.r))));
      const Q = D.queued.filter((q) => !state.q || (q.name || "").toLowerCase().includes(state.q));
      $("#queued").innerHTML = Q.length
        ? card("qc", `Jobs without a run folder (${Q.length})`, "Queued, or running but not yet past start-up.",
            `<div class="scroll"><table><tr><th>Job</th><th>Name</th><th>Host</th><th>Status</th><th class="hide-sm">Reason / elapsed</th></tr>` +
            Q.map((q) => `<tr><td class="mono">${esc(q.jobid)}</td><td>${esc(q.name)}</td><td>${esc(q.host)}</td><td>${chip(q.state)}</td><td class="hide-sm">${esc(q.reason || q.elapsed || "")}</td></tr>`).join("") + `</table></div>`)
        : "";
      $("#fail").innerHTML = D.failures.length
        ? card("fc", "Runs the collector could not read", "", `<table>${D.failures.map((f) => `<tr><td>${esc(f.name)}</td><td class="mono">${esc(f.error)}</td></tr>`).join("")}</table>`)
        : "";
    };
    $("#q").addEventListener("input", (e) => { state.q = e.target.value.toLowerCase(); draw(); });
    $("#seg").addEventListener("click", (e) => {
      if (!e.target.dataset.f) return;
      state.filter = e.target.dataset.f;
      localStorage.setItem("dash.filter", state.filter);
      draw();
    });
    D.runs.forEach((r) => (r.feas_tol = D.feas_tol));
    draw();
  }

  // ----------------------------------------------------------------- run page
  async function run() {
    const name = new URLSearchParams(location.search).get("r");
    let D, I;
    try {
      [D, I] = await Promise.all([
        fetch("data/runs/" + encodeURIComponent(name) + ".json" + bust()).then((r) => r.json()),
        fetch("data/index.json" + bust()).then((r) => r.json()),
      ]);
    } catch (e) {
      $("#app").innerHTML = `<p class="bad">Could not load run ${esc(name)} (${esc(e)})</p>`;
      return;
    }
    const s = D.summary, h = D.hist;
    document.title = s.family;
    $("#title").textContent = s.family;
    $("#gen").textContent = `data ${ago(I.generated)}`;
    const pair = I.pairs.find((p) => p.conv === s.name || p.rev === s.name);
    const other = pair ? (pair.conv === s.name ? pair.rev : pair.conv) : null;
    const best = s.best, objName = s.objective;
    const sections = [];
    sections.push(`<section class="card">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${chip(s.state, s.stop_reason)}${s.stalled ? '<span class="chip warn">⚠ no new iteration for a while</span>' : ""}${tag(s.drag)}${tag(s.concept)}${tag(s.host + " " + s.jobid)}${s.sized ? tag("sized layout") : tag("frozen layout")}</div>
      <div class="tiles">
        <div class="tile"><div class="k">Best design (g ≤ ${D.feas_tol})</div><div class="v">${best ? num(best.obj) : "–"}</div><div class="s">${best ? `iteration ${best.it}, max g ${sci(best.maxg)}` : "no iterate within tolerance yet"}</div></div>
        <div class="tile"><div class="k">Latest iterate</div><div class="v">${num(s.obj_last)}</div><div class="s">iteration ${s.it}${s.maxit ? " of " + s.maxit : ""}, max g ${sci(s.maxg_last)}</div></div>
        <div class="tile"><div class="k">Strictly feasible best (g ≤ 0)</div><div class="v">${s.best_strict ? num(s.best_strict.obj) : "–"}</div><div class="s">${s.best_strict ? "iteration " + s.best_strict.it : ""}</div></div>
        <div class="tile"><div class="k">Time per iteration</div><div class="v">${s.s_per_it ? num(s.s_per_it / 60, 1) + " min" : "–"}</div><div class="s">${s.eta_h != null ? `≈ ${num(s.eta_h, 1)} h to go` : "median of last 10"}</div></div>
        ${pair ? `<div class="tile"><div class="k">Pair gap (rev − conv)</div><div class="v">${pair.gap == null ? "–" : (pair.gap > 0 ? "+" : "") + num(pair.gap) + " kg"}</div><div class="s"><a href="run.html?r=${encodeURIComponent(other)}">open the ${pair.conv === s.name ? "reversal-enabled" : "conventional"} run</a></div></div>` : ""}
      </div>
      <details style="margin-top:8px"><summary>Run details</summary><div class="note mono">${esc(s.path)}<br>workbook ${esc(s.workbook)} · profile ${esc(s.profile)}<br>started ${stamp(s.started)} · last iteration ${stamp(s.last_update)} (${ago(s.last_update)})</div></details>
    </section>`);

    // convergence
    sections.push(card("conv", "Convergence", `${esc(objName)} per iteration with the best design marked; constraint values g ≤ 0 are feasible.`,
      `<div class="grid2">${chartDiv("c_obj")}${chartDiv("c_g")}${chartDiv("c_n")}${chartDiv("c_t")}</div>`));
    if (h.drag || h.mass_struct) {
      const exact = !!h.dP_exact;
      sections.push(card("drivers", "What drives the payload", exact
        ? "Payload = MTOW − OEW − fuel at fixed MTOW and range. OEW moves with the full-wing mass (structure and control surfaces), fuel with drag through the Breguet range equation."
        : "Wing drag per iteration and the payload change it causes (first order: Σ ½(∂P/∂D<sub>k</sub>+∂P/∂D<sub>k+1</sub>)ΔD). The rest of the payload change is mass (and lift). Masses and fuel per iteration are recorded for runs started after 5 Nov 2026.",
        `<div class="grid2">${h.dP_drag || h.dP_exact ? chartDiv("c_dP") : ""}${h.drag ? chartDiv("c_drag") : ""}${h.mass_struct ? chartDiv("c_ms") : ""}${h.mass_cs ? chartDiv("c_mcs") : ""}${h.fuel ? chartDiv("c_fuel") : ""}${h.ld ? chartDiv("c_ld") : ""}</div>`));
    }
    if (h.gmax) sections.push(card("ctype", "Constraint groups over the iterations", "Largest g of each constraint type (all load cases). Dark = active or violated.", chartDiv("c_types", "tall")));
    if (D.cgrid) sections.push(card("cgrid", "Where the constraints bite", `Largest g per constraint type and load case, and per laminate, at the ${D.critical.best ? "best design (it " + best.it + ")" : "latest iterate"}.`,
      `${chartDiv("c_grid", "tall")}<div class="grid2" id="lamc"></div>`));
    if (D.critical) sections.push(card("crit", "Critical constraints", "The 25 largest constraint values.",
      `<div class="seg" id="critseg" style="margin-bottom:8px">${D.critical.best ? '<button data-w="best" class="on">Best design</button>' : ""}<button data-w="latest" ${D.critical.best ? "" : 'class="on"'}>Latest</button></div><div class="scroll" id="crittab"></div>`));
    if (D.drivers) sections.push(card("drv", "What moved the payload", `First-order payload change per design variable, summed along the iterations (Σ ½(∇f<sub>k</sub>+∇f<sub>k+1</sub>)·Δx). Total ${num(D.drivers.sum)} kg against ${num(h.obj[h.obj.length - 1] - h.obj[0])} kg actual.`,
      `<div class="grid2">${chartDiv("c_fam")}<div class="scroll" id="drvtab"></div></div>`));
    if (D.movers || D.bounds) sections.push(card("mov", "Recent moves and bounds", "", `<div class="grid2"><div class="scroll" id="movtab"></div><div class="scroll" id="bndtab"></div></div>`));
    if (D.laminates) sections.push(card("lam", "Laminates", "Normalised design variables (−1…1) per laminate: thickness at the first, best and latest iterates, and the lamination parameters of the best design.",
      `<div class="grid3" id="lamt"></div><div class="grid3" id="lamp"></div>`));
    if (D.structure) sections.push(card("struct", "Laminate thickness and stiffness", "As PlotComponentStiffnessThickness: elements coloured by laminate thickness, rosettes of the in-plane (A) and out-of-plane (D) stiffness E<sub>11</sub>(θ) per laminate. Δ modes compare with the first iterate (thickness only).",
      `<div class="seg" id="stseg" style="margin-bottom:8px"></div><div id="stc"></div>`));
    if (D.twist || D.laf) sections.push(card("aero", "Jig twist and control-surface deflections", D.phys
      ? `Jig twist from the design variables: clamped B-spline of degree ${D.phys.twist ? D.phys.twist.degree : "–"} over η = y/y<sub>tip</sub>, root control point fixed at 0 (on top of the workbook geometry; bounds ±${D.phys.twist ? num(D.phys.twist.bound_deg, 0) : "–"}°). Load-alleviation deflections per load case, dotted lines = bounds.`
      : "Normalised design variables (−1…1, ±1 = bound): no structure export for this workbook yet.",
      `<div class="grid2">${D.twist ? chartDiv("c_tw") : ""}${D.laf ? chartDiv("c_laf") : ""}</div>`));
    if (D.layout) sections.push(card("lay", "Control-surface layout (sizing)", "Layout design variables over the iterations (normalised).", chartDiv("c_lay", "tall")));
    if (D.snap) sections.push(card("snap", "Loads and roll (gateway snapshots)", "", `<div class="grid2" id="snapc"></div>`));
    else sections.push(card("snap0", "Loads and roll", '<span class="muted">Lift distributions, physical deflections and roll rates appear here for runs whose gateway writes the light per-iteration snapshots (phase 2).</span>'));
    $("#app").innerHTML = sections.join("");

    // ---- charts
    const it = h.it;
    const mark = (k, label, color, sym) => {
      if (!k) return null;
      const j = it.indexOf(k.it);
      return { x: [k.it], y: [h.obj[j]], name: label, type: "scatter", mode: "markers", marker: { size: 11, color, symbol: sym, line: { color: css("--surface-1"), width: 2 } } };
    };
    plot("c_obj", [line(it, h.obj, objName, S(1)), mark(best, "best design", S(2), "star"), mark(s.best_strict, "best with g ≤ 0", S(3), "diamond")].filter(Boolean),
      { title: { text: objName, font: { size: 13 }, x: 0 }, xaxis: { title: "iteration" } });
    const tolShapes = [0, D.feas_tol].map((v, i) => ({ type: "line", xref: "paper", x0: 0, x1: 1, y0: v, y1: v, line: { color: css(i ? "--warning" : "--text-muted"), width: 1, dash: i ? "dot" : "dash" } }));
    plot("c_g", [line(it, h.maxg, "max g", S(1))], { title: { text: "Largest constraint value g", font: { size: 13 }, x: 0 }, xaxis: { title: "iteration" }, shapes: tolShapes, showlegend: false,
      annotations: [{ xref: "paper", x: 1, y: D.feas_tol, text: "tolerance", showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 10, color: css("--warning") } }] });
    if (h.nact) plot("c_n", [line(it, h.nact, "active (g > −0.001)", S(1)), line(it, h.nvio, "violated (g > 0)", S(2))], { title: { text: "Number of constraints", font: { size: 13 }, x: 0 }, xaxis: { title: "iteration" } });
    else plot("c_n", [line(it, h.kkt, "KKT residual", S(1))], { title: { text: "KKT residual", font: { size: 13 }, x: 0 }, yaxis: { type: "log" } });
    const tr = [];
    if (h.dt) tr.push(line(it, h.dt.map((v) => (v == null ? null : v / 60)), "iteration", S(1), { mode: "lines+markers", marker: { size: 4 } }));
    if (h.sub_s && h.sub_s.some((v) => v != null)) tr.push(line(it, h.sub_s.map((v) => (v == null ? null : v / 60)), "MMA subproblem", S(2)));
    plot("c_t", tr, { title: { text: "Wall clock [min]", font: { size: 13 }, x: 0 }, xaxis: { title: "iteration" }, yaxis: { rangemode: "tozero" } });

    if (h.drag || h.mass_struct) {
      const T = (t) => ({ text: t, font: { size: 13 }, x: 0 });
      if (h.dP_exact) {
        const E = h.dP_exact, keys = Object.keys(E).filter((k) => E[k].some((v) => v));
        plot("c_dP", [line(it, h.obj.map((o) => o - h.obj[0]), "payload change", css("--text-primary"), { line: { color: css("--text-primary"), width: 2, dash: "dot" } }),
          ...keys.map((k, i) => line(it, E[k], k, S(i + 1)))], { title: T("Payload change by driver [kg]"), xaxis: { title: "iteration" } });
      } else if (h.dP_drag) {
        plot("c_dP", [line(it, h.obj.map((o) => o - h.obj[0]), "payload change", css("--text-primary"), { line: { color: css("--text-primary"), width: 2, dash: "dot" } }),
          line(it, h.dP_drag, "from drag (first order)", S(1)), line(it, h.dP_rest, "rest: mass (and lift)", S(2))], { title: T("Payload change by driver [kg]"), xaxis: { title: "iteration" } });
      }
      if (h.drag) plot("c_drag", [line(it, h.drag, "wing drag", S(1))], { title: T(`Wing drag [N] (${s.drag})`), xaxis: { title: "iteration" }, showlegend: false });
      if (h.mass_struct) plot("c_ms", [line(it, h.mass_struct, "structure", S(1))], { title: T("Wing structural mass, full wing [kg]"), xaxis: { title: "iteration" }, showlegend: false });
      if (h.mass_cs) plot("c_mcs", [line(it, h.mass_cs, "control surfaces", S(1))], { title: T("Control-surface mass, full wing [kg]"), xaxis: { title: "iteration" }, showlegend: false });
      if (h.fuel) plot("c_fuel", [line(it, h.fuel, "fuel", S(1))], { title: T("Mission fuel incl. reserve [kg]"), xaxis: { title: "iteration" }, showlegend: false });
      if (h.ld) plot("c_ld", [line(it, h.ld, "L/D", S(1))], { title: T("Aircraft L/D"), xaxis: { title: "iteration" }, showlegend: false });
    }
    if (h.gmax) {
      const types = Object.keys(h.gmax);
      const z = types.map((t) => h.gmax[t].map((v) => (v == null ? null : Math.max(-0.5, Math.min(0.05, v)))));
      const txt = types.map((t) => h.gmax[t].map((v) => (v == null ? "" : sci(v))));
      plot("c_types", [{ type: "heatmap", x: it, y: types, z, text: txt, zmin: -0.5, zmax: 0.05, colorscale: seqScale(), xgap: 1, ygap: 2,
        hovertemplate: "%{y}<br>iteration %{x}: g = %{text}<extra></extra>", colorbar: { title: { text: "g", side: "right" }, thickness: 10, tickvals: [-0.5, -0.25, 0], len: 0.9 } }],
        { hovermode: "closest", margin: { l: 170, r: 10, t: 10, b: 40 }, xaxis: { title: "iteration" }, yaxis: { autorange: "reversed" } });
    }
    if (D.cgrid) {
      const g = D.cgrid, w = D.cgrid.best ? "best" : "latest";
      const Z = g[w];
      plot("c_grid", [{ type: "heatmap", x: g.lcs.map((l) => (l ? "LC" + l : "all")), y: g.types,
        z: Z.map((r) => r.map((v) => (v == null ? null : Math.max(-0.5, Math.min(0.05, v))))), text: Z.map((r) => r.map((v) => (v == null ? "" : sci(v)))),
        zmin: -0.5, zmax: 0.05, colorscale: seqScale(), xgap: 2, ygap: 2, texttemplate: "%{text}", textfont: { size: 10 },
        hovertemplate: "%{y}, %{x}: g = %{text}<extra></extra>", showscale: false }],
        { hovermode: "closest", margin: { l: 170, r: 10, t: 10, b: 30 }, yaxis: { autorange: "reversed" } });
      const per = g[w + "_lam"] || {};
      const lamc = $("#lamc");
      Object.keys(per).forEach((t, i) => {
        const id = "c_lam" + i;
        lamc.insertAdjacentHTML("beforeend", chartDiv(id));
        const comps = [[0.5, 20.5, "top skin"], [20.5, 40.5, "bottom skin"], [40.5, 60.5, "spars"]].filter((c) => per[t].lam.some((l) => l > c[0] && l < c[1]));
        plot(id, [{ type: "bar", x: per[t].lam, y: per[t].g.map((v) => Math.max(v, -1.5)), marker: { color: per[t].g.map((v) => (v > -0.001 ? S(8) : S(1))) }, name: t,
          hovertemplate: "laminate %{x}: g = %{y:.4f}<extra></extra>" }],
          { title: { text: `${t}: largest g per laminate`, font: { size: 13 }, x: 0 }, showlegend: false, hovermode: "closest", xaxis: { title: "laminate (1–20 top skin, 21–40 bottom skin, 41–60 spars)" },
            shapes: comps.slice(1).map((c) => ({ type: "line", x0: c[0], x1: c[0], yref: "paper", y0: 0, y1: 1, line: { color: css("--border"), width: 1 } })) });
      });
    }
    if (D.critical) {
      const drawCrit = (w) => {
        const L = D.critical[w] || [];
        $("#crittab").innerHTML = `<table><tr><th>Constraint</th><th class="num">g</th></tr>${L.map((c) => `<tr><td>${esc(c.label)}</td><td class="num ${c.g > 0 ? "warn" : ""}">${sci(c.g)}</td></tr>`).join("")}</table>`;
        document.querySelectorAll("#critseg button").forEach((b) => b.classList.toggle("on", b.dataset.w === w));
      };
      drawCrit(D.critical.best ? "best" : "latest");
      $("#critseg").addEventListener("click", (e) => e.target.dataset.w && drawCrit(e.target.dataset.w));
    }
    if (D.drivers) {
      const F = D.drivers.family.slice().reverse();
      plot("c_fam", [{ type: "bar", orientation: "h", y: F.map((f) => f.family), x: F.map((f) => f.kg), marker: { color: F.map((f) => (f.kg >= 0 ? css("--div-neg") : css("--div-pos"))) },
        hovertemplate: "%{y}: %{x:.0f} kg<extra></extra>" }], { hovermode: "closest", showlegend: false, margin: { l: 210, r: 10, t: 10, b: 40 }, xaxis: { title: "payload change [kg]" } });
      $("#drvtab").innerHTML = `<table><tr><th>Design variable</th><th class="num">kg</th><th class="num">x now</th></tr>${D.drivers.top.map((d) => `<tr><td>${esc(d.label)}</td><td class="num">${num(d.kg, 1)}</td><td class="num">${num(d.x, 3)}</td></tr>`).join("")}</table>`;
    }
    if (D.movers) $("#movtab").innerHTML = `<table><tr><th>Moved most, it ${D.movers.from}→${D.movers.to}</th><th class="num">Δx</th><th class="num">x</th></tr>${D.movers.top.map((d) => `<tr><td>${esc(d.label)}</td><td class="num">${num(d.dx, 4)}</td><td class="num">${num(d.x, 3)}</td></tr>`).join("")}</table>`;
    if (D.bounds) {
      const B = Object.entries(D.bounds);
      $("#bndtab").innerHTML = B.length ? `<table><tr><th>At a bound (${best ? "best design" : "latest"})</th><th class="num">lower</th><th class="num">upper</th></tr>${B.map(([f, b]) => `<tr><td title="${esc(b.examples.join(", "))}">${esc(f)}<div class="muted" style="white-space:normal;font-size:11px">${esc(b.examples.join(", "))}</div></td><td class="num">${b.lower}</td><td class="num">${b.upper}</td></tr>`).join("")}</table>` : '<p class="muted">No design variable at a bound.</p>';
    }
    if (D.laminates) {
      const W = [["first", "first", S(3), "dot"], ["best", "best design", S(1), "solid"], ["latest", "latest", S(2), "solid"]];
      const pars = ["V1A", "V2A", "V3A", "V4A", "V1D", "V2D", "V3D", "V4D"];
      Object.entries(D.laminates).forEach(([comp, L], i) => {
        $("#lamt").insertAdjacentHTML("beforeend", chartDiv("c_lt" + i));
        $("#lamp").insertAdjacentHTML("beforeend", chartDiv("c_lp" + i));
        const t = L.par.t || {};
        plot("c_lt" + i, W.filter((w) => t[w[0]]).map((w) => line(L.lam, t[w[0]], w[1], w[2], { line: { color: w[2], width: 2, dash: w[3] } })),
          { title: { text: `${comp}: thickness`, font: { size: 13 }, x: 0 }, xaxis: { title: "laminate", dtick: 2 }, yaxis: { range: [-1.05, 1.05] } });
        const w = L.par.V1A && L.par.V1A.best ? "best" : "latest";
        const P = pars.filter((p) => L.par[p]);
        if (P.length) plot("c_lp" + i, [{ type: "heatmap", x: L.lam, y: P, z: P.map((p) => L.par[p][w]), zmin: -1, zmax: 1, colorscale: divScale(), xgap: 1, ygap: 1,
          hovertemplate: "laminate %{x}, %{y} = %{z:.3f}<extra></extra>", colorbar: { thickness: 10, len: 0.9 } }],
          { title: { text: `${comp}: lamination parameters (${w})`, font: { size: 13 }, x: 0 }, hovermode: "closest", yaxis: { autorange: "reversed" }, xaxis: { dtick: 2 } });
      });
    }
    const PT = D.phys && D.phys.twist, PL = D.phys && D.phys.laf;
    if (PT) {
      const W = [["first", "first", S(3), "dot"], ["best", "best design", S(1), "solid"], ["latest", "latest", S(2), "solid"]].filter((w) => PT[w[0]]);
      const tr = [];
      W.forEach((w) => {
        tr.push(line(PT.eta, PT[w[0]].curve, w[1], w[2], { line: { color: w[2], width: 2, dash: w[3] }, legendgroup: w[0], hovertemplate: "η %{x:.2f}: %{y:.2f}°<extra>" + w[1] + "</extra>" }));
        tr.push({ type: "scatter", mode: "lines+markers", x: PT.cp_eta, y: PT[w[0]].cp, name: w[1] + " control points", legendgroup: w[0], showlegend: false,
          line: { color: w[2], width: 1, dash: "dot" }, marker: { size: 8, color: w[2], symbol: "square", line: { color: css("--surface-1"), width: 1.5 } },
          hovertemplate: "control point η %{x:.2f}: %{y:.2f}°<extra>" + w[1] + "</extra>" });
      });
      plot("c_tw", tr, { title: { text: "Jig twist [deg] (squares: control points)", font: { size: 13 }, x: 0 }, hovermode: "closest", xaxis: { title: "η = y / y<sub>tip</sub>", range: [0, 1.02] } });
    } else if (D.twist) {
      const W = [["first", "first", S(3), "dot"], ["best", "best design", S(1), "solid"], ["latest", "latest", S(2), "solid"]];
      plot("c_tw", W.filter((w) => D.twist[w[0]]).map((w) => line(D.twist.eta, D.twist[w[0]], w[1], w[2], { mode: "lines+markers", marker: { size: 8 }, line: { color: w[2], width: 2, dash: w[3] } })),
        { title: { text: "Twist B-spline control points", font: { size: 13 }, x: 0 }, xaxis: { title: "η (span fraction)" } });
    }
    if (PL) {
      const w = PL.best ? "best" : "latest";
      const bmax = Math.max(...PL.bound_deg);
      plot("c_laf", PL.cs.map((c, i) => ({ type: "bar", name: "CS" + c, x: PL.lc.map((l) => "LC" + l), y: PL[w][i], marker: { color: S(i + 1) },
        hovertemplate: "CS" + c + ", %{x}: %{y:.2f}°<extra></extra>" })),
        { title: { text: `Load-alleviation deflections [deg] (${w === "best" ? "best design" : "latest"})`, font: { size: 13 }, x: 0 }, barmode: "group", bargap: 0.25, bargroupgap: 0.08,
          hovermode: "closest", yaxis: { range: [-1.08 * bmax, 1.08 * bmax] },
          shapes: [...new Set(PL.bound_deg)].flatMap((b) => [b, -b]).map((b) => ({ type: "line", xref: "paper", x0: 0, x1: 1, y0: b, y1: b, line: { color: css("--text-muted"), width: 1, dash: "dot" } })) });
    } else if (D.laf) {
      const w = D.laf.best ? "best" : "latest";
      plot("c_laf", D.laf.cs.map((c, i) => ({ type: "bar", name: "CS" + c, x: D.laf.lc.map((l) => "LC" + l), y: D.laf[w][i], marker: { color: S(i + 1) } })),
        { title: { text: `Load-alleviation deflections (${w === "best" ? "best design" : "latest"})`, font: { size: 13 }, x: 0 }, barmode: "group", bargap: 0.25, bargroupgap: 0.08, yaxis: { range: [-1.05, 1.05] } });
    }
    if (D.layout) {
      const hx = D.layout.hist, keys = Object.keys(hx).slice(0, 8);
      plot("c_lay", keys.map((k, i) => line(it.slice(0, hx[k].length), hx[k], k.replace("CS layout, ", ""), S(i + 1))), { title: { text: "Layout design variables", font: { size: 13 }, x: 0 }, xaxis: { title: "iteration" } });
    }
    if (D.snap) snapshots(D);
    if (D.structure) structure(D).catch((e) => ($("#stc").innerHTML = `<p class="bad">${esc(e)}</p>`));
  }

  // ----------------------------------------------------------------- laminate thickness + stiffness rosettes
  // Port of lam_param/dADcalc.m and evalstiffness (stiffness per unit thickness from lamination parameters).
  function dAD(E1, E2, nu12, G12, lp) {
    const nu21 = (nu12 / E1) * E2, Dn = 1 / (1 - nu12 * nu21);
    const Q11 = E1 * Dn, Q22 = E2 * Dn, Q12 = nu12 * E2 * Dn, Q66 = G12;
    const U1 = (3 * Q11 + 3 * Q22 + 2 * Q12 + 4 * Q66) / 8, U2 = (Q11 - Q22) / 2, U3 = (Q11 + Q22 - 2 * Q12 - 4 * Q66) / 8;
    const U4 = (Q11 + Q22 + 6 * Q12 - 4 * Q66) / 8, U5 = (Q11 + Q22 - 2 * Q12 + 4 * Q66) / 8;
    const C0 = [[U1, U4, 0], [U4, U1, 0], [0, 0, U5]], C1 = [[U2, 0, 0], [0, -U2, 0], [0, 0, 0]];
    const C2 = [[0, 0, U2 / 2], [0, 0, U2 / 2], [U2 / 2, U2 / 2, 0]], C3 = [[U3, -U3, 0], [-U3, U3, 0], [0, 0, -U3]];
    const C4 = [[0, 0, U3], [0, 0, -U3], [U3, -U3, 0]];
    const mk = (o) => C0.map((r, i) => r.map((c0, j) => c0 + lp[o] * C1[i][j] + lp[o + 1] * C2[i][j] + lp[o + 2] * C3[i][j] + lp[o + 3] * C4[i][j]));
    return [mk(0), mk(4)];
  }
  function inv3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  function evalE(a, th) {
    const c = Math.cos(th), s = Math.sin(th);
    const T = [[c * c, s * s, c * s], [s * s, c * c, -c * s], [-2 * c * s, 2 * c * s, c * c - s * s]];
    // (T a T')_11 = sum_jk T1j a_jk T1k
    let v = 0;
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) v += T[0][j] * a[j][k] * T[0][k];
    return 1 / v;
  }
  const THETA = Array.from({ length: 161 }, (_, k) => (k * Math.PI) / 80);
  function rosette(S, L, lp) {        // L 0-based; returns {A:{h,v}, D:{h,v}, axis:[[h,h],[v,v]]}
    const comp = S.comp[L], corr = S.skin_corr[comp - 1], shift = (S.orient_shift_deg[L] * Math.PI) / 180;
    const [A, Dm] = dAD(S.mat.E11[L], S.mat.E22[L], S.mat.nu12[L], S.mat.G12[L], lp);
    const [ch, cv] = S.centre[L], k = S.rosette_c / S.maxE11;
    const out = {};
    [["A", inv3(A)], ["D", inv3(Dm)]].forEach(([n, a]) => {
      const h = [], v = [];
      THETA.forEach((t) => { const E = evalE(a, t), tt = (t - shift) * corr; h.push(ch + k * E * Math.cos(tt)); v.push(cv - k * E * Math.sin(tt)); });
      out[n] = { h, v };
    });
    let best = -1, bi = 0, bj = 0;
    const H = out.A.h, V = out.A.v;
    for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) {
      const d = (H[i] - H[j]) ** 2 + (V[i] - V[j]) ** 2;
      if (d > best) { best = d; bi = i; bj = j; }
    }
    out.axis = [[H[bi], H[bj]], [V[bi], V[bj]]];
    return out;
  }
  function rampColor(stops, u) {
    u = Math.max(0, Math.min(1, isFinite(u) ? u : 0));
    const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    for (let i = 1; i < stops.length; i++) if (u <= stops[i][0]) {
      const [u0, c0] = stops[i - 1], [u1, c1] = stops[i], f = (u - u0) / (u1 - u0 || 1);
      const a = hex(c0), b = hex(c1);
      return "#" + a.map((x, j) => Math.round(x + (b[j] - x) * f).toString(16).padStart(2, "0")).join("");
    }
    return stops[stops.length - 1][1];
  }
  async function structure(D) {
    const S = await (await fetch("data/structure/" + encodeURIComponent(D.structure.key) + ".json" + bust())).json();
    const des = D.structure.designs;
    const modes = [["best", "Best design"], ["latest", "Latest"], ["first", "First"], ["dmm", "Δ best − first [mm]"], ["dpc", "Δ best − first [%]"]]
      .filter(([m]) => (m.startsWith("d") ? des.first && (des.best || des.latest) : des[m]));
    let mode = modes[0][0];
    const seg = $("#stseg");
    seg.innerHTML = modes.map(([m, l]) => `<button data-m="${m}">${l}</button>`).join("");
    const box = $("#stc");
    box.innerHTML = S.comp_names.map((n, i) => chartDiv("c_st" + i)).join("");
    const draw = () => {
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
      const ref = des.best || des.latest;
      const delta = mode === "dmm" || mode === "dpc";
      const dz = delta ? null : des[mode];
      const val = (L) => {
        if (!delta) return dz.t_mm[L];
        const a = ref.t_mm[L], b = des.first.t_mm[L];
        return mode === "dmm" ? a - b : (100 * (a - b)) / Math.max(b, 1e-6);
      };
      const vals = Array.from({ length: S.nlam }, (_, L) => val(L)).filter((v) => isFinite(v));
      let lo = Math.min(...vals), hi = Math.max(...vals);
      let stops;
      if (delta) { const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1; lo = -m; hi = m; stops = [[0, css("--div-neg")], [0.5, css("--div-mid")], [1, css("--div-pos")]]; }
      else stops = [[0, "#f2f6fc"], [0.5, "#9cc2f0"], [1, css("--series-1")]];
      const unit = mode === "dpc" ? "%" : "mm";
      S.comp_names.forEach((name, ci) => {
        const comp = ci + 1;
        const shapes = S.quads.filter((q) => q.comp === comp).map((q) => {
          const col = rampColor(stops, (val(q.lam - 1) - lo) / (hi - lo || 1));
          return { type: "path", path: "M" + q.h.map((h, k) => `${h},${q.v[k]}`).join("L") + "Z", fillcolor: col, line: { color: col, width: 0.5 }, layer: "below" };
        });
        const lams = [];
        for (let L = 0; L < S.nlam; L++) if (S.comp[L] === comp && S.centre[L] && S.centre[L][0] != null) lams.push(L);
        const traces = [{
          type: "scatter", mode: "markers", x: lams.map((L) => S.centre[L][0]), y: lams.map((L) => S.centre[L][1]),
          marker: { size: 16, opacity: 0, color: [lo, hi], cmin: lo, cmax: hi, colorscale: stops, showscale: ci === 0,
            colorbar: { title: { text: unit, side: "top" }, thickness: 10, len: 0.9 } },
          text: lams.map((L) => `laminate ${L + 1}: ${num(val(L), mode === "dpc" ? 1 : 2)} ${unit}`), hovertemplate: "%{text}<extra></extra>", showlegend: false,
        }];
        if (!delta) {
          const acc = { A: { h: [], v: [] }, D: { h: [], v: [] }, X: { h: [], v: [] } };
          lams.forEach((L) => {
            const lp = dz.lp[L];
            if (!lp || lp.some((v) => v == null)) return;
            const r = rosette(S, L, lp);
            acc.A.h.push(...r.A.h, null); acc.A.v.push(...r.A.v, null);
            acc.D.h.push(...r.D.h, null); acc.D.v.push(...r.D.v, null);
            acc.X.h.push(...r.axis[0], null); acc.X.v.push(...r.axis[1], null);
          });
          traces.push({ type: "scatter", mode: "lines", x: acc.A.h, y: acc.A.v, name: "In-plane", line: { color: css("--text-primary"), width: 1.5 }, hoverinfo: "skip", showlegend: ci === 0 });
          traces.push({ type: "scatter", mode: "lines", x: acc.X.h, y: acc.X.v, name: "In-plane axis", line: { color: css("--text-primary"), width: 1.5 }, hoverinfo: "skip", showlegend: false });
          traces.push({ type: "scatter", mode: "lines", x: acc.D.h, y: acc.D.v, name: "Out-of-plane", line: { color: css("--series-8"), width: 1.5 }, hoverinfo: "skip", showlegend: ci === 0 });
        }
        // panel height from the component's aspect ratio (equal axes), so the planform fills the width
        const qs = S.quads.filter((q) => q.comp === comp), vs = qs.flatMap((q) => q.v);
        const el = document.getElementById("c_st" + ci), w = (el && el.clientWidth) || 800;
        const vr = (Math.max(...vs) - Math.min(...vs)) || 1, hr = (S.span_limits[1] - S.span_limits[0]) || 1;
        const height = Math.round(Math.max(170, Math.min(520, (w - 20) * (vr / hr) * 1.25 + 70)));
        if (el) el.style.height = height + "px";
        plot("c_st" + ci, traces, {
          height, title: { text: name, font: { size: 13 }, x: 0 }, hovermode: "closest", shapes, margin: { l: 10, r: 10, t: 30, b: 10 },
          xaxis: { range: S.span_limits, visible: false }, yaxis: { scaleanchor: "x", visible: false },
          legend: { orientation: "h", y: 1.12, x: 0.35 },
        });
      });
    };
    seg.addEventListener("click", (e) => { if (e.target.dataset.m) { mode = e.target.dataset.m; draw(); } });
    draw();
  }

  // phase 2: light gateway snapshots (schema in README.md)
  function snapshots(D) {
    const sn = D.snap, wrap = $("#snapc");
    const w = sn.best ? "best" : "latest", S0 = sn[w];
    const lcs = (S0.loadcases || []).slice(0, 8);
    let n = 0;
    const add = (fn) => { const id = "c_sn" + n++; wrap.insertAdjacentHTML("beforeend", chartDiv(id)); fn(id); };
    const field = (key, title, ylab) => {
      if (!lcs.some((l) => l[key])) return;
      add((id) => plot(id, lcs.filter((l) => l[key]).map((l, i) => line(l.y, l[key], l.name || "LC" + l.lc, S(i + 1))),
        { title: { text: `${title} (${w === "best" ? "best design" : "latest"}, it ${S0.iteration})`, font: { size: 13 }, x: 0 }, xaxis: { title: "spanwise y [m]" }, yaxis: { title: ylab } }));
    };
    field("lift_per_span", "Lift distribution", "N/m");
    field("cl", "Local lift coefficient", "c_l");
    field("twist_deg", "Elastic twist", "deg");
    field("defl_m", "Vertical deflection", "m");
    if (lcs.some((l) => l.roll_eta)) {
      const ncs = Math.max(...lcs.map((l) => (l.roll_eta || []).length));
      add((id) => plot(id, Array.from({ length: ncs }, (_, c) => ({ type: "bar", name: "CS" + (c + 1), x: lcs.map((l) => l.name || "LC" + l.lc), y: lcs.map((l) => (l.roll_eta || [])[c]), marker: { color: S(c + 1) } })),
        { title: { text: "Control-surface effectiveness η", font: { size: 13 }, x: 0 }, barmode: "group", bargap: 0.25 }));
    }
    if (lcs.some((l) => l.laf_deg)) {
      const ncs = Math.max(...lcs.map((l) => (l.laf_deg || []).length));
      add((id) => plot(id, Array.from({ length: ncs }, (_, c) => ({ type: "bar", name: "CS" + (c + 1), x: lcs.map((l) => l.name || "LC" + l.lc), y: lcs.map((l) => (l.laf_deg || [])[c]), marker: { color: S(c + 1) } })),
        { title: { text: "Load-alleviation deflection [deg]", font: { size: 13 }, x: 0 }, barmode: "group", bargap: 0.25 }));
    }
    const H = D.snap_hist || {};
    const rr = Object.keys(H).filter((k) => k.startsWith("roll_rate_degs|")).slice(0, 8);
    if (rr.length) add((id) => plot(id, rr.map((k, i) => line(H.it, H[k], k.split("|")[1], S(i + 1))), { title: { text: "Roll rate [deg/s]", font: { size: 13 }, x: 0 }, xaxis: { title: "iteration" } }));
    if (H.wing_mass_kg) add((id) => plot(id, [line(H.it, H.wing_mass_kg, "wing mass", S(1))], { title: { text: "Wing mass [kg]", font: { size: 13 }, x: 0 }, xaxis: { title: "iteration" }, showlegend: false }));
  }

  window.Dash = { index, run, _dAD: dAD, _inv3: inv3, _evalE: evalE };
})();
