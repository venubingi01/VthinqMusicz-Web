// Sangeetham AI Spotlight Engine
// Transforms AI interactions into a fast, modern Apple Spotlight / Command Palette UI
// Supports natural-language music queries, direct playback, recommendations, voice input, and player controls

(function () {
	var spotlightOverlay = null;
	var spotlightInput = null;
	var spotlightClear = null;
	var spotlightClose = null;
	var spotlightCloseBadge = null;
	var spotlightMic = null;
	var spotlightStatus = null;
	var spotlightStatusText = null;
	var spotlightLoading = null;
	var spotlightResults = null;
	var spotlightEmpty = null;
	var floatingChatBtn = null;

	var currentResults = [];
	var selectedIndex = -1;
	var isProcessing = false;
	var searchDebounceTimer = null;
	var speechRecognition = null;
	var isListening = false;

	function initAISpotlight() {
		spotlightOverlay = document.getElementById("ai_spotlight_overlay");
		spotlightInput = document.getElementById("ai_spotlight_input");
		spotlightClear = document.getElementById("ai_spotlight_clear");
		spotlightClose = document.getElementById("ai_spotlight_close");
		spotlightCloseBadge = document.getElementById("ai_spotlight_close_badge");
		spotlightMic = document.getElementById("ai_spotlight_mic");
		spotlightStatus = document.getElementById("ai_spotlight_status");
		spotlightStatusText = document.getElementById("ai_spotlight_status_text");
		spotlightLoading = document.getElementById("ai_spotlight_loading");
		spotlightResults = document.getElementById("ai_spotlight_results");
		spotlightEmpty = document.getElementById("ai_spotlight_empty");
		floatingChatBtn = document.getElementById("floating_chat_btn");

		setupFloatingButtonDrag();
		setupKeyboardShortcuts();
		setupInputEvents();
		setupVoiceRecognition();
		setupChipsEvents();
		setupCloseEvents();
	}

	// --------------------------------------------------------------------------
	// Open / Close / Toggle Spotlight
	// --------------------------------------------------------------------------
	function openAISpotlight(initialQuery) {
		if (!spotlightOverlay) {
			spotlightOverlay = document.getElementById("ai_spotlight_overlay");
			spotlightInput = document.getElementById("ai_spotlight_input");
		}
		if (!spotlightOverlay) return;
		spotlightOverlay.classList.add("active");

		if (spotlightInput) {
			if (initialQuery) {
				spotlightInput.value = initialQuery;
				executeAIQuery(initialQuery);
			}
			setTimeout(function () {
				try {
					spotlightInput.focus();
				} catch (e) { }
			}, 60);
		}
		updateClearButtonVisibility();
	}

	function closeAISpotlight() {
		if (!spotlightOverlay) {
			spotlightOverlay = document.getElementById("ai_spotlight_overlay");
		}
		if (!spotlightOverlay) return;
		spotlightOverlay.classList.remove("active");
		stopVoiceRecognition();
		selectedIndex = -1;
	}

	function toggleAISpotlight() {
		if (!spotlightOverlay) {
			spotlightOverlay = document.getElementById("ai_spotlight_overlay");
		}
		if (spotlightOverlay && spotlightOverlay.classList.contains("active")) {
			closeAISpotlight();
		} else {
			openAISpotlight();
		}
	}

	// Expose globally
	window.openAISpotlight = openAISpotlight;
	window.closeAISpotlight = closeAISpotlight;
	window.toggleAISpotlight = toggleAISpotlight;

	// --------------------------------------------------------------------------
	// Floating Chat Button Dragging & Click Handling
	// --------------------------------------------------------------------------
	function setupFloatingButtonDrag() {
		if (!floatingChatBtn) return;

		var isDragging = false;
		var hasMoved = false;
		var startX = 0;
		var startY = 0;
		var initialBtnLeft = 0;
		var initialBtnTop = 0;
		var dragThreshold = 15; // Raised threshold prevents natural finger tap jitter from registering as drag
		var lastActivateTime = 0;

		function handleActivate(e) {
			var now = Date.now();
			if (now - lastActivateTime < 350) return; // Prevent double-trigger from touchend + click
			lastActivateTime = now;
			toggleAISpotlight();
		}

		function getClientCoords(e) {
			if (e.touches && e.touches.length > 0) {
				return { x: e.touches[0].clientX, y: e.touches[0].clientY };
			} else if (e.changedTouches && e.changedTouches.length > 0) {
				return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
			}
			return { x: e.clientX, y: e.clientY };
		}

		function startDrag(e) {
			if (e.type === "mousedown" && e.button !== 0) return;
			var coords = getClientCoords(e);
			var rect = floatingChatBtn.getBoundingClientRect();
			isDragging = true;
			hasMoved = false;
			startX = coords.x;
			startY = coords.y;
			initialBtnLeft = rect.left;
			initialBtnTop = rect.top;
			// Note: Do not mutate position or add .is-dragging class until dragThreshold is exceeded
		}

		function onDragMove(e) {
			if (!isDragging) return;
			var coords = getClientCoords(e);
			var dx = coords.x - startX;
			var dy = coords.y - startY;

			if (!hasMoved && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
				hasMoved = true;
				floatingChatBtn.style.right = "auto";
				floatingChatBtn.style.bottom = "auto";
				floatingChatBtn.style.left = initialBtnLeft + "px";
				floatingChatBtn.style.top = initialBtnTop + "px";
				floatingChatBtn.classList.add("is-dragging");
			}

			if (hasMoved) {
				if (e.cancelable) e.preventDefault();
				var btnWidth = floatingChatBtn.offsetWidth || 50;
				var btnHeight = floatingChatBtn.offsetHeight || 50;
				var maxLeft = window.innerWidth - btnWidth - 8;
				var maxTop = window.innerHeight - btnHeight - 8;
				var newLeft = Math.max(8, Math.min(maxLeft, initialBtnLeft + dx));
				var newTop = Math.max(8, Math.min(maxTop, initialBtnTop + dy));

				floatingChatBtn.style.left = newLeft + "px";
				floatingChatBtn.style.top = newTop + "px";
			}
		}

		function endDrag(e) {
			if (!isDragging) return;
			isDragging = false;
			floatingChatBtn.classList.remove("is-dragging");

			if (!hasMoved) {
				// Clean tap without dragging - open AI Spotlight
				handleActivate(e);
			}

			// Clear hasMoved flag after a short delay so click event doesn't get confused
			setTimeout(function () {
				hasMoved = false;
			}, 300);
		}

		// Direct Click Event (Desktop click and Mobile fallback click)
		floatingChatBtn.addEventListener("click", function (e) {
			e.preventDefault();
			e.stopPropagation();
			if (hasMoved) return;
			handleActivate(e);
		});

		// Mouse events
		floatingChatBtn.addEventListener("mousedown", startDrag);
		window.addEventListener("mousemove", onDragMove);
		window.addEventListener("mouseup", endDrag);

		// Touch events (Mobile)
		floatingChatBtn.addEventListener("touchstart", startDrag, { passive: true });
		window.addEventListener("touchmove", onDragMove, { passive: false });
		window.addEventListener("touchend", endDrag, { passive: true });
		window.addEventListener("touchcancel", endDrag, { passive: true });

		// Window resize reposition
		window.addEventListener("resize", function () {
			if (floatingChatBtn.style.left && floatingChatBtn.style.top) {
				var btnWidth = floatingChatBtn.offsetWidth || 50;
				var btnHeight = floatingChatBtn.offsetHeight || 50;
				var currentLeft = parseFloat(floatingChatBtn.style.left) || 0;
				var currentTop = parseFloat(floatingChatBtn.style.top) || 0;
				var maxLeft = window.innerWidth - btnWidth - 8;
				var maxTop = window.innerHeight - btnHeight - 8;

				floatingChatBtn.style.left = Math.max(8, Math.min(maxLeft, currentLeft)) + "px";
				floatingChatBtn.style.top = Math.max(8, Math.min(maxTop, currentTop)) + "px";
			}
		});
	}

	// --------------------------------------------------------------------------
	// Global Keyboard Shortcuts (Cmd+K, Ctrl+K, Escape, Arrow Navigation)
	// --------------------------------------------------------------------------
	function setupKeyboardShortcuts() {
		window.addEventListener("keydown", function (e) {
			// Cmd+K (Mac) or Ctrl+K (Windows/Linux) to toggle spotlight
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				toggleAISpotlight();
				return;
			}

			// Escape to close spotlight
			if (e.key === "Escape" && spotlightOverlay && spotlightOverlay.classList.contains("active")) {
				e.preventDefault();
				closeAISpotlight();
				return;
			}
		});
	}

	// --------------------------------------------------------------------------
	// Input & Arrow Navigation Handling
	// --------------------------------------------------------------------------
	function setupInputEvents() {
		if (!spotlightInput) return;

		spotlightInput.addEventListener("input", function () {
			updateClearButtonVisibility();
			var val = this.value.trim();

			if (!val) {
				showEmptyState();
				hideStatus();
				return;
			}

			// Debounced live AI search for fluid experience
			clearTimeout(searchDebounceTimer);
			searchDebounceTimer = setTimeout(function () {
				if (spotlightInput && spotlightInput.value.trim().length >= 2) {
					executeAIQuery(spotlightInput.value.trim(), { isLive: true });
				}
			}, 360);
		});

		spotlightInput.addEventListener("keydown", function (e) {
			if (e.key === "Enter") {
				e.preventDefault();
				clearTimeout(searchDebounceTimer);

				// If an item is actively highlighted with arrow keys, play it
				if (selectedIndex >= 0 && currentResults && currentResults[selectedIndex]) {
					playSongDirectly(currentResults[selectedIndex]);
					return;
				}

				// Otherwise execute full AI query
				var val = this.value.trim();
				if (val) {
					executeAIQuery(val, { isLive: false });
				}
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				navigateResults(1);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				navigateResults(-1);
			}
		});

		if (spotlightClear) {
			spotlightClear.addEventListener("click", function (e) {
				e.preventDefault();
				spotlightInput.value = "";
				updateClearButtonVisibility();
				showEmptyState();
				hideStatus();
				spotlightInput.focus();
			});
		}
	}

	function updateClearButtonVisibility() {
		if (!spotlightClear || !spotlightInput) return;
		spotlightClear.style.display = spotlightInput.value.length > 0 ? "flex" : "none";
	}

	function navigateResults(direction) {
		if (!currentResults || currentResults.length === 0) return;
		selectedIndex += direction;

		if (selectedIndex >= currentResults.length) {
			selectedIndex = 0;
		} else if (selectedIndex < 0) {
			selectedIndex = currentResults.length - 1;
		}

		updateSelectedResultUI();
	}

	function updateSelectedResultUI() {
		if (!spotlightResults) return;
		var items = spotlightResults.querySelectorAll(".spotlight-song-item");
		items.forEach(function (item, idx) {
			if (idx === selectedIndex) {
				item.classList.add("selected");
				item.scrollIntoView({ block: "nearest", behavior: "smooth" });
			} else {
				item.classList.remove("selected");
			}
		});
	}

	// --------------------------------------------------------------------------
	// Close Handlers
	// --------------------------------------------------------------------------
	function setupCloseEvents() {
		if (spotlightClose) {
			spotlightClose.addEventListener("click", closeAISpotlight);
		}

		if (spotlightCloseBadge) {
			spotlightCloseBadge.addEventListener("click", closeAISpotlight);
		}

		if (spotlightOverlay) {
			spotlightOverlay.addEventListener("click", function (e) {
				if (e.target === spotlightOverlay) {
					closeAISpotlight();
				}
			});
		}
	}

	// --------------------------------------------------------------------------
	// Quick Vibe Chips Handling
	// --------------------------------------------------------------------------
	function setupChipsEvents() {
		document.addEventListener("click", function (e) {
			var chip = e.target.closest(".spotlight-chip");
			if (chip) {
				e.preventDefault();
				var query = chip.getAttribute("data-query");
				if (query) {
					if (spotlightInput) {
						spotlightInput.value = query;
						updateClearButtonVisibility();
					}
					executeAIQuery(query, { isLive: false });
				}
			}
		});
	}

	// --------------------------------------------------------------------------
	// Voice Input (Speech Recognition)
	// --------------------------------------------------------------------------
	function setupVoiceRecognition() {
		var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SpeechRecognition || !spotlightMic) return;

		try {
			speechRecognition = new SpeechRecognition();
			speechRecognition.continuous = false;
			speechRecognition.interimResults = false;
			speechRecognition.lang = "en-IN";

			speechRecognition.onstart = function () {
				isListening = true;
				if (spotlightMic) spotlightMic.classList.add("listening");
				showStatus("🎤 Listening... Speak to Sangeetham AI", false);
			};

			speechRecognition.onresult = function (event) {
				var transcript = event.results[0][0].transcript;
				if (transcript && spotlightInput) {
					spotlightInput.value = transcript;
					updateClearButtonVisibility();
					executeAIQuery(transcript, { isLive: false });
				}
			};

			speechRecognition.onerror = function () {
				stopVoiceRecognition();
				showStatus("Could not recognize voice. Please try typing your query.", false);
			};

			speechRecognition.onend = function () {
				stopVoiceRecognition();
			};

			spotlightMic.addEventListener("click", function (e) {
				e.preventDefault();
				if (isListening) {
					stopVoiceRecognition();
				} else {
					try {
						speechRecognition.start();
					} catch (err) {
						console.warn("Speech recognition start error:", err);
					}
				}
			});
		} catch (e) {
			console.warn("SpeechRecognition init failed:", e);
		}
	}

	function stopVoiceRecognition() {
		isListening = false;
		if (spotlightMic) spotlightMic.classList.remove("listening");
		if (speechRecognition) {
			try { speechRecognition.stop(); } catch (e) { }
		}
	}

	// --------------------------------------------------------------------------
	// Status & Visualizer Helpers
	// --------------------------------------------------------------------------
	function showStatus(htmlMsg, isPlayback) {
		if (!spotlightStatus || !spotlightStatusText) return;
		spotlightStatusText.innerHTML = htmlMsg;
		spotlightStatus.style.display = "flex";

		var waves = spotlightStatus.querySelector(".spotlight-mini-waves");
		if (waves) {
			waves.style.display = isPlayback ? "flex" : "none";
		}
	}

	function hideStatus() {
		if (spotlightStatus) {
			spotlightStatus.style.display = "none";
		}
	}

	function showLoading(show) {
		if (!spotlightLoading) return;
		spotlightLoading.style.display = show ? "flex" : "none";
	}

	function showEmptyState() {
		if (spotlightResults) spotlightResults.innerHTML = "";
		if (spotlightEmpty) spotlightEmpty.style.display = "block";
		currentResults = [];
		selectedIndex = -1;
	}

	function hideEmptyState() {
		if (spotlightEmpty) spotlightEmpty.style.display = "none";
	}

	// --------------------------------------------------------------------------
	// AI Query Processing Engine
	// --------------------------------------------------------------------------
	async function executeAIQuery(prompt, options) {
		if (!prompt || !prompt.trim()) return;
		var cleanPrompt = prompt.trim();
		var lower = cleanPrompt.toLowerCase();
		var isLive = options && options.isLive;

		// 1. Playback Control Commands (Immediate Execution)
		if (lower === "pause" || lower === "stop" || lower.includes("pause music")) {
			if (typeof audio !== "undefined" && audio) {
				audio.pause();
			}
			var playbtn = document.getElementById("playpausebtn");
			if (playbtn) playbtn.className = "play";
			if (typeof setPlayerLyricPlayingState === "function") {
				setPlayerLyricPlayingState(false);
			}
			showStatus("⏸ Music paused", false);
			return;
		}

		if (lower === "play" || lower === "resume" || lower.includes("resume music") || lower === "start") {
			if (typeof audio !== "undefined" && audio && audio.paused && audio.src) {
				audio.play();
				var playbtn2 = document.getElementById("playpausebtn");
				if (playbtn2) playbtn2.className = "pause";
				if (typeof setPlayerLyricPlayingState === "function") {
					setPlayerLyricPlayingState(true);
				}
				var currentSong = (typeof playlist !== "undefined" && playlist && playlist[playlist_index]);
				var title = currentSong ? currentSong.title : "track";
				showStatus("▶ Playback resumed: <strong>" + title + "</strong>", true);
			} else {
				showStatus("▶ Tell me what to play: 'Play Kesariya', 'Late night lo-fi'...", false);
			}
			return;
		}

		if (lower.includes("next") || lower.includes("skip")) {
			var nextBtn = document.getElementById("next-s");
			if (nextBtn) nextBtn.click();
			setTimeout(function () {
				var currentSong = (typeof playlist !== "undefined" && playlist && playlist[playlist_index]);
				var songName = currentSong ? currentSong.title : "next song";
				showStatus("⏭ Skipped to: <strong>" + songName + "</strong>", true);
			}, 200);
			return;
		}

		if (lower.includes("prev") || lower.includes("previous") || lower.includes("back")) {
			var prevBtn = document.getElementById("prev-s");
			if (prevBtn) prevBtn.click();
			setTimeout(function () {
				var currentSong = (typeof playlist !== "undefined" && playlist && playlist[playlist_index]);
				var songName = currentSong ? currentSong.title : "previous song";
				showStatus("⏮ Playing: <strong>" + songName + "</strong>", true);
			}, 200);
			return;
		}

		if (lower.includes("lyric") || lower.includes("lyrics")) {
			var lyricsModal = document.getElementById("lyrics_modal");
			if (lyricsModal) {
				lyricsModal.classList.add("active");
				if (typeof loadLyricsForCurrentSong === "function") {
					loadLyricsForCurrentSong();
				}
			}
			if (typeof switchTab === "function") {
				switchTab("lyrics");
			}
			closeAISpotlight();
			if (typeof showToast === "function") {
				showToast("📜 Opened synced lyrics view");
			}
			return;
		}

		if (lower.includes("mute")) {
			if (typeof audio !== "undefined" && audio) {
				audio.muted = true;
				showStatus("🔇 Audio muted", false);
			}
			return;
		}

		if (lower.includes("unmute")) {
			if (typeof audio !== "undefined" && audio) {
				audio.muted = false;
				showStatus("🔊 Audio unmuted", false);
			}
			return;
		}

		// 2. Music Search & Recommendations via Saavn API
		var isDirectPlay = lower.startsWith("play ") && !lower.endsWith("music") && lower !== "play";

		// Strip query prefix words to pass accurate keyword to music search
		var searchQuery = cleanPrompt
			.replace(/^(can you play|please play|play songs by|play|recommend me|suggest me|find me|give me|i want to listen to|i want)\s+/gi, "")
			.replace(/songs?|music|tracks?|hits?/gi, "")
			.trim();

		if (!searchQuery) searchQuery = cleanPrompt;

		hideEmptyState();
		showLoading(true);
		isProcessing = true;

		try {
			if (typeof SaavnAPI !== "undefined" && SaavnAPI.searchSongs) {
				var results = await SaavnAPI.searchSongs(searchQuery, 1, 15);
				showLoading(false);

				if (results && results.length > 0) {
					currentResults = results;
					selectedIndex = -1;

					// Direct Play: start playing first result if user typed "play <song>" and it wasn't a live debounce
					if (isDirectPlay && !isLive) {
						playSongDirectly(results[0]);
						showStatus("⚡ Now playing: <strong>" + results[0].title + "</strong> • " + results[0].artist, true);
					} else {
						showStatus("✨ Curated <strong>" + results.length + "</strong> songs for \"" + cleanPrompt + "\"", false);
					}

					renderSpotlightResults(results);
				} else {
					currentResults = [];
					showStatus("🤔 No matches found for \"" + cleanPrompt + "\". Try another artist, mood, or song.", false);
					if (spotlightResults) {
						spotlightResults.innerHTML = `
							<div class="spotlight-empty-state" style="padding: 24px;">
								<p>No tracks found. Try popular searches like <em>"Trending Hindi"</em>, <em>"Arijit Singh"</em>, or <em>"Lo-Fi Study"</em>.</p>
							</div>
						`;
					}
				}
			} else {
				showLoading(false);
				showStatus("Music service is connecting. Please try again in a moment.", false);
			}
		} catch (err) {
			console.warn("AI Spotlight query error:", err);
			showLoading(false);
			showStatus("✨ Could not fetch recommendations right now. Please try again.", false);
		} finally {
			isProcessing = false;
		}
	}

	// --------------------------------------------------------------------------
	// Render Results in Spotlight
	// --------------------------------------------------------------------------
	function renderSpotlightResults(songs) {
		if (!spotlightResults) return;
		spotlightResults.innerHTML = "";

		songs.forEach(function (song, index) {
			var item = document.createElement("div");
			item.className = "spotlight-song-item";
			item.setAttribute("data-index", index);

			var isFav = (typeof FavoritesManager !== "undefined") && FavoritesManager.isFavorite(song);
			var favIcon = isFav ? "fa fa-heart" : "fa fa-heart-o";
			var favActive = isFav ? " active" : "";
			var coverUrl = song.cover || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80";

			item.innerHTML = `
				<div class="spotlight-item-main">
					<div class="spotlight-thumb-wrap">
						<img src="${coverUrl}" alt="${song.title}" class="spotlight-song-thumb" loading="lazy">
						<div class="spotlight-thumb-overlay"><i class="fa fa-play"></i></div>
					</div>
					<div class="spotlight-song-details">
						<div class="spotlight-song-title">${song.title}</div>
						<div class="spotlight-song-meta">${song.artist || 'Unknown'} • ${song.durationStr || '3:30'}</div>
					</div>
				</div>
				<div class="spotlight-item-actions">
					<button class="spotlight-fav-btn${favActive}" title="${isFav ? 'Remove from Favorites' : 'Add to Favorites'}">
						<i class="${favIcon}"></i>
					</button>
					<button class="spotlight-play-btn" title="Play Track">
						<i class="fa fa-play"></i> Play
					</button>
				</div>
			`;

			// Favorite toggle
			var favBtn = item.querySelector(".spotlight-fav-btn");
			if (favBtn) {
				favBtn.addEventListener("click", function (e) {
					e.stopPropagation();
					if (typeof FavoritesManager !== "undefined") {
						FavoritesManager.toggleFavorite(song);
						var nowFav = FavoritesManager.isFavorite(song);
						favBtn.className = "spotlight-fav-btn" + (nowFav ? " active" : "");
						favBtn.querySelector("i").className = nowFav ? "fa fa-heart" : "fa fa-heart-o";
					}
				});
			}

			// Play button
			var playBtn = item.querySelector(".spotlight-play-btn");
			if (playBtn) {
				playBtn.addEventListener("click", function (e) {
					e.stopPropagation();
					playSongDirectly(song);
				});
			}

			// Click row to play
			item.addEventListener("click", function () {
				playSongDirectly(song);
			});

			spotlightResults.appendChild(item);
		});
	}

	function playSongDirectly(song) {
		if (typeof playDirectSong === "function") {
			playDirectSong(song);
		}
		showStatus("▶ Now playing: <strong>" + song.title + "</strong> • " + (song.artist || ''), true);
	}

	// --------------------------------------------------------------------------
	// Legacy Chat View Fallback Support
	// --------------------------------------------------------------------------
	// Retain initAIChatBot for compatibility if called elsewhere
	window.initAIChatBot = initAISpotlight;

	// Initialize on DOMContentLoaded or Load
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initAISpotlight);
	} else {
		initAISpotlight();
	}
})();
