(async function () {
  if (typeof Auth === "undefined") {
    console.warn("Admin dashboard requires Auth helper.");
    return;
  }

  await Auth.ensureSeedUsers();
  const users = Auth.store.get(Auth.STORAGE_KEYS.USERS, []);
  const CUSTOMER_META_KEY = "app_customer_meta";

  const tiers = ["atelier", "luxe", "studio"];
  const cities = ["Hanoi", "Ho Chi Minh", "Da Nang", "Hue", "Da Lat", "Nha Trang", "Can Tho"];
  const payments = ["paypal", "cod"];
  const statuses = ["active", "risk", "dormant"];

  const existingMeta = Auth.store.get(CUSTOMER_META_KEY, {});
  const metaEntries = { ...existingMeta };
  let dirty = false;

  const randomDate = (startDaysAgo = 5, endDaysAgo = 90) => {
    const now = Date.now();
    const days = startDaysAgo + Math.random() * (endDaysAgo - startDaysAgo);
    return new Date(now - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  };

  users.forEach((user) => {
    if (metaEntries[user.id]) return;
    dirty = true;
    metaEntries[user.id] = {
      tier: tiers[Math.floor(Math.random() * tiers.length)],
      city: cities[Math.floor(Math.random() * cities.length)],
      spend: Math.floor(1500 + Math.random() * 14000),
      lastOrder: randomDate(2, 60),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      items: Math.floor(2 + Math.random() * 20),
      tags: ["VIP"],
      notes: "Awaiting latest campaign engagement.",
      payment: payments[Math.floor(Math.random() * payments.length)]
    };
  });

  if (dirty) {
    Auth.store.set(CUSTOMER_META_KEY, metaEntries);
  }

  const CUSTOMER_META = metaEntries;

  const ADMIN_SEGMENTS = [
    { id: "all", label: "All clients" },
    { id: "vip", label: "VIP runway" },
    { id: "atrisk", label: "At risk" },
    { id: "dormant", label: "Dormant" }
  ];

  const selectors = {
    kpiGrid: "#kpiGrid",
    segmentList: "#segmentList",
    notesFeed: "#notesFeed",
    customerTable: "#customerTable",
    searchInput: "#searchInput",
    tierSelect: "#tierSelect",
    toggleHighValue: "#toggleHighValue",
    toggleDormant: "#toggleDormant",
    invoiceModal: "#invoiceModal",
    invoiceCloseBtn: "#invoiceCloseBtn",
    invoiceSummaryLine: "#invoiceSummaryLine",
    invoiceOrderId: "#invoiceOrderId",
    invoiceDateText: "#invoiceDateText",
    invoicePayment: "#invoicePayment",
    invoiceStatusText: "#invoiceStatusText",
    invoiceItemsCount: "#invoiceItemsCount",
    invoiceTotalValue: "#invoiceTotalValue",
    invoiceShipTo: "#invoiceShipTo",
    invoiceThumbCode: "#invoiceThumbCode",
    invoicePrintBtn: "#invoicePrintBtn",
    invoiceSaveBtn: "#invoiceSaveBtn",
    snapshotBtn: "#snapshotBtn",
    exportBtn: "#exportBtn"
  };

  const els = {};
  Object.entries(selectors).forEach(([key, selector]) => {
    els[key] = document.querySelector(selector);
  });

  const state = {
    segment: "all",
    tier: "all",
    search: "",
    highValue: false,
    dormant: false
  };

  const getProfile = (userId) => Auth.store.get(`app_profile_${userId}`, null);

  const buildCustomerList = () => {
    return users.map((user) => {
      const profile = getProfile(user.id);
      const meta = CUSTOMER_META[user.id];
      const city = profile?.city || meta?.city || "Hanoi";
      const addressParts = [profile?.address, city].filter(Boolean);
      return {
        name: profile?.displayName || user.name || user.email,
        email: user.email,
        tier: meta?.tier || "studio",
        spend: meta?.spend || 0,
        lastOrder: meta?.lastOrder || randomDate(1, 40),
        status: meta?.status || "active",
        items: meta?.items || 0,
        tags: ["Client"],
        notes: meta?.notes || "No notes yet.",
        payment: meta?.payment || "paypal",
        address: addressParts.join(", "),
        city,
        userId: user.id
      };
    });
  };

  let customerList = buildCustomerList();

  const KPI_CONFIG = [
    { label: "Total clients", key: "count" },
    { label: "Active accounts", key: "active" },
    { label: "At-risk", key: "risk" },
    { label: "Avg spend", key: "avg", format: (value) => `$${value.toLocaleString()}` }
  ];

  const STATUS_CLASS = {
    active: "status-pill active",
    risk: "status-pill risk",
    dormant: "status-pill dormant"
  };

  const computeKpis = (list) => {
    const count = list.length;
    const active = list.filter((c) => c.status === "active").length;
    const risk = list.filter((c) => c.status === "risk").length;
    const avg = list.reduce((sum, c) => sum + c.spend, 0) / (list.length || 1);
    return { count, active, risk, avg: Math.round(avg) };
  };

  const fmtCurrency = (value) => `$${value.toLocaleString()}`;
  const fmtDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const renderKpis = (list) => {
    const stats = computeKpis(list);
    els.kpiGrid.innerHTML = KPI_CONFIG.map((kpi) => {
      const raw = stats[kpi.key];
      const display = kpi.format ? kpi.format(raw) : raw.toLocaleString();
      return `
        <div class="kpi-card">
          <div class="kpi-label">${kpi.label}</div>
          <div class="kpi-value">${display}</div>
          <div class="kpi-trend">Synced ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      `;
    }).join("");
  };

  const renderSegments = () => {
    els.segmentList.innerHTML = ADMIN_SEGMENTS.map(
      (segment) => `
        <div class="segment-item ${state.segment === segment.id ? "active" : ""}" data-segment="${segment.id}">
          <span>${segment.label}</span>
          <i class="fas fa-chevron-right"></i>
        </div>
      `
    ).join("");
  };

  const renderNotes = (list) => {
    const sorted = [...list].sort((a, b) => new Date(b.lastOrder) - new Date(a.lastOrder));
    els.notesFeed.innerHTML = sorted.slice(0, 4).map((customer) => `<li><strong>${customer.name}</strong> — ${customer.notes}</li>`).join("");
  };

  const filterSegment = (customer) => {
    if (state.segment === "vip") return customer.tier === "atelier";
    if (state.segment === "atrisk") return customer.status === "risk";
    if (state.segment === "dormant") return customer.status === "dormant";
    return true;
  };

  const filterCustomers = () => {
    return customerList.filter((customer) => {
      if (state.search) {
        const haystack = `${customer.name} ${customer.email} ${customer.city}`.toLowerCase();
        if (!haystack.includes(state.search.toLowerCase())) return false;
      }
      if (state.tier !== "all" && customer.tier !== state.tier) return false;
      if (state.highValue && customer.spend < 8000) return false;
      if (state.dormant && customer.status !== "dormant") return false;
      if (!filterSegment(customer)) return false;
      return true;
    });
  };

  const renderTable = (list) => {
    if (!list.length) {
      els.customerTable.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:36px;color:#6c6c6c;">No customers match these filters.</td></tr>`;
      return;
    }
    els.customerTable.innerHTML = list.map((customer) => `
      <tr data-customer="${customer.email}">
        <td>
          <strong>${customer.name}</strong><br />
          <span style="color:#777;font-size:12px;">${customer.email}</span>
        </td>
        <td>${customer.tier.replace(/^[a-z]/, (m) => m.toUpperCase())}</td>
        <td>${fmtCurrency(customer.spend)}</td>
        <td>${fmtDate(customer.lastOrder)}</td>
        <td><span class="${STATUS_CLASS[customer.status] || STATUS_CLASS.active}">${customer.status}</span></td>
        <td>${customer.tags.map((tag) => `<span class="customer-tag">${tag}</span>`).join("")}</td>
      </tr>
    `).join("");
  };

  const updateUI = () => {
    const filtered = filterCustomers();
    renderKpis(filtered);
    renderTable(filtered);
    renderNotes(filtered);
  };

  const openInvoiceModal = (customer) => {
    if (!customer) return;
    const summary = `${customer.name} • ${fmtDate(customer.lastOrder)} • ${fmtCurrency(customer.spend)} lifetime`;
    const thumb = customer.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, "X");

    els.invoiceSummaryLine.textContent = summary;
    els.invoiceOrderId.textContent = customer.name;
    els.invoiceDateText.textContent = fmtDate(customer.lastOrder);
    els.invoicePayment.textContent = paymentLabel(customer.payment);
    els.invoiceStatusText.textContent = customer.status === "active" ? "Healthy" : customer.status === "risk" ? "At risk" : "Dormant";
    els.invoiceItemsCount.textContent = `${customer.items} item(s)`;
    els.invoiceTotalValue.textContent = fmtCurrency(customer.spend);
    els.invoiceShipTo.textContent = customer.address;
    els.invoiceThumbCode.textContent = thumb;
    els.invoiceModal.hidden = false;
  };

  const closeInvoiceModal = () => {
    els.invoiceModal.hidden = true;
  };

  const printInvoice = () => {
    const win = window.open("", "_blank", "width=520,height=720");
    if (!win) {
      alert("Please allow popups to print.");
      return;
    }
    win.document.write(`<html><head><title>Customer snapshot</title></head><body style="font-family:Arial;padding:40px;line-height:1.6;color:#111;">
      <h2 style="margin-top:0;">Customer snapshot</h2>
      <p>${els.invoiceSummaryLine.textContent}</p>
      <ul style="list-style:none;padding:0;margin:24px 0;">
        <li><strong>Client:</strong> ${els.invoiceOrderId.textContent}</li>
        <li><strong>Last order:</strong> ${els.invoiceDateText.textContent}</li>
        <li><strong>Status:</strong> ${els.invoiceStatusText.textContent}</li>
        <li><strong>Payment:</strong> ${els.invoicePayment.textContent}</li>
        <li><strong>Items:</strong> ${els.invoiceItemsCount.textContent}</li>
        <li><strong>Total:</strong> ${els.invoiceTotalValue.textContent}</li>
        <li><strong>Ship to:</strong> ${els.invoiceShipTo.textContent}</li>
      </ul>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const saveInvoice = () => {
    const lines = [
      "Avant Atelier · Customer insight",
      "-------------------------------",
      `Summary: ${els.invoiceSummaryLine.textContent}`,
      `Client: ${els.invoiceOrderId.textContent}`,
      `Last order: ${els.invoiceDateText.textContent}`,
      `Status: ${els.invoiceStatusText.textContent}`,
      `Payment: ${els.invoicePayment.textContent}`,
      `Items: ${els.invoiceItemsCount.textContent}`,
      `Total: ${els.invoiceTotalValue.textContent}`,
      `Ship to: ${els.invoiceShipTo.textContent}`
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "customer-insight.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  document.addEventListener("DOMContentLoaded", () => {
    renderSegments();
    updateUI();

    els.segmentList?.addEventListener("click", (event) => {
      const item = event.target.closest(".segment-item");
      if (!item) return;
      state.segment = item.dataset.segment;
      renderSegments();
      updateUI();
    });

    els.searchInput?.addEventListener("input", (event) => {
      state.search = event.target.value.trim();
      updateUI();
    });

    els.tierSelect?.addEventListener("change", (event) => {
      state.tier = event.target.value;
      updateUI();
    });

    els.toggleHighValue?.addEventListener("click", () => {
      state.highValue = !state.highValue;
      els.toggleHighValue.classList.toggle("active", state.highValue);
      updateUI();
    });

    els.toggleDormant?.addEventListener("click", () => {
      state.dormant = !state.dormant;
      els.toggleDormant.classList.toggle("active", state.dormant);
      updateUI();
    });

    els.customerTable?.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-customer]");
      if (!row) return;
      const customer = customerList.find((c) => c.email === row.dataset.customer);
      openInvoiceModal(customer);
    });

    els.invoiceModal?.addEventListener("click", (event) => {
      if (event.target === els.invoiceModal) closeInvoiceModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeInvoiceModal();
    });

    els.invoiceCloseBtn?.addEventListener("click", closeInvoiceModal);
    els.invoicePrintBtn?.addEventListener("click", printInvoice);
    els.invoiceSaveBtn?.addEventListener("click", saveInvoice);
  });
})();
