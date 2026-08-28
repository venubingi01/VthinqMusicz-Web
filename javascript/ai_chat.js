// Sangeetham AI DJ Chat Box Engine
// Provides natural language music recommendations, playlist creation, voice chat, and player controls

function initAIChatBot() {
	var floatingChatBtn = document.getElementById("floating_chat_btn");
	var chatInput = document.getElementById("chat_input");
	var sendChatBtn = document.getElementById("send_chat_btn");
	var clearChatBtn = document.getElementById("clear_chat_btn");
	var chatVoiceBtn = document.getElementById("chat_voice_btn");
	var chatMessages = document.getElementById("chat_messages_container");

	var closeChatBtn = document.getElementById("close_chat_btn");
	closeChatBtn.addEventListener("click", function () {
		var chatView = document.getElementById("chat_view");
		chatView.classList.remove("active");
		//swith to previous view
		switchTab("home");
	});

	// Free Drag & Drop Controller for Floating AI Chat Button across Entire Screen
	if (floatingChatBtn) {
		var isDragging = false;
		var hasMoved = false;
		var startX = 0;
		var startY = 0;
		var initialBtnLeft = 0;
		var initialBtnTop = 0;
		var dragThreshold = 6;

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

			// Switch to absolute left/top positioning relative to viewport
			floatingChatBtn.style.right = "auto";
			floatingChatBtn.style.bottom = "auto";
			floatingChatBtn.style.left = initialBtnLeft + "px";
			floatingChatBtn.style.top = initialBtnTop + "px";
			floatingChatBtn.classList.add("is-dragging");
		}

		function onDragMove(e) {
			if (!isDragging) return;
			var coords = getClientCoords(e);
			var dx = coords.x - startX;
			var dy = coords.y - startY;

			if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) {
				hasMoved = true;
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

		function endDrag() {
			if (!isDragging) return;
			isDragging = false;
			floatingChatBtn.classList.remove("is-dragging");

			if (!hasMoved) {
				// Clean tap or click without drag - toggle between AI Chat and Home
				var chatView = document.getElementById("chat_view");
				var isChatActive = (chatView && chatView.classList.contains("active")) || (typeof activeTab !== "undefined" && activeTab === "ai_chat");

				if (typeof switchTab === "function") {
					switchTab("ai_chat");
				}
			}
		}

		// Mouse drag listeners
		floatingChatBtn.addEventListener("mousedown", startDrag);
		window.addEventListener("mousemove", onDragMove);
		window.addEventListener("mouseup", endDrag);

		// Touch drag listeners
		floatingChatBtn.addEventListener("touchstart", startDrag, { passive: false });
		window.addEventListener("touchmove", onDragMove, { passive: false });
		window.addEventListener("touchend", endDrag);
		window.addEventListener("touchcancel", endDrag);

		// Re-clamp position on window resize or device orientation change
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

	function appendMessage(sender, text, songResults, suggestions) {
		if (!chatMessages) return;
		var msgDiv = document.createElement("div");
		msgDiv.className = "chat-message " + (sender === "user" ? "user-message" : "bot-message");

		var avatarDiv = document.createElement("div");
		avatarDiv.className = "message-avatar" + (sender === "user" ? " user-avatar" : "");
		avatarDiv.innerHTML = sender === "user" ? '<i class="fa fa-user"></i>' : '<i class="fa fa-magic"></i>';

		var bodyDiv = document.createElement("div");
		bodyDiv.className = "message-body";

		var bubbleDiv = document.createElement("div");
		bubbleDiv.className = "message-bubble";
		bubbleDiv.innerHTML = text;
		bodyDiv.appendChild(bubbleDiv);

		// Render interactive song recommendation cards
		if (songResults && songResults.length > 0) {
			var songsListDiv = document.createElement("div");
			songsListDiv.className = "chat-song-cards-list";

			songResults.forEach(function (song) {
				var card = document.createElement("div");
				card.className = "chat-song-card";
				var isFav = (typeof FavoritesManager !== "undefined") && FavoritesManager.isFavorite(song);
				var favIcon = isFav ? "fa fa-heart" : "fa fa-heart-o";
				var favActive = isFav ? " active" : "";

				card.innerHTML = `
					<div class="chat-song-info-group">
						<img class="chat-song-thumb" src="${song.cover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80'}" alt="${song.title}">
						<div class="chat-song-text">
							<div class="chat-song-title">${song.title}</div>
							<div class="chat-song-artist">${song.artist} • ${song.durationStr || '3:30'}</div>
						</div>
					</div>
					<div style="display:flex;align-items:center;gap:4px;">
						<button class="chat-fav-song-btn${favActive}" data-fav-song-title="${song.title.replace(/"/g, '&quot;')}" data-fav-song-artist="${(song.artist || '').replace(/"/g, '&quot;')}" title="${isFav ? 'Remove from Favorites' : 'Add to Favorites'}"><i class="${favIcon}"></i></button>
						<button class="chat-play-song-btn" title="Play Now"><i class="fa fa-play"></i> Play</button>
					</div>
				`;

				var favBtn = card.querySelector(".chat-fav-song-btn");
				if (favBtn) {
					favBtn.onclick = function (e) {
						e.stopPropagation();
						if (typeof FavoritesManager !== "undefined") {
							FavoritesManager.toggleFavorite(song);
						}
					};
				}

				var playBtn = card.querySelector(".chat-play-song-btn");
				if (playBtn) {
					playBtn.onclick = function (e) {
						e.stopPropagation();
						if (typeof playDirectSong === "function") {
							playDirectSong(song);
						}
					};
				}

				songsListDiv.appendChild(card);
			});

			bodyDiv.appendChild(songsListDiv);
		}

		// Render follow-up suggestions
		if (suggestions && suggestions.length > 0) {
			var suggDiv = document.createElement("div");
			suggDiv.className = "chat-quick-suggestions";
			suggestions.forEach(function (promptText) {
				var chip = document.createElement("button");
				chip.className = "chat-chip";
				chip.textContent = promptText;
				chip.onclick = function () {
					handleUserPrompt(promptText);
				};
				suggDiv.appendChild(chip);
			});
			bodyDiv.appendChild(suggDiv);
		}

		msgDiv.appendChild(avatarDiv);
		msgDiv.appendChild(bodyDiv);
		chatMessages.appendChild(msgDiv);
		chatMessages.scrollTop = chatMessages.scrollHeight;
	}

	function showTypingIndicator() {
		if (!chatMessages) return null;
		var typingDiv = document.createElement("div");
		typingDiv.id = "ai_typing_indicator";
		typingDiv.className = "chat-message bot-message";
		typingDiv.innerHTML = `
			<div class="message-avatar"><i class="fa fa-magic"></i></div>
			<div class="message-body">
				<div class="message-bubble" style="padding: 8px 14px;">
					<div class="typing-indicator"><span></span><span></span><span></span></div>
				</div>
			</div>
		`;
		chatMessages.appendChild(typingDiv);
		chatMessages.scrollTop = chatMessages.scrollHeight;
		return typingDiv;
	}

	function removeTypingIndicator() {
		var el = document.getElementById("ai_typing_indicator");
		if (el) el.remove();
	}

	async function handleUserPrompt(prompt) {
		if (!prompt || !prompt.trim()) return;
		var cleanPrompt = prompt.trim();
		appendMessage("user", cleanPrompt);

		if (chatInput) chatInput.value = "";

		showTypingIndicator();

		var lower = cleanPrompt.toLowerCase();

		// Playback control commands
		if (lower === "pause" || lower === "stop" || lower.includes("pause music")) {
			setTimeout(function () {
				removeTypingIndicator();
				if (typeof audio !== "undefined" && audio) {
					audio.pause();
				}
				var playbtn = document.getElementById("playpausebtn");
				if (playbtn) playbtn.className = "play";
				if (typeof setPlayerLyricPlayingState === "function") {
					setPlayerLyricPlayingState(false);
				}
				appendMessage("bot", "⏸ Music paused! Let me know when you'd like to resume or find another groove.", null, ["Resume music", "Play trending songs", "Chill acoustic"]);
			}, 350);
			return;
		}

		if (lower === "play" || lower === "resume" || lower.includes("resume music") || lower === "start") {
			setTimeout(function () {
				removeTypingIndicator();
				if (typeof audio !== "undefined" && audio && audio.paused && audio.src) {
					audio.play();
					var playbtn = document.getElementById("playpausebtn");
					if (playbtn) playbtn.className = "pause";
					if (typeof setPlayerLyricPlayingState === "function") {
						setPlayerLyricPlayingState(true);
					}
					appendMessage("bot", "▶ Playback resumed! Enjoy the music! 🎵", null, ["Next track", "Show lyrics"]);
				} else {
					appendMessage("bot", "▶ Let's get some music going! Pick a vibe below:", null, ["Trending Hindi", "Workout Pump", "Lo-Fi Focus"]);
				}
			}, 350);
			return;
		}

		if (lower.includes("next") || lower.includes("skip")) {
			setTimeout(function () {
				removeTypingIndicator();
				var nextBtn = document.getElementById("next-s");
				if (nextBtn) nextBtn.click();
				var currentSong = (typeof playlist !== "undefined" && playlist && playlist[playlist_index]);
				var songName = currentSong ? currentSong.title : "next song";
				appendMessage("bot", "⏭ Skipped to the next track: <strong>" + songName + "</strong> 🎶", null, ["Show lyrics", "Recommend similar songs"]);
			}, 350);
			return;
		}

		if (lower.includes("lyric") || lower.includes("lyrics")) {
			setTimeout(function () {
				removeTypingIndicator();
				var lyricsModal = document.getElementById("lyrics_modal");
				if (lyricsModal) {
					lyricsModal.classList.add("active");
					if (typeof loadLyricsForCurrentSong === "function") {
						loadLyricsForCurrentSong();
					}
				}
				appendMessage("bot", "📜 Opened the real-time synced lyrics screen for you!", null, ["Play romantic songs", "Next song"]);
			}, 350);
			return;
		}

		// Intelligent Music Query extraction
		var searchQuery = cleanPrompt
			.replace(/^(can you play|please play|play songs by|play|recommend me|suggest me|find me|give me|i want to listen to|i want)\s+/gi, "")
			.replace(/songs?|music|tracks?|hits?/gi, "")
			.trim();

		if (!searchQuery) searchQuery = cleanPrompt;

		try {
			if (typeof SaavnAPI !== "undefined" && SaavnAPI.searchSongs) {
				var results = await SaavnAPI.searchSongs(searchQuery, 1, 10);
				removeTypingIndicator();

				if (results && results.length > 0) {
					var responseGreeting = "🎵 Here are the top tracks I curated for <strong>\"" + cleanPrompt + "\"</strong>. Tap ▶ Play to start jamming!";
					if (lower.startsWith("play ") && results.length > 0) {
						if (typeof playDirectSong === "function") {
							playDirectSong(results[0]);
						}
						responseGreeting = "⚡ Now playing <strong>" + results[0].title + "</strong> by " + results[0].artist + "! Here are more recommendations:";
					}
					appendMessage("bot", responseGreeting, results, [
						"More by " + (results[0].artist.split(",")[0] || "Artist"),
						"High energy workout",
						"Late night vibes"
					]);
				} else {
					appendMessage("bot", "🤔 I couldn't find exact tracks for \"" + cleanPrompt + "\". Let's try these popular vibes:", null, [
						"Trending Hindi",
						"Arijit Singh Hits",
						"Lo-Fi Study Beats",
						"Anirudh Energy Hits"
					]);
				}
			} else {
				removeTypingIndicator();
				appendMessage("bot", "Music service is connecting. Try asking again in a moment!", null, ["Trending Hindi"]);
			}
		} catch (err) {
			console.warn("AI Chat music search error:", err);
			removeTypingIndicator();
			appendMessage("bot", "✨ I'm your AI DJ! Try asking me for moods like *'Relaxing lo-fi'*, *'Workout pump'*, or artists like *'Arijit Singh'*!", null, [
				"Trending Hindi",
				"Deep Focus Lo-Fi",
				"Workout Beats"
			]);
		}
	}

	if (sendChatBtn) {
		sendChatBtn.addEventListener("click", function () {
			if (chatInput) handleUserPrompt(chatInput.value);
		});
	}

	if (chatInput) {
		chatInput.addEventListener("keydown", function (e) {
			if (e.key === "Enter") {
				e.preventDefault();
				handleUserPrompt(this.value);
			}
		});
	}

	if (clearChatBtn) {
		clearChatBtn.addEventListener("click", function () {
			if (chatMessages) {
				chatMessages.innerHTML = `
					<div class="chat-message bot-message">
						<div class="message-avatar"><i class="fa fa-magic"></i></div>
						<div class="message-body">
							<div class="message-bubble">
								<p>🧹 Chat cleared! What vibe are you in the mood for next?</p>
							</div>
							<div class="chat-quick-suggestions">
								<button class="chat-chip" data-prompt="Play trending Hindi hits">🔥 Trending Hindi</button>
								<button class="chat-chip" data-prompt="Calm acoustic songs for evening">☕ Chill Acoustic</button>
								<button class="chat-chip" data-prompt="High energy workout tracks">⚡ Workout Pump</button>
								<button class="chat-chip" data-prompt="Deep focus instrumental lo-fi">🎧 Focus Lo-Fi</button>
							</div>
						</div>
					</div>
				`;
			}
		});
	}

	// Chat Voice Input Mic
	var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
	if (SpeechRecognition && chatVoiceBtn) {
		var chatRec = new SpeechRecognition();
		chatRec.continuous = false;
		chatRec.interimResults = false;
		chatRec.lang = "en-IN";

		chatVoiceBtn.addEventListener("click", function () {
			try {
				chatVoiceBtn.classList.add("listening");
				chatRec.start();
				if (typeof showToast === "function") {
					showToast("🎤 Listening... Speak to AI DJ");
				}
			} catch (e) {
				console.warn("Chat speech start error:", e);
			}
		});

		chatRec.onresult = function (event) {
			chatVoiceBtn.classList.remove("listening");
			var transcript = event.results[0][0].transcript;
			if (transcript) {
				if (chatInput) chatInput.value = transcript;
				handleUserPrompt(transcript);
			}
		};

		chatRec.onerror = function () {
			chatVoiceBtn.classList.remove("listening");
			if (typeof showToast === "function") {
				showToast("Could not recognize voice. Please try again.");
			}
		};

		chatRec.onend = function () {
			chatVoiceBtn.classList.remove("listening");
		};
	}

	// Delegate chat chip clicks
	document.addEventListener("click", function (e) {
		var chip = e.target.closest(".chat-chip");
		if (chip) {
			var prompt = chip.getAttribute("data-prompt") || chip.textContent;
			if (prompt) {
				handleUserPrompt(prompt);
			}
		}
	});
}

// Auto-initialize when window loads or script loads
window.addEventListener("load", initAIChatBot);
