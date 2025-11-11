document.addEventListener("DOMContentLoaded", () => {
	const header = document.querySelector(".landing-header");
	if (!header) return;

	const menuToggler = document.getElementById("menu-toggler");
	const submenuItems = Array.from(header.querySelectorAll(".has-submenu"));
	const heroSelector = header.dataset.heroTarget || ".homepage";
	const hero = heroSelector ? document.querySelector(heroSelector) : null;

	const hasHero = !!(hero && hero.offsetHeight);
	let threshold = hasHero ? Math.max(0, hero.offsetHeight - header.offsetHeight * 1.25) : 0;
	const forceFloating = header.dataset.forceFloating === "true";
	const solidByDefault = header.dataset.solidStart === "true" || (!hasHero && !forceFloating);

	const updateHeaderState = () => {
		const shouldBeSolid =
			solidByDefault ||
			window.scrollY > threshold ||
			(menuToggler && menuToggler.checked);

		header.classList.toggle("is-solid", shouldBeSolid);
	};

	if (solidByDefault) {
		header.classList.add("is-solid");
	} else {
		header.classList.remove("is-solid");
	}

	updateHeaderState();

	window.addEventListener("scroll", updateHeaderState, { passive: true });
	window.addEventListener("resize", () => {
		if (hero) {
			threshold = Math.max(0, hero.offsetHeight - header.offsetHeight * 1.25);
		}
		updateHeaderState();
	});

	const collapseSubmenus = () => {
		submenuItems.forEach((item) => {
			item.classList.remove("submenu-open");
			const control = item.querySelector(".submenu-control");
			if (control) control.setAttribute("aria-expanded", "false");
		});
	};

	if (menuToggler) {
		menuToggler.addEventListener("change", () => {
			if (menuToggler.checked) {
				header.classList.add("is-solid");
			} else {
				collapseSubmenus();
				updateHeaderState();
			}
		});
	}

	submenuItems.forEach((item) => {
		const control = item.querySelector(".submenu-control");
		if (!control) return;
		control.setAttribute("aria-expanded", "false");
		control.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			const isOpen = item.classList.contains("submenu-open");
			submenuItems.forEach((other) => {
				if (other === item) return;
				other.classList.remove("submenu-open");
				const otherControl = other.querySelector(".submenu-control");
				if (otherControl) otherControl.setAttribute("aria-expanded", "false");
			});
			const nextState = !isOpen;
			item.classList.toggle("submenu-open", nextState);
			control.setAttribute("aria-expanded", String(nextState));
		});
	});

	const userIcon = document.getElementById("userIconLink");
	if (userIcon && window.Auth && typeof Auth.attachUserIconHandler === "function") {
		if (typeof Auth.ensureSeedUsers === "function") {
			Auth.ensureSeedUsers().catch(() => {});
		}
		const routes = {
			loggedIn: userIcon.dataset.loggedInHref || "profile.html",
			loggedOut: userIcon.dataset.loggedOutHref || "Signin.html"
		};
		const ensureAvatarElement = () => {
			let avatar = userIcon.querySelector(".user-avatar-icon");
			if (!avatar) {
				avatar = document.createElement("img");
				avatar.alt = "Profile photo";
				avatar.className = "user-avatar-icon";
				userIcon.insertBefore(avatar, userIcon.firstChild || null);
			}
			return avatar;
		};

		const avatarFromInitials = (name = "") => {
			const trimmed = name.trim();
			if (!trimmed) return null;
			const initials = trimmed
				.split(/\s+/)
				.map((part) => part[0] || "")
				.join("")
				.slice(0, 2)
				.toUpperCase();
			if (!initials) return null;
			const svg = `
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
					<rect width="200" height="200" rx="100" fill="#111419"></rect>
					<text x="100" y="118" text-anchor="middle" font-size="78" fill="#ff5d20" font-family="Inter, sans-serif" font-weight="700">${initials}</text>
				</svg>
			`.trim();
			return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
		};

		const applyAvatar = (loggedIn) => {
			const avatarEl = ensureAvatarElement();
			if (!loggedIn) {
				userIcon.classList.remove("has-avatar");
				avatarEl.removeAttribute("src");
				return;
			}
			const session = typeof Auth.session === "function" ? Auth.session() : null;
			if (!session?.userId) {
				userIcon.classList.remove("has-avatar");
				avatarEl.removeAttribute("src");
				return;
			}

			const photoKey = `app_profile_photo_${session.userId}`;
			const photo = window.localStorage ? localStorage.getItem(photoKey) : null;

			let profileName = session.name || "";
			if (typeof Auth.store?.get === "function") {
				const profile = Auth.store.get(`app_profile_${session.userId}`, null);
				if (profile?.displayName) {
					profileName = profile.displayName;
				}
			}

			const fallback = avatarFromInitials(profileName);
			const src = photo || fallback;

			if (src) {
				avatarEl.src = src;
				userIcon.classList.add("has-avatar");
			} else {
				userIcon.classList.remove("has-avatar");
				avatarEl.removeAttribute("src");
			}
		};

		Auth.attachUserIconHandler(userIcon, routes, {
			loggedInTitle: userIcon.dataset.loggedInTitle || "View profile",
			loggedOutTitle: userIcon.dataset.loggedOutTitle || "Sign in",
			updateOnFocus: true,
			onStateChange: ({ loggedIn }) => applyAvatar(loggedIn)
		});
		applyAvatar(Auth.isLoggedIn ? Auth.isLoggedIn() : false);
	}
});
