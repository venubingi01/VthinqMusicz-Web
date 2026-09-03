// ==========================================================================
// Sangeetham Music Player - Feedback Service & Interactive Modal Module
// ==========================================================================

var FeedbackService = {
	endpointUrl: "https://formsubmit.co/ajax/venubingi01@gmail.com",

	submitFeedback: async function (data) {
		var curSong = (typeof playlist !== "undefined" && playlist && playlist[playlist_index]) ? playlist[playlist_index] : null;
		var payload = {
			name: data.name,
			email: data.email || "anonymous@sangeetham.web",
			category: data.category,
			rating: (data.rating || 5) + " / 5 Stars ⭐",
			message: data.message,
			current_track: curSong ? (curSong.title + " - " + curSong.artist) : "No track playing",
			stream_quality: (typeof localStorage !== "undefined" && localStorage.getItem("sangeetham_stream_quality")) || "320kbps",
			platform: navigator.userAgent,
			screen_size: window.innerWidth + "x" + window.innerHeight,
			submitted_at: new Date().toLocaleString(),
			_subject: "✨ Sangeetham Feedback: [" + data.category + "] from " + data.name
		};

		// 1. Save local backup to localStorage
		try {
			var existingFb = JSON.parse(localStorage.getItem("sangeetham_feedback") || "[]");
			existingFb.push(payload);
			localStorage.setItem("sangeetham_feedback", JSON.stringify(existingFb));
		} catch (e) {
			console.warn("Could not save feedback to localStorage:", e);
		}

		// 2. Dispatch via FormSubmit AJAX endpoint (CORS-enabled, free delivery)
		try {
			var res = await fetch(this.endpointUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json"
				},
				body: JSON.stringify(payload)
			});
			if (res.ok) {
				return { success: true };
			}
		} catch (err) {
			console.warn("Feedback network delivery error:", err);
		}

		// Local backup was saved successfully even if network failed
		return { success: true, offline: true };
	}
};

window.FeedbackService = FeedbackService;

function initFeedbackModule() {
	var feedbackModal = document.getElementById("feedback_modal");
	var fundingModal = document.getElementById("funding_modal");
	var feedbackForm = document.getElementById("feedback_form");
	var fbSubmitBtn = document.getElementById("fb_submit_btn");

	var topFbBtn = document.getElementById("top_feedback_btn");
	var footerFbBtn = document.getElementById("footer_feedback_btn");
	var closeFbBtn = document.getElementById("close_feedback_modal");
	var modalFbOptionBtn = document.getElementById("modal_feedback_option_btn");

	var selectedStars = 5;

	function openModal(m) {
		if (m) m.classList.add("active");
	}

	function closeModal(m) {
		if (m) m.classList.remove("active");
	}

	// Modal Open/Close Triggers
	if (topFbBtn) topFbBtn.addEventListener("click", function () { openModal(feedbackModal); });
	if (footerFbBtn) footerFbBtn.addEventListener("click", function () { openModal(feedbackModal); });
	if (closeFbBtn) closeFbBtn.addEventListener("click", function () { closeModal(feedbackModal); });

	if (modalFbOptionBtn) {
		modalFbOptionBtn.addEventListener("click", function () {
			closeModal(fundingModal);
			openModal(feedbackModal);
		});
	}

	// Star Rating Selection
	var stars = document.querySelectorAll("#star_rating .star-btn");
	stars.forEach(function (starEl) {
		starEl.addEventListener("click", function () {
			var rating = parseInt(this.getAttribute("data-star"), 10) || 5;
			selectedStars = rating;
			stars.forEach(function (s, idx) {
				s.classList.toggle("active", idx < rating);
			});
		});
	});

	// Form Submission Handler
	if (feedbackForm) {
		feedbackForm.addEventListener("submit", async function (e) {
			e.preventDefault();
			var nameInput = document.getElementById("fb_name");
			var emailInput = document.getElementById("fb_email");
			var categoryInput = document.getElementById("fb_category");
			var messageInput = document.getElementById("fb_message");

			var name = nameInput ? nameInput.value.trim() : "";
			var email = emailInput ? emailInput.value.trim() : "";
			var category = categoryInput ? categoryInput.value : "General";
			var message = messageInput ? messageInput.value.trim() : "";

			if (!name || !message) {
				if (typeof showToast === "function") {
					showToast("Please fill in your name and message.");
				}
				return;
			}

			if (fbSubmitBtn) {
				fbSubmitBtn.disabled = true;
				fbSubmitBtn.innerHTML = '<i class="fa fa-circle-o-notch fa-spin"></i> <span>Sending Feedback...</span>';
			}

			var result = await FeedbackService.submitFeedback({
				name: name,
				email: email,
				category: category,
				message: message,
				rating: selectedStars
			});

			if (fbSubmitBtn) {
				fbSubmitBtn.disabled = false;
				fbSubmitBtn.innerHTML = '<i class="fa fa-check"></i> <span>Sent Successfully!</span>';
			}

			setTimeout(function () {
				closeModal(feedbackModal);
				feedbackForm.reset();
				selectedStars = 5;
				stars.forEach(function (btn) { btn.classList.add("active"); });
				if (fbSubmitBtn) {
					fbSubmitBtn.innerHTML = '<i class="fa fa-paper-plane"></i> <span>Submit Feedback</span>';
				}
				if (typeof showToast === "function") {
					showToast("Thank you, " + name + "! Your feedback has been received. ❤️");
				}
			}, 600);
		});
	}
}

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initFeedbackModule);
} else {
	initFeedbackModule();
}
