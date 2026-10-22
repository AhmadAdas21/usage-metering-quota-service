(() => {
  "use strict";

  const STARTER = "00000000-0000-4000-8000-000000000001";
  const BASIC = "00000000-0000-4000-8000-000000000003";
  const PREMIUM = "00000000-0000-4000-8000-000000000004";
  const MAX = 2_147_483_647;
  const currentMonth = () => new Date().toISOString().slice(0, 7);
  // Resolve dashboard elements explicitly, so missing markup fails clearly.
  const $ = (id) => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Dashboard element not found: ${id}`);
    return element;
  };
  const input = (id) => {
    const element = $(id);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
      throw new Error(`Expected an input/select/textarea element: ${id}`);
    }
    return element;
  };
  const button = (id) => {
    const element = $(id);
    if (!(element instanceof HTMLButtonElement)) throw new Error(`Expected a button: ${id}`);
    return element;
  };
  const form = (id) => {
    const element = $(id);
    if (!(element instanceof HTMLFormElement)) throw new Error(`Expected a form: ${id}`);
    return element;
  };
  const state = {
    apiKey: null, account: null, plans: [], users: [], userTotal: 0,
    usersPage: 1, usersTotalPages: 1, accountUsage: null, userUsage: [],
    recent: [], history: [], historyMonth: currentMonth(), historyPage: 1,
    historyTotalPages: 0, view: "overview", busy: false,
    selectedUserUsage: null, lastPayload: null,
  };
  let toastTimer;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const number = (value) => Number(value ?? 0).toLocaleString("en-US");
  const shortId = (value) => String(value ?? "").length > 19
    ? `${String(value).slice(0, 17)}…` : String(value ?? "");
  const dateLabel = (iso) => {
    const date = new Date(iso);
    return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };
  const iconInitial = (value) => String(value || "U").trim().slice(0, 1).toUpperCase();

  function toast(message, error = false) {
    const element = $("toast");
    element.textContent = message;
    element.classList.toggle("error", error);
    element.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("show"), 4100);
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    document.querySelectorAll("button[type=submit], #create-demo-btn, #top-consume-btn")
      .forEach((element) => { if (element instanceof HTMLButtonElement) element.disabled = isBusy; });
  }

  /**
   * @param {string} path
   * @param {{ method?: string, body?: unknown, authenticated?: boolean }} [options]
   */
  async function api(path, { method = "GET", body, authenticated = true } = {}) {
    /** @type {Record<string, string>} */
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (authenticated && state.apiKey) headers["x-api-key"] = state.apiKey;
    let response;
    try {
      response = await fetch(path, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      throw new Error("Cannot reach the API. Check that Docker or the local server is running.");
    }
    let result;
    try { result = await response.json(); }
    catch { throw new Error(`Unexpected API response (HTTP ${response.status}).`); }
    if (!response.ok) {
      const message = result?.error?.message || `Request failed (HTTP ${response.status}).`;
      throw new Error(`${message}${result?.error?.code ? ` [${result.error.code}]` : ""}`);
    }
    return result;
  }

  function freshRequestId() {
    // randomUUID is available on HTTPS/localhost. getRandomValues provides
    // a fallback for local HTTP/LAN previews where randomUUID is unavailable.
    let id;
    if (globalThis.crypto?.randomUUID) {
      id = globalThis.crypto.randomUUID();
    } else if (globalThis.crypto?.getRandomValues) {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
      id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } else {
      id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    input("consume-request-id").value = `document-${id}`;
  }
  function lookupPlan(planId) {
    return state.plans.find((plan) => plan.id === planId) ?? null;
  }
  function planName(planId) {
    return state.plans.find((plan) => plan.id === planId)?.name || "Unknown plan";
  }
  function nameForUser(userId) {
    return state.users.find((user) => user.id === userId)?.externalId || shortId(userId);
  }
  function userPlanOptions(selectedId) {
    return state.plans.filter((plan) => plan.scope === "user")
      .map((plan) => `<option value="${escapeHtml(plan.id)}" ${selectedId === plan.id ? "selected" : ""}>${escapeHtml(plan.name)}</option>`).join("");
  }

  async function loadUsers() {
    const result = await api(`/users?page=${state.usersPage}&pageSize=100`);
    state.users = result.users;
    state.userTotal = result.pagination.totalItems;
    state.usersTotalPages = Math.max(1, result.pagination.totalPages);
  }
  async function loadRecent() {
    const result = await api(`/usage/history?month=${currentMonth()}&page=1&pageSize=5`);
    state.recent = result.items;
  }
  async function loadHistory() {
    const result = await api(`/usage/history?month=${state.historyMonth}&page=${state.historyPage}&pageSize=8`);
    state.history = result.items;
    state.historyTotalPages = result.pagination.totalPages;
    renderHistory();
  }
  async function loadUserUsage() {
    const results = await Promise.allSettled(state.users.slice(0, 6).map(async (user) => {
      const result = await api(`/usage/users/${encodeURIComponent(user.id)}?month=${currentMonth()}`);
      return { user, usage: result.usage };
    }));
    state.userUsage = results.filter((item) => item.status === "fulfilled").map((item) => item.value);
  }
  async function loadDashboard() {
    const [account, plans, usage] = await Promise.all([
      api("/accounts/me"), api("/plans"), api(`/usage/account?month=${currentMonth()}`),
    ]);
    state.account = account.account;
    state.plans = plans.plans;
    state.accountUsage = usage.usage;
    await Promise.all([loadUsers(), loadRecent(), loadHistory()]);
    await loadUserUsage();
    renderAll();
    await refreshSelectedUserUsage();
  }
  async function reload() {
    await loadDashboard();
  }

  function renderQuotaPreview() {
    const selectedId = input("consume-user").value;
    const chosenUser = state.users.find((user) => user.id === selectedId);
    const accountPlan = lookupPlan(state.account?.planId);
    const userPlan = chosenUser ? lookupPlan(chosenUser.planId) : null;
    const panel = $("quota-preview");

    panel.hidden = !chosenUser || !accountPlan || !userPlan;
    if (panel.hidden) return;

    const aMax = accountPlan.rules.maxUnitsPerRequest;
    const uMax = userPlan.rules.maxUnitsPerRequest;
    const effectiveMax = Math.min(aMax, uMax);
    const userBalance = state.selectedUserUsage?.userId === selectedId
      ? state.selectedUserUsage.usage : null;
    const accountRemaining = state.accountUsage?.remaining;
    const userRemaining = userBalance?.remaining;
    const availableNow = accountRemaining == null || userRemaining == null
      ? null : Math.min(effectiveMax, accountRemaining, userRemaining);

    $("preview-account-plan").textContent = accountPlan.name;
    $("preview-account-limits").textContent = `${number(aMax)} max/request · ${accountRemaining == null ? "—" : number(accountRemaining)} monthly left`;
    $("preview-user-plan").textContent = userPlan.name;
    $("preview-user-limits").textContent = `${number(uMax)} max/request · ${userRemaining == null ? "checking…" : number(userRemaining)} monthly left`;
    $("effective-rule-label").textContent = `Effective max/request: ${number(effectiveMax)}`;

    const units = Number(input("consume-units").value);
    const message = $("preview-message");
    message.classList.remove("is-blocked", "is-allowed");
    if (!Number.isSafeInteger(units) || units < 1 || units > MAX) {
      message.textContent = "Enter a positive whole number of units.";
      return;
    }
    if (accountRemaining == null || userRemaining == null) {
      message.textContent = "Checking current user balance. Both account and user limits apply.";
      return;
    }
    // Match the backend's documented rule order, so users understand which
    // owner and rule would block the request. The server remains authoritative.
    const failure = units > aMax
      ? `Account ${accountPlan.name} per-request limit is ${number(aMax)}.`
      : units > uMax
        ? `User ${userPlan.name} per-request limit is ${number(uMax)}.`
        : units > accountRemaining
          ? `Only ${number(accountRemaining)} account units remain this month.`
          : units > userRemaining
            ? `Only ${number(userRemaining)} user units remain this month.`
            : null;
    if (failure) {
      message.classList.add("is-blocked");
      message.textContent = `Likely rejected: ${failure} Submitting still records the server's decision without consuming units.`;
    } else {
      message.classList.add("is-allowed");
      message.textContent = `${number(units)} units fit both plans. Available now: ${number(availableNow)} units. Final decision is made by the server.`;
    }
  }

  async function refreshSelectedUserUsage() {
    const userId = input("consume-user").value;
    state.selectedUserUsage = null;
    renderQuotaPreview();
    if (!userId || !state.apiKey) return;
    try {
      const response = await api(`/usage/users/${encodeURIComponent(userId)}?month=${currentMonth()}`);
      if (input("consume-user").value !== userId) return;
      state.selectedUserUsage = { userId, usage: response.usage };
      renderQuotaPreview();
    } catch (error) {
      if (input("consume-user").value === userId) {
        $("preview-message").textContent = "Could not load user balance. Refresh and try again.";
        toast(error instanceof Error ? error.message : "Could not load user usage", true);
      }
    }
  }

  function showConsumptionResult(result, replayed = false) {
    const box = $("consume-result");
    box.hidden = false;
    box.classList.toggle("is-rejected", !result.accepted);
    const reason = result.rejection
      ? `Blocked by ${escapeHtml(result.rejection.scope)} ${escapeHtml(result.rejection.rule.replaceAll("_", " "))} (limit: ${number(result.rejection.limit)}). No units charged.`
      : "The units were charged to both the account and the user.";
    box.innerHTML = `<div class="result-heading">${result.accepted ? "✓ Accepted" : "× Rejected"}${replayed ? " · Replay" : ""}</div><p>${reason}</p><p class="result-request-id">Request: ${escapeHtml(result.requestId)}</p><div class="result-balances"><span>Account remaining<strong>${number(result.accountUsage.remaining)}</strong></span><span>User remaining<strong>${number(result.userUsage.remaining)}</strong></span></div>`;
  }

  function renderOverview() {
    const used = state.accountUsage?.used ?? 0;
    const allowance = state.accountUsage?.monthlyAllowance ?? 0;
    const remaining = state.accountUsage?.remaining ?? 0;
    const percentage = allowance > 0 ? Math.min(100, Math.max(0, (used / allowance) * 100)) : (used > 0 ? 100 : 0);
    $("metric-used").textContent = number(used);
    $("metric-remaining").textContent = number(remaining);
    $("metric-allowance").textContent = number(allowance);
    $("metric-users").textContent = number(state.userTotal);
    $("donut-number").textContent = `${Math.round(percentage)}%`;
    $("quota-donut").style.setProperty("--percentage", `${percentage}%`);
    $("quota-used").textContent = number(used);
    $("quota-max").textContent = number(allowance);
    $("quota-caption").textContent = remaining === 0
      ? "Your shared allowance is fully used. Upgrade or adjust your plan."
      : "Your account has room for more consumption requests.";
    $("account-plan-badge").textContent = planName(state.account?.planId);
    $("nav-user-count").textContent = number(state.userTotal);
    $("overview-users").innerHTML = state.userUsage.length ? state.userUsage.map(({ user, usage }) => {
      const pct = usage.monthlyAllowance ? Math.min(100, usage.used / usage.monthlyAllowance * 100) : 0;
      return `<div class="user-usage-row"><div class="user-usage-heading"><span class="tiny-avatar">${escapeHtml(iconInitial(user.externalId))}</span><div class="user-usage-info"><strong>${escapeHtml(user.externalId)}</strong><small>${escapeHtml(planName(user.planId))}</small></div><span class="user-usage-amount">${number(usage.used)} / ${number(usage.monthlyAllowance)}</span></div><div class="progress-track"><div class="progress-fill ${pct >= 90 ? "high" : ""}" style="width:${pct}%"></div></div></div>`;
    }).join("") : `<div class="empty-mini">No users yet. Register your first user to track individual quotas.</div>`;
    $("overview-history").innerHTML = state.recent.length
      ? state.recent.map((item) => historyRow(item, false)).join("")
      : `<tr><td colspan="5" class="empty-mini">No consumption requests yet. Record one to get started.</td></tr>`;
  }

  function historyRow(item, detailed) {
    const label = item.accepted ? "Accepted" : "Rejected";
    const reason = item.rejection ? `${item.rejection.scope}: ${item.rejection.rule.replaceAll("_", " ")}` : "—";
    return `<tr><td><span class="request-id" title="${escapeHtml(item.requestId)}">${escapeHtml(shortId(item.requestId))}</span></td><td>${escapeHtml(nameForUser(item.userId))}</td><td>${number(item.units)}</td><td><span class="decision ${item.accepted ? "accepted" : "rejected"}">${item.accepted ? "✓" : "×"} ${label}</span></td>${detailed ? `<td>${escapeHtml(reason)}</td>` : ""}<td>${escapeHtml(dateLabel(item.processedAt))}</td></tr>`;
  }
  function renderHistory() {
    $("activity-history").innerHTML = state.history.length
      ? state.history.map((item) => historyRow(item, true)).join("")
      : `<tr><td colspan="6" class="empty-mini">No requests recorded in this month.</td></tr>`;
    $("history-page-label").textContent = `Page ${state.historyPage} of ${Math.max(1, state.historyTotalPages)}`;
    button("history-prev").disabled = state.historyPage <= 1;
    button("history-next").disabled = state.historyPage >= state.historyTotalPages;
  }

  function renderUserSelects() {
    const options = state.users.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.externalId)}</option>`).join("");
    const previouslySelected = input("consume-user").value;
    $("consume-user").innerHTML = `<option value="">Choose a user</option>${options}`;
    if (state.users.some((user) => user.id === previouslySelected)) {
      input("consume-user").value = previouslySelected;
    }
    renderQuotaPreview();
    $("create-user-plan").innerHTML = `<option value="">Choose a plan</option>${userPlanOptions()}`;
    const accountOptions = state.plans.filter((plan) => plan.scope === "account").map((plan) =>
      `<option value="${escapeHtml(plan.id)}" ${plan.id === state.account?.planId ? "selected" : ""}>${escapeHtml(plan.name)} · ${number(plan.rules.monthlyAllowance)} units</option>`).join("");
    $("change-account-plan").innerHTML = accountOptions;
  }
  function renderUsers() {
    $("users-count-badge").textContent = `${number(state.userTotal)} users`;
    $("users-list").innerHTML = state.users.length ? state.users.map((user) =>
      `<div class="user-row"><span class="tiny-avatar">${escapeHtml(iconInitial(user.externalId))}</span><div class="user-meta"><strong>${escapeHtml(user.externalId)}</strong><small>${escapeHtml(planName(user.planId))} · ${escapeHtml(shortId(user.id))}</small></div><div class="user-controls"><select class="user-plan-select" aria-label="Plan for ${escapeHtml(user.externalId)}" data-user-select="${escapeHtml(user.id)}">${userPlanOptions(user.planId)}</select><button class="button outline small" data-assign-user="${escapeHtml(user.id)}">Assign</button></div></div>`).join("")
      : `<div class="empty-mini">No users to display. Create one on the right.</div>`;
    $("user-pagination").hidden = state.usersTotalPages <= 1;
    $("user-page-label").textContent = `Page ${state.usersPage} of ${state.usersTotalPages}`;
    button("user-prev").disabled = state.usersPage <= 1;
    button("user-next").disabled = state.usersPage >= state.usersTotalPages;
  }
  function renderPlans() {
    $("plan-count-badge").textContent = `${state.plans.length} plans`;
    const activeAccount = lookupPlan(state.account?.planId);
    $("plan-active-note").textContent = activeAccount
      ? `Active account plan: ${activeAccount.name}. Max ${number(activeAccount.rules.maxUnitsPerRequest)} units per request; every user must also pass their own plan limits.`
      : "Account and user plan limits apply together.";
    $("plan-list").innerHTML = state.plans.map((plan) =>
      `<div class="plan-row"><div class="plan-meta"><strong>${escapeHtml(plan.name)}</strong><small>${plan.isPredefined ? "Predefined · read-only" : `Custom · v${number(plan.version)}`}</small><div class="rules">${number(plan.rules.monthlyAllowance)} units/month · ${number(plan.rules.maxUnitsPerRequest)} max/request</div></div><span class="plan-scope">${escapeHtml(plan.scope)}</span>${plan.isPredefined ? "" : `<button class="button outline small" data-edit-plan="${escapeHtml(plan.id)}">Edit</button>`}</div>`).join("");
  }
  function renderAll() {
    renderOverview(); renderHistory(); renderUserSelects(); renderUsers(); renderPlans();
  }

  function navigate(view) {
    if (!$("view-" + view)) return;
    state.view = view;
    const titles = {
      overview: ["Usage overview", "A clear picture of every unit, user, and limit."],
      consumption: ["Record consumption", "Safely charge units against both quota levels."],
      users: ["Your users", "Organize consumers and manage their individual plans."],
      plans: ["Plans & limits", "Build flexible rules that change without redeploying."],
      activity: ["Request activity", "An auditable view of your consumption decisions."],
    };
    $("page-title").textContent = titles[view][0];
    $("page-description").textContent = titles[view][1];
    $("breadcrumb-current").textContent = titles[view][0];
    document.querySelectorAll(".view").forEach((element) => {
      if (element instanceof HTMLElement) element.hidden = element.id !== `view-${view}`;
    });
    document.querySelectorAll(".nav-link").forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      const active = element.dataset.view === view;
      element.classList.toggle("active", active);
      if (active) element.setAttribute("aria-current", "page"); else element.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function task(action) {
    if (state.busy) return;
    setBusy(true);
    try { await action(); }
    catch (error) { toast(error instanceof Error ? error.message : "Unexpected error", true); }
    finally { setBusy(false); }
  }

  async function connect(key) {
    state.apiKey = key.trim();
    state.lastPayload = null;
    button("replay-request-btn").hidden = true;
    $("consume-result").hidden = true;
    try {
      await loadDashboard();
      $("auth-backdrop").hidden = true;
      input("connect-key").value = "";
      toast(`Connected to ${state.account.name}`);
    } catch (error) {
      state.apiKey = null;
      throw error;
    }
  }

  async function createDemo() {
    const newAccount = await api("/accounts", {
      method: "POST", authenticated: false,
      body: { name: `Demo Workspace ${new Date().toLocaleDateString("en-US")}`, planId: STARTER },
    });
    const apiKey = newAccount.apiKey;
    state.apiKey = apiKey;
    // Offer a useful sample workspace without hard-coding any fake usage.
    try {
      await Promise.all([
        api("/users", { method: "POST", body: { externalId: "Alice", planId: BASIC } }),
        api("/users", { method: "POST", body: { externalId: "Bob", planId: PREMIUM } }),
      ]);
    } catch (error) {
      toast(`Workspace created; a sample user could not be added: ${error instanceof Error ? error.message : String(error)}`, true);
    }
    await connect(apiKey);
    $("key-banner").hidden = false;
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("[data-view]");
    if (link instanceof HTMLElement) navigate(link.dataset.view);
    const edit = target.closest("[data-edit-plan]");
    if (edit instanceof HTMLElement) {
      const plan = state.plans.find((item) => item.id === edit.dataset.editPlan);
      if (!plan || plan.isPredefined) return;
      input("edit-plan-id").value = plan.id;
      input("edit-plan-version").value = String(plan.version);
      input("edit-plan-name").value = plan.name;
      input("edit-plan-monthly").value = String(plan.rules.monthlyAllowance);
      input("edit-plan-per-request").value = String(plan.rules.maxUnitsPerRequest);
      $("edit-plan-panel").hidden = false;
      $("edit-plan-panel").scrollIntoView({ behavior: "smooth" });
    }
    const assign = target.closest("[data-assign-user]");
    if (assign instanceof HTMLElement) task(async () => {
      const userId = assign.dataset.assignUser;
      if (!userId) throw new Error("Missing user ID.");
      const selected = document.querySelector(`[data-user-select="${CSS.escape(userId)}"]`);
      if (!(selected instanceof HTMLSelectElement) || !selected.value) throw new Error("Select a user plan first.");
      await api(`/users/${encodeURIComponent(userId)}/plan`, { method: "PUT", body: { planId: selected.value } });
      await reload(); toast("User plan updated. Previously consumed units were preserved.");
    });
  });

  $("today-label").textContent = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  input("history-month").value = state.historyMonth;
  freshRequestId();
  $("top-consume-btn").addEventListener("click", () => navigate("consumption"));
  $("new-request-id").addEventListener("click", () => {
    freshRequestId();
    $("consume-result").hidden = true;
  });
  $("consume-user").addEventListener("change", () => { void refreshSelectedUserUsage(); });
  $("consume-units").addEventListener("input", renderQuotaPreview);
  $("replay-request-btn").addEventListener("click", () => task(async () => {
    if (!state.lastPayload) throw new Error("No previous completed request to replay.");
    const result = await api("/consumption", { method: "POST", body: state.lastPayload });
    showConsumptionResult(result, true);
    await reload();
    toast("Original decision replayed. No extra units were charged.");
  }));
  $("connect-form").addEventListener("submit", (event) => {
    event.preventDefault();
    task(() => connect(input("connect-key").value));
  });
  $("create-demo-btn").addEventListener("click", () => task(createDemo));
  $("disconnect-btn").addEventListener("click", () => {
    state.apiKey = null;
    state.account = null;
    state.lastPayload = null;
    state.selectedUserUsage = null;
    button("replay-request-btn").hidden = true;
    $("auth-backdrop").hidden = false;
    $("key-banner").hidden = true;
    toast("Disconnected. Your API key was cleared from this page.");
  });
  $("copy-key-btn").addEventListener("click", () => task(async () => {
    if (!state.apiKey) throw new Error("No API key is available.");
    await navigator.clipboard.writeText(state.apiKey);
    toast("API key copied. Store it securely.");
  }));
  $("dismiss-key-btn").addEventListener("click", () => { $("key-banner").hidden = true; });

  $("consume-form").addEventListener("submit", (event) => {
    event.preventDefault();
    task(async () => {
      const userId = input("consume-user").value;
      const units = Number(input("consume-units").value);
      const requestId = input("consume-request-id").value;
      if (!userId || !Number.isSafeInteger(units) || units < 1 || units > MAX) throw new Error("Choose a user and valid positive units.");
      if (!requestId.trim()) throw new Error("Request ID is required.");
      const payload = { userId, units, requestId };
      // On network/timeout failure, preserve the ID for a safe manual retry.
      const result = await api("/consumption", { method: "POST", body: payload });
      state.lastPayload = Object.freeze(payload);
      button("replay-request-btn").hidden = false;
      showConsumptionResult(result);
      freshRequestId(); // Next distinct action must not reuse the old ID.
      await reload();
      toast(result.accepted ? "Consumption accepted and recorded." : "Consumption rejected by quota rules; no units deducted.");
    });
  });

  $("create-user-form").addEventListener("submit", (event) => {
    event.preventDefault();
    task(async () => {
      await api("/users", { method: "POST", body: {
        externalId: input("create-user-external").value.trim(), planId: input("create-user-plan").value,
      } });
      form("create-user-form").reset(); state.usersPage = 1;
      await reload(); toast("User registered successfully.");
    });
  });
  $("create-plan-form").addEventListener("submit", (event) => {
    event.preventDefault();
    task(async () => {
      await api("/plans", { method: "POST", body: {
        name: input("plan-name").value.trim(), scope: input("plan-scope").value,
        rules: { monthlyAllowance: Number(input("plan-monthly").value), maxUnitsPerRequest: Number(input("plan-per-request").value) },
      } });
      form("create-plan-form").reset(); await reload(); toast("Custom plan created.");
    });
  });
  $("change-account-plan-form").addEventListener("submit", (event) => {
    event.preventDefault();
    task(async () => {
      await api("/accounts/me/plan", { method: "PUT", body: { planId: input("change-account-plan").value } });
      await reload(); toast("Account plan updated without resetting usage.");
    });
  });
  $("cancel-edit-plan").addEventListener("click", () => { $("edit-plan-panel").hidden = true; });
  $("edit-plan-form").addEventListener("submit", (event) => {
    event.preventDefault();
    task(async () => {
      const planId = input("edit-plan-id").value;
      await api(`/plans/${encodeURIComponent(planId)}`, { method: "PUT", body: {
        name: input("edit-plan-name").value.trim(),
        expectedVersion: Number(input("edit-plan-version").value),
        rules: { monthlyAllowance: Number(input("edit-plan-monthly").value), maxUnitsPerRequest: Number(input("edit-plan-per-request").value) },
      } });
      $("edit-plan-panel").hidden = true; await reload(); toast("Plan rules updated. New requests use the updated limits.");
    });
  });
  $("history-month").addEventListener("change", () => task(async () => {
    if (!input("history-month").value) throw new Error("Choose a month.");
    state.historyMonth = input("history-month").value;
    state.historyPage = 1;
    await loadHistory();
  }));
  $("history-prev").addEventListener("click", () => task(async () => {
    if (state.historyPage > 1) { state.historyPage--; await loadHistory(); }
  }));
  $("history-next").addEventListener("click", () => task(async () => {
    if (state.historyPage < state.historyTotalPages) { state.historyPage++; await loadHistory(); }
  }));
  $("user-prev").addEventListener("click", () => task(async () => {
    if (state.usersPage > 1) { state.usersPage--; await reload(); }
  }));
  $("user-next").addEventListener("click", () => task(async () => {
    if (state.usersPage < state.usersTotalPages) { state.usersPage++; await reload(); }
  }));
})();
