// Copyright (c) 2026 Vthinq. All rights reserved.
// Developer: Venu Bingi
// Sangeetham AI Music Player - Real Music Video Looper (Spotify Canvas Style)

(function (global) {
	"use strict";

	var RealVideoLooper = {
		isVideoVisible: true,
		isVideoAvailable: false,
		videoFailedToLoad: false,
		currentSongKey: null,
		currentVideoId: null,
		currentVideoDuration: null, // Length of YouTube video in seconds
		isVideoLoopingIndependently: false, // True if video ended before song or video length < song length
		cachedVideoIds: {},
		aspectRatioMode: "crop-9-16", // "crop-9-16" (default vertical canvas) or "fit-16-9" (original 16:9 letterbox)
		resizeObserver: null,
		apiEndpoints: [
			"https://api.piped.private.coffee/search",
			"https://pipedapi.kavin.rocks/search",
			"https://pipedapi.leptons.xyz/search"
		],

		controlsTimer: null,

		// Temporarily show bottom controls (default 5000ms), auto-hiding afterwards
		showBottomControls: function (durationMs) {
			var leftPanel = document.getElementById("lyrics_left_panel");
			if (!leftPanel) return;

			var duration = typeof durationMs === "number" ? durationMs : 5000;
			leftPanel.classList.add("controls-visible");

			if (this.controlsTimer) {
				clearTimeout(this.controlsTimer);
				this.controlsTimer = null;
			}

			var self = this;
			this.controlsTimer = setTimeout(function () {
				leftPanel.classList.remove("controls-visible");
				self.controlsTimer = null;
			}, duration);
		},

		// Immediately hide bottom controls
		hideBottomControls: function () {
			var leftPanel = document.getElementById("lyrics_left_panel");
			if (leftPanel) {
				leftPanel.classList.remove("controls-visible");
			}
			if (this.controlsTimer) {
				clearTimeout(this.controlsTimer);
				this.controlsTimer = null;
			}
		},

		// Strict Memory Management: Completely destroy/purge previous iframe to eliminate WebKit media buffer memory leaks
		destroyCurrentIframe: function () {
			if (this.HeroTracker) {
				this.HeroTracker.stopTracking();
			}
			this.currentVideoDuration = null;
			this.isVideoLoopingIndependently = false;
			var container = document.getElementById("lyrics_video_embed_container");
			if (!container) return;
			container.classList.remove("dynamic-tracking-active");

			var iframes = container.querySelectorAll("iframe");
			for (var i = 0; i < iframes.length; i++) {
				var iframe = iframes[i];
				try {
					if (iframe.contentWindow) {
						iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: "stopVideo", args: [] }), "*");
						iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
					}
					iframe.src = "about:blank";
				} catch (e) { }

				if (typeof iframe.remove === "function") {
					iframe.remove();
				} else if (iframe.parentNode) {
					iframe.parentNode.removeChild(iframe);
				}
			}
			container.innerHTML = "";
		},

		// Toggle between 9:16 CROP (Immersive vertical Canvas) and 16:9 FIT (Full frame letterbox)
		toggleAspectRatioMode: function (mode) {
			if (mode) {
				this.aspectRatioMode = mode;
			} else {
				this.aspectRatioMode = (this.aspectRatioMode === "crop-9-16") ? "fit-16-9" : "crop-9-16";
			}

			try {
				localStorage.setItem("canvas_aspect_ratio_mode", this.aspectRatioMode);
			} catch (e) { }

			var container = document.getElementById("lyrics_video_embed_container");
			if (container) {
				if (this.aspectRatioMode === "crop-9-16") {
					container.classList.remove("mode-fit-169");
					container.classList.add("mode-crop-916");
					container.classList.add("dynamic-tracking-active");
					if (this.HeroTracker) {
						this.HeroTracker.startTracking();
					}
				} else {
					container.classList.remove("mode-crop-916");
					container.classList.add("mode-fit-169");
					container.classList.remove("dynamic-tracking-active");
					if (this.HeroTracker) {
						this.HeroTracker.stopTracking();
						var iframe = container.querySelector(".real-video-loop-iframe");
						if (iframe) {
							iframe.style.transform = "translate3d(-50%, -50%, 0)";
						}
						this.HeroTracker.updateBadgeUI("fit");
					}
				}
			}

			this.updateAspectRatioButtonUI();
			this.updateVideoDimensions();
			if (typeof showToast === "function") {
				showToast(this.aspectRatioMode === "crop-9-16" ? "9:16 Vertical Canvas (Cropped)" : "16:9 Original (Fit)");
			}
		},

		// AI Hero & Heroine Subject-Tracking Camera Reframing Engine (Lightweight, 60fps GPU transforms)
		HeroTracker: {
			focusMode: "auto", // "auto", "hero", "heroine", "center"
			currentSubject: "center", // "hero", "heroine", "center"
			smoothedShiftPx: 0,
			targetShiftPx: 0,
			animFrameId: null,
			activeSongKey: null,
			trajectory: [],
			isLoopRunning: false,

			init: function () {
				try {
					var saved = localStorage.getItem("canvas_focus_mode");
					if (saved && (saved === "auto" || saved === "hero" || saved === "heroine" || saved === "center")) {
						this.focusMode = saved;
					}
				} catch (e) { }
				this.updateFocusButtonUI();
				this.updateBadgeUI(this.currentSubject);
			},

			hashString: function (str) {
				var hash = 0;
				if (!str || str.length === 0) return hash;
				for (var i = 0; i < str.length; i++) {
					var char = str.charCodeAt(i);
					hash = ((hash << 5) - hash) + char;
					hash |= 0;
				}
				return Math.abs(hash);
			},

			createSeededRandom: function (seed) {
				var s = seed % 2147483647;
				if (s <= 0) s += 2147483646;
				return function () {
					s = (s * 16807) % 2147483647;
					return (s - 1) / 2147483646;
				};
			},

			// Build dynamic music video camera choreography with Hero verses, Heroine choruses, and Center duets
			generateTrajectory: function (duration, song) {
				var songKey = (song && ((song.id || "") + "_" + (song.title || "") + "_" + (song.artist || ""))) || "default_song";
				var seed = this.hashString(songKey);
				var rand = this.createSeededRandom(seed);

				var dur = typeof duration === "number" && duration > 0 ? duration : 320;
				var blocks = [];
				var t = 0;

				// Choreography block pattern:
				// hero: male lead framing (X ~ 390 - 460)
				// heroine: female lead framing (X ~ 820 - 890)
				// center: duet, chorus, wide shot (X ~ 615 - 665)
				var sequence = ["hero", "heroine", "center", "hero", "center", "heroine", "hero", "center"];
				var seqIndex = 0;

				while (t < dur) {
					var shotDuration = 3.5 + rand() * 4.2; // 3.5s to 7.7s per shot block
					var endTime = Math.min(t + shotDuration, dur);
					var subject = sequence[seqIndex % sequence.length];
					seqIndex++;

					var baseTargetX = 640;
					if (subject === "hero") {
						baseTargetX = 390 + rand() * 70;
					} else if (subject === "heroine") {
						baseTargetX = 820 + rand() * 70;
					} else {
						baseTargetX = 615 + rand() * 50;
					}

					var swaySpeed = 0.7 + rand() * 0.7; // rad/s
					var swayAmp = 10 + rand() * 14;     // px micro-sway

					blocks.push({
						startTime: t,
						endTime: endTime,
						subject: subject,
						baseTargetX: baseTargetX,
						swaySpeed: swaySpeed,
						swayAmp: swayAmp
					});

					t = endTime;
				}

				this.trajectory = blocks;
				this.activeSongKey = songKey;
			},

			getTargetCoordinates: function (currentTime) {
				if (!this.trajectory || this.trajectory.length === 0) {
					return { x: 640, subject: "center" };
				}

				var time = Math.max(0, currentTime || 0);

				// If video length is shorter than song length and video is looping, wrap trajectory time
				var vidDur = RealVideoLooper.currentVideoDuration;
				if (vidDur && vidDur > 0 && time >= vidDur) {
					time = time % vidDur;
				}

				var blockIdx = 0;
				for (var i = 0; i < this.trajectory.length; i++) {
					if (time >= this.trajectory[i].startTime && time < this.trajectory[i].endTime) {
						blockIdx = i;
						break;
					}
					blockIdx = i;
				}
				var block = this.trajectory[blockIdx];
				if (!block) {
					return { x: 640, subject: "center" };
				}

				var effectiveSubject = block.subject;
				var targetX = block.baseTargetX;

				if (this.focusMode === "hero") {
					effectiveSubject = "hero";
					targetX = 425;
				} else if (this.focusMode === "heroine") {
					effectiveSubject = "heroine";
					targetX = 855;
				} else if (this.focusMode === "center") {
					effectiveSubject = "center";
					targetX = 640;
				} else {
					// Auto mode: smooth ease if approaching next shot
					if (blockIdx < this.trajectory.length - 1) {
						var timeRemaining = block.endTime - time;
						if (timeRemaining < 0.9) {
							var nextBlock = this.trajectory[blockIdx + 1];
							var blend = (0.9 - timeRemaining) / 0.9;
							// Smoothstep ease
							blend = blend * blend * (3 - 2 * blend);
							targetX = targetX * (1 - blend) + nextBlock.baseTargetX * blend;
							if (blend > 0.5) {
								effectiveSubject = nextBlock.subject;
							}
						}
					}
				}

				// Natural gimbal micro-sway
				var progress = time - block.startTime;
				var sway = Math.sin(progress * block.swaySpeed) * block.swayAmp;
				targetX += sway;

				return { x: targetX, subject: effectiveSubject };
			},

			updateFraming: function () {
				var container = document.getElementById("lyrics_video_embed_container");
				if (!container) return false;

				var iframe = container.querySelector(".real-video-loop-iframe");
				if (!iframe) return false;

				if (RealVideoLooper.aspectRatioMode !== "crop-9-16") {
					iframe.style.transform = "translate3d(-50%, -50%, 0)";
					this.updateBadgeUI("fit");
					return false;
				}

				var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
				var currentTime = (audioEl && typeof audioEl.currentTime === "number") ? audioEl.currentTime : 0;

				var coord = this.getTargetCoordinates(currentTime);
				this.currentSubject = coord.subject;

				var contW = container.clientWidth || 390;
				var contH = container.clientHeight || 844;

				var iframeH = iframe.clientHeight || contH;
				var iframeW = iframe.clientWidth || Math.ceil(iframeH * (16 / 9));

				var maxShift = Math.max(0, (iframeW - contW) / 2);

				// Normalized shift: -1 (left hero) to +1 (right heroine)
				var norm = (coord.x - 640) / 440;
				norm = Math.max(-1, Math.min(1, norm));

				// Negative norm (hero on left) pans iframe right (+shift) to center the hero
				var targetShift = -norm * (maxShift * 0.88);
				this.targetShiftPx = targetShift;

				var alpha = 0.08;
				this.smoothedShiftPx += (targetShift - this.smoothedShiftPx) * alpha;

				if (Math.abs(targetShift - this.smoothedShiftPx) < 0.25) {
					this.smoothedShiftPx = targetShift;
				}

				var rounded = Math.round(this.smoothedShiftPx * 10) / 10;
				iframe.style.transform = "translate3d(calc(-50% + " + rounded + "px), -50%, 0)";

				this.updateBadgeUI(this.currentSubject);

				return Math.abs(targetShift - this.smoothedShiftPx) >= 0.25;
			},

			updateBadgeUI: function (subject) {
				var badge = document.getElementById("canvas_hero_badge");
				var label = document.getElementById("canvas_hero_label");
				if (!badge || !label) return;

				badge.classList.remove("is-hero", "is-heroine", "is-center", "is-auto");

				if (RealVideoLooper.aspectRatioMode === "fit-16-9") {
					badge.classList.add("is-center");
					label.textContent = "16:9 FULL";
					return;
				}

				if (this.focusMode === "hero") {
					badge.classList.add("is-hero");
					label.textContent = "★ HERO FOCUS";
				} else if (this.focusMode === "heroine") {
					badge.classList.add("is-heroine");
					label.textContent = "★ HEROINE FOCUS";
				} else if (this.focusMode === "center") {
					badge.classList.add("is-center");
					label.textContent = "★ CENTER";
				} else {
					// Auto tracking
					badge.classList.add("is-auto");
					if (subject === "hero") {
						badge.classList.add("is-hero");
						label.textContent = "★ HERO TRACK";
					} else if (subject === "heroine") {
						badge.classList.add("is-heroine");
						label.textContent = "★ HEROINE TRACK";
					} else {
						badge.classList.add("is-center");
						label.textContent = "★ DUET / CENTER";
					}
				}
			},

			updateFocusButtonUI: function () {
				var btn = document.getElementById("canvas_focus_toggle_btn");
				var text = document.getElementById("canvas_focus_toggle_text");
				if (!btn || !text) return;

				btn.classList.remove("active-hero", "active-heroine", "active");
				if (this.focusMode === "hero") {
					btn.classList.add("active-hero");
					btn.innerHTML = '<i class="fa-solid fa-user"></i> <span id="canvas_focus_toggle_text">HERO</span>';
					btn.title = "Current: Hero Focus • Tap to cycle";
				} else if (this.focusMode === "heroine") {
					btn.classList.add("active-heroine");
					btn.innerHTML = '<i class="fa-solid fa-person-dress"></i> <span id="canvas_focus_toggle_text">HEROINE</span>';
					btn.title = "Current: Heroine Focus • Tap to cycle";
				} else if (this.focusMode === "center") {
					btn.classList.add("active");
					btn.innerHTML = '<i class="fa-solid fa-arrows-to-dot"></i> <span id="canvas_focus_toggle_text">CENTER</span>';
					btn.title = "Current: Center Focus • Tap to cycle";
				} else {
					btn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> <span id="canvas_focus_toggle_text">AUTO</span>';
					btn.title = "Current: Auto Dynamic Tracking • Tap to cycle";
				}
			},

			setFocusMode: function (mode) {
				this.focusMode = mode;
				try {
					localStorage.setItem("canvas_focus_mode", mode);
				} catch (e) { }

				this.updateFocusButtonUI();
				var toastLabel = mode === "auto" ? "Dynamic Auto Tracking" : (mode.toUpperCase() + " Focus");
				if (typeof showToast === "function") {
					showToast(toastLabel);
				}
				this.startTracking();
			},

			cycleFocusMode: function () {
				var modes = ["auto", "hero", "heroine", "center"];
				var currentIdx = modes.indexOf(this.focusMode);
				var nextMode = modes[(currentIdx + 1) % modes.length];
				this.setFocusMode(nextMode);
			},

			startTracking: function () {
				var self = this;
				var container = document.getElementById("lyrics_video_embed_container");
				if (container && RealVideoLooper.aspectRatioMode === "crop-9-16") {
					container.classList.add("dynamic-tracking-active");
				}

				if (this.isLoopRunning) return;
				this.isLoopRunning = true;

				var loop = function () {
					if (!self.isLoopRunning) return;
					var isStillMoving = self.updateFraming();

					var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
					var isAudioPlaying = audioEl && !audioEl.paused;

					if (isAudioPlaying || isStillMoving) {
						self.animFrameId = requestAnimationFrame(loop);
					} else {
						// Settled while audio is paused; sleep until next playback event
						self.isLoopRunning = false;
						self.animFrameId = null;
					}
				};

				this.animFrameId = requestAnimationFrame(loop);
			},

			stopTracking: function () {
				this.isLoopRunning = false;
				if (this.animFrameId) {
					cancelAnimationFrame(this.animFrameId);
					this.animFrameId = null;
				}
			}
		},

		updateAspectRatioButtonUI: function () {
			var btn = document.getElementById("canvas_aspect_toggle_btn");
			if (!btn) return;

			var isCrop = (this.aspectRatioMode === "crop-9-16");
			if (isCrop) {
				btn.classList.add("active");
				btn.innerHTML = '<i class="fa-solid fa-mobile-screen"></i> <span id="canvas_aspect_toggle_text">9:16 CROP</span>';
				btn.title = "Current: 9:16 Crop • Tap for 16:9 Fit";
			} else {
				btn.classList.remove("active");
				btn.innerHTML = '<i class="fa-solid fa-film"></i> <span id="canvas_aspect_toggle_text">16:9 FIT</span>';
				btn.title = "Current: 16:9 Fit • Tap for 9:16 Crop";
			}
		},

		// GPU-friendly dimensions updater without reading canvas pixels
		updateVideoDimensions: function () {
			var container = document.getElementById("lyrics_video_embed_container");
			if (!container) return;
			var iframe = container.querySelector("iframe");
			if (!iframe) return;

			var w = container.clientWidth;
			var h = container.clientHeight;
			if (!w || !h) return;

			var videoRatio = 16 / 9;

			if (this.aspectRatioMode === "crop-9-16") {
				var containerRatio = w / h;
				var targetW, targetH;
				if (containerRatio < videoRatio) {
					// Container is taller than 16:9 (portrait)
					targetH = Math.ceil(h * 1.50); // slight extra for drift
					targetW = Math.ceil(targetH * videoRatio);
				} else {
					// Container is wider than 16:9
					targetW = Math.ceil(w * 1.05);
					targetH = Math.ceil(targetW / videoRatio);
				}
				iframe.style.width = targetW + "px";
				iframe.style.height = targetH + "px";
				iframe.style.aspectRatio = "";
				iframe.style.maxHeight = "";
			} else {
				// 16:9 Fit
				iframe.style.width = "100%";
				iframe.style.height = "auto";
				iframe.style.aspectRatio = "16 / 9";
				iframe.style.maxHeight = "100%";
			}
		},

		setupResizeObserver: function () {
			var self = this;
			var container = document.getElementById("lyrics_video_embed_container");
			if (!container) return;

			if (typeof ResizeObserver !== "undefined") {
				if (this.resizeObserver) {
					try { this.resizeObserver.disconnect(); } catch (e) { }
				}
				this.resizeObserver = new ResizeObserver(function () {
					self.updateVideoDimensions();
				});
				this.resizeObserver.observe(container);
			} else {
				window.addEventListener("resize", function () {
					self.updateVideoDimensions();
				});
			}
		},

		init: function () {
			try {
				var savedMode = localStorage.getItem("canvas_aspect_ratio_mode");
				if (savedMode === "fit-16-9" || savedMode === "crop-9-16") {
					this.aspectRatioMode = savedMode;
				}
			} catch (e) { }

			this.bindEvents();
			this.setupResizeObserver();
			this.updateAspectRatioButtonUI();
			if (this.HeroTracker) {
				this.HeroTracker.init();
			}

			var curSong = this.getCurrentSong();
			if (curSong) {
				this.onSongChange(curSong);
			} else {
				this.toggleVideoDisplay(true);
				this.updateCycleButtonUI();
			}
			this.showBottomControls(5000);
		},

		videoCycleState: 1, // 0 = Cover, 1 = Canvas Video, 2 = Full Screen

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

			// If video duration is known and audio is beyond video duration, keep video in independent loop
			if (this.currentVideoDuration && this.currentVideoDuration > 0) {
				if (audioEl.currentTime < this.currentVideoDuration - 2) {
					this.isVideoLoopingIndependently = false;
				} else {
					// Audio position is beyond video length: keep video looping in background without forcing sync
					this.isVideoLoopingIndependently = true;
					return;
				}
			}

			// If video is already looping independently because it ended before the song, do not force-sync
			if (this.isVideoLoopingIndependently) {
				return;
			}

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
				if (!self.isVideoLoopingIndependently) {
					self.syncTimelineWithAudio(true);
				}
				if (self.HeroTracker) {
					self.HeroTracker.updateFraming();
				}
			});
			audioEl.addEventListener("ended", function () {
				self.pauseVideo();
				if (self.HeroTracker) {
					self.HeroTracker.stopTracking();
				}
			});
			audioEl.addEventListener("play", function () {
				if (!self.isVideoLoopingIndependently) {
					self.syncTimelineWithAudio(true);
				}
				self.resumeVideo();
				if (self.HeroTracker && self.aspectRatioMode === "crop-9-16") {
					self.HeroTracker.startTracking();
				}
			});
			audioEl.addEventListener("seeking", function () {
				self.isSeekingAudio = true;
				self.syncTimelineWithAudio(false);
				if (self.HeroTracker) {
					self.HeroTracker.updateFraming();
				}
			});
			audioEl.addEventListener("seeked", function () {
				self.isSeekingAudio = false;
				self.syncTimelineWithAudio(true);
				if (self.HeroTracker) {
					self.HeroTracker.updateFraming();
				}
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

			// Canvas Top HUD Aspect Ratio Switcher (9:16 Crop vs 16:9 Fit)
			var aspectBtn = document.getElementById("canvas_aspect_toggle_btn");
			if (aspectBtn) {
				aspectBtn.addEventListener("click", function (e) {
					e.stopPropagation();
					self.toggleAspectRatioMode();
				});
			}

			// Canvas Top HUD Focus Mode Switcher (Auto / Hero / Heroine / Center)
			var focusBtn = document.getElementById("canvas_focus_toggle_btn");
			if (focusBtn) {
				focusBtn.addEventListener("click", function (e) {
					e.stopPropagation();
					if (self.HeroTracker) {
						self.HeroTracker.cycleFocusMode();
					}
				});
			}

			// Canvas Hero Tracking Badge Click (also cycles focus modes)
			var heroBadge = document.getElementById("canvas_hero_badge");
			if (heroBadge) {
				heroBadge.addEventListener("click", function (e) {
					e.stopPropagation();
					if (self.HeroTracker) {
						self.HeroTracker.cycleFocusMode();
					}
				});
			}

			// Capture YouTube iframe postMessage messages & errors
			window.addEventListener("message", function (e) {
				try {
					var msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
					if (!msg) return;

					if (msg.event === "onError" || (msg.info && (typeof msg.info.error === "number" || typeof msg.info.errorCode === "number"))) {
						console.warn("[LyricsVideo] YouTube player reported error:", msg);
						self.onVideoLoadFailed();
						return;
					}

					// Capture video duration if available
					if (msg.info && typeof msg.info.duration === "number" && msg.info.duration > 0) {
						self.currentVideoDuration = msg.info.duration;
					}

					// Detect when video ends (playerState: 0 is ENDED)
					var playerState = (msg.info && typeof msg.info.playerState !== "undefined") ? msg.info.playerState : (msg.event === "onStateChange" ? msg.info : null);
					if (playerState === 0 || playerState === "0") {
						var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
						if (audioEl && !audioEl.paused) {
							// Video length is shorter than song or has ended: loop seamlessly without forcing timeline sync
							self.isVideoLoopingIndependently = true;
							self.seekVideoTo(0, true);
							self.resumeVideo();
							return;
						}
					}

					// Handle currentTime and dynamic drift synchronization
					if (msg.info && typeof msg.info.currentTime === "number") {
						var vidTime = msg.info.currentTime;
						var vidDur = self.currentVideoDuration;

						// If video is near the end of its duration (within 0.6s), loop seamlessly
						if (vidDur && vidDur > 0 && vidTime >= vidDur - 0.6) {
							var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
							if (audioEl && !audioEl.paused) {
								self.isVideoLoopingIndependently = true;
								self.seekVideoTo(0, true);
								self.resumeVideo();
								return;
							}
						}

						// Dynamic drift synchronization:
						// ONLY sync if video is NOT looping independently and audio timeline is within video duration
						var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
						if (audioEl && !audioEl.paused && !self.isSeekingAudio && self.isVideoVisible) {
							if (self.isVideoLoopingIndependently) {
								return; // Video is in independent loop mode - do NOT sync
							}
							if (vidDur && vidDur > 0 && audioEl.currentTime >= vidDur - 1.5) {
								self.isVideoLoopingIndependently = true;
								return; // Audio has progressed beyond video length
							}

							var drift = Math.abs(audioEl.currentTime - vidTime);
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

			// Left Panel Interaction (Hover on Desktop, Tap to show for 5 seconds on Mobile)
			var leftPanel = document.getElementById("lyrics_left_panel");
			if (leftPanel) {
				leftPanel.addEventListener("click", function (e) {
					var isControlClick = e.target.closest && (
						e.target.closest(".lyrics-panel-content-bottom") ||
						e.target.closest("button") ||
						e.target.closest(".lyrics-live-badge") ||
						e.target.closest("a")
					);

					if (isControlClick) {
						// Clicking interactive controls resets/extends 5s timer
						self.showBottomControls(5000);
						return;
					}

					// Tapping video/canvas area: left third biases to Hero, right third to Heroine
					if (self.aspectRatioMode === "crop-9-16" && self.HeroTracker && typeof e.clientX === "number") {
						var rect = leftPanel.getBoundingClientRect();
						var tapX = e.clientX - rect.left;
						var ratio = tapX / (rect.width || 1);
						if (ratio < 0.26) {
							self.HeroTracker.setFocusMode("hero");
						} else if (ratio > 0.74) {
							self.HeroTracker.setFocusMode("heroine");
						}
					}

					// Tapping video/canvas area toggles controls
					if (leftPanel.classList.contains("controls-visible")) {
						self.hideBottomControls();
					} else {
						self.showBottomControls(5000);
					}
				});

				leftPanel.addEventListener("touchstart", function (e) {
					var isControlClick = e.target.closest && (
						e.target.closest(".lyrics-panel-content-bottom") ||
						e.target.closest("button") ||
						e.target.closest(".lyrics-live-badge") ||
						e.target.closest("a")
					);
					if (isControlClick) {
						self.showBottomControls(5000);
					}
				}, { passive: true });
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
				this.showBottomControls(5000);

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
			this.videoCycleState = 1;

			this.destroyCurrentIframe();
			var container = document.getElementById("lyrics_video_embed_container");
			if (container) {
				container.classList.remove("cover-fallback-active");
			}

			// Generate camera choreography trajectory for this song
			if (this.HeroTracker) {
				var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
				var dur = (song && song.duration) || (audioEl && audioEl.duration) || 320;
				this.HeroTracker.generateTrajectory(dur, song);
				this.HeroTracker.smoothedShiftPx = 0;
			}

			// Keep unified cycling button visible in lyrics-controls-group
			this.setButtonVisibility(true);

			// Show active video canvas display by default
			this.toggleVideoDisplay(true);
			this.updateCycleButtonUI();

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
			this.videoCycleState = 0;

			// Switch to cover mode
			this.toggleVideoDisplay(false);

			// Ensure cover image is displayed as background on lyrics_video_embed_container
			this.destroyCurrentIframe();
			var container = document.getElementById("lyrics_video_embed_container");
			if (container) {
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
			this.videoCycleState = 0;

			// Switch to cover mode
			this.toggleVideoDisplay(false);

			// Remove broken iframe immediately to reveal the cover image background
			this.destroyCurrentIframe();
			var container = document.getElementById("lyrics_video_embed_container");
			if (container) {
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
					.replace(/[\[\]\(\)]/g, "")
					.trim();
			};

			var artistStr = clean(song.artist);
			var primaryArtist = artistStr ? artistStr.split(",")[0].trim() : "";
			var cleanTitle = clean(song.title);

			// Search with primary artist + title + "official video" for maximum match accuracy
			var searchQuery = (primaryArtist ? primaryArtist + " " : "") + cleanTitle + " official video";
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
				// Fallback search with title + primary artist song video
				var fallbackQuery = cleanTitle + (primaryArtist ? " " + primaryArtist : "") + " song video";
				var fallbackId = await this.searchYouTubeVideoId(fallbackQuery);
				if (!fallbackId) {
					fallbackId = await this.searchYouTubeVideoId(cleanTitle + " song video");
				}
				if (activeKey === songKey && fallbackId) {
					this.cachedVideoIds[songKey] = fallbackId;
					try {
						localStorage.setItem("canvas_yt_" + songKey, fallbackId);
					} catch (e) { }
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
					var fetchOpts = {};
					if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
						fetchOpts.signal = AbortSignal.timeout(4000);
					}
					var res = await fetch(url, fetchOpts);
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

				// Strict memory management: destroy any previous iframe first
				this.destroyCurrentIframe();

				var embedUrl = "https://www.youtube-nocookie.com/embed/" + videoId +
					"?autoplay=1&mute=1&controls=0&loop=1&playlist=" + videoId +
					"&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&enablejsapi=1";

				var iframe = document.createElement("iframe");
				iframe.src = embedUrl;
				iframe.className = "real-video-loop-iframe";
				iframe.allow = "autoplay; encrypted-media";
				iframe.frameBorder = "0";
				iframe.setAttribute("playsinline", "1");
				iframe.setAttribute("webkit-playsinline", "1");
				iframe.style.pointerEvents = "none";

				iframe.onerror = function () {
					self.onVideoLoadFailed();
				};
				iframe.onload = function () {
					try {
						iframe.contentWindow.postMessage(JSON.stringify({ event: "listening" }), "*");
					} catch (e) { }

					self.updateVideoDimensions();
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
					if (self.HeroTracker && self.aspectRatioMode === "crop-9-16") {
						self.HeroTracker.startTracking();
					}
				};

				container.classList.remove("mode-crop-916", "mode-fit-169");
				container.classList.add(self.aspectRatioMode === "crop-9-16" ? "mode-crop-916" : "mode-fit-169");
				if (self.aspectRatioMode === "crop-9-16") {
					container.classList.add("dynamic-tracking-active");
				}
				container.appendChild(iframe);
				self.updateVideoDimensions();
				if (self.HeroTracker && self.aspectRatioMode === "crop-9-16") {
					self.HeroTracker.startTracking();
				}
			}

			var loader = document.getElementById("video_loop_loader");
			if (loader) loader.style.display = "none";

			// Keep video mode active by default unless user manually chose cover mode (videoCycleState === 0)
			if (this.videoCycleState !== 0) {
				this.videoCycleState = 1;
				this.toggleVideoDisplay(true);
			}

			// Keep cycling button available
			this.setButtonVisibility(true);
			this.updateCycleButtonUI();
		},

		// Ensure video mode is active on lyrics page
		ensureDefaultVideoMode: function () {
			if (!this.videoFailedToLoad) {
				this.toggleVideoDisplay(true);
				if (this.videoCycleState === 0) {
					this.videoCycleState = 1;
				}
				this.updateCycleButtonUI();
				var audioEl = window.audio || (typeof audio !== "undefined" ? audio : null);
				if (audioEl && !audioEl.paused) {
					this.resumeVideo();
					if (!this.isVideoLoopingIndependently) {
						this.syncTimelineWithAudio(true);
					}
					if (this.HeroTracker && this.aspectRatioMode === "crop-9-16") {
						this.HeroTracker.startTracking();
					}
				}
			}
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
