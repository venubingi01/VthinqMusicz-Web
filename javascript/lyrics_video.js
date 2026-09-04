// Copyright (c) 2026 Vthinq. All rights reserved.
// Developer: Venu Bingi
// Sangeetham AI Music Player - Real Music Video Looper (Spotify Canvas Style)

(function (global) {
	"use strict";

	var RealVideoLooper = {
		isVideoVisible: false,
		isVideoAvailable: false,
		videoFailedToLoad: false,
		currentSongKey: null,
		currentVideoId: null,
		cachedVideoIds: {},
		apiEndpoints: [
			"https://api.piped.private.coffee/search",
			"https://pipedapi.kavin.rocks/search",
			"https://pipedapi.leptons.xyz/search"
		],

		init: function () {
			this.bindEvents();

			var curSong = this.getCurrentSong();
			if (curSong) {
				this.onSongChange(curSong);
			}
		},

		videoCycleState: 0, // 0 = Cover, 1 = Canvas Video, 2 = Full Screen

		// Get current song cover URL safely
		getSongCover: function (song) {
			if (!song) song = this.getCurrentSong();
			if (song && song.cover) return song.cover;
			if (song && typeof song.image === "string") return song.image;
			if (song && Array.isArray(song.image) && song.image.length > 0) {
				var last = song.image[song.image.length - 1];
				if (typeof last === "string") return last;
				if (last && (last.url || last.link)) return last.url || last.link;
			}
			var lyricsCover = document.getElementById("lyrics_cover");
			if (lyricsCover && lyricsCover.src && !lyricsCover.src.includes("data:image")) return lyricsCover.src;
			var modalCover = document.getElementById("modal_lyrics_cover");
			if (modalCover && modalCover.src) return modalCover.src;
			var playerThumb = document.getElementById("player_thumb") || document.getElementById("track_image");
			if (playerThumb && playerThumb.src) return playerThumb.src;
			return "";
		},

		// Set cover image as background image of lyrics_video_embed_container
		setCoverBackground: function (coverUrl) {
			var container = document.getElementById("lyrics_video_embed_container");
			if (!container) return;
			if (!coverUrl) coverUrl = this.getSongCover();
			if (coverUrl) {
				container.style.backgroundImage = 'url("' + coverUrl + '")';
				container.style.backgroundSize = "cover";
				container.style.backgroundPosition = "center center";
				container.style.backgroundRepeat = "no-repeat";
			}
		},

		wasAudioPlayingBeforeFullscreen: false,

		// Send commands to YouTube iframe (pauseVideo, playVideo, seekTo, etc.)
		sendYouTubeCommand: function (iframe, command, args) {
			if (!iframe || !iframe.contentWindow) return;
			try {
				var payload = {
					event: "command",
					func: command,
					args: args !== undefined ? (Array.isArray(args) ? args : [args]) : []
				};
				iframe.contentWindow.postMessage(JSON.stringify(payload), "*");
			} catch (e) {
				console.warn("[LyricsVideo] Error sending command to YouTube iframe:", e);
			}
		},

		// Seek all active YouTube video iframes to exact seconds
		seekVideoTo: function (seconds, allowSeekAhead) {
			if (typeof seconds !== "number" || isNaN(seconds) || seconds < 0) return;
			var allowAhead = typeof allowSeekAhead === "boolean" ? allowSeekAhead : true;

			var canvasIframe = document.querySelector("#lyrics_video_embed_container iframe");
			if (canvasIframe) {
				this.sendYouTubeCommand(canvasIframe, "seekTo", [seconds, allowAhead]);
			}
			var fsIframe = document.querySelector("#fullscreen_video_embed iframe");
			if (fsIframe) {
				this.sendYouTubeCommand(fsIframe, "seekTo", [seconds, allowAhead]);
			}
		},

		lastSeekTime: 0,
		seekThrottleTimer: null,
		isSeekingAudio: false,

		// Synchronize YouTube video timeline with audio player's currentTime
		syncTimelineWithAudio: function (immediate) {
			var self = this;
			var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
			if (!audioEl || typeof audioEl.currentTime !== "number" || isNaN(audioEl.currentTime)) return;

			var targetTime = audioEl.currentTime;

			if (immediate) {
				if (this.seekThrottleTimer) {
					clearTimeout(this.seekThrottleTimer);
					this.seekThrottleTimer = null;
				}
				this.seekVideoTo(targetTime, true);
				this.lastSeekTime = Date.now();
				return;
			}

			// Throttled seeking while dragging to prevent YouTube player buffering stutter (max once every 100ms)
			var now = Date.now();
			if (now - this.lastSeekTime >= 100) {
				this.lastSeekTime = now;
				this.seekVideoTo(targetTime, false);
			} else {
				if (this.seekThrottleTimer) clearTimeout(this.seekThrottleTimer);
				this.seekThrottleTimer = setTimeout(function () {
					self.seekVideoTo(targetTime, true);
					self.lastSeekTime = Date.now();
				}, 100);
			}
		},

		// Bind all audio timeline events (play, pause, seeking, seeked) to YouTube video
		bindAudioSyncEvents: function () {
			var self = this;
			var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
			if (!audioEl || audioEl._videoSyncBound) return;
			audioEl._videoSyncBound = true;

			audioEl.addEventListener("pause", function () {
				self.pauseVideo();
				self.syncTimelineWithAudio(true);
			});
			audioEl.addEventListener("ended", function () {
				self.pauseVideo();
			});
			audioEl.addEventListener("play", function () {
				self.syncTimelineWithAudio(true);
				self.resumeVideo();
			});
			audioEl.addEventListener("seeking", function () {
				self.isSeekingAudio = true;
				self.syncTimelineWithAudio(false);
			});
			audioEl.addEventListener("seeked", function () {
				self.isSeekingAudio = false;
				self.syncTimelineWithAudio(true);
			});
		},

		// Pause any active YouTube video (canvas or fullscreen)
		pauseVideo: function () {
			var canvasIframe = document.querySelector("#lyrics_video_embed_container iframe");
			if (canvasIframe) {
				this.sendYouTubeCommand(canvasIframe, "pauseVideo");
			}
			var fsIframe = document.querySelector("#fullscreen_video_embed iframe");
			if (fsIframe) {
				this.sendYouTubeCommand(fsIframe, "pauseVideo");
			}
		},

		// Resume video playback if video mode is active and video is valid
		resumeVideo: function () {
			if (this.isVideoVisible && !this.videoFailedToLoad) {
				var canvasIframe = document.querySelector("#lyrics_video_embed_container iframe");
				if (canvasIframe) {
					this.sendYouTubeCommand(canvasIframe, "playVideo");
				}
			}
		},

		bindEvents: function () {
			var self = this;

			// Synchronize with audio element events
			this.bindAudioSyncEvents();

			// Unified cycling video button in lyrics-controls-group
			var cycleBtn = document.getElementById("lyrics_video_toggle_btn");
			if (cycleBtn) {
				cycleBtn.addEventListener("click", function () {
					self.handleCycleClick();
				});
			}

			// Capture YouTube iframe postMessage messages & errors
			window.addEventListener("message", function (e) {
				try {
					var msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
					if (!msg) return;

					if (msg.event === "onError" || (msg.info && msg.info.playerState === -1 && self.videoCycleState === 1)) {
						console.warn("[LyricsVideo] YouTube player reported error:", msg);
						self.onVideoLoadFailed();
						return;
					}

					// Dynamic drift synchronization: if YouTube video drifts from audio timeline by > 1.5s, re-sync
					if (msg.info && typeof msg.info.currentTime === "number") {
						var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
						if (audioEl && !audioEl.paused && !self.isSeekingAudio && self.isVideoVisible) {
							var drift = Math.abs(audioEl.currentTime - msg.info.currentTime);
							if (drift > 1.5) {
								self.seekVideoTo(audioEl.currentTime, true);
							}
						}
					}
				} catch (err) { }
			});

			// Legacy button support if present
			var toggleBtn = document.getElementById("show_video_btn");
			if (toggleBtn) {
				toggleBtn.addEventListener("click", function () {
					self.handleCycleClick();
				});
			}

			var fsBtn = document.getElementById("video_fullscreen_btn");
			if (fsBtn) {
				fsBtn.addEventListener("click", function () {
					self.openFullscreenVideo();
				});
			}

			// Exit Fullscreen Video button
			var closeFsBtn = document.getElementById("close_fullscreen_video_btn");
			if (closeFsBtn) {
				closeFsBtn.addEventListener("click", function () {
					self.closeFullscreenVideo();
				});
			}

			// Mobile Landscape Rotate button
			var rotateBtn = document.getElementById("video_rotate_landscape_btn");
			if (rotateBtn) {
				rotateBtn.addEventListener("click", function () {
					self.toggleLandscapeMode();
				});
			}

			// Escape key to exit fullscreen video
			window.addEventListener("keydown", function (e) {
				if (e.key === "Escape") {
					var overlay = document.getElementById("fullscreen_video_overlay");
					if (overlay && overlay.style.display !== "none") {
						self.closeFullscreenVideo();
					}
				}
			});

			// Change video URL / ID
			var changeBtn = document.getElementById("video_loop_change_btn");
			var customTray = document.getElementById("video_loop_custom_tray");
			var customInput = document.getElementById("video_loop_custom_input");
			var customSubmitBtn = document.getElementById("video_loop_custom_submit");

			if (changeBtn && customTray) {
				changeBtn.addEventListener("click", function () {
					var isHidden = customTray.style.display === "none" || !customTray.style.display;
					customTray.style.display = isHidden ? "flex" : "none";
					if (isHidden && customInput) {
						customInput.focus();
					}
				});
			}

			if (customSubmitBtn && customInput) {
				var handleCustomSubmit = function () {
					var val = customInput.value.trim();
					if (val) {
						self.loadCustomVideo(val);
						if (customTray) customTray.style.display = "none";
					}
				};
				customSubmitBtn.addEventListener("click", handleCustomSubmit);
				customInput.addEventListener("keydown", function (e) {
					if (e.key === "Enter") handleCustomSubmit();
				});
			}
		},

		// Handle multi-click cycle for the single video button:
		// State 0 (Cover) -> State 1 (Play Video / Fallback Cover) -> State 2 (Full Screen) -> State 0 (Cover)
		handleCycleClick: function () {
			if (this.videoCycleState === 0) {
				// State 0 -> 1: Show Canvas Video or Fallback Cover Background
				this.toggleVideoDisplay(true);
				this.videoCycleState = 1;

				if (!this.isVideoAvailable || this.videoFailedToLoad) {
					// Ensure cover image is displayed as background in lyrics_video_embed_container
					this.setCoverBackground(this.getSongCover());
					var container = document.getElementById("lyrics_video_embed_container");
					if (container) container.classList.add("cover-fallback-active");
					if (typeof showToast === "function") {
						showToast("Showing album artwork");
					}
				} else {
					if (typeof showToast === "function") {
						showToast("▶ Music video playing");
					}
				}
				this.updateCycleButtonUI();
			} else if (this.videoCycleState === 1) {
				if (this.isVideoAvailable && !this.videoFailedToLoad) {
					// State 1 -> 2: Open Full Screen Video
					this.openFullscreenVideo();
					this.videoCycleState = 2;
					this.updateCycleButtonUI();
				} else {
					// If video not available or failed, return to normal cover view
					this.toggleVideoDisplay(false);
					this.videoCycleState = 0;
					this.updateCycleButtonUI();
				}
			} else {
				// State 2 -> 0: Close and return to Cover Art
				this.closeFullscreenVideo();
				this.toggleVideoDisplay(false);
				this.videoCycleState = 0;
				this.updateCycleButtonUI();
				if (typeof showToast === "function") {
					showToast("Switched to Album Cover");
				}
			}
		},

		// Update icon, text, and tooltip of the single video button based on cycle state
		updateCycleButtonUI: function () {
			var cycleBtn = document.getElementById("lyrics_video_toggle_btn");
			var textEl = document.getElementById("lyrics_video_toggle_text");
			if (!cycleBtn) return;

			if (this.videoCycleState === 0) {
				cycleBtn.classList.remove("active");
				cycleBtn.title = (this.isVideoAvailable && !this.videoFailedToLoad) ? "Show Music Video" : "Show Artwork Background";
				cycleBtn.innerHTML = '<i class="fa-solid fa-video"></i> <span id="lyrics_video_toggle_text">Video</span>';
			} else if (this.videoCycleState === 1) {
				cycleBtn.classList.add("active");
				if (this.isVideoAvailable && !this.videoFailedToLoad) {
					cycleBtn.title = "Watch Full Screen";
					cycleBtn.innerHTML = '<i class="fa-solid fa-expand"></i> <span id="lyrics_video_toggle_text">Full Screen</span>';
				} else {
					cycleBtn.title = "Hide Artwork Background / Show Cover";
					cycleBtn.innerHTML = '<i class="fa-solid fa-image"></i> <span id="lyrics_video_toggle_text">Cover</span>';
				}
			} else {
				cycleBtn.classList.add("active");
				cycleBtn.title = "Hide Video / Show Cover";
				cycleBtn.innerHTML = '<i class="fa-solid fa-image"></i> <span id="lyrics_video_toggle_text">Cover</span>';
			}
		},

		// Open Video in Full Screen Mode with Mobile Landscape Option
		openFullscreenVideo: function () {
			if (!this.currentVideoId) return;

			// Pause audio player so full screen video audio doesn't clash with music player audio
			var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
			if (audioEl && !audioEl.paused) {
				this.wasAudioPlayingBeforeFullscreen = true;
				audioEl.pause();
				var playbtn = document.getElementById("play_btn") || document.getElementById("playbtn");
				if (playbtn) playbtn.className = "play";
				if (typeof setPlayerLyricPlayingState === "function") {
					setPlayerLyricPlayingState(false);
				}
			} else {
				this.wasAudioPlayingBeforeFullscreen = false;
			}

			var overlay = document.getElementById("fullscreen_video_overlay");
			var embed = document.getElementById("fullscreen_video_embed");
			var titleEl = document.getElementById("fullscreen_video_title");
			var song = this.getCurrentSong();

			if (titleEl && song) {
				titleEl.textContent = song.title + (song.artist ? " • " + song.artist : "");
			}

			if (embed) {
				var startSec = (audioEl && typeof audioEl.currentTime === "number") ? Math.floor(audioEl.currentTime) : 0;
				var url = "https://www.youtube-nocookie.com/embed/" + this.currentVideoId +
					"?autoplay=1&mute=0&controls=1&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&start=" + startSec;
				embed.innerHTML = '<iframe src="' + url + '" class="fullscreen-video-iframe" allow="autoplay; encrypted-media; fullscreen" allowfullscreen frameborder="0"></iframe>';

				var fsIframe = embed.querySelector("iframe");
				if (fsIframe) {
					fsIframe.onload = function () {
						try {
							fsIframe.contentWindow.postMessage(JSON.stringify({ event: "listening" }), "*");
						} catch (e) { }
						if (audioEl && audioEl.currentTime) {
							self.seekVideoTo(audioEl.currentTime, true);
						}
					};
				}
			}

			if (overlay) {
				overlay.style.display = "flex";
			}

			// Try native HTML5 fullscreen if available
			var container = document.getElementById("fullscreen_video_container") || overlay;
			if (container && container.requestFullscreen) {
				container.requestFullscreen().catch(function () { });
			} else if (container && container.webkitRequestFullscreen) {
				container.webkitRequestFullscreen();
			}
		},

		// Close Full Screen Video
		closeFullscreenVideo: function () {
			var overlay = document.getElementById("fullscreen_video_overlay");
			var embed = document.getElementById("fullscreen_video_embed");

			if (embed) {
				embed.innerHTML = "";
			}

			if (overlay) {
				overlay.style.display = "none";
				overlay.classList.remove("is-landscape-rotated");
			}

			// Reset rotate button label
			var rotateBtn = document.getElementById("video_rotate_landscape_btn");
			if (rotateBtn) {
				rotateBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> <span>Rotate</span>';
			}

			// Unlock orientation if locked
			if (screen.orientation && screen.orientation.unlock) {
				try { screen.orientation.unlock(); } catch (e) { }
			}

			if (document.fullscreenElement && document.exitFullscreen) {
				document.exitFullscreen().catch(function () { });
			} else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
				document.webkitExitFullscreen();
			}

			if (this.isVideoVisible) {
				this.videoCycleState = 1;
			} else {
				this.videoCycleState = 0;
			}
			this.updateCycleButtonUI();

			// Resume music player audio if it was playing before entering full screen
			if (this.wasAudioPlayingBeforeFullscreen) {
				this.wasAudioPlayingBeforeFullscreen = false;
				var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
				if (audioEl && audioEl.paused) {
					audioEl.play().then(function () {
						var playbtn = document.getElementById("play_btn") || document.getElementById("playbtn");
						if (playbtn) playbtn.className = "pause";
						if (typeof setPlayerLyricPlayingState === "function") {
							setPlayerLyricPlayingState(true);
						}
					}).catch(function (err) {
						console.warn("[LyricsVideo] Error resuming audio after exiting fullscreen:", err);
					});
				}
			}
		},

		// Toggle Mobile Landscape Rotation Mode
		toggleLandscapeMode: function () {
			var overlay = document.getElementById("fullscreen_video_overlay");
			var rotateBtn = document.getElementById("video_rotate_landscape_btn");
			if (!overlay) return;

			var isRotated = overlay.classList.toggle("is-landscape-rotated");

			if (rotateBtn) {
				rotateBtn.innerHTML = isRotated
					? '<i class="fa-solid fa-mobile-screen"></i> <span>Portrait</span>'
					: '<i class="fa-solid fa-rotate"></i> <span>Landscape</span>';
			}

			// Try Screen Orientation API if available on device
			if (screen.orientation && screen.orientation.lock) {
				try {
					if (isRotated) {
						screen.orientation.lock("landscape").catch(function () { });
					} else {
						screen.orientation.unlock();
					}
				} catch (e) { }
			}
		},

		// Toggle video visibility WITHOUT reloading the iframe
		toggleVideoDisplay: function (forceState) {
			if (!this.isVideoAvailable && typeof forceState === "undefined") return;

			this.isVideoVisible = typeof forceState === "boolean" ? forceState : !this.isVideoVisible;

			var btn = document.getElementById("show_video_btn");
			var leftPanel = document.getElementById("lyrics_left_panel");
			var rightPanel = document.getElementById("lyrics_right_panel");
			var artWrapper = document.getElementById("lyrics_art_wrapper");
			var videoBg = document.getElementById("lyrics_panel_video_bg");
			var videoBar = document.getElementById("video_loop_bar");

			if (this.isVideoVisible) {
				// Show Video
				if (btn) {
					btn.classList.add("active");
					btn.innerHTML = '<i class="fa-solid fa-image"></i> <span id="show_video_btn_text">Hide Video</span>';
				}
				if (leftPanel) leftPanel.classList.add("video-mode-active");
				if (rightPanel) rightPanel.classList.add("video-mode-active");
				if (artWrapper) artWrapper.style.display = "none";
				if (videoBg) videoBg.style.display = "block";
				if (videoBar) videoBar.style.display = "flex";

				// Sync timeline immediately to match current audio position
				this.bindAudioSyncEvents();
				var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
				if (audioEl) {
					this.seekVideoTo(audioEl.currentTime, true);
					if (audioEl.paused) {
						this.pauseVideo();
					} else {
						this.resumeVideo();
					}
				}
			} else {
				// Hide Video / Show Cover
				if (btn) {
					btn.classList.remove("active");
					btn.innerHTML = '<i class="fa-solid fa-play"></i> <span id="show_video_btn_text">Show Video</span>';
				}
				if (leftPanel) leftPanel.classList.remove("video-mode-active");
				if (rightPanel) rightPanel.classList.remove("video-mode-active");
				if (artWrapper) artWrapper.style.display = "";
				if (videoBg) videoBg.style.display = "none";
				if (videoBar) videoBar.style.display = "none";
			}
		},

		// Get currently playing song from player
		getCurrentSong: function () {
			if (typeof playlist !== "undefined" && typeof playlist_index !== "undefined" && playlist[playlist_index]) {
				return playlist[playlist_index];
			}
			return null;
		},

		// Called when song starts playing
		onSongChange: function (song) {
			if (!song) return;
			var songKey = (song.id || "") + "_" + (song.title || "") + "_" + (song.artist || "");
			if (this.currentSongKey === songKey) return;
			this.currentSongKey = songKey;

			// Immediately set cover image as background image of lyrics_video_embed_container
			var coverUrl = this.getSongCover(song);
			this.setCoverBackground(coverUrl);

			// Reset availability and clear previous embed
			this.isVideoAvailable = false;
			this.videoFailedToLoad = false;
			this.currentVideoId = null;
			this.videoCycleState = 0;
			this.updateCycleButtonUI();

			var container = document.getElementById("lyrics_video_embed_container");
			if (container) {
				container.innerHTML = "";
				container.classList.remove("cover-fallback-active");
			}

			// Keep unified cycling button visible in lyrics-controls-group
			this.setButtonVisibility(true);

			// Hide active video display if song changes
			this.toggleVideoDisplay(false);

			// Start background search & pre-buffer immediately
			this.loadVideoForSong(song);
		},

		setButtonVisibility: function (visible) {
			var cycleBtn = document.getElementById("lyrics_video_toggle_btn");
			if (cycleBtn) {
				// Always display the unified cycling video button in lyrics-controls-group
				cycleBtn.style.display = "inline-flex";
			}
			var btn = document.getElementById("show_video_btn");
			if (btn) {
				btn.style.display = visible ? "inline-flex" : "none";
			}
			var fsBtn = document.getElementById("video_fullscreen_btn");
			if (fsBtn) {
				fsBtn.style.display = (visible && this.isVideoAvailable && !this.videoFailedToLoad) ? "inline-flex" : "none";
			}
		},

		// Called when no video could be found or video is not available
		onVideoUnavailable: function (song) {
			this.isVideoAvailable = false;
			this.videoFailedToLoad = false;
			this.currentVideoId = null;

			// Ensure cover image is displayed as background on lyrics_video_embed_container
			var container = document.getElementById("lyrics_video_embed_container");
			if (container) {
				container.innerHTML = "";
				container.classList.add("cover-fallback-active");
			}
			this.setCoverBackground(this.getSongCover(song));

			var loader = document.getElementById("video_loop_loader");
			if (loader) loader.style.display = "none";

			this.updateCycleButtonUI();
		},

		// Called when video embed fails to load or encounters YouTube playback error
		onVideoLoadFailed: function () {
			this.isVideoAvailable = false;
			this.videoFailedToLoad = true;

			// Remove broken iframe immediately to reveal the cover image background
			var container = document.getElementById("lyrics_video_embed_container");
			if (container) {
				container.innerHTML = "";
				container.classList.add("cover-fallback-active");
			}
			this.setCoverBackground(this.getSongCover());

			var loader = document.getElementById("video_loop_loader");
			if (loader) loader.style.display = "none";

			// Close fullscreen overlay if currently open
			var overlay = document.getElementById("fullscreen_video_overlay");
			if (overlay && overlay.style.display !== "none") {
				this.closeFullscreenVideo();
			}

			this.updateCycleButtonUI();
			if (typeof showToast === "function") {
				showToast("Video unavailable • Showing album cover");
			}
		},

		// Load or search video for the current song in background
		loadVideoForSong: async function (song) {
			if (!song) song = this.getCurrentSong();
			if (!song) return;

			var songKey = (song.id || "") + "_" + (song.title || "") + "_" + (song.artist || "");

			// Check memory cache
			if (this.cachedVideoIds[songKey]) {
				this.onVideoFound(this.cachedVideoIds[songKey]);
				return;
			}

			// Check localStorage cache
			try {
				var savedId = localStorage.getItem("canvas_yt_" + songKey);
				if (savedId) {
					this.cachedVideoIds[songKey] = savedId;
					this.onVideoFound(savedId);
					return;
				}
			} catch (e) { }

			var clean = function (str) {
				if (!str) return "";
				return str
					.replace(/\(From "[^"]*"\)/gi, "")
					.replace(/\(feat\.[^)]*\)/gi, "")
					.replace(/•.*/gi, "")
					.replace(/[\[\]]/g, "")
					.trim();
			};

			var searchQuery = clean(song.artist) + " " + clean(song.title) + " official video";
			var videoId = await this.searchYouTubeVideoId(searchQuery);

			// Check if song changed while searching
			var activeSong = this.getCurrentSong();
			var activeKey = activeSong ? (activeSong.id || "") + "_" + (activeSong.title || "") + "_" + (activeSong.artist || "") : "";
			if (activeKey !== songKey) return;

			if (videoId) {
				this.cachedVideoIds[songKey] = videoId;
				try {
					localStorage.setItem("canvas_yt_" + songKey, videoId);
				} catch (e) { }
				this.onVideoFound(videoId);
			} else {
				// Fallback search with title only
				var fallbackId = await this.searchYouTubeVideoId(clean(song.title) + " song video");
				if (activeKey === songKey && fallbackId) {
					this.cachedVideoIds[songKey] = fallbackId;
					this.onVideoFound(fallbackId);
				} else if (activeKey === songKey) {
					// Both primary and fallback searches failed to find a video
					this.onVideoUnavailable(song);
				}
			}
		},

		// Query Piped search API to get exact YouTube video ID
		searchYouTubeVideoId: async function (query) {
			for (var i = 0; i < this.apiEndpoints.length; i++) {
				var endpoint = this.apiEndpoints[i];
				try {
					var url = endpoint + "?q=" + encodeURIComponent(query) + "&filter=videos";
					var res = await fetch(url);
					if (res.ok) {
						var data = await res.json();
						var items = data.items || data;
						if (Array.isArray(items) && items.length > 0) {
							for (var j = 0; j < Math.min(items.length, 5); j++) {
								var item = items[j];
								var vUrl = item.url || "";
								var match = vUrl.match(/\/watch\?v=([\w-]{11})/);
								if (match && match[1]) {
									return match[1];
								}
								if (item.id && typeof item.id === "string" && item.id.length === 11) {
									return item.id;
								}
							}
						}
					}
				} catch (e) {
					console.warn("[VideoLooper] Search error on " + endpoint + ":", e);
				}
			}
			return null;
		},

		// Video is confirmed available: embed in background and reveal "Show Video" button
		onVideoFound: function (videoId) {
			var self = this;
			this.currentVideoId = videoId;
			this.isVideoAvailable = true;
			this.videoFailedToLoad = false;

			// Preload & start video playing silently in the background
			var container = document.getElementById("lyrics_video_embed_container");
			if (container) {
				container.classList.remove("cover-fallback-active");
				// Ensure cover image is also present behind the iframe as background
				this.setCoverBackground(this.getSongCover());

				var embedUrl = "https://www.youtube-nocookie.com/embed/" + videoId +
					"?autoplay=1&mute=1&loop=1&playlist=" + videoId +
					"&controls=0&modestbranding=1&showinfo=0&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&enablejsapi=1";

				var iframe = document.createElement("iframe");
				iframe.src = embedUrl;
				iframe.className = "real-video-loop-iframe";
				iframe.allow = "autoplay; encrypted-media";
				iframe.frameBorder = "0";
				iframe.onerror = function () {
					self.onVideoLoadFailed();
				};
				iframe.onload = function () {
					try {
						iframe.contentWindow.postMessage(JSON.stringify({ event: "listening" }), "*");
					} catch (e) { }

					self.bindAudioSyncEvents();
					var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
					if (audioEl) {
						if (typeof audioEl.currentTime === "number" && audioEl.currentTime > 0) {
							self.seekVideoTo(audioEl.currentTime, true);
						}
						if (audioEl.paused) {
							self.pauseVideo();
						} else {
							self.resumeVideo();
						}
					}
				};

				container.innerHTML = "";
				container.appendChild(iframe);
			}

			var loader = document.getElementById("video_loop_loader");
			if (loader) loader.style.display = "none";

			// Keep cycling button available
			this.setButtonVisibility(true);
			this.updateCycleButtonUI();
		},

		// Handle custom user URL or ID
		loadCustomVideo: function (input) {
			var match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
			var videoId = (match && match[1]) || (/^[\w-]{11}$/.test(input) ? input : null);

			if (videoId) {
				var cur = this.getCurrentSong();
				if (cur) {
					var songKey = (cur.id || "") + "_" + (cur.title || "") + "_" + (cur.artist || "");
					this.cachedVideoIds[songKey] = videoId;
					try {
						localStorage.setItem("canvas_yt_" + songKey, videoId);
					} catch (e) { }
				}
				this.onVideoFound(videoId);
				this.toggleVideoDisplay(true);
			}
		}
	};

	global.RealVideoLooper = RealVideoLooper;
	global.SpotifyCanvas = RealVideoLooper;
	global.LyricsVideo = RealVideoLooper;

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", function () {
			RealVideoLooper.init();
		});
	} else {
		RealVideoLooper.init();
	}
})(typeof window !== "undefined" ? window : this);
