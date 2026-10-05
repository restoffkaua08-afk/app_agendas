import { registerPlugin } from "./vendor/capacitor-core.js";

const SecureSession = registerPlugin("SecureSession");
const WhatsAppLauncher = registerPlugin("WhatsAppLauncher");
const root = document.querySelector("#app");
const apiBase = String(window.AGENDA_CONFIG?.apiBaseUrl ?? "").replace(/\/+$/, "");
const state = {
  session: null,
  tab: "home",
  date: new Date(),
  monthItems: [],
  services: [],
  filter: "all",
  modal: "",
  error: "",
  busy: false,
  toast: ""
};

const labels = { pending: "Aguardando", confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado", no_show: "Não compareceu" };
const nav = [["home", "⌂", "Início"], ["agenda", "◷", "Agenda"], ["reservations", "▤", "Reservas"], ["calendar", "▦", "Calendário"], ["site", "◎", "Meu site"]];
const pad = (value) => String(value).padStart(2, "0");
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (key) => { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); };
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const dateLabel = (date, options = { weekday: "long", day: "numeric", month: "long" }) => date.toLocaleDateString("pt-BR", options);
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const inTenantDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: state.session?.tenant?.timezone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const timeLabel = (iso) => new Intl.DateTimeFormat("pt-BR", { timeZone: state.session?.tenant?.timezone || undefined, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const whatsappPhone = (value) => { const raw = String(value ?? "").trim(); let digits = raw.replace(/\D/g, ""); if ((digits.length === 10 || digits.length === 11) && !raw.startsWith("+")) digits = `55${digits}`; return /^\d{12,15}$/.test(digits) ? digits : ""; };
function whatsappMessage(item, status) {
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: state.session?.tenant?.timezone || undefined, day: "numeric", month: "long" }).format(new Date(item.startsAt));
  const business = state.session?.tenant?.name || "nosso estabelecimento";
  return status === "confirmed"
    ? `Olá, ${item.customerName}! Seu horário para ${item.serviceName}, dia ${date} às ${timeLabel(item.startsAt)}, está confirmado. Aguardamos você! — ${business}`
    : `Olá, ${item.customerName}. Seu horário para ${item.serviceName}, dia ${date} às ${timeLabel(item.startsAt)}, foi cancelado por ${business}. Se quiser remarcar, responda por aqui.`;
}
const monthItems = () => state.monthItems;
const dayItems = () => monthItems().filter((item) => inTenantDay(item.startsAt) === dateKey(state.date)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

async function secureGet() {
  try {
    if (!window.Capacitor?.isNativePlatform?.()) return null;
    const result = await SecureSession.get();
    return result.value ? JSON.parse(result.value) : null;
  } catch { return null; }
}

async function secureSet(value) {
  if (!window.Capacitor?.isNativePlatform?.()) throw new Error("Abra o aplicativo instalado para conectar este aparelho.");
  await SecureSession.set({ value: JSON.stringify(value) });
}

async function clearSession() {
  try { if (window.Capacitor?.isNativePlatform?.()) await SecureSession.remove(); } catch { /* Clear the screen even if storage is unavailable. */ }
  state.session = null;
  state.monthItems = [];
  state.services = [];
  state.tab = "home";
  render();
}

async function request(path, options = {}) {
  if (!apiBase) throw new Error("Este aplicativo ainda está sendo preparado. Fale com a pessoa que lhe entregou o site.");
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(state.session?.token ? { Authorization: `Bearer ${state.session.token}` } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.session) await clearSession();
    if (data.code === "INVALID_PAIRING_CODE") throw new Error("Esse código não funciona mais. Peça um novo código a quem preparou seu site.");
    if (data.code === "PAIRING_RATE_LIMITED") throw new Error("Muitas tentativas seguidas. Aguarde um pouco e tente novamente.");
    throw new Error(data.message || "Não foi possível concluir agora. Confira sua conexão e tente novamente.");
  }
  return data;
}

async function connect(code) {
  state.busy = true; state.error = ""; render();
  try {
    const data = await request("/v1/mobile/pair", { method: "POST", body: { code } });
    const session = { token: data.token, tenant: data.tenant, user: data.user };
    await secureSet(session);
    state.session = session;
    state.tab = "home";
    await refresh();
  } catch (error) {
    state.error = error.message || "Não foi possível conectar. Tente novamente.";
    state.busy = false; render();
  }
}

async function refresh() {
  if (!state.session) return render();
  state.busy = true; state.error = ""; render();
  try {
    const slug = encodeURIComponent(state.session.tenant.slug);
    const [month, services] = await Promise.all([
      request(`/v1/owner/${slug}/appointments?month=${monthKey(state.date)}`),
      request(`/v1/owner/${slug}/services`)
    ]);
    state.monthItems = month.appointments ?? [];
    state.services = services.services ?? [];
    state.busy = false;
  } catch (error) {
    state.busy = false;
    if (state.session) state.error = error.message || "Não foi possível atualizar as informações.";
  }
  render();
}

function appointmentCard(item, actions = true) {
  const status = labels[item.status] || item.status;
  const buttons = actions && item.status === "pending"
    ? `<div class="modal-actions"><button class="secondary-button" data-action="status" data-id="${escapeHtml(item.id)}" data-status="cancelled">Recusar</button><button class="primary-button" data-action="status" data-id="${escapeHtml(item.id)}" data-status="confirmed">Confirmar</button></div>`
    : actions && item.status === "confirmed"
      ? `<div class="modal-actions"><button class="secondary-button" data-action="status" data-id="${escapeHtml(item.id)}" data-status="cancelled">Cancelar</button><button class="primary-button" data-action="status" data-id="${escapeHtml(item.id)}" data-status="completed">Concluir</button></div>` : "";
  return `<article class="appointment"><div class="time">${timeLabel(item.startsAt)}</div><div class="appointment-main"><div class="appointment-name">${escapeHtml(item.customerName)}</div><div class="appointment-service">${escapeHtml(item.serviceName)}${item.staffName ? ` · ${escapeHtml(item.staffName)}` : ""}</div><div class="appointment-meta">${escapeHtml(item.customerPhone || "")}</div><span class="status ${escapeHtml(item.status)}">${escapeHtml(status)}</span>${buttons}</div></article>`;
}

function empty(message) { return `<div class="empty"><div class="empty-icon">✦</div>${escapeHtml(message)}</div>`; }

function homeView() {
  const today = dayItems();
  const pending = monthItems().filter((item) => item.status === "pending").length;
  const byWeek = Array.from({ length: 5 }, (_, index) => monthItems().filter((item) => Math.floor((Number(inTenantDay(item.startsAt).slice(-2)) - 1) / 7) === index).length);
  const max = Math.max(1, ...byWeek);
  return `<div class="content"><div class="greeting"><div><p class="eyebrow">${dateLabel(new Date(), { weekday: "long", day: "numeric", month: "long" })}</p><h1>Olá, ${escapeHtml(state.session.user.displayName || "tudo bem?")}</h1><div class="business">${escapeHtml(state.session.tenant.name)}</div></div><button class="date-pill" data-action="refresh">↻ Atualizar</button></div>
    <section class="hero"><p class="hero-label">Agendamentos de hoje</p><p class="hero-number">${today.length}</p><div class="hero-foot"><span class="hero-dot"></span> Sua agenda está conectada</div></section>
    <div class="stats"><div class="stat-card"><div class="stat-icon blue">◷</div><div class="stat-value">${pending}</div><div class="stat-label">Aguardando resposta</div></div><div class="stat-card"><div class="stat-icon purple">✓</div><div class="stat-value">${today.filter((item) => item.status === "confirmed").length}</div><div class="stat-label">Confirmados hoje</div></div></div>
    <div class="section-head"><h2>Movimento do mês</h2><button class="text-button" data-tab="calendar">Ver calendário</button></div><div class="card chart">${byWeek.map((count, index) => `<div class="chart-col"><div class="chart-bar ${index === 4 ? "current" : ""}" style="height:${Math.max(7, count / max * 70)}%"></div><span class="chart-label">${index === 4 ? "Agora" : `Sem ${index + 1}`}</span></div>`).join("")}</div>
    <div class="section-head"><h2>Próximos hoje</h2><button class="text-button" data-tab="agenda">Ver agenda</button></div><div class="appointment-list">${today.length ? today.slice(0, 3).map((item) => appointmentCard(item, false)).join("") : empty("Nenhum horário reservado para hoje.")}</div></div>`;
}

function agendaView() {
  const items = dayItems();
  return `<div class="content"><div class="page-title"><h1>Agenda</h1><p>Acompanhe os horários do seu estabelecimento.</p></div><div class="toolbar"><div class="date-control"><button data-action="day" data-step="-1" aria-label="Dia anterior">‹</button><strong>${escapeHtml(dateLabel(state.date, { weekday: "short", day: "numeric", month: "short" }))}</strong><button data-action="day" data-step="1" aria-label="Próximo dia">›</button></div><button class="date-pill" data-action="today">Hoje</button></div><div class="appointment-list">${items.length ? items.map((item) => appointmentCard(item)).join("") : empty("Não há reservas neste dia.")}</div></div>`;
}

function reservationsView() {
  const all = monthItems().slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const items = state.filter === "all" ? all : all.filter((item) => item.status === state.filter);
  return `<div class="content"><div class="page-title"><h1>Reservas</h1><p>Pedidos recebidos pelo seu site neste mês.</p></div><div class="filter-row">${[["all", "Todas"], ["pending", "Aguardando"], ["confirmed", "Confirmadas"], ["completed", "Concluídas"]].map(([key, label]) => `<button class="filter-chip ${state.filter === key ? "active" : ""}" data-filter="${key}">${label}</button>`).join("")}</div><div class="appointment-list">${items.length ? items.map((item) => appointmentCard(item)).join("") : empty("Nenhuma reserva nesta categoria.")}</div></div>`;
}

function calendarView() {
  const year = state.date.getFullYear(), month = state.date.getMonth();
  const first = new Date(year, month, 1), offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const key = dateKey(date), count = monthItems().filter((item) => inTenantDay(item.startsAt) === key).length;
    const selected = key === dateKey(state.date), today = key === dateKey(new Date());
    return `<button class="day-cell ${sameMonth(date, first) ? "" : "muted"} ${today ? "today" : ""} ${selected ? "selected" : ""}" data-date="${key}">${date.getDate()}${count ? `<i class="day-dot" aria-label="${count} reservas"></i>` : ""}</button>`;
  }).join("");
  const chosen = dayItems();
  return `<div class="content"><div class="page-title"><h1>Calendário</h1><p>Veja os dias com horários reservados.</p></div><div class="card" style="padding:14px"><div class="month-title"><button class="icon-button" data-action="month" data-step="-1" aria-label="Mês anterior">‹</button><strong>${dateLabel(first, { month: "long", year: "numeric" })}</strong><button class="icon-button" data-action="month" data-step="1" aria-label="Próximo mês">›</button></div><div class="month-grid">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => `<span class="weekday">${day}</span>`).join("")}${cells}</div></div><div class="section-head"><h2>${escapeHtml(dateLabel(state.date))}</h2></div><div class="appointment-list">${chosen.length ? chosen.map((item) => appointmentCard(item, false)).join("") : empty("Nenhuma reserva para este dia.")}</div></div>`;
}

function siteView() {
  const services = state.services.map((service) => `<div class="card service-card"><div class="service-copy"><div class="service-name">${escapeHtml(service.name)}</div><div class="service-detail">${service.durationMinutes} min${service.priceCents ? ` · ${(service.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</div></div><button class="switch ${service.active ? "on" : ""}" role="switch" aria-checked="${service.active}" aria-label="${service.active ? "Pausar" : "Ativar"} ${escapeHtml(service.name)}" data-action="service" data-id="${escapeHtml(service.id)}"></button></div>`).join("");
  return `<div class="content"><div class="page-title"><h1>Meu site</h1><p>Controle quais serviços aparecem para seus clientes.</p></div><div class="card settings-card"><h3>${escapeHtml(state.session.tenant.name)} está conectado</h3><p>Este celular acompanha apenas o estabelecimento vinculado a ele. Para usar outro site, desconecte e insira o novo código.</p></div><div class="section-head"><h2>Serviços publicados</h2></div><div class="appointment-list">${services || empty("Não há serviços cadastrados neste site.")}</div><div class="section-head"><h2>Conexão</h2></div><button class="secondary-button full" data-action="new-code">Conectar outro celular</button><button class="danger-button full" style="margin-top:10px" data-action="disconnect">Desconectar este celular</button></div>`;
}

function modalView() {
  if (state.modal === "help") return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><div class="modal-head"><h2 id="help-title">Como usar o Agenda</h2><button class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div><p>O código recebido conecta este celular ao site certo. Ele é usado uma vez e não precisa ser digitado novamente neste aparelho.</p><p>Novas reservas aparecem em <b>Reservas</b> e <b>Agenda</b>. Você pode confirmar ou cancelar cada pedido. Em <b>Meu site</b>, pause ou reative os serviços que seus clientes podem escolher.</p><p>Para conectar outro celular, gere um novo código em <b>Meu site</b>. Se o código vencer, peça outro à pessoa que preparou seu site.</p><button class="primary-button full" data-action="close-modal">Entendi</button></section></div>`;
  if (state.modal === "code") return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="code-title"><div class="modal-head"><h2 id="code-title">Conectar outro celular</h2><button class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div><p>Envie este código para a pessoa que vai configurar o outro celular. Ele só pode ser usado uma vez e vence em 10 minutos.</p><div class="code-display">${escapeHtml(state.generatedCode)}</div><div class="modal-actions"><button class="secondary-button" data-action="copy-code">Copiar código</button><button class="primary-button" data-action="close-modal">Pronto</button></div></section></div>`;
  if (state.modal === "confirm-disconnect") return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>Desconectar este celular?</h2><button class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div><p>Você deixará de ver as reservas neste aparelho. Para voltar, será necessário pedir um novo código ao responsável pelo site.</p><div class="modal-actions"><button class="secondary-button" data-action="close-modal">Manter conectado</button><button class="danger-button" data-action="confirm-disconnect">Desconectar</button></div></section></div>`;
  return "";
}

function connectionView() {
  const busy = state.busy;
  return `<main class="connection-screen"><div class="connection-top"><span class="brand-mark">A</span> Agenda</div><div class="connection-spacer"></div><div class="connection-hero"><div class="connection-logo">A</div><h1>Seu negócio, em suas mãos</h1><p>Conecte o aplicativo ao site do seu estabelecimento para acompanhar os horários e reservas.</p></div><form class="connect-card" id="connect-form"><label for="pair-code">Código de conexão</label><input class="code-input" id="pair-code" name="code" autocomplete="one-time-code" autocapitalize="characters" maxlength="14" placeholder="XXXX-XXXX-XXXX" required aria-describedby="code-hint"/><p class="input-help" id="code-hint">Digite o código recebido junto com as instruções do seu site. Por segurança, ele só pode ser usado uma vez.</p>${state.error ? `<p class="connection-error" role="alert">${escapeHtml(state.error)}</p>` : ""}<button class="primary-button full" type="submit" ${busy ? "disabled" : ""}>${busy ? '<span class="spinner"></span>Conectando…' : "Conectar meu estabelecimento"}</button></form><button class="help-link" data-action="help">Onde encontro meu código?</button><div class="connection-spacer"></div><p class="connection-foot">Acesso protegido para o responsável pelo estabelecimento</p>${modalView()}</main>`;
}

function render() {
  if (!state.session) { root.innerHTML = connectionView(); return; }
  const view = ({ home: homeView, agenda: agendaView, reservations: reservationsView, calendar: calendarView, site: siteView })[state.tab] || homeView;
  root.innerHTML = `<main class="screen"><header class="topbar"><div class="brand"><span class="brand-mark">A</span> Agenda</div><button class="icon-button" data-action="help" aria-label="Ajuda">?</button></header>${state.error ? `<div class="content"><div class="connection-error" role="alert">${escapeHtml(state.error)} <button class="text-button" data-action="refresh">Tentar novamente</button></div></div>` : ""}${view()}<nav class="bottom-nav" aria-label="Navegação principal">${nav.map(([id, icon, label]) => `<button class="nav-item ${state.tab === id ? "active" : ""}" data-tab="${id}" aria-current="${state.tab === id ? "page" : "false"}"><span>${icon}</span><span>${label}</span></button>`).join("")}</nav>${modalView()}${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}</main>`;
}

function showToast(message) {
  state.toast = message; render();
  setTimeout(() => { state.toast = ""; render(); }, 2200);
}

async function updateStatus(id, status) {
  const appointment = monthItems().find((item) => item.id === id);
  try {
    await request(`/v1/owner/${encodeURIComponent(state.session.tenant.slug)}/appointments/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });
    await refresh();
    if (status === "confirmed" || status === "cancelled") {
      if (appointment?.whatsappOptIn !== true) { showToast("Reserva atualizada. Cliente não autorizou mensagens pelo WhatsApp; avise por outro canal."); return; }
      const phone = whatsappPhone(appointment.customerPhone);
      if (!phone) { showToast("Reserva atualizada. O telefone não está no formato para abrir o WhatsApp."); return; }
      try {
        await WhatsAppLauncher.open({ phone, message: whatsappMessage(appointment, status) });
        showToast("Mensagem pronta. Revise e toque em Enviar no WhatsApp.");
      } catch { showToast("Reserva atualizada, mas não foi possível abrir o WhatsApp neste aparelho."); }
      return;
    }
    showToast("Reserva atualizada.");
  } catch (error) { state.error = error.message; render(); }
}

async function toggleService(id) {
  const service = state.services.find((item) => item.id === id);
  if (!service) return;
  try {
    await request(`/v1/owner/${encodeURIComponent(state.session.tenant.slug)}/services/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: { name: service.name, description: service.description, durationMinutes: service.durationMinutes, bufferMinutes: service.bufferMinutes, priceCents: service.priceCents, active: !service.active, staffIds: service.staffIds }
    });
    showToast(service.active ? "Serviço pausado no site." : "Serviço publicado no site.");
    await refresh();
  } catch (error) { state.error = error.message; render(); }
}

async function generateCode() {
  try {
    const result = await request(`/v1/owner/${encodeURIComponent(state.session.tenant.slug)}/mobile-pairings`, { method: "POST" });
    state.generatedCode = result.code;
    state.modal = "code";
    render();
  } catch (error) { state.error = error.message; render(); }
}

root.addEventListener("submit", (event) => {
  if (event.target.id !== "connect-form") return;
  event.preventDefault();
  const code = new FormData(event.target).get("code");
  connect(String(code ?? "").replace(/[\s-]/g, "").toUpperCase());
});

root.addEventListener("input", (event) => {
  if (event.target.id !== "pair-code") return;
  const clean = event.target.value.replace(/[^23456789A-HJ-NP-Z]/gi, "").toUpperCase().slice(0, 12);
  event.target.value = clean.match(/.{1,4}/g)?.join("-") ?? clean;
});

root.addEventListener("click", async (event) => {
  const button = event.target.closest("button,[data-date]");
  if (!button) return;
  if (button.dataset.tab) { state.tab = button.dataset.tab; state.error = ""; render(); if (state.tab === "calendar") await refresh(); return; }
  if (button.dataset.filter) { state.filter = button.dataset.filter; return render(); }
  if (button.dataset.date) {
    const previousMonth = monthKey(state.date);
    state.date = parseDate(button.dataset.date);
    if (monthKey(state.date) !== previousMonth) await refresh(); else render();
    return;
  }
  const { action } = button.dataset;
  if (action === "help") { state.modal = "help"; render(); }
  else if (action === "close-modal") { if (event.target === button || button.classList.contains("icon-button") || button.dataset.action === "close-modal") { state.modal = ""; render(); } }
  else if (action === "refresh") await refresh();
  else if (action === "today") { state.date = new Date(); await refresh(); }
  else if (action === "day") { state.date.setDate(state.date.getDate() + Number(button.dataset.step)); await refresh(); }
  else if (action === "month") { state.date.setMonth(state.date.getMonth() + Number(button.dataset.step)); await refresh(); }
  else if (action === "status") await updateStatus(button.dataset.id, button.dataset.status);
  else if (action === "service") await toggleService(button.dataset.id);
  else if (action === "new-code") await generateCode();
  else if (action === "disconnect") { state.modal = "confirm-disconnect"; render(); }
  else if (action === "confirm-disconnect") { state.modal = ""; await clearSession(); }
  else if (action === "copy-code") {
    try { await navigator.clipboard.writeText(state.generatedCode); showToast("Código copiado."); }
    catch { showToast("Selecione o código para copiá-lo."); }
  }
});

async function start() {
  state.session = await secureGet();
  if (state.session) await refresh();
  else render();
}

start();
