// Copyright (c) 2026 Vthinq. All rights reserved.
// Developer: Venu Bingi
// Sangeetham AI Music Player - Real Music Video Looper (Spotify Canvas Style)

(function (global) {
	"use strict";

	var RealVideoLooper = {
		isVideoVisible: false,
		isVideoAvailable: false,
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

		bindEvents: function () {
			var self = this;

			// Single Show Video / Show Cover button
			var toggleBtn = document.getElementById("show_video_btn");
			if (toggleBtn) {
				toggleBtn.addEventListener("click", function () {
					self.toggleVideoDisplay();
				});
			}

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

			// Reset availability and hide button until video is found
			this.isVideoAvailable = false;
			this.setButtonVisibility(false);

			// Hide active video display if song changes
			this.toggleVideoDisplay(false);

			// Start background search & pre-buffer immediately
			this.loadVideoForSong(song);
		},

		setButtonVisibility: function (visible) {
			var btn = document.getElementById("show_video_btn");
			if (btn) {
				btn.style.display = visible ? "inline-flex" : "none";
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
			this.currentVideoId = videoId;
			this.isVideoAvailable = true;

			// Preload & start video playing silently in the background
			var container = document.getElementById("lyrics_video_embed_container");
			if (container) {
				var embedUrl = "https://www.youtube-nocookie.com/embed/" + videoId +
					"?autoplay=1&mute=1&loop=1&playlist=" + videoId +
					"&controls=0&modestbranding=1&showinfo=0&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1";

				container.innerHTML = '<iframe src="' + embedUrl + '" class="real-video-loop-iframe" allow="autoplay; encrypted-media" frameborder="0"></iframe>';
			}

			// Show the "Show Video" button now that video is available!
			this.setButtonVisibility(true);
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
