(function (global) {
  const DEFAULT_FILTERS = {
    search: "",
    sort: "",
    minPrice: "",
    maxPrice: ""
  };

  function computeDiscountPercent(original, sale) {
    const originalValue = toNumber(original);
    const saleValue = toNumber(sale);
    if (originalValue == null || saleValue == null) return null;
    if (!(saleValue > 0) || saleValue >= originalValue) return null;
    return Math.round(((originalValue - saleValue) / originalValue) * 100);
  }

  function shuffleArray(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  function init(options) {
    const config = {
      listId: options.listId,
      emptyId: options.emptyId,
      source: options.source,
      sources: Array.isArray(options.source) ? options.source : [options.source],
      detailUrl: typeof options.detailUrl === "function" ? options.detailUrl : null,
      detailHref: typeof options.detailHref === "string" ? options.detailHref : "",
      pageKey: options.pageKey || `listing-${Date.now()}`,
      errorMessage: options.errorMessage || "Could not load products right now. Please try again later.",
      shuffle: Boolean(options.shuffle)
    };

    const listElement = document.getElementById(config.listId);
    if (!listElement) {
      console.warn("ProductListing: list element not found", config.listId);
      return;
    }

    const emptyElement = config.emptyId ? document.getElementById(config.emptyId) : null;
    const emptyDefaultText = emptyElement ? emptyElement.textContent : "";

    const state = {
      products: [],
      filters: { ...DEFAULT_FILTERS }
    };

    const useFilters = options.enableFilters !== false;
    const ui = useFilters ? createFilterUi(config.pageKey, options.filterTitle || "Filter products") : null;
    const toggle = ui?.toggle || null;
    const panel = ui?.panel || null;
    const overlay = ui?.overlay || null;
    const form = ui?.form || null;
    const resetButton = ui?.resetButton || null;
    const fields = ui?.fields || null;

    const openPanel = () => {
      if (!ui) return;
      panel.hidden = false;
      overlay.hidden = false;
      requestAnimationFrame(() => {
        panel.classList.add("is-open");
        overlay.classList.add("is-visible");
      });
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("product-filter-open");
    };

    const closePanel = () => {
      if (!ui) return;
      panel.classList.remove("is-open");
      overlay.classList.remove("is-visible");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("product-filter-open");
      window.setTimeout(() => {
        panel.hidden = true;
        overlay.hidden = true;
      }, 200);
    };

    if (ui) {
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        if (expanded) {
          closePanel();
        } else {
          syncFormFromState();
          openPanel();
        }
      });

      overlay.addEventListener("click", closePanel);
      ui.closeButton.addEventListener("click", closePanel);

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && panel.classList.contains("is-open")) {
          closePanel();
        }
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        state.filters = {
          search: (fields.search.value || "").trim(),
          sort: fields.sort.value,
          minPrice: fields.min.value ? Number(fields.min.value) : "",
          maxPrice: fields.max.value ? Number(fields.max.value) : ""
        };
        applyFilters();
        closePanel();
      });

      resetButton.addEventListener("click", () => {
        state.filters = { ...DEFAULT_FILTERS };
        syncFormFromState();
        applyFilters();
        closePanel();
      });
    }

    function syncFormFromState() {
      if (!fields) return;
      fields.search.value = state.filters.search;
      fields.sort.value = state.filters.sort;
      fields.min.value = state.filters.minPrice;
      fields.max.value = state.filters.maxPrice;
    }

    function applyFilters() {
      if (!Array.isArray(state.products) || state.products.length === 0) {
        renderProducts([]);
        return;
      }

      const normalizedSearch = state.filters.search.toLowerCase();
      let results = state.products.slice();

      if (normalizedSearch) {
        results = results.filter((product) => {
          const name = String(product.name || "").toLowerCase();
          return name.includes(normalizedSearch);
        });
      }

      if (state.filters.minPrice !== "") {
        const min = Number(state.filters.minPrice);
        results = results.filter((product) => {
          const price = toNumber(product.price);
          return price != null && price >= min;
        });
      }

      if (state.filters.maxPrice !== "") {
        const max = Number(state.filters.maxPrice);
        results = results.filter((product) => {
          const price = toNumber(product.price);
          return price != null && price <= max;
        });
      }

      results.sort((a, b) => {
        switch (state.filters.sort) {
          case "price-asc":
            return compareNumbers(toNumber(a.price), toNumber(b.price));
          case "price-desc":
            return compareNumbers(toNumber(b.price), toNumber(a.price));
          case "name-asc":
            return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
          case "name-desc":
            return String(b.name || "").localeCompare(String(a.name || ""), undefined, { sensitivity: "base" });
          default:
            return (a.__index || 0) - (b.__index || 0);
        }
      });

      renderProducts(results);
    }

    function renderProducts(items) {
      listElement.innerHTML = "";

      if (!items.length) {
        if (emptyElement) {
          emptyElement.textContent = state.products.length
            ? "No products match the selected filters."
            : emptyDefaultText || "Products are being updated. Please check back soon.";
          emptyElement.classList.remove("hidden");
        }
        return;
      }

      if (emptyElement) {
        emptyElement.textContent = emptyDefaultText;
        emptyElement.classList.add("hidden");
      }

      const fragment = document.createDocumentFragment();
      items.forEach((product) => {
        const card = document.createElement("article");
        card.className = "item";
        card.dataset.productId = String(product.id);
        const isSoldOut = String(product.status || "").toLowerCase() === "sold-out";
        const saleValue = toNumber(product.salePrice);
        const originalValue = toNumber(product.price);
        const hasSale = saleValue != null && originalValue != null && saleValue < originalValue;

        if (isSoldOut) {
          card.classList.add("is-sold-out");
          card.setAttribute("aria-disabled", "true");
        }

        if (hasSale) {
          card.classList.add("has-sale");
        }

        const link = document.createElement("a");
        link.className = "item-link";
        link.href = resolveDetailHref(product);
        link.setAttribute("aria-label", product.name || "View product");

        const discountPercent = computeDiscountPercent(product.price, product.salePrice);
        const priceHtml = (() => {
          if (hasSale) {
            return `
              <span class="price-sale">${formatPrice(saleValue)}</span>
              <span class="price-original">${formatPrice(product.price)}</span>
              ${discountPercent != null ? `<span class="price-percent">-${discountPercent}%</span>` : ""}
            `;
          }
          return formatPrice(product.price);
        })();

        const badgeHtml = (() => {
          if (isSoldOut) {
            return `<span class="product-badge sold-out">Sold out</span>`;
          }
          if (hasSale) {
            return `<span class="product-badge sale">${discountPercent != null ? `-${discountPercent}%` : "Sale"}</span>`;
          }
          return "";
        })();

        link.innerHTML = `
          ${badgeHtml}
          <div class="thumb">
            ${product.image ? `<img src="${product.image}" alt="${escapeHtml(product.name)}">` : ""}
            ${product.hoverImage ? `<img class="hover" src="${product.hoverImage}" alt="${escapeHtml(product.name)} alternate view">` : ""}
          </div>
          <h2>${escapeHtml(product.name || "Product")}</h2>
          <div class="price">${priceHtml}</div>
        `;

        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.innerHTML = `
          <button type="button" class="action-btn buy-now" data-action="buy">Buy now</button>
          <button type="button" class="action-btn add-cart" data-action="cart">Add to cart</button>
        `;

        card.appendChild(link);
        card.appendChild(actions);
        fragment.appendChild(card);
      });

      listElement.appendChild(fragment);
    }

    function resolveDetailHref(product) {
      if (config.detailUrl) {
        try {
          return config.detailUrl(product);
        } catch (err) {
          console.warn("ProductListing: detailUrl failed", err);
        }
      }
      if (config.detailHref) {
        return `${config.detailHref}${encodeURIComponent(product.id)}`;
      }
      return "#";
    }

    function handleDataLoad(data) {
      if (!Array.isArray(data) || data.length === 0) {
        state.products = [];
        renderProducts([]);
        return;
      }
      state.products = data.map((item, index) => ({
        ...item,
        __index: index,
        __sourceTag: item.__sourceTag || item.source || null
      }));
      state.filters = { ...DEFAULT_FILTERS };
      syncFormFromState();
      applyFilters();
    }

    function handleDataError(error) {
      console.warn("ProductListing: unable to load products", error);
      state.products = [];
      if (emptyElement) {
        emptyElement.textContent = config.errorMessage;
        emptyElement.classList.remove("hidden");
      }
    }

    const normalizedSources = config.sources
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry === "string") {
          return { file: entry, tag: null };
        }
        if (typeof entry === "object" && entry.file) {
          return {
            file: entry.file,
            tag: entry.tag || entry.source || entry.label || null
          };
        }
        return null;
      })
      .filter(Boolean);

    if (!normalizedSources.length) {
      handleDataError(new Error("No product sources configured"));
      return;
    }

    const fetchSource = (entry) =>
      fetch(entry.file, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status} for ${entry.file}`);
          return response.json();
        })
        .then((payload) => {
          if (!Array.isArray(payload)) return [];
          return payload.map((item) =>
            entry.tag && (!item.source || item.source === "")
              ? { ...item, __sourceTag: entry.tag }
              : item
          );
        })
        .catch((error) => {
          console.warn("ProductListing: unable to load source", entry.file, error);
          return [];
        });

    // 🧩 HỢP NHẤT DỮ LIỆU THEO ID
    Promise.all(normalizedSources.map(fetchSource))
      .then((datasets) => {
        const mergedRaw = datasets.flat().filter(Boolean);
        if (!mergedRaw.length) {
          handleDataError(new Error("No product data returned"));
          return;
        }
        const mergedById = {};
        mergedRaw.forEach((item) => {
          const id = String(item.id);
          if (!mergedById[id]) {
            mergedById[id] = { ...item };
          } else {
            mergedById[id] = {
              ...mergedById[id],
              ...Object.fromEntries(
                Object.entries(item).filter(([k, v]) => v !== null && v !== undefined && v !== "")
              )
            };
          }
        });
        const merged = Object.values(mergedById);
        if (config.shuffle) {
          shuffleArray(merged);
        }
        handleDataLoad(merged);
      })
      .catch((error) => handleDataError(error));

    //  CHẶN MUA / ADD NẾU SOLD OUT
    listElement.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton || !listElement.contains(actionButton)) return;
      event.preventDefault();
      event.stopPropagation();
      const card = actionButton.closest(".item");
      if (!card) return;
      const productId = card.dataset.productId;
      const product = (state.products || []).find((item) => String(item.id) === String(productId));
      if (!product) return;

      // Ngăn thao tác khi sold-out
      if (String(product.status || "").toLowerCase() === "sold-out") {
        showListingToast(" This product is sold out.");
        return;
      }

      if (actionButton.dataset.action === "cart") {
        addProductToCart(product);
      } else if (actionButton.dataset.action === "buy") {
        buyProductNow(product);
      }
    });

    function addProductToCart(product) {
      const effectivePrice = resolveEffectivePrice(product);
      const entry = {
        id: product.id,
        name: product.name,
        price: effectivePrice,
        image: product.image,
        quantity: 1,
        size: null,
        color: null
      };
      const cart = JSON.parse(localStorage.getItem("cartItems")) || [];
      const existing = cart.find((item) => item.id === entry.id && item.size === entry.size);
      if (existing) {
        existing.quantity += 1;
      } else {
        cart.push(entry);
      }
      localStorage.setItem("cartItems", JSON.stringify(cart));
      showListingToast(" ADDED TO CART");
    }

    function buyProductNow(product) {
      const entry = {
        id: product.id,
        name: product.name,
        price: resolveEffectivePrice(product),
        image: product.image,
        quantity: 1,
        size: null,
        color: null
      };
      localStorage.setItem("checkoutSingleItem", JSON.stringify(entry));
      window.location.href = "checkout.html?mode=buyNow";
    }

    function resolveEffectivePrice(product) {
      const saleValue = toNumber(product.salePrice);
      const baseValue = toNumber(product.price);
      if (saleValue != null && baseValue != null && saleValue > 0 && saleValue < baseValue) {
        return saleValue;
      }
      if (baseValue != null) return baseValue;
      return saleValue != null ? saleValue : 0;
    }

    function showListingToast(message) {
      let container = document.querySelector(".listing-toast-container");
      if (!container) {
        container = document.createElement("div");
        container.className = "listing-toast-container";
        document.body.appendChild(container);
      }
      const toast = document.createElement("div");
      toast.className = "listing-toast";
      toast.textContent = message;
      container.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add("show"));
      setTimeout(() => {
        toast.classList.remove("show");
        toast.addEventListener(
          "transitionend",
          () => {
            toast.remove();
          },
          { once: true }
        );
      }, 2000);
    }
  }

  function compareNumbers(a, b) {
    const safeA = typeof a === "number" && !Number.isNaN(a) ? a : Number.POSITIVE_INFINITY;
    const safeB = typeof b === "number" && !Number.isNaN(b) ? b : Number.POSITIVE_INFINITY;
    return safeA - safeB;
  }

  function toNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^\d.-]+/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function formatPrice(value) {
    if (typeof value === "number") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
      }).format(value);
    }
    if (typeof value === "string") {
      return value;
    }
    return "";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function createFilterUi(key, title) {
    const existing = document.querySelector(`.product-filter-toggle[data-key="${key}"]`);
    if (existing) {
      return existing.__ui;
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "product-filter-toggle";
    toggle.dataset.key = key;
    toggle.setAttribute("aria-haspopup", "dialog");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `<i class="fas fa-sliders-h" aria-hidden="true"></i>`; // 👈 chỉ icon, không còn chữ “Filters”

    // 💅 Tùy chỉnh vị trí và kiểu hiển thị nút Filter tròn
    Object.assign(toggle.style, {
      position: "fixed",
      bottom: "90px",
      right: "28px",
      zIndex: "3000",
      background: "#111",
      color: "#fff",
      border: "none",
      borderRadius: "50%",
      width: "46px",
      height: "46px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      fontSize: "18px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
      transition: "background 0.25s ease, transform 0.25s ease"
    });

    // Hiệu ứng hover
    toggle.addEventListener("mouseenter", () => {
      toggle.style.background = "#222";
      toggle.style.transform = "translateY(-2px)";
    });
    toggle.addEventListener("mouseleave", () => {
      toggle.style.background = "#111";
      toggle.style.transform = "translateY(0)";
    });

    const overlay = document.createElement("div");
    overlay.className = "product-filter-backdrop";
    overlay.hidden = true;

    const panel = document.createElement("aside");
    panel.className = "product-filter-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", `${key}-filter-title`);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "product-filter-close";
    closeButton.innerHTML = `<i class="fas fa-times" aria-hidden="true"></i><span class="sr-only">Close filters</span>`;

    const heading = document.createElement("h3");
    heading.className = "product-filter-title";
    heading.id = `${key}-filter-title`;
    heading.textContent = title;

    const form = document.createElement("form");
    form.className = "product-filter-form";
    form.innerHTML = `
      <label class="filter-field">
        <span>Search</span>
        <input type="text" name="search" autocomplete="off" placeholder="Search by name">
      </label>
      <label class="filter-field">
        <span>Sort by</span>
        <select name="sort">
          <option value="">Default order</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="name-asc">Name: A to Z</option>
          <option value="name-desc">Name: Z to A</option>
        </select>
      </label>
      <div class="filter-field">
        <span>Price range (USD)</span>
        <div class="filter-range">
          <input type="number" name="min" inputmode="decimal" min="0" placeholder="Min">
          <span class="range-separator">to</span>
          <input type="number" name="max" inputmode="decimal" min="0" placeholder="Max">
        </div>
      </div>
      <div class="filter-actions">
        <button type="button" data-action="reset">Reset</button>
        <button type="submit" class="apply">Apply</button>
      </div>
    `;

    panel.appendChild(closeButton);
    panel.appendChild(heading);
    panel.appendChild(form);

    document.body.appendChild(toggle);
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    const ui = {
      toggle,
      overlay,
      panel,
      form,
      closeButton,
      resetButton: form.querySelector('[data-action="reset"]'),
      fields: {
        search: form.elements.search,
        sort: form.elements.sort,
        min: form.elements.min,
        max: form.elements.max
      }
    };

    toggle.__ui = ui;
    return ui;
  }

  global.ProductListing = {
    init
  };
})(window);

