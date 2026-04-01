const state = {
  apiKey: "",
  masked: true,
  loaded: false,
  saving: false,
};

const els = {
  form: document.getElementById("configForm"),
  apiKey: document.getElementById("apiKey"),
  toggle: document.getElementById("toggleVisibility"),
  refresh: document.getElementById("refreshButton"),
  save: document.getElementById("saveButton"),
  statusBadge: document.getElementById("statusBadge"),
  statusText: document.getElementById("statusText"),
  configuredValue: document.getElementById("configuredValue"),
  updatedValue: document.getElementById("updatedValue"),
  sourceValue: document.getElementById("sourceValue"),
  saveHint: document.getElementById("saveHint"),
  toastTemplate: document.getElementById("toastTemplate"),
};

function setBadge(kind, text) {
  els.statusBadge.className = `badge badge-${kind}`;
  els.statusBadge.textContent = text;
}

function formatTimestamp(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeConfig(payload) {
  const config = payload?.config ?? payload ?? {};
  const key =
    config.apiKey ??
    config.providers?.bigmodel?.apiKey ??
    config.api_key ??
    config.bigmodelApiKey ??
    config.bigmodel_api_key ??
    config.key ??
    "";

  return {
    apiKey: typeof key === "string" ? key : "",
    configured:
      typeof payload?.hasApiKey === "boolean"
        ? payload.hasApiKey
        : typeof config.configured === "boolean"
          ? config.configured
        : Boolean(typeof key === "string" && key.length > 0),
    updatedAt:
      config.updatedAt ?? payload?.updatedAt ?? config.updated_at ?? config.lastUpdated ?? null,
    source: payload?.source ?? config.source ?? config.provider ?? "Local config",
  };
}

function maskKey(value) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

function showToast(message, variant = "success") {
  const toast = els.toastTemplate.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  toast.classList.add(variant);
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));

  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}

function setBusy(isBusy) {
  const disabled = Boolean(isBusy);
  els.apiKey.disabled = disabled;
  els.toggle.disabled = disabled;
  els.refresh.disabled = disabled;
  els.save.disabled = disabled;
}

function renderConfig(config) {
  state.apiKey = config.apiKey;
  state.loaded = true;

  if (state.masked) {
    els.apiKey.type = "password";
    els.apiKey.value = maskKey(config.apiKey);
    els.toggle.textContent = "Show";
  } else {
    els.apiKey.type = "text";
    els.apiKey.value = config.apiKey;
    els.toggle.textContent = "Hide";
  }

  els.configuredValue.textContent = config.configured ? "Yes" : "No";
  els.updatedValue.textContent = formatTimestamp(config.updatedAt);
  els.sourceValue.textContent = config.source || "Local config";

  if (config.configured) {
    setBadge("good", "Configured");
    els.statusText.textContent = "BigModel credentials are available to the local backend.";
  } else {
    setBadge("warm", "Not configured");
    els.statusText.textContent = "No API key was returned by the backend yet.";
  }
}

function getEditableValue() {
  return state.masked ? state.apiKey : els.apiKey.value;
}

async function fetchConfig() {
  setBusy(true);
  setBadge("warm", "Loading");
  els.statusText.textContent = "Fetching current configuration...";
  els.saveHint.textContent = "";

  try {
    const response = await fetch("/api/config", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`GET /api/config failed with ${response.status}`);
    }

    const payload = await response.json();
    const config = normalizeConfig(payload);
    renderConfig(config);
    showToast("Configuration loaded.", "success");
  } catch (error) {
    console.error(error);
    setBadge("bad", "Error");
    els.statusText.textContent = "Unable to fetch configuration from the backend.";
    els.configuredValue.textContent = "Unknown";
    els.updatedValue.textContent = "Unknown";
    els.sourceValue.textContent = "Backend unavailable";
    showToast("Failed to load config.", "error");
  } finally {
    setBusy(false);
  }
}

async function saveConfig(event) {
  event.preventDefault();

  const apiKey = getEditableValue().trim();

  if (!apiKey) {
    showToast("API key cannot be empty.", "error");
    return;
  }

  setBusy(true);
  state.saving = true;
  els.saveHint.textContent = "Saving...";

  try {
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ apiKey, bigModelApiKey: apiKey }),
    });

    if (!response.ok) {
      throw new Error(`PUT /api/config failed with ${response.status}`);
    }

    const payload = await response.json().catch(() => ({}));
    const config = normalizeConfig(payload);
    config.apiKey = apiKey;
    config.configured = true;
    renderConfig(config);
    showToast("Configuration saved.", "success");
    els.saveHint.textContent = "Saved.";
  } catch (error) {
    console.error(error);
    showToast("Failed to save config.", "error");
    els.saveHint.textContent = "Save failed.";
  } finally {
    state.saving = false;
    setBusy(false);
  }
}

function toggleVisibility() {
  if (state.masked) {
    els.apiKey.type = "text";
    els.apiKey.value = state.apiKey;
    els.toggle.textContent = "Hide";
    state.masked = false;
    return;
  }

  state.apiKey = els.apiKey.value;
  els.apiKey.type = "password";
  els.apiKey.value = maskKey(state.apiKey);
  els.toggle.textContent = "Show";
  state.masked = true;
}

function wireEvents() {
  els.form.addEventListener("submit", saveConfig);
  els.toggle.addEventListener("click", toggleVisibility);
  els.refresh.addEventListener("click", fetchConfig);

  els.apiKey.addEventListener("focus", () => {
    if (state.masked && state.apiKey) {
      els.apiKey.value = state.apiKey;
      els.apiKey.type = "password";
      state.masked = false;
      els.toggle.textContent = "Hide";
    }
  });

  els.apiKey.addEventListener("input", () => {
    if (!state.masked) {
      state.apiKey = els.apiKey.value;
    }
  });

  els.apiKey.addEventListener("blur", () => {
    if (!state.masked) {
      state.apiKey = els.apiKey.value;
    }
  });
}

wireEvents();
fetchConfig();
