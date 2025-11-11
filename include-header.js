async function includeHeader() {
  try {
    const response = await fetch("components/header.html");
    if (!response.ok) {
      throw new Error("Failed to fetch header: " + response.status);
    }

    const markup = await response.text();
    document.body.insertAdjacentHTML("afterbegin", markup);
    console.log("IncludeHeader: header inserted");

    const searchBtn = document.querySelector("#searchBtn");
    const searchPopup = document.querySelector("#searchPopup");
    const closeSearchBtn = document.querySelector("#closeSearch");

    if (!searchBtn || !searchPopup || !closeSearchBtn) {
      console.warn("IncludeHeader: search controls missing from header markup.");
      return;
    }

    const getSearchApi = () => {
      const api = window.__avantSearch;
      if (!api) return null;
      const open = typeof api.open === "function" ? api.open : null;
      const close = typeof api.close === "function" ? api.close : null;
      if (!open || !close) return null;
      return { open, close };
    };

    const fallbackOpen = () => {
      searchPopup.classList.add("active");
      const input = searchPopup.querySelector("input");
      if (input) {
        requestAnimationFrame(() => input.focus());
      }
    };

    const fallbackClose = (resetField = true) => {
      searchPopup.classList.remove("active");
      if (resetField) {
        const input = searchPopup.querySelector("input");
        const results = document.querySelector("#searchResults");
        if (input) input.value = "";
        if (results) results.innerHTML = "";
      }
    };

    searchBtn.addEventListener("click", (event) => {
      event.preventDefault();
      const api = getSearchApi();
      if (api) {
        event.__searchHandled = true;
        event.stopImmediatePropagation();
        if (searchPopup.classList.contains("active")) {
          api.close({ resetField: false });
        } else {
          api.open();
        }
        return;
      }
      event.stopPropagation();
      if (searchPopup.classList.contains("active")) {
        fallbackClose(false);
      } else {
        fallbackOpen();
      }
    });

    closeSearchBtn.addEventListener("click", (event) => {
      event.preventDefault();
      const api = getSearchApi();
      if (api) {
        event.__searchHandled = true;
        event.stopImmediatePropagation();
        api.close();
        return;
      }
      event.stopPropagation();
      fallbackClose();
    });

    searchPopup.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", (event) => {
      const isActive = searchPopup.classList.contains("active");
      if (!isActive) return;
      const clickedToggle =
        event.target === searchBtn || (searchBtn && searchBtn.contains(event.target));
      const clickedInside = searchPopup.contains(event.target);

      if (clickedToggle || clickedInside) return;

      const api = getSearchApi();
      if (api) {
        api.close({ resetField: false });
      } else {
        fallbackClose(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!searchPopup.classList.contains("active")) return;
      const api = getSearchApi();
      if (api) {
        api.close({ resetField: false });
      } else {
        fallbackClose(false);
      }
    });

    console.log("IncludeHeader: search handlers attached");
  } catch (error) {
    console.error("includeHeader error:", error);
  }
}
includeHeader();
