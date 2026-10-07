/* EcoMovil · front que consume el API Gateway (puerto 8080 por defecto). */
(() => {
  "use strict";

  // ---------- estado ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const state = {
    api: store.get("eco.api", window.ECOMOVIL_API_URL || "http://localhost:8080"),
    user: store.get("eco.user", null),
    vehicles: [],
    view: "vehicles",
    trackTimer: null,
    alertTimer: null,
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- API ----------
  async function api(path, opts = {}) {
    const url = state.api.replace(/\/$/, "") + path;
    let res;
    try {
      res = await fetch(url, {
        method: opts.method || "GET",
        headers: opts.body ? { "Content-Type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      setApiStatus(false);
      throw new Error(`No se pudo conectar con ${state.api}. ¿Está corriendo el API Gateway?`);
    }
    setApiStatus(true);
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error || data.detail)) || `Error ${res.status}`;
      throw new Error(typeof msg === "string" ? msg : `Error ${res.status}`);
    }
    return data;
  }
  const API = {
    login: (b) => api("/api/auth/login", { method: "POST", body: b }),
    register: (b) => api("/api/auth/register", { method: "POST", body: b }),
    users: () => api("/api/users"),
    vehicles: () => api("/api/vehicles"),
    createVehicle: (b) => api("/api/vehicles", { method: "POST", body: b }),
    updateVehicle: (id, b) => api(`/api/vehicles/${id}`, { method: "PUT", body: b }),
    deleteVehicle: (id) => api(`/api/vehicles/${id}`, { method: "DELETE" }),
    reservations: () => api("/api/reservations"),
    reservationsByUser: (id) => api(`/api/reservations/user/${id}`),
    createReservation: (b) => api("/api/reservations", { method: "POST", body: b }),
    cancelReservation: (id) => api(`/api/reservations/${id}/cancel`, { method: "PUT" }),
    telemetry: (vid) => api(`/api/telemetry/vehicle/${vid}`),
    alerts: () => api("/api/safety/alerts"),
    alertsByVehicle: (vid) => api(`/api/safety/alerts/vehicle/${vid}`),
    lock: (vid) => api(`/api/access/vehicles/${vid}/lock`, { method: "POST" }),
    unlock: (vid) => api(`/api/access/vehicles/${vid}/unlock`, { method: "POST" }),
  };

  // ---------- UI helpers ----------
  let toastTimer;
  function toast(msg, isError = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = "toast" + (isError ? " error" : "")), 3500);
  }
  function setApiStatus(ok) {
    const d = $("#apiStatus");
    if (d) { d.className = "dot " + (ok ? "ok" : "err"); d.title = ok ? `API conectado: ${state.api}` : `Sin conexión: ${state.api}`; }
  }
  const STATUS = {
    AVAILABLE: ["Disponible", "b-green"], RENTED: ["Alquilado", "b-blue"], MAINTENANCE: ["Mantenimiento", "b-amber"], INACTIVE: ["Inactivo", "b-gray"],
    PENDING: ["Pendiente", "b-amber"], CONFIRMED: ["Confirmada", "b-blue"], ACTIVE: ["Activa", "b-green"], COMPLETED: ["Completada", "b-gray"], CANCELLED: ["Cancelada", "b-red"],
  };
  const badge = (s) => { const [l, c] = STATUS[s] || [s || "—", "b-gray"]; return `<span class="badge ${c}">${esc(l)}</span>`; };
  const fmtDate = (d) => { if (!d) return "—"; const x = new Date(d); return isNaN(x) ? esc(d) : x.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }); };
  const num = (n, d = 1) => (n == null ? "—" : Number(n).toFixed(d));
  const vName = (id) => { const v = state.vehicles.find((x) => x.id == id); return v ? `${v.brand} ${v.model}` : `Vehículo #${id}`; };
  const toLocalInput = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

  // ---------- mapas ----------
  const LIMA = [-12.0464, -77.0428];
  const maps = {};
  function makeMap(id) {
    if (maps[id]) return maps[id];
    const m = L.map(id).setView(LIMA, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    m._layer = L.layerGroup().addTo(m);
    maps[id] = m;
    new ResizeObserver(() => m.invalidateSize()).observe(document.getElementById(id));
    return m;
  }
  const pinIcon = (color) => L.divIcon({ className: "", html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });

  // ---------- auth ----------
  function showAuth() {
    $("#auth").classList.remove("hidden");
    $("#app").classList.add("hidden");
    $$(".api-url-label").forEach((e) => (e.textContent = state.api));
    $$(".api-url-input").forEach((e) => (e.value = state.api));
  }
  function showApp() {
    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#userName").textContent = state.user.name;
    $$(".admin-only").forEach((e) => e.classList.toggle("hidden", state.user.role !== "ADMIN"));
    go("vehicles");
  }
  $$(".tab-btn").forEach((b) => b.addEventListener("click", () => {
    $$(".tab-btn").forEach((x) => x.classList.toggle("active", x === b));
    $("#loginForm").classList.toggle("hidden", b.dataset.auth !== "login");
    $("#registerForm").classList.toggle("hidden", b.dataset.auth !== "register");
  }));
  $$(".api-url-save").forEach((b) => b.addEventListener("click", () => {
    const v = b.parentElement.querySelector(".api-url-input").value.trim();
    if (!v) return;
    state.api = v; store.set("eco.api", v);
    $$(".api-url-label").forEach((e) => (e.textContent = v));
    toast("Servidor guardado");
  }));
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const u = await API.login(f);
      state.user = u; store.set("eco.user", u);
      toast(`Bienvenido, ${u.name}`);
      showApp();
    } catch (err) { toast(err.message, true); }
  });
  $("#registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const u = await API.register(f);
      state.user = u; store.set("eco.user", u);
      toast("Cuenta creada");
      showApp();
    } catch (err) { toast(err.message, true); }
  });
  $("#logoutBtn").addEventListener("click", () => {
    state.user = null; store.del("eco.user"); stopTimers(); showAuth();
  });

  // ---------- navegación ----------
  function stopTimers() { clearInterval(state.trackTimer); clearInterval(state.alertTimer); state.trackTimer = state.alertTimer = null; }
  function go(view) {
    state.view = view;
    stopTimers();
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $$(".view").forEach((s) => s.classList.toggle("hidden", s.id !== "view-" + view));
    ({ vehicles: loadVehicles, reservations: loadReservations, tracking: loadTracking, alerts: loadAlerts, users: loadUsers })[view]();
    Object.values(maps).forEach((m) => setTimeout(() => m.invalidateSize(), 50));
  }
  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));

  async function fetchVehicles() {
    state.vehicles = (await API.vehicles()) || [];
    const opts = state.vehicles.map((v) => `<option value="${v.id}">#${v.id} · ${esc(v.brand)} ${esc(v.model)}</option>`).join("");
    const tv = $("#trackVehicle"), prev = tv.value;
    tv.innerHTML = opts || `<option value="">Sin vehículos</option>`;
    if (prev) tv.value = prev;
    $("#alertVehicle").innerHTML = `<option value="">Todos los vehículos</option>` + opts;
  }

  // ---------- vehículos ----------
  async function loadVehicles() {
    const list = $("#vehicleList");
    list.innerHTML = `<div class="empty">Cargando…</div>`;
    const map = makeMap("vehicleMap");
    map.off("click").on("click", (ev) => {
      if ($("#vehicleDialog").open) return;
      openVehicleDialog(null, ev.latlng);
    });
    try { await fetchVehicles(); } catch (e) { list.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    renderVehicles();
  }
  function renderVehicles() {
    const filter = $("#vehicleFilter").value;
    const vs = state.vehicles.filter((v) => !filter || v.status === filter);
    const list = $("#vehicleList");
    list.innerHTML = vs.length ? vs.map((v) => `
      <article class="card" data-id="${v.id}">
        <div class="card-head"><span class="card-title">${esc(v.brand)} ${esc(v.model)}</span>${badge(v.status)}</div>
        <div class="card-sub">#${v.id} · ${esc(v.type)} · ${v.latitude != null ? `${num(v.latitude, 4)}, ${num(v.longitude, 4)}` : "sin ubicación"}</div>
        <div class="row">
          <button class="btn small primary" data-act="reserve" ${v.status !== "AVAILABLE" ? "disabled" : ""}>Reservar</button>
          <button class="btn small" data-act="track">Seguir</button>
          <button class="btn small" data-act="edit">Editar</button>
          <button class="btn small ghost" data-act="delete">Eliminar</button>
        </div>
      </article>`).join("") : `<div class="empty">No hay vehículos${filter ? " con ese estado" : ""}. Publica el primero con el botón de arriba o haciendo clic en el mapa.</div>`;

    const map = maps.vehicleMap;
    map._layer.clearLayers();
    const pts = [];
    vs.forEach((v) => {
      if (v.latitude == null || v.longitude == null) return;
      const color = { AVAILABLE: "#16a34a", RENTED: "#1d4ed8", MAINTENANCE: "#b45309" }[v.status] || "#64746b";
      L.marker([v.latitude, v.longitude], { icon: pinIcon(color) }).addTo(map._layer)
        .bindPopup(`<b>${esc(v.brand)} ${esc(v.model)}</b><br>${esc(v.type)} · ${STATUS[v.status]?.[0] || esc(v.status)}`)
        .on("click", () => { $$(".card").forEach((c) => c.classList.toggle("focus", c.dataset.id == v.id)); });
      pts.push([v.latitude, v.longitude]);
    });
    map.invalidateSize();
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  }
  $("#vehicleFilter").addEventListener("change", renderVehicles);
  $("#vehicleList").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]"); if (!btn) return;
    const id = btn.closest(".card").dataset.id;
    const v = state.vehicles.find((x) => x.id == id);
    if (btn.dataset.act === "edit") openVehicleDialog(v);
    if (btn.dataset.act === "reserve") openReserveDialog(v);
    if (btn.dataset.act === "track") { $("#trackVehicle").value = id; go("tracking"); }
    if (btn.dataset.act === "delete") {
      if (!confirm(`¿Eliminar ${v.brand} ${v.model}?`)) return;
      try { await API.deleteVehicle(id); toast("Vehículo eliminado"); loadVehicles(); } catch (err) { toast(err.message, true); }
    }
  });
  $("#newVehicleBtn").addEventListener("click", () => openVehicleDialog(null));

  function openVehicleDialog(v, latlng) {
    const f = $("#vehicleForm");
    f.reset();
    $("#vehicleDialogTitle").textContent = v ? "Editar vehículo" : "Publicar vehículo";
    f.elements.id.value = v?.id ?? "";
    if (v) {
      if (![...f.elements.type.options].some((o) => o.value === v.type)) f.elements.type.add(new Option(v.type, v.type));
      f.elements.type.value = v.type; f.elements.status.value = v.status; f.elements.brand.value = v.brand; f.elements.model.value = v.model;
    }
    const lat = v?.latitude ?? latlng?.lat ?? LIMA[0], lng = v?.longitude ?? latlng?.lng ?? LIMA[1];
    f.elements.latitude.value = Number(lat).toFixed(6); f.elements.longitude.value = Number(lng).toFixed(6);
    $("#vehicleDialog").showModal();
  }
  $("#vehicleForm").addEventListener("submit", async (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const body = { type: f.type, brand: f.brand, model: f.model, status: f.status,
      latitude: f.latitude === "" ? null : Number(f.latitude), longitude: f.longitude === "" ? null : Number(f.longitude) };
    try {
      if (f.id) await API.updateVehicle(f.id, body); else await API.createVehicle(body);
      $("#vehicleDialog").close();
      toast(f.id ? "Vehículo actualizado" : "Vehículo publicado");
      loadVehicles();
    } catch (err) { toast(err.message, true); }
  });

  // ---------- reservas ----------
  function openReserveDialog(v) {
    const f = $("#reserveForm");
    f.reset();
    f.elements.vehicleId.value = v.id;
    $("#reserveVehicleName").textContent = `${v.brand} ${v.model}`;
    const start = new Date(Date.now() + 10 * 60000), end = new Date(start.getTime() + 60 * 60000);
    f.elements.startTime.value = toLocalInput(start); f.elements.endTime.value = toLocalInput(end);
    f.elements.startTime.min = toLocalInput(new Date());
    $("#reserveDialog").showModal();
  }
  $("#reserveForm").addEventListener("submit", async (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.endTime <= f.startTime) return toast("La hora de fin debe ser posterior al inicio", true);
    try {
      await API.createReservation({ vehicleId: Number(f.vehicleId), userId: state.user.id, startTime: f.startTime + ":00", endTime: f.endTime + ":00" });
      $("#reserveDialog").close();
      toast("Reserva creada");
      go("reservations");
    } catch (err) { toast(err.message, true); }
  });

  async function loadReservations() {
    const t = $("#reservationTable");
    t.innerHTML = `<tr><td class="empty">Cargando…</td></tr>`;
    try {
      if (!state.vehicles.length) await fetchVehicles().catch(() => {});
      const all = $("#allReservations").checked;
      const rs = (all ? await API.reservations() : await API.reservationsByUser(state.user.id)) || [];
      rs.sort((a, b) => (b.id || 0) - (a.id || 0));
      t.innerHTML = rs.length ? `
        <tr><th>#</th><th>Vehículo</th>${all ? "<th>Usuario</th>" : ""}<th>Inicio</th><th>Fin</th><th>Estado</th><th></th></tr>
        ${rs.map((r) => `<tr>
          <td>${r.id}</td><td>${esc(vName(r.vehicleId))}</td>${all ? `<td>#${esc(r.userId)}</td>` : ""}
          <td>${fmtDate(r.startTime)}</td><td>${fmtDate(r.endTime)}</td><td>${badge(r.status)}</td>
          <td>${["PENDING", "CONFIRMED"].includes(r.status) ? `<button class="btn small ghost" data-cancel="${r.id}">Cancelar</button>` : ""}</td>
        </tr>`).join("")}` : `<tr><td class="empty">Aún no tienes reservas. Ve a Vehículos y reserva uno disponible.</td></tr>`;
    } catch (e) { t.innerHTML = `<tr><td class="empty">${esc(e.message)}</td></tr>`; }
  }
  $("#allReservations").addEventListener("change", loadReservations);
  $("#reservationTable").addEventListener("click", async (e) => {
    const id = e.target.dataset.cancel; if (!id) return;
    if (!confirm("¿Cancelar esta reserva?")) return;
    try { await API.cancelReservation(id); toast("Reserva cancelada"); loadReservations(); } catch (err) { toast(err.message, true); }
  });

  // ---------- seguimiento ----------
  async function loadTracking() {
    makeMap("trackMap");
    try { await fetchVehicles(); } catch (e) { toast(e.message, true); }
    await refreshTracking();
    state.trackTimer = setInterval(refreshTracking, 5000);
  }
  async function refreshTracking() {
    const vid = $("#trackVehicle").value;
    const t = $("#telemetryTable"), stats = $("#trackStats"), map = maps.trackMap;
    if (!vid) { t.innerHTML = `<tr><td class="empty">Selecciona un vehículo.</td></tr>`; return; }
    try {
      const [rows, alerts] = await Promise.all([API.telemetry(vid), API.alertsByVehicle(vid).catch(() => [])]);
      const data = rows || [];
      const last = data[0];
      const ageS = last ? Math.round((Date.now() - new Date(last.timestamp)) / 1000) : null;
      const signal = ageS == null ? ["Sin datos", "b-gray"] : ageS > 60 ? ["Sin señal", "b-red"] : ageS > 15 ? ["Señal débil", "b-amber"] : ["En línea", "b-green"];
      stats.innerHTML = `
        <div class="stat"><div class="k">Conexión</div><div class="v"><span class="badge ${signal[1]}">${signal[0]}</span></div></div>
        <div class="stat"><div class="k">Velocidad</div><div class="v">${last ? num(last.speed) + " km/h" : "—"}</div></div>
        <div class="stat"><div class="k">Cerradura</div><div class="v">${last ? (last.locked ? "🔒 Bloqueado" : "🔓 Libre") : "—"}</div></div>
        <div class="stat"><div class="k">Último reporte</div><div class="v" style="font-size:15px">${last ? fmtDate(last.timestamp) : "—"}</div></div>
        <div class="stat"><div class="k">Alertas</div><div class="v">${(alerts || []).length}</div></div>`;
      t.innerHTML = data.length ? `
        <tr><th>Hora</th><th>Lat</th><th>Lon</th><th>Vel. km/h</th><th>Giro (x,y,z)</th><th>Cerradura</th></tr>
        ${data.map((r) => `<tr><td>${fmtDate(r.timestamp)}</td><td>${num(r.latitude, 5)}</td><td>${num(r.longitude, 5)}</td>
          <td>${num(r.speed)}</td><td>${num(r.gyroX, 2)}, ${num(r.gyroY, 2)}, ${num(r.gyroZ, 2)}</td><td>${r.locked ? "Bloqueado" : "Libre"}</td></tr>`).join("")}`
        : `<tr><td class="empty">Sin telemetría para este vehículo. Inicia el simulador IoT (simulator.py) para verla en vivo.</td></tr>`;
      map._layer.clearLayers();
      const path = data.filter((r) => r.latitude != null).map((r) => [r.latitude, r.longitude]);
      if (path.length) {
        L.polyline(path, { color: "#16a34a", weight: 4, opacity: .7 }).addTo(map._layer);
        L.marker(path[0], { icon: pinIcon(last.locked ? "#dc2626" : "#16a34a") }).addTo(map._layer).bindPopup(`<b>${esc(vName(vid))}</b><br>${num(last.speed)} km/h`);
        (alerts || []).filter((a) => a.latitude != null).forEach((a) =>
          L.circleMarker([a.latitude, a.longitude], { radius: 7, color: "#dc2626" }).addTo(map._layer).bindPopup(`<b>${esc(a.type)}</b><br>${esc(a.message)}`));
        if (map._tracked !== vid) { map.setView(path[0], 16); map._tracked = vid; } else map.panTo(path[0]);
      } else {
        const v = state.vehicles.find((x) => x.id == vid);
        if (v?.latitude != null) { L.marker([v.latitude, v.longitude], { icon: pinIcon("#64746b") }).addTo(map._layer); map.setView([v.latitude, v.longitude], 15); }
      }
    } catch (e) { t.innerHTML = `<tr><td class="empty">${esc(e.message)}</td></tr>`; }
  }
  $("#trackVehicle").addEventListener("change", () => { if (maps.trackMap) maps.trackMap._tracked = null; refreshTracking(); });
  async function sendCommand(kind) {
    const vid = $("#trackVehicle").value; if (!vid) return;
    try {
      const r = await (kind === "lock" ? API.lock(vid) : API.unlock(vid));
      toast(r?.message || (kind === "lock" ? "Bloqueo enviado" : "Desbloqueo enviado"));
      setTimeout(refreshTracking, 1500);
    } catch (e) { toast(e.message, true); }
  }
  $("#lockBtn").addEventListener("click", () => sendCommand("lock"));
  $("#unlockBtn").addEventListener("click", () => sendCommand("unlock"));

  // ---------- alertas ----------
  async function loadAlerts() {
    try { if (!state.vehicles.length) await fetchVehicles(); } catch {}
    await refreshAlerts();
    state.alertTimer = setInterval(refreshAlerts, 8000);
  }
  async function refreshAlerts() {
    const list = $("#alertList"), vid = $("#alertVehicle").value;
    try {
      const as = ((vid ? await API.alertsByVehicle(vid) : await API.alerts()) || [])
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const sev = (s) => (/high|alta|critical|crít/i.test(s || "") ? "b-red" : /medium|media/i.test(s || "") ? "b-amber" : "b-blue");
      list.innerHTML = as.length ? as.map((a) => `
        <article class="card">
          <div class="card-head"><span class="card-title">${esc(a.type)}</span><span class="badge ${sev(a.severity)}">${esc(a.severity || "info")}</span></div>
          <div>${esc(a.message)}</div>
          <div class="card-sub">${esc(vName(a.vehicleId))} · ${fmtDate(a.timestamp)}${a.latitude != null ? ` · ${num(a.latitude, 4)}, ${num(a.longitude, 4)}` : ""}</div>
        </article>`).join("") : `<div class="empty">Sin alertas. El Safety Service las genera cuando la telemetría supera el límite de velocidad o detecta una caída.</div>`;
    } catch (e) { list.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  $("#alertVehicle").addEventListener("change", refreshAlerts);

  // ---------- usuarios ----------
  async function loadUsers() {
    const t = $("#userTable");
    try {
      const us = (await API.users()) || [];
      t.innerHTML = `<tr><th>#</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Activo</th></tr>` +
        us.map((u) => `<tr><td>${esc(u.id)}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.active === false ? "No" : "Sí"}</td></tr>`).join("");
    } catch (e) { t.innerHTML = `<tr><td class="empty">${esc(e.message)}</td></tr>`; }
  }

  // ---------- inicio ----------
  if (state.user) showApp(); else showAuth();
})();
