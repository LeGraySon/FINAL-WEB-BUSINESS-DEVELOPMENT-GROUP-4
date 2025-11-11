
      document.addEventListener("DOMContentLoaded", async () => {
        if (!window.Auth) {
          console.warn("Auth module is unavailable.");
          return;
        }

        await Auth.ensureSeedUsers();
        const session = Auth.session();
        if (!session || !session.userId) {
          window.location.href = "Signin.html";
          return;
        }

        const store = Auth.store;
        const PROFILE_KEY = `app_profile_${session.userId}`;
        const PHOTO_KEY = `app_profile_photo_${session.userId}`;
        const ORDERS_KEY = "app_orders";
        const STATUS_FLOW = ["Processing", "Packed", "Shipped", "Out for delivery", "Delivered"];

        const els = {
          avatar: document.getElementById("profileAvatar"),
          avatarInput: document.getElementById("avatarInput"),
          changeAvatarBtn: document.getElementById("changeAvatarBtn"),
          logoutBtn: document.getElementById("logoutBtn"),
          downloadBtn: document.getElementById("downloadSummaryBtn"),
          exportOrdersBtn: document.getElementById("exportOrdersBtn"),
          accountName: document.getElementById("accountName"),
          accountEmail: document.getElementById("accountEmail"),
          toast: document.getElementById("toast"),
          orderTable: document.getElementById("orderTable"),
          orderBody: document.getElementById("orderHistoryBody"),
          orderEmpty: document.getElementById("orderEmpty"),
          trackingList: document.getElementById("trackingList"),
          trackingEmpty: document.getElementById("trackingEmpty"),
          cardCode: document.getElementById("cardCode"),
          lookNumber: document.getElementById("lookNumber"),
          invoiceModal: document.getElementById("invoiceModal"),
          invoiceClose: document.getElementById("invoiceCloseBtn"),
          invoiceSummaryLine: document.getElementById("invoiceSummaryLine"),
          invoiceOrderId: document.getElementById("invoiceOrderId"),
          invoiceDateText: document.getElementById("invoiceDateText"),
          invoicePayment: document.getElementById("invoicePayment"),
          invoiceStatusText: document.getElementById("invoiceStatusText"),
          invoiceItemsCount: document.getElementById("invoiceItemsCount"),
          invoiceTotalValue: document.getElementById("invoiceTotalValue"),
          invoiceShipTo: document.getElementById("invoiceShipTo"),
          invoiceThumbCode: document.getElementById("invoiceThumbCode"),
          invoicePrintBtn: document.getElementById("invoicePrintBtn"),
          invoiceSaveBtn: document.getElementById("invoiceSaveBtn")
        };

        const fields = {
          displayName: document.getElementById("displayName"),
          email: document.getElementById("email"),
          phone: document.getElementById("phone"),
          dob: document.getElementById("dob"),
          address: document.getElementById("address"),
          city: document.getElementById("city"),
          postalCode: document.getElementById("postalCode"),
          notes: document.getElementById("notes")
        };

        const defaults = {
          displayName: session.name || "Avant Member",
          email: session.email,
          phone: "",
          dob: "",
          address: "",
          city: "",
          postalCode: "",
          notes: ""
        };
        let cachedOrders = [];

        function showToast(message) {
          els.toast.textContent = message;
          els.toast.classList.add("show");
          window.clearTimeout(showToast._timer);
          showToast._timer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
        }

        function loadProfile() {
          const data = store.get(PROFILE_KEY, defaults) || defaults;
          Object.entries(fields).forEach(([key, input]) => {
            if (!input) return;
            input.value = data[key] ?? defaults[key] ?? "";
          });

          els.accountName.textContent = data.displayName || defaults.displayName;
          els.accountEmail.textContent = data.email || defaults.email;
          const lookValue = Math.abs(data.displayName?.length || 16) % 38 || 16;
          els.lookNumber.textContent = String(lookValue).padStart(2, "0");
        }

        function saveProfile(event) {
          event.preventDefault();
          const payload = {};
          Object.entries(fields).forEach(([key, input]) => {
            payload[key] = (input?.value ?? "").trim();
          });
          payload.email = defaults.email;
          store.set(PROFILE_KEY, payload);

          const currentSession = Auth.session();
          if (currentSession) {
            currentSession.name = payload.displayName || defaults.displayName;
            store.set(Auth.STORAGE_KEYS.SESSION, currentSession);
            els.accountName.textContent = currentSession.name;
          }

          if (!localStorage.getItem(PHOTO_KEY)) {
            loadAvatar();
          }

          showToast("Profile updated.");
        }

        function seedCardCode() {
          const code = `AA-${(session.userId || "")
            .replace(/[^0-9a-z]/gi, "")
            .padEnd(6, "0")
            .slice(0, 6)
            .toUpperCase()}`;
          els.cardCode.textContent = code;
        }

        function loadAvatar() {
          const stored = localStorage.getItem(PHOTO_KEY);
          if (stored) {
            els.avatar.src = stored;
            return;
          }
          const nameSource = fields.displayName?.value || defaults.displayName || "A";
          const initials = nameSource
            .split(" ")
            .map((p) => p.trim()[0] || "")
            .join("")
            .slice(0, 2)
            .toUpperCase();
          const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
              <rect width="200" height="200" fill="#1a1d24"/>
              <text x="100" y="116" text-anchor="middle" font-size="72" fill="#ff5d20" font-family="Inter, sans-serif" font-weight="700">${initials}</text>
            </svg>
          `.trim();
          els.avatar.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
        }

        function handleAvatarUpload(file) {
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result;
            if (typeof dataUrl === "string") {
              els.avatar.src = dataUrl;
              localStorage.setItem(PHOTO_KEY, dataUrl);
              showToast("Portrait updated.");
            }
          };
          reader.readAsDataURL(file);
        }

        function statusClass(status) {
          if (!status) return "status-processing";
          const key = status.toLowerCase();
          if (key.includes("deliver")) return "status-delivered";
          if (key.includes("out")) return "status-out";
          if (key.includes("ship")) return "status-shipped";
          if (key.includes("pack")) return "status-packed";
          if (key.includes("cancel")) return "status-cancelled";
          return "status-processing";
        }

        function fmtCurrency(amount) {
          if (!Number.isFinite(Number(amount))) return amount;
          return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));
        }

        function fmtDate(value) {
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return value;
          return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }

        function formatAddress(address = {}) {
          const parts = [
            address.line1 || address.address || fields.address?.value || "",
            address.city || fields.city?.value || "",
            address.postalCode || address.zip || fields.postalCode?.value || ""
          ]
            .map((part) => String(part || "").trim())
            .filter(Boolean);
          return parts.length ? parts.join(", ") : "No shipping details saved.";
        }

        function resolvePaymentLabel(method) {
          if (!method) return "Not specified";
          const key = String(method).toLowerCase();
          if (key === "cod") return "Cash on delivery";
          if (key === "paypal") return "PayPal";
          return method;
        }

        function openInvoice(orderId) {
          if (!els.invoiceModal) return;
          const order = cachedOrders.find((entry) => entry.id === orderId);
          if (!order) {
            showToast("Không tìm thấy đơn hàng.");
            return;
          }
          const items = (order.items || []).length;
          const total = fmtCurrency(order.total);
          const dateText = fmtDate(order.placedAt);
          const summary = `${order.id} • ${dateText} • ${items} item(s) • ${total}`;
          const shipTo = formatAddress(order.address || {});
          const thumbCode = (order.id || "INV").replace(/[^0-9a-z]/gi, "").slice(-3).toUpperCase().padStart(3, "0");

          els.invoiceSummaryLine.textContent = summary;
          els.invoiceOrderId.textContent = order.id;
          els.invoiceDateText.textContent = dateText;
          els.invoicePayment.textContent = resolvePaymentLabel(order.paymentMethod);
          els.invoiceStatusText.textContent = order.status || "Processing";
          els.invoiceItemsCount.textContent = `${items} item(s)`;
          els.invoiceTotalValue.textContent = total;
          els.invoiceShipTo.textContent = shipTo;
          if (els.invoiceThumbCode) {
            els.invoiceThumbCode.textContent = thumbCode;
          }

          els.invoiceModal.hidden = false;
        }

        function closeInvoice() {
          if (els.invoiceModal) {
            els.invoiceModal.hidden = true;
          }
        }

        function printInvoice() {
          const win = window.open("", "_blank", "width=520,height=720");
          if (!win) {
            showToast("Please allow popups to print.");
            return;
          }
          win.document.write(`<html><head><title>Invoice</title></head><body style="font-family:Arial;padding:40px;line-height:1.6;color:#111;">
            <h2 style="margin-top:0;">Avant Atelier Invoice</h2>
            <p>${els.invoiceSummaryLine?.textContent || "No data"}</p>
            <ul style="list-style:none;padding:0;margin:24px 0;">
              <li><strong>Order:</strong> ${els.invoiceOrderId?.textContent || "-"}</li>
              <li><strong>Date:</strong> ${els.invoiceDateText?.textContent || "-"}</li>
              <li><strong>Status:</strong> ${els.invoiceStatusText?.textContent || "-"}</li>
              <li><strong>Payment:</strong> ${els.invoicePayment?.textContent || "-"}</li>
              <li><strong>Items:</strong> ${els.invoiceItemsCount?.textContent || "-"}</li>
              <li><strong>Total:</strong> ${els.invoiceTotalValue?.textContent || "-"}</li>
              <li><strong>Ship to:</strong> ${els.invoiceShipTo?.textContent || "-"}</li>
            </ul>
            </body></html>`);
          win.document.close();
          win.focus();
          win.print();
        }

        function saveInvoice() {
          const lines = [
            "Avant Atelier Invoice Snapshot",
            "==============================",
            `Summary: ${els.invoiceSummaryLine?.textContent || "-"}`,
            `Order: ${els.invoiceOrderId?.textContent || "-"}`,
            `Date: ${els.invoiceDateText?.textContent || "-"}`,
            `Status: ${els.invoiceStatusText?.textContent || "-"}`,
            `Payment: ${els.invoicePayment?.textContent || "-"}`,
            `Items: ${els.invoiceItemsCount?.textContent || "-"}`,
            `Total: ${els.invoiceTotalValue?.textContent || "-"}`,
            `Ship to: ${els.invoiceShipTo?.textContent || "-"}`
          ];
          const blob = new Blob([lines.join("\n")], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "invoice-summary.txt";
          link.click();
          URL.revokeObjectURL(url);
        }

        function getOrdersForUser() {
          const stored = store.get(ORDERS_KEY, []);
          if (!Array.isArray(stored)) {
            return [];
          }
          return stored
            .filter((order) => order && order.userId === session.userId)
            .map((order) => {
              const basePlaced = Number(order.placedAt) || Date.now();
              const normalizedItems = Array.isArray(order.items)
                ? order.items
                : Array.isArray(order.cart)
                  ? order.cart
                  : [];
              return {
                ...order,
                items: normalizedItems,
                placedAt: basePlaced,
                estimatedDelivery: Number(order.estimatedDelivery) || basePlaced + 1000 * 60 * 60 * 24 * 3,
                status: order.status || "Processing",
                total: Number(order.total) || 0
              };
            });
        }

        function loadOrders() {
          const orders = getOrdersForUser();
          cachedOrders = [...orders];

          if (orders.length === 0) {
            els.orderEmpty.hidden = false;
            els.orderTable.hidden = true;
            els.trackingEmpty.hidden = false;
            return;
          }

          els.orderEmpty.hidden = true;
          els.orderTable.hidden = false;

          const sorted = [...orders].sort((a, b) => (b.placedAt || 0) - (a.placedAt || 0));
          els.orderBody.innerHTML = sorted
            .map((order) => {
              const itemsSummary = (order.items || [])
                .map((item) => `${item.quantity || 1} x ${item.name}`)
                .join(", ");
              return `
                <tr>
                  <td><strong>${order.id}</strong></td>
                  <td>${fmtDate(order.placedAt)}</td>
                  <td>${fmtCurrency(order.total)}</td>
                  <td><span class="status-pill ${statusClass(order.status)}">${order.status}</span></td>
                  <td>${itemsSummary}</td>
                  <td>
                    <button class="btn" data-order="${order.id}" data-action="view-invoice">Invoice</button>
                  </td>
                </tr>
              `;
            })
            .join("");

          const activeOrders = sorted.filter((order) => {
            const delivered = order.status?.toLowerCase().includes("deliver");
            const cancelled = order.status?.toLowerCase().includes("cancel");
            return !delivered && !cancelled;
          });

          if (activeOrders.length === 0) {
            els.trackingList.innerHTML = "";
            els.trackingList.appendChild(els.trackingEmpty);
            els.trackingEmpty.hidden = false;
            return;
          }

          els.trackingEmpty.hidden = true;
          els.trackingList.innerHTML = activeOrders
            .map((order) => {
              const stepIndex = STATUS_FLOW.findIndex((step) => order.status?.toLowerCase().includes(step.toLowerCase()));
              const progress = stepIndex >= 0 ? ((stepIndex + 1) / STATUS_FLOW.length) * 100 : 20;
              return `
                <div class="tracking-item">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                    <div>
                      <strong>${order.id}</strong>
                      <div class="tracking-meta">
                        <span>${fmtDate(order.placedAt)}</span>
                        <span>Tracking: <strong>${order.trackingCode || "Updating"}</strong></span>
                      </div>
                    </div>
                    <span class="status-pill ${statusClass(order.status)}">${order.status}</span>
                  </div>
                  <div class="progress-bar"><span style="width:${Math.min(progress, 100)}%"></span></div>
                  <div class="tracking-meta">
                    <span><i class="fas fa-box"></i> ${(order.items || []).length} item(s)</span>
                    <span><i class="fas fa-calendar"></i> ETA: ${fmtDate(order.estimatedDelivery || order.placedAt)}</span>
                  </div>
                </div>
              `;
            })
            .join("");
        }

        function downloadProfileSummary() {
          const data = store.get(PROFILE_KEY, defaults) || defaults;
          const lines = [
            "Avant Atelier - Member Pass Card",
            "================================",
            `Name: ${data.displayName || defaults.displayName}`,
            `Email: ${data.email || defaults.email}`,
            `Phone: ${data.phone || "-"}`,
            `Date of birth: ${data.dob || "-"}`,
            `Address: ${data.address || "-"}`,
            `City: ${data.city || "-"}`,
            `Postal code: ${data.postalCode || "-"}`,
            "",
            "Notes:",
            data.notes ? data.notes : "-"
          ];
          const blob = new Blob([lines.join("\n")], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "avant-pass-card.txt";
          link.click();
          URL.revokeObjectURL(url);
        }

        function exportOrdersCsv() {
          const orders = getOrdersForUser();
          if (orders.length === 0) {
            showToast("No orders to export yet.");
            return;
          }

          const header = ["Order", "Date", "Total", "Status", "Items"].join(",");
          const rows = orders.map((order) => {
            const items = (order.items || []).map((item) => `${item.quantity || 1} x ${item.name}`).join(" | ");
            return [
              `"${order.id}"`,
              `"${fmtDate(order.placedAt)}"`,
              `"${order.total}"`,
              `"${order.status}"`,
              `"${items}"`
            ].join(",");
          });
          const csv = [header, ...rows].join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "avant-orders.csv";
          link.click();
          URL.revokeObjectURL(url);
        }

        seedCardCode();
        loadProfile();
        loadAvatar();
        loadOrders();

        document.getElementById("profileForm").addEventListener("submit", saveProfile);
        els.changeAvatarBtn.addEventListener("click", () => els.avatarInput.click());
        els.avatarInput.addEventListener("change", (event) => handleAvatarUpload(event.target.files?.[0]));
        els.logoutBtn.addEventListener("click", () => {
          const role = localStorage.getItem("role");
          Auth.logout();
          if (role === "user") {
            localStorage.removeItem("cartItems"); 
            showToast("Logged out successfully. Cart cleared.");
          } else {
            showToast("Admin logged out successfully.");
          }
          window.location.href = "index.html";
        });
        els.downloadBtn.addEventListener("click", downloadProfileSummary);
        els.exportOrdersBtn.addEventListener("click", exportOrdersCsv);
        els.orderBody.addEventListener("click", (event) => {
          const button = event.target.closest("button[data-action='view-invoice']");
          if (!button) return;
          openInvoice(button.dataset.order);
        });
        els.invoiceClose?.addEventListener("click", closeInvoice);
        els.invoiceModal?.addEventListener("click", (event) => {
          if (event.target === els.invoiceModal) {
            closeInvoice();
          }
        });
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && !els.invoiceModal?.hidden) {
            closeInvoice();
          }
        });
        els.invoicePrintBtn?.addEventListener("click", printInvoice);
        els.invoiceSaveBtn?.addEventListener("click", saveInvoice);
      });
    
