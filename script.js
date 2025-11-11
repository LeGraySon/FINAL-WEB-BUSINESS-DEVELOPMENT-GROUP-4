(() => {
	const DATA_SOURCES = [
		{ file: "Tops.json", src: "top" },
		{ file: "Bottoms.json", src: "bottom" },
		{ file: "Accessories.json", src: "accessory" },
		{ file: "NewArrivals.json", src: "new" }
	];

	const CATEGORY_LABELS = {
		top: "Tops",
		bottom: "Bottoms",
		accessory: "Accessories",
		new: "New Arrivals"
	};

	const DIACRITIC_REGEX = /[\u0300-\u036f]/g;
	let cachedProductsPromise = null;
	let latestSearchToken = 0;
	let isExpanded = false;

	function normalizeText(value) {
		if (!value) return "";
		return String(value)
			.toLowerCase()
			.normalize("NFD")
			.replace(DIACRITIC_REGEX, "");
	}

	function escapeHtml(value) {
		if (value == null) return "";
		return String(value).replace(/[&<>"']/g, (char) => {
			switch (char) {
				case "&":
					return "&amp;";
				case "<":
					return "&lt;";
				case ">":
					return "&gt;";
				case '"':
					return "&quot;";
				case "'":
					return "&#39;";
				default:
					return char;
			}
		});
	}

	function formatUSD(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return "";
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2
		}).format(numeric);
	}

	function resolveDetailHref(product) {
		const idParam = encodeURIComponent(product.id);
		const rawSrc = (product && product._src) ? String(product._src).toLowerCase() : "tops";
		const srcParam = encodeURIComponent(rawSrc);
		const SRC_TO_RETURN = {
			top: "top.html",
			tops: "top.html",
			bottom: "bottom.html",
			bottoms: "bottom.html",
			accessory: "accessories.html",
			accessories: "accessories.html",
			new: "products.html"
		};
		const safeReturn = SRC_TO_RETURN[rawSrc] || "products.html";
		return `top-detail.html?id=${idParam}&src=${srcParam}&return=${encodeURIComponent(safeReturn)}`;
	}

	async function loadAllProducts() {
		if (!cachedProductsPromise) {
			cachedProductsPromise = (async () => {
				const combined = [];
				for (const { file, src } of DATA_SOURCES) {
					try {
						const response = await fetch(file);
						if (!response.ok) {
							console.warn("Search: could not load", file, response.status);
							continue;
						}
						const payload = await response.json();
						if (!Array.isArray(payload)) continue;
						for (const item of payload) {
							if (item && typeof item === "object") {
								item._src = src;
								combined.push(item);
							}
						}
					} catch (error) {
						console.warn("Search: fetch failed for", file, error);
					}
				}
				return combined;
			})();
		}
		return cachedProductsPromise;
	}

	function initSearchPopup() {
		const searchPopup = document.getElementById("searchPopup");
		const searchInput = document.getElementById("searchInput");
		const searchResults = document.getElementById("searchResults");
		const closeSearchBtn = document.getElementById("closeSearch");
		const searchBtn = document.getElementById("searchBtn");

		if (!searchPopup || !searchInput || !searchResults || !searchBtn || !closeSearchBtn) {
			console.warn("Search: popup markup not found, skipping setup.");
			return;
		}

		console.log("Search: popup initialized");

		function clearResults() {
			searchResults.innerHTML = "";
			searchResults.classList.remove("is-visible");
			searchResults.removeAttribute("data-has-results");
		}

		function renderEmptyState(keyword) {
			searchResults.innerHTML = `
				<div class="search-result-empty" role="alert">
					Không tìm thấy sản phẩm phù hợp cho "<span>${escapeHtml(keyword)}</span>".
				</div>
			`;
			searchResults.classList.add("is-visible");
			searchResults.removeAttribute("data-has-results");
		}

		function renderDataUnavailable() {
			searchResults.innerHTML = `
				<div class="search-result-empty" role="alert">
					Không thể tải dữ liệu sản phẩm. Hãy mở trang bằng local server (Live Server, http-server, npx serve, ...).
				</div>
			`;
			searchResults.classList.add("is-visible");
			searchResults.removeAttribute("data-has-results");
		}

		function renderResults(items, fullResults = null) {
			if (!items.length) return;

			const hasMore = fullResults && fullResults.length > 5;

			const listMarkup = items
				.map(({ product }) => {
					const href = resolveDetailHref(product);
					const image = product.image || "";
					const name = escapeHtml(product.name || "Sản phẩm");
					const category = escapeHtml(CATEGORY_LABELS[product._src] || "Collection");

					const salePrice = product.salePrice != null ? Number(product.salePrice) : null;
					const basePrice = Number(product.price);
					const finalPrice = Number.isFinite(salePrice) ? salePrice : basePrice;

					const priceMarkup = Number.isFinite(finalPrice)
						? `
							<span class="search-result-price${Number.isFinite(salePrice) ? " has-sale" : ""}">
								${
									Number.isFinite(salePrice)
										? `<span class="search-result-price--sale">${formatUSD(finalPrice)}</span>`
										: `<span>${formatUSD(finalPrice)}</span>`
								}
								${
									Number.isFinite(salePrice)
										? `<span class="search-result-price--original">${formatUSD(basePrice)}</span>`
										: ""
								}
							</span>
						`
						: "";

					return `
						<li class="search-result-row" role="option">
							<a class="search-result-item" href="${href}">
								<div class="search-result-thumb">
									<img src="${image}" alt="${name}" loading="lazy">
								</div>
								<div class="search-result-info">
									<span class="search-result-meta">${category}</span>
									<span class="search-result-name">${name}</span>
									${priceMarkup}
								</div>
							</a>
						</li>
					`;
				})
				.join("");

			searchResults.innerHTML = `
				<ul class="search-result-list" role="listbox">
					${listMarkup}
				</ul>
				${hasMore ? `<button id="toggleViewAll" class="search-view-all">${isExpanded ? "Show Less" : "View All Results"}</button>` : ""}
			`.trim();

			if (hasMore) {
				const popup = document.getElementById("searchPopup");
				const toggleBtn = document.getElementById("toggleViewAll");
				if (!toggleBtn) return;

				toggleBtn.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();

					isExpanded = !isExpanded;
					popup.classList.toggle("expanded", isExpanded);
					toggleBtn.textContent = isExpanded ? "Show Less" : "View All Results";

					const newItems = isExpanded ? fullResults : fullResults.slice(0, 5);
					renderResults(newItems, fullResults);
					popup.scrollTo({ top: 0, behavior: "smooth" });
				});
			}

			searchResults.classList.add("is-visible");
			searchResults.setAttribute("data-has-results", "true");
		}

		async function handleSearchInput() {
			const rawKeyword = searchInput.value.trim();
			if (!rawKeyword) {
				clearResults();
				return;
			}

			const keyword = normalizeText(rawKeyword);
			if (!keyword) {
				clearResults();
				return;
			}

			const searchToken = ++latestSearchToken;
			const products = await loadAllProducts();
			if (searchToken !== latestSearchToken) return;

			if (!products.length) {
				renderDataUnavailable();
				return;
			}

			const results = [];
			for (const product of products) {
				const normalizedName = normalizeText(product.name);
				const normalizedDescription = normalizeText(product.description);
				const normalizedMeta = normalizeText(
					[
						Array.isArray(product.details) ? product.details.join(" ") : "",
						Array.isArray(product.colors) ? product.colors.join(" ") : "",
						product.id != null ? String(product.id) : ""
					].join(" ")
				);

				let score = Infinity;

				if (normalizedName.includes(keyword)) {
					const index = normalizedName.indexOf(keyword);
					score = index === 0 ? 0 : 100 + index;
				} else if (normalizedDescription.includes(keyword)) {
					const index = normalizedDescription.indexOf(keyword);
					score = 300 + index;
				} else if (normalizedMeta.includes(keyword)) {
					const index = normalizedMeta.indexOf(keyword);
					score = 600 + index;
				}

				if (score !== Infinity) results.push({ product, score });
			}

			results.sort((a, b) => a.score - b.score);

			if (!results.length) {
				renderEmptyState(rawKeyword);
				return;
			}

			isExpanded = false;
			const previewResults = results.slice(0, 5);
			renderResults(previewResults, results);
		}

		function openSearchPopup() {
			console.log("Search: opening popup");
			searchPopup.classList.add("active");
			searchPopup.removeAttribute("inert"," ");
			loadAllProducts().catch((error) => console.warn("Search: preload failed", error));
			requestAnimationFrame(() => searchInput.focus({ preventScroll: true }));
		}

		function closeSearchPopup({ resetField = true } = {}) {
			console.log("Search: closing popup", { resetField });
			if (document.activeElement && searchPopup.contains(document.activeElement)) {
				document.activeElement.blur();
			}
			searchPopup.classList.remove("active");
			searchPopup.setAttribute("aria-hidden", "true");
			if (resetField) {
				searchInput.value = "";
				clearResults();
			}
		}

		searchInput.addEventListener("input", () => {
			handleSearchInput().catch((error) => {
				console.error("Search: unable to handle input", error);
				renderEmptyState(searchInput.value.trim());
			});
		});

		searchInput.addEventListener("keydown", (event) => {
			if (event.key === "Escape") closeSearchPopup({ resetField: false });
		});

		searchBtn.addEventListener("click", (event) => {
			event.preventDefault();
			if (searchPopup.classList.contains("active")) {
				closeSearchPopup({ resetField: false });
			} else {
				openSearchPopup();
			}
		});

		closeSearchBtn.addEventListener("click", (event) => {
			event.preventDefault();
			closeSearchPopup();
		});

		document.addEventListener("click", (event) => {
			const active = searchPopup.classList.contains("active");
			if (!active) return;

			const clickedInsidePopup = searchPopup.contains(event.target);
			const clickedToggle =
				event.target === searchBtn ||
				searchBtn.contains(event.target) ||
				event.target.id === "toggleViewAll" ||
				event.target.closest?.("#toggleViewAll") !== null;

			if (!clickedInsidePopup && !clickedToggle) {
				closeSearchPopup({ resetField: false });
			}
		});

		searchPopup.addEventListener("transitionend", () => {
			if (!searchPopup.classList.contains("active")) clearResults();
		});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initSearchPopup);
	} else {
		initSearchPopup();
	}
})();

(() => {
  const CART_KEY = "cartItems";

  const ensureBadge = () => {
    const cartAnchors = document.querySelectorAll('a[href$="shopping_cart.html"]');
    if (!cartAnchors.length) return null;
    const target = cartAnchors[0];
    target.classList.add("cart-link");
    let badge = target.querySelector(".cart-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "cart-badge";
      badge.textContent = "0";
      target.appendChild(badge);
    }
    return badge;
  };

  const parseCartItems = () => {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {
      console.warn("Cart badge: unable to parse items", err);
    }
    return [];
  };

  const refreshBadge = () => {
    const badge = ensureBadge();
    if (!badge) return;
    const items = parseCartItems();
    const quantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    badge.textContent = String(quantity);
    badge.style.display = quantity ? "flex" : "none";
  };

  document.addEventListener("DOMContentLoaded", () => {
    refreshBadge();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === CART_KEY) {
      refreshBadge();
    }
  });
})();
