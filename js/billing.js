/**
 * QuarkMemory website billing client (PRD-044 §8).
 * Hosted API only — never embed Stripe secrets in the browser.
 */
(function (global) {
  const SESSION_KEY = "qm_web_session";

  function getApiBase() {
    const meta = document.querySelector('meta[name="qm-api-base"]');
    const params = new URLSearchParams(window.location.search);
    const override = params.get("api");
    if (override) return override.replace(/\/$/, "");
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:8765";
    }
    return (meta?.content || "https://api.quarkmemory.com").replace(/\/$/, "");
  }

  function loadSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveSession(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function slugify(value) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/^(.{3,98}).*$/, "$1")
      .slice(0, 100) || "org";
  }

  function parsePlan(value) {
    const plan = (value || "").toLowerCase();
    return plan === "pro" || plan === "team" ? plan : null;
  }

  function registerPath(plan) {
    return `register.html?plan=${plan}`;
  }

  async function api(path, options, accessToken) {
    const headers = { ...(options.headers || {}) };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (options.body && typeof options.body === "object") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const detail = data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : typeof detail === "object"
            ? JSON.stringify(detail)
            : data?.message || res.statusText;
      throw new Error(msg || "Request failed");
    }
    return data;
  }

  async function registerWithOrg(payload) {
    const res = await fetch(`${getApiBase()}/auth/register-with-org`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return res.json();
    }

    if (res.status !== 404 && res.status !== 501) {
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      const detail = data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : typeof detail === "object"
            ? JSON.stringify(detail)
            : res.statusText;
      throw new Error(msg || "Registration failed");
    }

    const tokens = await api("/auth/register", {
      method: "POST",
      body: {
        email: payload.email,
        password: payload.password,
        display_name: payload.display_name,
      },
    });

    const org = await api(
      "/orgs",
      {
        method: "POST",
        body: { slug: payload.org_slug, display_name: payload.org_display_name },
      },
      tokens.access_token
    );

    return {
      ...tokens,
      org_id: org.id,
    };
  }

  function getAdminBase() {
    return window.location.origin.replace(/\/$/, "");
  }

  function adminOnboardingUrl() {
    return `${getAdminBase()}/admin/#/onboarding`;
  }

  function adminOverviewUrl() {
    return `${getAdminBase()}/admin/#/overview`;
  }

  async function registerAndGoToAdmin(formPayload) {
    const orgSlug = slugify(formPayload.org_slug || formPayload.org_display_name || formPayload.email.split("@")[0]);
    const payload = {
      email: formPayload.email.trim(),
      password: formPayload.password,
      display_name: formPayload.display_name.trim() || formPayload.email.split("@")[0],
      org_slug: orgSlug,
      org_display_name: formPayload.org_display_name.trim() || orgSlug,
    };

    const auth = await registerWithOrg(payload);
    if (!auth.access_token || !auth.org_id) {
      throw new Error("Account created but organisation id missing — contact support.");
    }

    saveSession({
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      orgId: auth.org_id,
      email: payload.email,
    });

    window.location.href = adminOnboardingUrl();
  }

  async function startCheckout(plan, formPayload) {
    const selected = parsePlan(plan);
    if (!selected) throw new Error("Invalid plan — choose Pro or Team.");

    const orgSlug = slugify(formPayload.org_slug || formPayload.org_display_name || formPayload.email.split("@")[0]);
    const payload = {
      email: formPayload.email.trim(),
      password: formPayload.password,
      display_name: formPayload.display_name.trim() || formPayload.email.split("@")[0],
      org_slug: orgSlug,
      org_display_name: formPayload.org_display_name.trim() || orgSlug,
    };

    const auth = await registerWithOrg(payload);
    if (!auth.access_token || !auth.org_id) {
      throw new Error("Account created but organisation id missing — contact support.");
    }

    saveSession({
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      orgId: auth.org_id,
      email: payload.email,
      plan: selected,
    });

    const checkout = await api(
      `/orgs/${auth.org_id}/billing/checkout-session`,
      { method: "POST", body: { plan: selected } },
      auth.access_token
    );

    if (!checkout.checkout_url) {
      throw new Error("Checkout URL missing from API response.");
    }

    window.location.href = checkout.checkout_url;
  }

  async function pollBillingActive(orgId, accessToken, maxAttempts = 30, intervalMs = 2000) {
    for (let i = 0; i < maxAttempts; i += 1) {
      const billing = await api(`/orgs/${orgId}/billing`, { method: "GET" }, accessToken);
      if (billing.subscription_status === "active") return billing;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("Still processing — check email or billing settings in the admin console.");
  }

  global.QMBilling = {
    SESSION_KEY,
    getApiBase,
    loadSession,
    saveSession,
    clearSession,
    parsePlan,
    registerPath,
    startCheckout,
    registerAndGoToAdmin,
    pollBillingActive,
    adminOverviewUrl,
    adminOnboardingUrl,
    api,
  };
})(window);
