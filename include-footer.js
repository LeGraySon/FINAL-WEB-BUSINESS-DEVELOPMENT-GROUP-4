(function () {
  async function injectFooter() {
    if (document.querySelector(".site-footer")) return;

    try {
      const response = await fetch("components/footer.html", { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to fetch footer (${response.status})`);
      const markup = await response.text();

      const wrapper = document.createElement("div");
      wrapper.innerHTML = markup.trim();
      const footer = wrapper.firstElementChild;

      if (!footer) return;
      document.body.appendChild(footer);

      const yearTarget = footer.querySelector("[data-footer-year]");
      if (yearTarget) yearTarget.textContent = new Date().getFullYear();

      const form = footer.querySelector(".footer-form");
      if (form) {
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const input = form.querySelector("input[name='email']");
          if (input) {
            input.value = "";
            footer.classList.add("footer-form-success");
            setTimeout(() => footer.classList.remove("footer-form-success"), 2200);
          }
        });
      }
      const loadScript = (src) => new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      });
      (async () => {
        await loadScript('env.js');
        await loadScript('chatbot-config.js');
        if (!window.__avantChatbotLoaded) {
          await loadScript('chatbot.js');
        }
      })();

    } catch (error) {
      console.warn("include-footer: unable to inject footer", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectFooter);
  } else {
    injectFooter();
  }
})();
