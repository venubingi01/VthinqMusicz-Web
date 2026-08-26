// Sangeetham PWA "Add to Home Screen" Installation Handler
// Handles beforeinstallprompt, iOS Safari guide, install banner, and header install action

(function () {
	var deferredPrompt = null;
	var isInstalled = false;

	// Detect if running in standalone PWA mode
	function isRunningStandalone() {
		return (
			window.matchMedia('(display-mode: standalone)').matches ||
			window.navigator.standalone === true ||
			document.referrer.includes('android-app://')
		);
	}

	// Detect iOS devices
	function isIosDevice() {
		var userAgent = window.navigator.userAgent.toLowerCase();
		return /iphone|ipad|ipod/.test(userAgent);
	}

	function initPWAInstallation() {
		var headerInstallBtn = document.getElementById("header_install_btn");
		var installBanner = document.getElementById("pwa_install_banner");
		var bannerInstallBtn = document.getElementById("pwa_banner_install_btn");
		var bannerCloseBtn = document.getElementById("pwa_banner_close_btn");
		var iosModal = document.getElementById("pwa_ios_modal");
		var closeIosModal = document.getElementById("close_ios_pwa_modal");
		var gotItIosBtn = document.getElementById("got_it_ios_btn");

		// If already in standalone mode, do not display prompts
		if (isRunningStandalone()) {
			isInstalled = true;
			if (headerInstallBtn) headerInstallBtn.style.display = "none";
			if (installBanner) installBanner.style.display = "none";
			return;
		}

		// Capture beforeinstallprompt for Chrome, Edge, Android browsers
		window.addEventListener("beforeinstallprompt", function (e) {
			e.preventDefault();
			deferredPrompt = e;

			// Show Header Install action button
			if (headerInstallBtn) {
				headerInstallBtn.style.display = "inline-flex";
			}

			// Show bottom install banner if not dismissed in this session
			var isDismissed = sessionStorage.getItem("sangeetham_pwa_dismissed");
			if (!isDismissed && installBanner) {
				setTimeout(function () {
					installBanner.classList.add("active");
				}, 2500);
			}
		});

		// Trigger installation prompt
		async function promptInstall() {
			if (deferredPrompt) {
				deferredPrompt.prompt();
				var choiceResult = await deferredPrompt.userChoice;
				if (choiceResult.outcome === "accepted") {
					if (typeof showToast === "function") {
						showToast("🎉 Thank you for installing Sangeetham!");
					}
					if (installBanner) installBanner.classList.remove("active");
					if (headerInstallBtn) headerInstallBtn.style.display = "none";
				}
				deferredPrompt = null;
			} else if (isIosDevice()) {
				// Show iOS Safari installation guide
				if (iosModal) iosModal.classList.add("active");
			} else {
				if (typeof showToast === "function") {
					showToast("To install, tap your browser's menu (⋮) and select 'Add to Home Screen'.");
				}
			}
		}

		if (headerInstallBtn) {
			headerInstallBtn.addEventListener("click", promptInstall);
		}

		if (bannerInstallBtn) {
			bannerInstallBtn.addEventListener("click", promptInstall);
		}

		if (bannerCloseBtn) {
			bannerCloseBtn.addEventListener("click", function () {
				if (installBanner) installBanner.classList.remove("active");
				sessionStorage.setItem("sangeetham_pwa_dismissed", "true");
			});
		}

		// iOS Modal Close Handlers
		if (closeIosModal) {
			closeIosModal.addEventListener("click", function () {
				if (iosModal) iosModal.classList.remove("active");
			});
		}

		if (gotItIosBtn) {
			gotItIosBtn.addEventListener("click", function () {
				if (iosModal) iosModal.classList.remove("active");
			});
		}

		if (iosModal) {
			iosModal.addEventListener("click", function (e) {
				if (e.target === iosModal) {
					iosModal.classList.remove("active");
				}
			});
		}

		// Show header install button for iOS if not standalone
		if (isIosDevice() && !isRunningStandalone() && headerInstallBtn) {
			headerInstallBtn.style.display = "inline-flex";
		}

		// App installed listener
		window.addEventListener("appinstalled", function () {
			isInstalled = true;
			deferredPrompt = null;
			if (installBanner) installBanner.classList.remove("active");
			if (headerInstallBtn) headerInstallBtn.style.display = "none";
			if (typeof showToast === "function") {
				showToast("🎉 Sangeetham added to Home Screen!");
			}
		});
	}

	window.addEventListener("load", initPWAInstallation);
})();
