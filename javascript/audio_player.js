// JavaScript Audio Player with JioSaavn Open Source API & Real Beat Detection Visualizer

// HTML entity decoder helper
function decodeHTMLEntities(text) {
	if (!text) return "";
	var textarea = document.createElement("textarea");
	textarea.innerHTML = text;
	return textarea.value;
}

// Synced Karaoke Lyrics Service
var LyricsService = {
	baseUrl: 'https://test-0k.onrender.com/lyrics/',
	cache: {},
	currentTimedLyrics: [],

	cleanQuery: function (str) {
		if (!str) return "";
		return str
			.replace(/\(From "[^"]*"\)/gi, "")
			.replace(/\(feat\.[^)]*\)/gi, "")
			.replace(/-\s*New Version/gi, "")
			.replace(/-\s*Original/gi, "")
			.replace(/•.*/gi, "")
			.trim();
	},

	fetchLyrics: async function (artist, songTitle) {
		var cleanArtist = this.cleanQuery(artist);
		var cleanTitle = this.cleanQuery(songTitle);
		var cacheKey = (cleanArtist + "_" + cleanTitle).toLowerCase();

		if (this.cache[cacheKey]) {
			return this.cache[cacheKey];
		}

		// 1. Primary: fetch with artist and song title
		try {
			var url = this.baseUrl + "?artist=" + encodeURIComponent(cleanArtist) + "&song=" + encodeURIComponent(cleanTitle) + "&timestamps=true";
			var res = await fetch(url);
			if (res.ok) {
				var data = await res.json();
				if (data && data.status === "success" && data.data) {
					this.cache[cacheKey] = data.data;
					return data.data;
				}
			}
		} catch (e1) {
			console.warn("Lyrics primary fetch error:", e1);
		}

		// 2. Secondary fallback: fetch with song title only (no artist param — empty string causes 400)
		try {
			var url2 = this.baseUrl + "?song=" + encodeURIComponent(cleanTitle) + "&timestamps=true";
			var res2 = await fetch(url2);
			if (res2.ok) {
				var data2 = await res2.json();
				if (data2 && data2.status === "success" && data2.data) {
					this.cache[cacheKey] = data2.data;
					return data2.data;
				}
			}
		} catch (e2) {
			console.warn("Lyrics secondary fetch error:", e2);
		}

		return null;
	},

	parseLrcText: function (lrcText) {
		if (!lrcText) return [];
		var lines = lrcText.split("\n");
		var result = [];
		var regExp = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

		lines.forEach(function (line, idx) {
			var matches = regExp.exec(line.trim());
			if (matches) {
				var mins = parseInt(matches[1], 10);
				var secs = parseInt(matches[2], 10);
				var ms = parseInt(matches[3].padEnd(3, "0"), 10);
				var startTime = (mins * 60 + secs) * 1000 + ms;
				var text = matches[4].trim();
				if (text) {
					result.push({
						id: "lrc_" + idx,
						start_time: startTime,
						end_time: 0,
						text: text
					});
				}
			}
		});

		for (var i = 0; i < result.length; i++) {
			if (i < result.length - 1) {
				result[i].end_time = result[i + 1].start_time;
			} else {
				result[i].end_time = result[i].start_time + 5000;
			}
		}

		return result;
	}
};

// JioSaavn API Service
var SaavnAPI = {
	primaryApiUrl: 'https://saavn.sumit.co/api',
	fallbackApiUrl: 'https://saavn.dev/api',
	secondaryFallbackApiUrl: 'https://jiosaavn-api-2.vercel.app',
	CIPHER_KEY: "38346591",

	decryptMediaUrl: function (encryptedMediaUrl) {
		if (!encryptedMediaUrl) return null;
		try {
			if (typeof CryptoJS !== "undefined" && CryptoJS.DES) {
				var key = CryptoJS.enc.Utf8.parse(this.CIPHER_KEY);
				var decrypted = CryptoJS.DES.decrypt(
					{ ciphertext: CryptoJS.enc.Base64.parse(encryptedMediaUrl) },
					key,
					{ mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
				);
				var url = decrypted.toString(CryptoJS.enc.Utf8);
				if (url && url.indexOf("http") === 0) {
					return url;
				}
			}
		} catch (e) {
			console.warn("CryptoJS decryption warning:", e);
		}
		return null;
	},

	normalizeSong: function (raw) {
		if (!raw) return null;

		var id = raw.id || Math.random().toString(36).substring(2);
		var title = decodeHTMLEntities(raw.name || raw.song || raw.title || "Unknown Track");
		var artist = decodeHTMLEntities(raw.artists.primary[0].name || raw.primary_artists || raw.singers || raw.artist || raw.music || "Various Artists");
		var albumStr = "JioSaavn";
		if (typeof raw.album === "string") {
			albumStr = raw.album;
		} else if (raw.album && typeof raw.album === "object" && raw.album.name) {
			albumStr = raw.album.name;
		}
		var album = decodeHTMLEntities(albumStr);

		// Album cover handling (upgrade 150x150 to 500x500 for HD quality)
		var coverUrl = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80";
		if (raw.image) {
			if (typeof raw.image === "string") {
				coverUrl = raw.image.replace("150x150", "500x500").replace("50x50", "500x500");
			} else if (Array.isArray(raw.image) && raw.image.length > 0) {
				var highRes = raw.image.find(function (img) { return img.quality === "500x500"; }) || raw.image[raw.image.length - 1];
				coverUrl = highRes.link || highRes.url || coverUrl;
			}
		}

		// Audio media URL handling & fallbacks
		var mainUrl = null;
		var fallbacks = [];

		// Helper to sanitize & upgrade non-existent 12kbps CDN URLs to 160kbps
		var sanitizeUrl = function (u) {
			if (!u || typeof u !== "string" || u.indexOf("http") !== 0) return null;
			if (u.indexOf("_12.mp4") !== -1 || u.indexOf("_12.m4a") !== -1 || u.indexOf("_12_p.mp4") !== -1) {
				return u.replace("_12.mp4", "_160.mp4").replace("_12.m4a", "_160.mp4").replace("_12_p.mp4", "_160.mp4");
			}
			return u;
		};

		// 1. Primary: Decrypt encrypted_media_url if available
		var encUrl = raw.encrypted_media_url || raw.encryptedMediaUrl || (raw.more_info && raw.more_info.encrypted_media_url);
		if (encUrl) {
			var dec = this.decryptMediaUrl(encUrl);
			if (dec) {
				var u160 = dec.replace("_96.mp4", "_160.mp4").replace("_96.m4a", "_160.mp4").replace("_96_p.mp4", "_160.mp4");
				var u320 = dec.replace("_96.mp4", "_320.mp4").replace("_96.m4a", "_320.mp4").replace("_96_p.mp4", "_320.mp4");
				var u96 = dec;
				mainUrl = u160;
				fallbacks.push(u320, u96);
			}
		}

		// 2. Secondary: Process downloadUrl array (filter & upgrade 12kbps links)
		// NOTE: API changed field name from 'link' to 'url' — check both for compatibility
		if (Array.isArray(raw.downloadUrl) && raw.downloadUrl.length > 0) {
			var validDownloads = raw.downloadUrl
				.map(function (dl) { return dl.url ? sanitizeUrl(dl.url) : (dl.link ? sanitizeUrl(dl.link) : null); })
				.filter(Boolean);

			// Prefer 160kbps as main URL (best quality without huge file size)
			if (!mainUrl) {
				var preferred = null;
				raw.downloadUrl.forEach(function (dl) {
					var q = dl.quality || '';
					if (q === '160kbps' || q === '320kbps') {
						var u = sanitizeUrl(dl.url || dl.link);
						if (u && !preferred) preferred = u;
					}
				});
				mainUrl = preferred || validDownloads[validDownloads.length - 1] || null;
			}

			validDownloads.forEach(function (link) {
				if (fallbacks.indexOf(link) === -1 && link !== mainUrl) {
					fallbacks.push(link);
				}
			});
		}

		// 3. Tertiary: Additional media URL fields
		// Exclude jiosaavn.com page links (raw.url is a webpage, not a stream URL)
		var extraUrls = [raw.media_url, raw.media_preview_url, raw.preview];
		extraUrls.forEach(function (u) {
			if (!u || u.indexOf('jiosaavn.com/song') !== -1) return; // skip page links
			var clean = sanitizeUrl(u);
			if (clean && fallbacks.indexOf(clean) === -1 && clean !== mainUrl) {
				fallbacks.push(clean);
			}
		});

		// 4. Safety Net: Local MP3 fallbacks if online CDN streams fail or CORS blocked
		["mp3/sample.mp3", "mp3/sample2.mp3", "mp3/sample3.mp3"].forEach(function (localMp3) {
			if (fallbacks.indexOf(localMp3) === -1) {
				fallbacks.push(localMp3);
			}
		});

		// Final check: if mainUrl is missing, take first fallback
		if (!mainUrl && fallbacks.length > 0) {
			mainUrl = fallbacks.shift();
		}

		if (mainUrl) {
			mainUrl = sanitizeUrl(mainUrl);
		}

		// Duration calculation
		var durSec = parseInt(raw.duration || 0, 10) || 0;
		var mins = Math.floor(durSec / 60);
		var secs = Math.floor(durSec % 60);
		var durStr = (mins < 10 ? "0" + mins : mins) + ":" + (secs < 10 ? "0" + secs : secs);

		return {
			id: id,
			title: title,
			artist: artist,
			album: album,
			cover: coverUrl,
			file: mainUrl,
			fallbacks: fallbacks,
			durationSec: durSec,
			durationStr: durStr,
			raw: raw
		};
	},

	parseSearchResults: function (data) {
		if (!data) return [];
		var results = (data.data && data.data.results) || data.results || data.data || data.songs || [];
		if (!Array.isArray(results)) return [];
		var self = this;
		return results.map(function (item) { return self.normalizeSong(item); }).filter(Boolean);
	},

	searchSongs: async function (query, page, limit) {
		page = page || 1;
		limit = limit || 15;
		var self = this;

		// 1. Try Primary API URL (saavn.sumit.co)
		try {
			var primaryUrl = self.primaryApiUrl + "/search/songs?query=" + encodeURIComponent(query) + "&page=" + page + "&limit=" + limit;
			var res1 = await fetch(primaryUrl);
			if (res1.ok) {
				var data1 = await res1.json();
				var parsed1 = self.parseSearchResults(data1);
				if (parsed1.length > 0) return parsed1;
			}
		} catch (err1) {
			console.warn("Primary API URL (" + self.primaryApiUrl + ") failed, trying fallback...", err1);
		}

		// 2. Try Fallback API URL (saavn.dev)
		try {
			var fallbackUrl = self.fallbackApiUrl + "/search/songs?query=" + encodeURIComponent(query) + "&page=" + page + "&limit=" + limit;
			var res2 = await fetch(fallbackUrl);
			if (res2.ok) {
				var data2 = await res2.json();
				var parsed2 = self.parseSearchResults(data2);
				if (parsed2.length > 0) return parsed2;
			}
		} catch (err2) {
			console.warn("Fallback API URL (" + self.fallbackApiUrl + ") failed, trying secondary fallback...", err2);
		}

		// 3. Try Secondary Vercel API
		try {
			var vercelUrl = self.secondaryFallbackApiUrl + "/search/songs?query=" + encodeURIComponent(query) + "&page=" + page + "&limit=" + limit;
			var res3 = await fetch(vercelUrl);
			if (res3.ok) {
				var data3 = await res3.json();
				var parsed3 = self.parseSearchResults(data3);
				if (parsed3.length > 0) return parsed3;
			}
		} catch (err3) {
			console.warn("Secondary Fallback API failed:", err3);
		}

		// 4. Try Direct JioSaavn API
		try {
			var directUrl = "https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&p=" + page + "&n=" + limit + "&q=" + encodeURIComponent(query);
			var res4 = await fetch(directUrl);
			if (res4.ok) {
				var data4 = await res4.json();
				var parsed4 = self.parseSearchResults(data4);
				if (parsed4.length > 0) return parsed4;
			}
		} catch (err4) {
			console.warn("Direct JioSaavn API failed:", err4);
		}

		return [];
	}
};

// Initial Fallback Tracks if offline
var fallbackPlaylist = [
	{ title: "Temper", file: "mp3/02 - Temper [www.AtoZmp3.in].mp3", artist: "Anup Rubens", cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80", durationStr: "04:12" },
	{ title: "Fire Storm", file: "mp3/Fire Storm.mp3", artist: "Electro Synth", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80", durationStr: "03:45" },
	{ title: "Naadaan Parindey", file: "mp3/Naadaan-Parindey.mp3", artist: "A.R. Rahman", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop&q=80", durationStr: "05:20" }
];

var playlist = [];
var playlist_index = 0;

var audio = new Audio();
audio.crossOrigin = "anonymous"; // Required: makes browser send Origin header so CDN returns CORS headers,
// allowing Web Audio API (visualizer) to read stream data.
// Without this, MediaElementAudioSource outputs zeroes.
audio.loop = false;
audio.autoplay = false;

// Audio Error Retry Recovery with Stream Fallback
audio.addEventListener("error", function (e) {
	console.warn("Audio element error on URL:", audio.src, audio.error);
	if (playlist && playlist[playlist_index]) {
		var song = playlist[playlist_index];
		if (song.fallbacks && song.fallbacks.length > 0) {
			var nextUrl = song.fallbacks.shift();
			console.log("Retrying with fallback stream URL:", nextUrl);
			audio.src = nextUrl;
			audio.load();
			audio.play().catch(function (err) {
				console.warn("Fallback stream play failed:", err);
			});
			return;
		}
	}
	var statusElem = document.getElementById("playlist_status");
	if (statusElem) {
		statusElem.innerHTML = "<span style='color:#ff4e50;'><i class='fa fa-exclamation-triangle'></i> Stream unavailable</span>";
	}
});

var canvas, ctx, source, context, analyser, fbc_array, bars;
var barParticles = [];
var sparkParticles = [];
var orbitAngle = 0;

// Beat Detection state variables
var bassEnergy = 0;
var beatThreshold = 200;
var beatScale = 0;
var lastBeatTime = 0;

// Options & Controls
var visualizerStyles = ["Classic", "Neon Wave", "Peak Caps", "Radial Pulse", "Particle Burst", "Mirror Spectrum"];
var currentStyleIndex = 0;

var colorThemes = {
	midnight: {
		c1: '#aaaaaa', c2: '#dddddd', c3: '#ffffff', cap: 'rgba(255,255,255,0.4)',
		gradientStops: [
			{ pos: 0, color: 'rgba(255,255,255,0.0)' },
			{ pos: 0.2, color: 'rgba(200,200,200,0.12)' },
			{ pos: 0.5, color: 'rgba(160,160,160,0.35)' },
			{ pos: 0.78, color: 'rgba(100,100,100,0.6)' },
			{ pos: 1, color: 'rgba(40,40,40,0.85)' }
		]
	},
	cyberpunk: {
		c1: '#ff6b8a', c2: '#ffd97d', c3: '#7efcff', cap: 'rgba(255,255,255,0.6)',
		gradientStops: [
			{ pos: 0, color: 'rgba(255,255,255,0.0)' },
			{ pos: 0.15, color: 'rgba(126,252,255,0.25)' },
			{ pos: 0.45, color: 'rgba(255,180,50,0.55)' },
			{ pos: 0.75, color: 'rgba(255,80,100,0.75)' },
			{ pos: 1, color: 'rgba(255,45,73,0.9)' }
		]
	},
	sunset: {
		c1: '#ff7043', c2: '#ffd54f', c3: '#ff9a3c', cap: 'rgba(255,255,255,0.6)',
		gradientStops: [
			{ pos: 0, color: 'rgba(255,255,255,0.0)' },
			{ pos: 0.2, color: 'rgba(255,213,79,0.3)' },
			{ pos: 0.5, color: 'rgba(255,154,60,0.6)' },
			{ pos: 0.78, color: 'rgba(255,112,67,0.8)' },
			{ pos: 1, color: 'rgba(230,74,25,0.9)' }
		]
	},
	emerald: {
		c1: '#43e97b', c2: '#72efdd', c3: '#38f9d7', cap: 'rgba(255,255,255,0.6)',
		gradientStops: [
			{ pos: 0, color: 'rgba(255,255,255,0.0)' },
			{ pos: 0.2, color: 'rgba(114,239,221,0.25)' },
			{ pos: 0.5, color: 'rgba(67,233,123,0.5)' },
			{ pos: 0.78, color: 'rgba(56,249,215,0.72)' },
			{ pos: 1, color: 'rgba(0,200,130,0.9)' }
		]
	},
	violet: {
		c1: '#e879b0', c2: '#b57bee', c3: '#9f6aff', cap: 'rgba(255,255,255,0.6)',
		gradientStops: [
			{ pos: 0, color: 'rgba(255,255,255,0.0)' },
			{ pos: 0.2, color: 'rgba(181,123,238,0.25)' },
			{ pos: 0.5, color: 'rgba(159,106,255,0.55)' },
			{ pos: 0.78, color: 'rgba(213,54,126,0.75)' },
			{ pos: 1, color: 'rgba(180,0,200,0.9)' }
		]
	},
	ocean: {
		c1: '#4fc3f7', c2: '#81d4fa', c3: '#00b4d8', cap: 'rgba(255,255,255,0.6)',
		gradientStops: [
			{ pos: 0, color: 'rgba(255,255,255,0.0)' },
			{ pos: 0.2, color: 'rgba(129,212,250,0.25)' },
			{ pos: 0.5, color: 'rgba(79,195,247,0.5)' },
			{ pos: 0.78, color: 'rgba(0,180,216,0.72)' },
			{ pos: 1, color: 'rgba(2,119,189,0.9)' }
		]
	}
};

var currentThemeKey = "midnight";
var sensitivity = 1.0;
var enableGlow = false;
var enableVisualizer = false;
var isShuffle = false;
var isLoop = false;
var activeTab = "home";
var homeFeeds = {
	latest: [],
	motivational: [],
	deep_focus: []
};
var gradient;

function setVisualizerStyle(styleName) {
	for (var i = 0; i < visualizerStyles.length; i++) {
		if (visualizerStyles[i] === styleName) {
			currentStyleIndex = i;
			break;
		}
	}
}

function updateGradient() {
	if (!ctx || !canvas) return;
	gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
	var stops = colorThemes[currentThemeKey].gradientStops;
	for (var i = 0; i < stops.length; i++) {
		gradient.addColorStop(stops[i].pos, stops[i].color);
	}
}

window.addEventListener("load", initMp3Player, false);

function initMp3Player() {
	var AudioContextClass = window.AudioContext || window.webkitAudioContext;
	context = new AudioContextClass();
	analyser = context.createAnalyser();
	analyser.fftSize = 512;
	analyser.smoothingTimeConstant = 0.85;

	canvas = document.getElementById('analyser_render');
	if (canvas) {
		ctx = canvas.getContext('2d');
		resizeCanvas();
		window.addEventListener('resize', resizeCanvas);
	}

	try {
		source = context.createMediaElementSource(audio);
		source.connect(analyser);
		analyser.connect(context.destination);
	} catch (e) {
		console.warn("Audio Context source error:", e);
	}

	frameLooper();
	loadHomeFeeds();
}

function resizeCanvas() {
	if (!canvas) return;
	var dpr = window.devicePixelRatio || 1;
	var rect = canvas.getBoundingClientRect();
	// Fallback to full viewport dimensions (canvas is now position:fixed 100vh)
	canvas.width = (rect.width || window.innerWidth) * dpr;
	canvas.height = (rect.height || window.innerHeight) * dpr;
	updateGradient();
}

// Home Page Feeds Loading
async function loadHomeFeeds() {
	var latestPromise = SaavnAPI.searchSongs("latest telugu songs", 1, 8);
	var motivationalPromise = SaavnAPI.searchSongs("motivational telugu songs", 1, 8);
	var deepFocusPromise = SaavnAPI.searchSongs("deep focus study", 1, 8);

	var results = await Promise.all([latestPromise, motivationalPromise, deepFocusPromise]);

	homeFeeds.latest = results[0] && results[0].length > 0 ? results[0] : fallbackPlaylist;
	homeFeeds.motivational = results[1] && results[1].length > 0 ? results[1] : fallbackPlaylist;
	homeFeeds.deep_focus = results[2] && results[2].length > 0 ? results[2] : fallbackPlaylist;

	// Populate Home Page Grids
	renderCardsGrid("latest_songs_list", homeFeeds.latest, "latest");
	renderCardsGrid("motivational_songs_list", homeFeeds.motivational, "motivational");
	renderCardsGrid("deep_focus_songs_list", homeFeeds.deep_focus, "deep_focus");

	// Initialize default playlist with latest songs feed
	if (playlist.length === 0) {
		playlist = homeFeeds.latest;
		if (playlist.length > 0) {
			setTrackWithoutAutoplay(0);
		}
	}
}

function renderCardsGrid(containerId, songsList, categoryKey) {
	var container = document.getElementById(containerId);
	if (!container) return;
	container.innerHTML = "";

	if (!songsList || songsList.length === 0) {
		container.innerHTML = '<div class="no-songs"><i class="fa fa-music"></i> No tracks found for this category.</div>';
		return;
	}

	songsList.forEach(function (song, index) {
		var card = document.createElement("div");
		card.className = "song-card";
		var isActive = (playlist === songsList && playlist_index === index);
		if (isActive) {
			card.classList.add("active");
		}

		var playingOverlay = isActive ? '<div class="playing-pill"><i class="fa fa-signal"></i> Playing</div>' : '';

		card.innerHTML =
			'<div class="card-thumb-wrapper">' +
			'<img class="card-thumb" src="' + song.cover + '" alt="' + song.title + '" loading="lazy">' +
			'<span class="hd-badge"><i class="fa fa-bolt"></i> HD</span>' +
			playingOverlay +
			'<div class="play-overlay">' +
			'<div class="play-btn-circle"><i class="fa fa-play"></i></div>' +
			'</div>' +
			'</div>' +
			'<div class="card-title" title="' + song.title + '">' + song.title + '</div>' +
			'<div class="card-artist" title="' + song.artist + '">' + song.artist + '</div>';

		card.onclick = function () {
			playlist = songsList;
			playTrackAtIndex(index);
			updateAllActiveCards();
		};

		container.appendChild(card);
	});
}

function updateAllActiveCards() {
	renderCardsGrid("latest_songs_list", homeFeeds.latest, "latest");
	renderCardsGrid("motivational_songs_list", homeFeeds.motivational, "motivational");
	renderCardsGrid("deep_focus_songs_list", homeFeeds.deep_focus, "deep_focus");
	renderSongsList(playlist);
}

function renderSongsList(songsList) {
	var songsContainer = document.getElementById("songslistcon");
	if (!songsContainer) return;
	songsContainer.innerHTML = "";

	if (!songsList || songsList.length === 0) {
		songsContainer.innerHTML = '<div class="no-songs"><i class="fa fa-search"></i> No songs to display. Use the search box above to explore.</div>';
		return;
	}

	var ul = document.createElement("ul");
	songsList.forEach(function (songItem, idx) {
		var li = document.createElement("li");
		var isActive = (playlist === songsList && idx === playlist_index);
		if (isActive) {
			li.className = "active";
		}

		var trackNum = document.createElement("span");
		trackNum.className = "track-idx";
		trackNum.textContent = (idx + 1 < 10 ? "0" : "") + (idx + 1);

		var imgWrapper = document.createElement("div");
		imgWrapper.className = "song-cover-wrapper";

		var img = document.createElement("img");
		img.className = "song-cover";
		img.src = songItem.cover;
		img.alt = songItem.title;
		imgWrapper.appendChild(img);

		var infoDiv = document.createElement("div");
		infoDiv.className = "song-info";

		var titleSpan = document.createElement("span");
		titleSpan.className = "song-title";
		titleSpan.textContent = songItem.title;

		var metaLine = document.createElement("div");
		metaLine.className = "song-meta-line";

		var artistSpan = document.createElement("span");
		artistSpan.className = "song-artist";
		artistSpan.textContent = songItem.artist;

		metaLine.appendChild(artistSpan);

		if (songItem.album && songItem.album !== "JioSaavn") {
			var albumTag = document.createElement("span");
			albumTag.className = "album-tag";
			albumTag.textContent = songItem.album;
			metaLine.appendChild(albumTag);
		}

		infoDiv.appendChild(titleSpan);
		infoDiv.appendChild(metaLine);

		var eqIcon = document.createElement("div");
		eqIcon.className = "eq-indicator";
		eqIcon.innerHTML = "<span></span><span></span><span></span><span></span>";
		if (isActive && !audio.paused) {
			eqIcon.classList.add("playing");
		}

		var durSpan = document.createElement("span");
		durSpan.className = "song-duration";
		durSpan.textContent = songItem.durationStr || "--:--";

		var playRowBtn = document.createElement("button");
		playRowBtn.className = "row-play-btn";
		playRowBtn.innerHTML = isActive && !audio.paused ? '<i class="fa fa-pause"></i>' : '<i class="fa fa-play"></i>';

		li.appendChild(trackNum);
		li.appendChild(imgWrapper);
		li.appendChild(infoDiv);
		li.appendChild(eqIcon);
		li.appendChild(durSpan);
		li.appendChild(playRowBtn);

		li.onclick = function () {
			playlist = songsList;
			playTrackAtIndex(idx);
		};

		ul.appendChild(li);
	});
	songsContainer.appendChild(ul);
}

function updatePlayerMetadata(song) {
	if (!song) return;
	var playerThumb = document.getElementById("player_thumb");
	if (playerThumb && song.cover) {
		playerThumb.src = song.cover;
	}
	var statusElem = document.getElementById("playlist_status");
	if (statusElem) {
		statusElem.innerHTML = song.title + ' <span class="artist-sub">• ' + song.artist + '</span>';
	}
}

function setTrackWithoutAutoplay(index) {
	if (!playlist || playlist.length === 0) return;
	playlist_index = index;
	var song = playlist[playlist_index];
	updatePlayerMetadata(song);
	if (song.file) {
		audio.src = song.file;
	}
}

async function loadLyricsForCurrentSong() {
	if (!playlist || !playlist[playlist_index]) return;
	var song = playlist[playlist_index];

	var lyricsCover = document.getElementById("lyrics_cover");
	var modalCover = document.getElementById("modal_lyrics_cover");
	var artGlow = document.getElementById("lyrics_art_glow");
	if (lyricsCover) lyricsCover.src = song.cover;
	if (modalCover) modalCover.src = song.cover;
	if (artGlow && song.cover) {
		artGlow.style.backgroundImage = "url('" + song.cover + "')";
	}

	var lyricsTitle = document.getElementById("lyrics_title");
	var modalTitle = document.getElementById("modal_lyrics_title");
	if (lyricsTitle) lyricsTitle.textContent = song.title;
	if (modalTitle) modalTitle.textContent = song.title;

	var lyricsArtist = document.getElementById("lyrics_artist");
	var modalArtist = document.getElementById("modal_lyrics_artist");
	if (lyricsArtist) lyricsArtist.textContent = song.artist;
	if (modalArtist) modalArtist.textContent = song.artist;

	var containers = [document.getElementById("lyrics_container"), document.getElementById("modal_lyrics_container")];
	containers.forEach(function (c) {
		if (c) c.innerHTML = '<div class="loading-state"><i class="fa fa-circle-o-notch fa-spin"></i> Fetching synced lyrics...</div>';
	});

	var lyricsData = await LyricsService.fetchLyrics(song.artist, song.title);
	var timed = [];

	if (lyricsData) {
		if (Array.isArray(lyricsData.timed_lyrics) && lyricsData.timed_lyrics.length > 0) {
			timed = lyricsData.timed_lyrics;
		} else if (lyricsData.lyrics) {
			timed = LyricsService.parseLrcText(lyricsData.lyrics);
		}
	}

	LyricsService.currentTimedLyrics = timed;

	containers.forEach(function (c) {
		if (!c) return;
		c.innerHTML = "";

		if (!timed || timed.length === 0) {
			c.innerHTML = '<div class="no-lyrics-placeholder"><i class="fa fa-info-circle"></i> No synced lyrics found for this track.</div>';
			return;
		}

		timed.forEach(function (line, index) {
			var p = document.createElement("p");
			p.className = "lyric-line";
			p.setAttribute("data-start", line.start_time);
			p.setAttribute("data-end", line.end_time || 0);
			p.setAttribute("data-idx", index);
			p.textContent = line.text;

			p.onclick = function () {
				var startSec = line.start_time / 1000;
				audio.currentTime = startSec;
				if (audio.paused) audio.play();
			};

			c.appendChild(p);
		});
	});
}

function updateSyncedLyrics() {
	if (!LyricsService.currentTimedLyrics || LyricsService.currentTimedLyrics.length === 0) return;
	var currentMs = audio.currentTime * 1000;
	var activeIndex = -1;

	var timed = LyricsService.currentTimedLyrics;
	for (var i = 0; i < timed.length; i++) {
		var item = timed[i];
		var nextItem = timed[i + 1];
		var endTime = item.end_time || (nextItem ? nextItem.start_time : item.start_time + 4000);

		if (currentMs >= item.start_time && currentMs <= endTime) {
			activeIndex = i;
			break;
		} else if (currentMs >= item.start_time && !nextItem) {
			activeIndex = i;
			break;
		}
	}

	if (activeIndex !== -1) {
		var allLines = document.querySelectorAll(".lyric-line");
		allLines.forEach(function (lineEl) {
			var idx = parseInt(lineEl.getAttribute("data-idx"), 10);
			if (idx === activeIndex) {
				if (!lineEl.classList.contains("active")) {
					lineEl.classList.add("active");
					lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
				}
			} else {
				lineEl.classList.remove("active");
			}
		});
	}
}

function playTrackAtIndex(index) {
	if (!playlist || playlist.length === 0) return;
	playlist_index = index;
	var song = playlist[playlist_index];
	updatePlayerMetadata(song);
	loadLyricsForCurrentSong();

	if (context && context.state === 'suspended') {
		context.resume();
	}

	if (song.file) {
		audio.src = song.file;
		audio.play().then(function () {
			var playbtn = document.getElementById("playpausebtn");
			if (playbtn) playbtn.className = "pause";
		}).catch(function (err) {
			console.warn("Audio play promise catch:", err);
		});
	} else if (song.fallbacks && song.fallbacks.length > 0) {
		audio.src = song.fallbacks.shift();
		audio.play().catch(function (err) {
			console.warn("Audio fallback play promise catch:", err);
		});
	} else {
		var statusElem = document.getElementById("playlist_status");
		if (statusElem) statusElem.innerHTML = "Stream unavailable: " + song.title;
	}

	updateAllActiveCards();
}

function detectBeat(fbc) {
	var bassSum = 0;
	var bassBins = 12;
	for (var b = 0; b < bassBins; b++) {
		bassSum += fbc[b];
	}
	bassEnergy = bassSum / bassBins;

	var now = performance.now();
	if (bassEnergy > beatThreshold * 1.12 && (now - lastBeatTime) > 220) {
		beatScale = 1.0;
		lastBeatTime = now;
	} else {
		beatScale *= 0.88;
	}

	beatThreshold = beatThreshold * 0.96 + bassEnergy * 0.04;
}

function frameLooper() {
	var reqAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;
	reqAnimationFrame(frameLooper);

	if (!analyser || !ctx || !canvas) return;

	if (!enableVisualizer) {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		return;
	}

	fbc_array = new Uint8Array(analyser.frequencyBinCount);
	analyser.getByteFrequencyData(fbc_array);
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	detectBeat(fbc_array);

	bars = 250;
	var theme = colorThemes[currentThemeKey];
	var style = visualizerStyles[currentStyleIndex];

	if (enableGlow) {
		ctx.shadowBlur = 6 + beatScale * 10;
		ctx.shadowColor = theme.c1;
	} else {
		ctx.shadowBlur = 0;
	}

	if (style === "Classic") {
		ctx.fillStyle = gradient;
		var barGap = canvas.width / bars;
		var bWidth = Math.max(1, barGap - 2);

		for (var i = 0; i < bars; i++) {
			var freqVal = fbc_array[i] * sensitivity;
			var bHeight = (freqVal / 255) * (canvas.height * 0.85);
			bHeight += beatScale * 8;

			var bx = i * barGap;
			var by = canvas.height - bHeight;

			ctx.fillRect(bx, by, bWidth, bHeight);

			ctx.save();
			ctx.fillStyle = theme.cap;
			ctx.fillRect(bx, by - 2, bWidth, 2);
			ctx.restore();
		}

	} else if (style === "Neon Wave") {
		ctx.beginPath();
		ctx.moveTo(0, canvas.height);

		var stepX = canvas.width / (bars - 1);
		for (var i = 0; i < bars; i++) {
			var freqVal = fbc_array[i] * sensitivity;
			var x = i * stepX;
			var y = canvas.height - (freqVal / 255) * (canvas.height * 0.8) - (beatScale * 12);

			if (i === 0) {
				ctx.lineTo(x, y);
			} else {
				var prevX = (i - 1) * stepX;
				var prevY = canvas.height - (fbc_array[i - 1] * sensitivity / 255) * (canvas.height * 0.8) - (beatScale * 12);
				var cx = (prevX + x) / 2;
				var cy = (prevY + y) / 2;
				ctx.quadraticCurveTo(prevX, prevY, cx, cy);
			}
		}

		ctx.lineTo(canvas.width, canvas.height);
		ctx.closePath();
		ctx.fillStyle = gradient;
		ctx.globalAlpha = 0.75;
		ctx.fill();
		ctx.globalAlpha = 1.0;

		ctx.lineWidth = 3 + beatScale * 2;
		ctx.strokeStyle = theme.c2;
		ctx.stroke();

	} else if (style === "Peak Caps") {
		ctx.fillStyle = gradient;
		if (barParticles.length !== bars) {
			barParticles = [];
			for (var bp = 0; bp < bars; bp++) {
				barParticles.push({ y: canvas.height, vy: 0 });
			}
		}

		var barGap = canvas.width / bars;
		var bWidth = Math.max(2, barGap - 2);

		for (var i = 0; i < bars; i++) {
			var freqVal = fbc_array[i] * sensitivity;
			var bHeight = (freqVal / 255) * (canvas.height * 0.82);
			var bx = i * barGap;
			var by = canvas.height - bHeight;

			ctx.fillRect(bx, by, bWidth, bHeight);

			var p = barParticles[i];
			if (by <= p.y) {
				p.y = by - 3;
				p.vy = -1.5 * (freqVal / 255);
			} else {
				p.y += p.vy;
				p.vy += 0.15;
				if (p.y > canvas.height - 3) {
					p.y = canvas.height - 3;
					p.vy = 0;
				}
			}

			ctx.save();
			ctx.fillStyle = theme.c2;
			ctx.fillRect(bx - 0.5, p.y, bWidth + 1, 3);
			ctx.restore();
		}

	} else if (style === "Radial Pulse") {
		var centerX = canvas.width / 2;
		var centerY = canvas.height / 2;
		var baseRadius = Math.min(canvas.width, canvas.height) * 0.22;
		var pulsedRadius = baseRadius + (beatScale * 14);

		ctx.save();
		ctx.translate(centerX, centerY);

		ctx.beginPath();
		ctx.arc(0, 0, pulsedRadius, 0, Math.PI * 2);
		ctx.fillStyle = theme.c1;
		ctx.fill();

		ctx.beginPath();
		ctx.arc(0, 0, pulsedRadius + 6 + (beatScale * 8), 0, Math.PI * 2);
		ctx.strokeStyle = theme.c2;
		ctx.lineWidth = 2;
		ctx.stroke();

		var spikeCount = 64;
		var angleStep = (Math.PI * 2) / spikeCount;

		for (var i = 0; i < spikeCount; i++) {
			var angle = i * angleStep;
			var freqVal = fbc_array[i % 40] * sensitivity;
			var spikeLen = (freqVal / 255) * (baseRadius * 1.5) + (beatScale * 10);

			var x1 = Math.cos(angle) * (pulsedRadius + 4);
			var y1 = Math.sin(angle) * (pulsedRadius + 4);
			var x2 = Math.cos(angle) * (pulsedRadius + 4 + spikeLen);
			var y2 = Math.sin(angle) * (pulsedRadius + 4 + spikeLen);

			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.strokeStyle = i % 2 === 0 ? theme.c2 : theme.c3;
			ctx.lineWidth = 2.5;
			ctx.stroke();
		}

		orbitAngle += 0.02 + (beatScale * 0.03);
		for (var o = 0; o < 3; o++) {
			var a = orbitAngle + (o * Math.PI * 2 / 3);
			var ox = Math.cos(a) * (pulsedRadius + 30);
			var oy = Math.sin(a) * (pulsedRadius + 30);

			ctx.beginPath();
			ctx.arc(ox, oy, 4 + beatScale * 3, 0, Math.PI * 2);
			ctx.fillStyle = theme.cap;
			ctx.fill();
		}

		ctx.restore();

	} else if (style === "Particle Burst") {
		ctx.fillStyle = gradient;
		var barGap = canvas.width / bars;
		var bWidth = Math.max(2, barGap - 2);

		for (var i = 0; i < bars; i++) {
			var freqVal = fbc_array[i] * sensitivity;
			var bHeight = (freqVal / 255) * (canvas.height * 0.8);
			var bx = i * barGap;
			var by = canvas.height - bHeight;

			ctx.fillRect(bx, by, bWidth, bHeight);

			var intensity = freqVal / 255;
			if (intensity > 0.6 && sparkParticles.length < 200 && Math.random() < (0.2 + beatScale * 0.4)) {
				sparkParticles.push({
					x: bx + bWidth / 2,
					y: by,
					vx: (Math.random() - 0.5) * (3 + beatScale * 4),
					vy: -Math.random() * (3 + beatScale * 5) - 1,
					size: Math.random() * 3 + 1.5,
					alpha: 1.0,
					color: intensity > 0.85 ? theme.cap : (intensity > 0.65 ? theme.c2 : theme.c1)
				});
			}
		}

		for (var s = sparkParticles.length - 1; s >= 0; s--) {
			var sp = sparkParticles[s];
			sp.x += sp.vx;
			sp.y += sp.vy;
			sp.vy += 0.1;
			sp.alpha -= 0.03;

			if (sp.alpha <= 0 || sp.y > canvas.height) {
				sparkParticles.splice(s, 1);
				continue;
			}

			ctx.save();
			ctx.globalAlpha = Math.max(0, sp.alpha);
			ctx.beginPath();
			ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
			ctx.fillStyle = sp.color;
			ctx.shadowBlur = 8;
			ctx.shadowColor = sp.color;
			ctx.fill();
			ctx.restore();
		}

	} else if (style === "Mirror Spectrum") {
		ctx.fillStyle = gradient;
		var midY = canvas.height / 2;
		var barGap = canvas.width / bars;
		var bWidth = Math.max(2, barGap - 2);

		ctx.save();
		ctx.strokeStyle = theme.c2;
		ctx.lineWidth = 1 + beatScale * 2;
		ctx.beginPath();
		ctx.moveTo(0, midY);
		ctx.lineTo(canvas.width, midY);
		ctx.stroke();
		ctx.restore();

		for (var i = 0; i < bars; i++) {
			var freqVal = fbc_array[i] * sensitivity;
			var halfHeight = (freqVal / 255) * (canvas.height / 2.3) + (beatScale * 4);
			var bx = i * barGap;

			ctx.fillRect(bx, midY - halfHeight, bWidth, halfHeight * 2);

			ctx.save();
			ctx.fillStyle = theme.cap;
			ctx.fillRect(bx, midY - halfHeight - 1, bWidth, 2);
			ctx.fillRect(bx, midY + halfHeight - 1, bWidth, 2);
			ctx.restore();
		}
	}
}

// Tab navigation & View handling
function switchTab(tabName) {
	activeTab = tabName;
	var navItems = document.querySelectorAll(".nav-tabs .col, .nav-icon");
	navItems.forEach(function (el) {
		el.classList.toggle("active", el.getAttribute("data-tab") === tabName);
	});

	var homeView = document.getElementById("home_view");
	var searchView = document.getElementById("search_view");
	var lyricsView = document.getElementById("lyrics_view");

	if (homeView) homeView.classList.remove("active");
	if (searchView) searchView.classList.remove("active");
	if (lyricsView) lyricsView.classList.remove("active");

	if (tabName === "home") {
		if (homeView) homeView.classList.add("active");
	} else if (tabName === "lyrics") {
		if (lyricsView) lyricsView.classList.add("active");
		loadLyricsForCurrentSong();
	} else {
		if (searchView) searchView.classList.add("active");

		var viewTitle = document.getElementById("view_title");
		var songSearch = document.getElementById("song_search");

		if (tabName === "latest") {
			if (viewTitle) viewTitle.innerHTML = '<i class="fa fa-bolt section-icon"></i> Latest Songs';
			if (homeFeeds.latest.length > 0) {
				playlist = homeFeeds.latest;
				renderSongsList(playlist);
			}
		} else if (tabName === "motivational") {
			if (viewTitle) viewTitle.innerHTML = '<i class="fa fa-fire section-icon"></i> Motivational Songs';
			if (homeFeeds.motivational.length > 0) {
				playlist = homeFeeds.motivational;
				renderSongsList(playlist);
			}
		} else if (tabName === "deep_focus") {
			if (viewTitle) viewTitle.innerHTML = '<i class="fa fa-headphones section-icon"></i> Deep Focus Songs';
			if (homeFeeds.deep_focus.length > 0) {
				playlist = homeFeeds.deep_focus;
				renderSongsList(playlist);
			}
		} else if (tabName === "search") {
			if (viewTitle) viewTitle.textContent = "Search Music";
			if (songSearch) songSearch.focus();
		}
	}
}

function initAudioPlayer() {
	var playbtn = document.getElementById("playpausebtn");
	var mutebtn = document.getElementById("mutebtn");
	var seekslider = document.getElementById("seekslider");
	var volumeslider = document.getElementById("volumeslider");
	var current_time = document.getElementById("current_time");
	var duration_time = document.getElementById("duration_time");
	var playlist_status = document.getElementById("playlist_status");
	var seeking = false;

	// Tab Clicks Event Listeners
	document.addEventListener("click", function (e) {
		var target = e.target.closest("[data-tab]");
		if (target) {
			var tab = target.getAttribute("data-tab");
			switchTab(tab);
		}
	});

	// Controls
	var styleSelect = document.getElementById("style_select");
	if (styleSelect) {
		styleSelect.addEventListener("change", function () {
			setVisualizerStyle(this.value);
		});
	}

	var themeSelect = document.getElementById("theme_select");
	if (themeSelect) {
		themeSelect.addEventListener("change", function () {
			currentThemeKey = this.value;
			updateGradient();
		});
	}

	var sensSlider = document.getElementById("sensitivity_slider");
	if (sensSlider) {
		sensSlider.addEventListener("input", function () {
			sensitivity = parseFloat(this.value);
		});
	}

	var vizToggleBtn = document.getElementById("visualizer_toggle");
	if (vizToggleBtn) {
		vizToggleBtn.addEventListener("click", function () {
			enableVisualizer = !enableVisualizer;
			this.classList.toggle("active", enableVisualizer);
			var mp3Player = document.getElementById("mp3_player");
			if (mp3Player) {
				mp3Player.classList.toggle("visualizer-hidden", !enableVisualizer);
			}
		});
	}

	var glowBtn = document.getElementById("glow_toggle");
	if (glowBtn) {
		glowBtn.addEventListener("click", function () {
			enableGlow = !enableGlow;
			this.classList.toggle("active", enableGlow);
		});
	}

	var shuffleBtn = document.getElementById("shuffle_btn");
	if (shuffleBtn) {
		shuffleBtn.addEventListener("click", function () {
			isShuffle = !isShuffle;
			this.classList.toggle("active", isShuffle);
		});
	}

	var loopBtn = document.getElementById("loop_btn");
	if (loopBtn) {
		loopBtn.addEventListener("click", function () {
			isLoop = !isLoop;
			audio.loop = isLoop;
			this.classList.toggle("active", isLoop);
		});
	}

	// Lyrics Button & Modal Event Listeners
	var lyricsBtn = document.getElementById("lyrics_btn");
	var lyricsModal = document.getElementById("lyrics_modal");
	var closeLyricsModal = document.getElementById("close_lyrics_modal");

	if (lyricsBtn) {
		lyricsBtn.addEventListener("click", function () {
			if (lyricsModal) {
				var isOpen = lyricsModal.classList.contains("active");
				if (!isOpen) {
					lyricsModal.classList.add("active");
					loadLyricsForCurrentSong();
				} else {
					lyricsModal.classList.remove("active");
				}
			}
		});
	}

	if (closeLyricsModal) {
		closeLyricsModal.addEventListener("click", function () {
			if (lyricsModal) lyricsModal.classList.remove("active");
		});
	}

	// Live Search Input with Debouncing
	var songSearch = document.getElementById("song_search");
	var clearSearchBtn = document.getElementById("clear_search_btn");
	var searchDebounceTimer = null;

	var triggerSearch = function (q) {
		if (!songSearch) return;
		songSearch.value = q;
		clearTimeout(searchDebounceTimer);

		if (!q) {
			renderSongsList(playlist);
			if (clearSearchBtn) clearSearchBtn.style.display = "none";
			return;
		}

		if (clearSearchBtn) clearSearchBtn.style.display = "flex";
		switchTab("search");

		var songsContainer = document.getElementById("songslistcon");
		if (songsContainer) {
			songsContainer.innerHTML = '<div class="loading-state"><i class="fa fa-circle-o-notch fa-spin"></i> Searching JioSaavn for "' + q + '"...</div>';
		}

		searchDebounceTimer = setTimeout(async function () {
			var searchResults = await SaavnAPI.searchSongs(q, 1, 20);
			if (searchResults.length > 0) {
				playlist = searchResults;
				renderSongsList(playlist);
			} else if (songsContainer) {
				songsContainer.innerHTML = '<div class="no-songs"><i class="fa fa-frown-o"></i> No songs found matching "' + q + '". Try another keyword.</div>';
			}
		}, 300);
	};

	if (songSearch) {
		songSearch.addEventListener("input", function () {
			triggerSearch(this.value);
		});
	}

	if (clearSearchBtn) {
		clearSearchBtn.addEventListener("click", function () {
			if (songSearch) {
				songSearch.value = "";
				triggerSearch("");
				songSearch.focus();
			}
		});
	}

	// Search Chip Pills Click Listener
	document.addEventListener("click", function (e) {
		var chip = e.target.closest(".chip");
		if (chip) {
			var query = chip.getAttribute("data-query");
			if (query) {
				triggerSearch(query);
			}
		}
	});

	var prevBtn = document.getElementById("prev-s");
	var nextBtn = document.getElementById("next-s");

	if (prevBtn) {
		prevBtn.addEventListener("click", function () {
			if (!playlist || playlist.length === 0) return;
			var newIndex;
			if (isShuffle) {
				newIndex = Math.floor(Math.random() * playlist.length);
			} else {
				newIndex = (playlist_index - 1 + playlist.length) % playlist.length;
			}
			playTrackAtIndex(newIndex);
		});
	}

	if (nextBtn) {
		nextBtn.addEventListener("click", function () {
			switchTrack();
		});
	}

	if (playbtn) playbtn.addEventListener("click", playPause);
	if (mutebtn) mutebtn.addEventListener("click", mute);

	if (seekslider) {
		seekslider.addEventListener("mousedown", function (event) { seeking = true; seek(event); });
		seekslider.addEventListener("mousemove", function (event) { if (seeking) seek(event); });
		seekslider.addEventListener("mouseup", function () { seeking = false; });
	}

	if (volumeslider) volumeslider.addEventListener("input", setvolume);

	audio.addEventListener("timeupdate", function () {
		seektimeupdate();
		updateSyncedLyrics();
	});
	audio.addEventListener("ended", switchTrack);

	function switchTrack() {
		if (!playlist || playlist.length === 0) return;
		if (isLoop) {
			playTrackAtIndex(playlist_index);
			return;
		}
		var newIndex;
		if (isShuffle) {
			newIndex = Math.floor(Math.random() * playlist.length);
		} else {
			newIndex = (playlist_index + 1) % playlist.length;
		}
		playTrackAtIndex(newIndex);
	}

	function playPause() {
		if (context && context.state === 'suspended') {
			context.resume();
		}
		if (audio.paused) {
			audio.play().then(function () {
				if (playbtn) playbtn.className = "pause";
			}).catch(function (err) {
				console.warn("Play error:", err);
			});
		} else {
			audio.pause();
			if (playbtn) playbtn.className = "play";
		}
		renderSongsList(playlist);
	}

	function mute() {
		if (audio.muted) {
			audio.muted = false;
			if (volumeslider) volumeslider.value = audio.volume * 100;
			if (mutebtn) mutebtn.className = "volume";
		} else {
			audio.muted = true;
			if (volumeslider) volumeslider.value = 0;
			if (mutebtn) mutebtn.className = "mute";
		}
	}

	function seek(event) {
		if (!seekslider) return;
		var rect = seekslider.getBoundingClientRect();
		var offsetX = event.clientX - rect.left;
		var pct = Math.max(0, Math.min(1, offsetX / rect.width));
		if (audio.duration) {
			audio.currentTime = pct * audio.duration;
			seekslider.value = pct * 500;
		}
	}

	function setvolume() {
		if (!volumeslider) return;
		audio.volume = volumeslider.value / 100;
		if (audio.volume > 0) {
			audio.muted = false;
			if (mutebtn) mutebtn.className = "volume";
		} else {
			audio.muted = true;
			if (mutebtn) mutebtn.className = "mute";
		}
	}

	function seektimeupdate() {
		if (!seeking && audio.duration && seekslider) {
			var pct = audio.currentTime / audio.duration;
			seekslider.value = pct * 500;
		}
		var current_mins = Math.floor(audio.currentTime / 60);
		var current_secs = Math.floor(audio.currentTime - current_mins * 60);
		var duration_mins = Math.floor(audio.duration / 60) || 0;
		var duration_secs = Math.floor(audio.duration - duration_mins * 60) || 0;

		if (current_secs < 10) { current_secs = "0" + current_secs; }
		if (duration_secs < 10) { duration_secs = "0" + duration_secs; }
		if (current_mins < 10) { current_mins = "0" + current_mins; }
		if (duration_mins < 10) { duration_mins = "0" + duration_mins; }

		if (current_time) current_time.innerHTML = current_mins + ":" + current_secs;
		if (duration_time) duration_time.innerHTML = duration_mins + ":" + duration_secs;
	}

	// Toast Notification Helper
	function showToast(message) {
		var toast = document.getElementById("app_toast");
		var toastText = document.getElementById("toast_text");
		if (!toast || !toastText) return;
		toastText.textContent = message;
		toast.classList.add("show");
		setTimeout(function () {
			toast.classList.remove("show");
		}, 3500);
	}

	// Feedback & Funding Modals Handler
	var feedbackModal = document.getElementById("feedback_modal");
	var fundingModal = document.getElementById("funding_modal");

	var topFbBtn = document.getElementById("top_feedback_btn");
	var footerFbBtn = document.getElementById("footer_feedback_btn");
	var closeFbBtn = document.getElementById("close_feedback_modal");

	var topFundBtn = document.getElementById("top_funding_btn");
	var footerFundBtn = document.getElementById("footer_funding_btn");
	var closeFundBtn = document.getElementById("close_funding_modal");

	function openModal(modal) {
		if (modal) modal.classList.add("active");
	}

	function closeModal(modal) {
		if (modal) modal.classList.remove("active");
	}

	if (topFbBtn) topFbBtn.addEventListener("click", function () { openModal(feedbackModal); });
	if (footerFbBtn) footerFbBtn.addEventListener("click", function () { openModal(feedbackModal); });
	if (closeFbBtn) closeFbBtn.addEventListener("click", function () { closeModal(feedbackModal); });

	if (topFundBtn) topFundBtn.addEventListener("click", function () { openModal(fundingModal); });
	if (footerFundBtn) footerFundBtn.addEventListener("click", function () { openModal(fundingModal); });
	if (closeFundBtn) closeFundBtn.addEventListener("click", function () { closeModal(fundingModal); });

	var modalFbOptionBtn = document.getElementById("modal_feedback_option_btn");
	if (modalFbOptionBtn) {
		modalFbOptionBtn.addEventListener("click", function () {
			closeModal(fundingModal);
			openModal(feedbackModal);
		});
	}

	// Star Rating Selection
	var selectedStars = 5;
	var stars = document.querySelectorAll("#star_rating .star-btn");
	stars.forEach(function (starEl) {
		starEl.addEventListener("click", function () {
			var rating = parseInt(this.getAttribute("data-star"), 10);
			selectedStars = rating;
			stars.forEach(function (s, idx) {
				s.classList.toggle("active", idx < rating);
			});
		});
	});

	// Feedback Form Submission
	var feedbackForm = document.getElementById("feedback_form");
	if (feedbackForm) {
		feedbackForm.addEventListener("submit", function (e) {
			e.preventDefault();
			var name = document.getElementById("fb_name").value;
			var category = document.getElementById("fb_category").value;
			var message = document.getElementById("fb_message").value;

			var feedbackObj = {
				name: name,
				category: category,
				message: message,
				rating: selectedStars,
				timestamp: new Date().toISOString()
			};

			var existingFb = JSON.parse(localStorage.getItem("sangeetham_feedback") || "[]");
			existingFb.push(feedbackObj);
			localStorage.setItem("sangeetham_feedback", JSON.stringify(existingFb));

			closeModal(feedbackModal);
			feedbackForm.reset();
			showToast("Thank you, " + name + "! Your feedback has been sent to Vthinq. ❤️");
		});
	}

	// Copy UPI ID Handler
	var copyUpiBtn = document.getElementById("copy_upi_btn");
	if (copyUpiBtn) {
		copyUpiBtn.addEventListener("click", function () {
			var upiInput = document.getElementById("upi_id_val");
			if (upiInput) {
				navigator.clipboard.writeText(upiInput.value).then(function () {
					showToast("UPI ID (vthinq@upi) copied to clipboard! Thank you for supporting!");
				}).catch(function () {
					showToast("UPI ID: vthinq@upi");
				});
			}
		});
	}
}

window.addEventListener("load", initAudioPlayer);


