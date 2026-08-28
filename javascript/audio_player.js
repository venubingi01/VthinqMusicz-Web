// Copyright (c) 2026 Vthinq. All rights reserved.
// Developer name : Venu Bingi
// This AI Music Player use JioSaavn Open Source API for music streaming.


// HTML entity decoder helper
function decodeHTMLEntities(text) {
	if (!text) return "";
	var textarea = document.createElement("textarea");
	textarea.innerHTML = text;
	return textarea.value;
}

// JioSaavn API Service
var SaavnAPI = {
	primaryApiUrl: 'https://sangeetham-api.onrender.com/api',
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

		var id = raw.id || raw.albumid || Math.random().toString(36).substring(2);
		var title = decodeHTMLEntities(raw.name || raw.song || raw.title || "Unknown Track");

		var artist = "Various Artists";
		if (raw.artists && raw.artists.primary && Array.isArray(raw.artists.primary) && raw.artists.primary.length > 0 && raw.artists.primary[0].name) {
			artist = raw.artists.primary.map(function (a) { return a.name; }).join(", ");
		} else if (raw.primary_artists) {
			artist = raw.primary_artists;
		} else if (raw.singers) {
			artist = raw.singers;
		} else if (raw.artist) {
			artist = raw.artist;
		} else if (raw.music) {
			artist = raw.music;
		}
		artist = decodeHTMLEntities(artist);

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
	},

	normalizeAlbum: function (raw) {
		if (!raw) return null;
		var id = raw.id || raw.albumid || "";
		var title = decodeHTMLEntities(raw.name || raw.title || raw.album || "Unknown Album");
		var year = raw.year || "";
		var language = raw.language || "";
		var songCount = raw.song_count || raw.songCount || (raw.songs ? raw.songs.length : (raw.list ? raw.list.length : 0)) || "";

		var artists = "Various Artists";
		if (raw.artists && raw.artists.primary && Array.isArray(raw.artists.primary) && raw.artists.primary.length > 0) {
			artists = raw.artists.primary.map(function (a) { return a.name; }).join(", ");
		} else if (raw.primary_artists) {
			artists = raw.primary_artists;
		} else if (raw.singers) {
			artists = raw.singers;
		} else if (raw.artist) {
			artists = raw.artist;
		} else if (raw.music) {
			artists = raw.music;
		}
		artists = decodeHTMLEntities(artists);

		var coverUrl = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80";
		if (raw.image) {
			if (typeof raw.image === "string") {
				coverUrl = raw.image.replace("150x150", "500x500").replace("50x50", "500x500");
			} else if (Array.isArray(raw.image) && raw.image.length > 0) {
				var highRes = raw.image.find(function (img) { return img.quality === "500x500"; }) || raw.image[raw.image.length - 1];
				coverUrl = highRes.link || highRes.url || coverUrl;
			}
		}

		return {
			id: id,
			title: title,
			artists: artists,
			year: year,
			language: language,
			songCount: songCount,
			cover: coverUrl,
			raw: raw
		};
	},

	searchAlbums: async function (query, page, limit) {
		page = page || 1;
		limit = limit || 15;
		var self = this;
		var endpoints = [
			self.primaryApiUrl + "/search/albums?query=" + encodeURIComponent(query) + "&page=" + page + "&limit=" + limit,
			self.secondaryFallbackApiUrl + "/search/albums?query=" + encodeURIComponent(query) + "&page=" + page + "&limit=" + limit,
			self.fallbackApiUrl + "/search/albums?query=" + encodeURIComponent(query) + "&page=" + page + "&limit=" + limit,
			"https://www.jiosaavn.com/api.php?__call=search.getAlbumResults&_format=json&_marker=0&p=" + page + "&n=" + limit + "&q=" + encodeURIComponent(query)
		];

		for (var i = 0; i < endpoints.length; i++) {
			try {
				var res = await fetch(endpoints[i]);
				if (res.ok) {
					var data = await res.json();
					var list = (data.data && data.data.results) || data.results || data.data || [];
					if (Array.isArray(list) && list.length > 0) {
						return list.map(function (item) { return self.normalizeAlbum(item); }).filter(Boolean);
					}
				}
			} catch (err) {
				console.warn("searchAlbums endpoint error:", endpoints[i], err);
			}
		}
		return [];
	},

	getAlbumDetails: async function (albumId) {
		if (!albumId) return null;
		var self = this;
		var endpoints = [
			self.primaryApiUrl + "/albums?id=" + encodeURIComponent(albumId),
			self.secondaryFallbackApiUrl + "/albums?id=" + encodeURIComponent(albumId),
			self.fallbackApiUrl + "/albums?id=" + encodeURIComponent(albumId),
			"https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&_format=json&albumid=" + encodeURIComponent(albumId)
		];

		for (var i = 0; i < endpoints.length; i++) {
			try {
				var res = await fetch(endpoints[i]);
				if (res.ok) {
					var data = await res.json();
					var albumData = data.data || data;
					if (albumData && (albumData.name || albumData.title)) {
						var normalizedAlbum = self.normalizeAlbum(albumData);
						var rawSongs = albumData.songs || albumData.list || [];
						normalizedAlbum.songs = rawSongs.map(function (s) { return self.normalizeSong(s); }).filter(Boolean);
						return normalizedAlbum;
					}
				}
			} catch (err) {
				console.warn("getAlbumDetails endpoint error:", endpoints[i], err);
			}
		}
		return null;
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
var currentStyleIndex = 4;

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

// ==========================================================================
// Favorites Management Module & Persistence
// ==========================================================================
var FavoritesManager = {
	STORAGE_KEY: "sangeetham_favorites",

	getFavorites: function () {
		try {
			var raw = localStorage.getItem(this.STORAGE_KEY);
			if (!raw) return [];
			var parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			console.warn("Error reading favorites:", e);
			return [];
		}
	},

	saveFavorites: function (list) {
		try {
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
		} catch (e) {
			console.warn("Error saving favorites:", e);
		}
	},

	isFavorite: function (song) {
		if (!song) return false;
		var favs = this.getFavorites();
		return favs.some(function (item) {
			if (song.id && item.id && song.id === item.id) return true;
			if (song.file && item.file && song.file === item.file) return true;
			if (song.title && item.title && song.title.trim().toLowerCase() === item.title.trim().toLowerCase()) {
				if (!song.artist || !item.artist || song.artist.trim().toLowerCase() === item.artist.trim().toLowerCase()) {
					return true;
				}
			}
			return false;
		});
	},

	toggleFavorite: function (song) {
		if (!song) return false;
		var favs = this.getFavorites();
		var existingIndex = -1;

		for (var i = 0; i < favs.length; i++) {
			var item = favs[i];
			if ((song.id && item.id && song.id === item.id) ||
				(song.file && item.file && song.file === item.file) ||
				(song.title && item.title && song.title.trim().toLowerCase() === item.title.trim().toLowerCase() &&
					(!song.artist || !item.artist || song.artist.trim().toLowerCase() === item.artist.trim().toLowerCase()))) {
				existingIndex = i;
				break;
			}
		}

		var isNowFav = false;
		if (existingIndex !== -1) {
			favs.splice(existingIndex, 1);
			this.saveFavorites(favs);
			if (typeof showToast === "function") {
				showToast("💔 Removed from Favorites: " + (song.title || "Track"));
			}
			isNowFav = false;
		} else {
			var cleanSong = {
				id: song.id || ("fav_" + Date.now()),
				title: song.title || "Unknown Title",
				artist: song.artist || "Unknown Artist",
				album: song.album || "JioSaavn",
				cover: song.cover || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80",
				file: song.file || null,
				fallbacks: song.fallbacks || [],
				duration: song.duration || 0,
				durationStr: song.durationStr || "--:--",
				has_lyrics: !!song.has_lyrics,
				lyrics: song.lyrics || null,
				savedAt: Date.now()
			};
			favs.unshift(cleanSong);
			this.saveFavorites(favs);
			if (typeof showToast === "function") {
				showToast("❤️ Added to Favorites: " + cleanSong.title);
			}
			isNowFav = true;
		}

		this.updateAllUI();
		return isNowFav;
	},

	clearAll: function () {
		var count = this.getFavorites().length;
		if (count === 0) return;
		this.saveFavorites([]);
		if (typeof showToast === "function") {
			showToast("🗑️ Cleared all favorite songs");
		}
		this.updateAllUI();
	},

	updateAllUI: function () {
		var curSong = (typeof playlist !== "undefined" && playlist && playlist[playlist_index]) || null;

		// 1. Update Bottom Player Dock Favorite Button
		var dockFavBtn = document.getElementById("player_fav_btn");
		if (dockFavBtn) {
			var isFav = this.isFavorite(curSong);
			dockFavBtn.classList.toggle("active", isFav);
			var icon = dockFavBtn.querySelector("i");
			if (icon) {
				icon.className = isFav ? "fa fa-heart" : "fa fa-heart-o";
			}
			dockFavBtn.setAttribute("title", isFav ? "Remove from Favorites" : "Add to Favorites");
		}

		// 2. Update Lyrics Screen Favorite Button
		var lyricsFavBtn = document.getElementById("lyrics_fav_btn");
		if (lyricsFavBtn) {
			var isFavLyrics = this.isFavorite(curSong);
			lyricsFavBtn.classList.toggle("active", isFavLyrics);
			var lIcon = lyricsFavBtn.querySelector("i");
			if (lIcon) {
				lIcon.className = isFavLyrics ? "fa fa-heart" : "fa fa-heart-o";
			}
			var lSpan = lyricsFavBtn.querySelector("span");
			if (lSpan) {
				lSpan.textContent = isFavLyrics ? "Favorited" : "Favorite";
			}
		}

		// 3. Update Favorites Screen
		renderFavoritesScreen();

		// 4. Update heart icons on all rendered cards & list rows
		var allFavButtons = document.querySelectorAll("[data-fav-song-title]");
		var self = this;
		allFavButtons.forEach(function (btn) {
			var title = btn.getAttribute("data-fav-song-title");
			var artist = btn.getAttribute("data-fav-song-artist");
			var checkSong = { title: title, artist: artist };
			var isF = self.isFavorite(checkSong);
			btn.classList.toggle("active", isF);
			var ic = btn.querySelector("i");
			if (ic) {
				ic.className = isF ? "fa fa-heart" : "fa fa-heart-o";
			}
			btn.setAttribute("title", isF ? "Remove from Favorites" : "Add to Favorites");
		});
	}
};

function renderFavoritesScreen() {
	var favoritesView = document.getElementById("favorites_view");
	if (!favoritesView) return;

	var favListContainer = document.getElementById("favorites_songs_list");
	var countBadge = document.getElementById("fav_count_badge");
	var favs = FavoritesManager.getFavorites();

	if (countBadge) {
		countBadge.textContent = favs.length + (favs.length === 1 ? " Song" : " Songs");
	}

	var playAllBtn = document.getElementById("fav_play_all_btn");
	var shuffleBtn = document.getElementById("fav_shuffle_btn");
	var clearBtn = document.getElementById("fav_clear_btn");

	if (playAllBtn) playAllBtn.disabled = (favs.length === 0);
	if (shuffleBtn) shuffleBtn.disabled = (favs.length === 0);
	if (clearBtn) clearBtn.disabled = (favs.length === 0);

	if (!favListContainer) return;
	favListContainer.innerHTML = "";

	if (favs.length === 0) {
		favListContainer.innerHTML =
			'<div class="empty-favorites-state">' +
			'<div class="empty-fav-icon-box">' +
			'<i class="fa fa-heart-crack"></i>' +
			'</div>' +
			'<h3>No Favorite Songs Yet</h3>' +
			'<p>Explore songs on Home or Search, and tap the <i class="fa fa-heart" style="color:var(--accent-pink)"></i> heart button to save your top tunes here for quick playback anytime!</p>' +
			'<div class="empty-fav-actions">' +
			'<button class="explore-btn" onclick="switchTab(\'home\')"><i class="fa fa-home"></i> Explore Home</button>' +
			'<button class="explore-btn search-explore-btn" onclick="switchTab(\'search\')"><i class="fa fa-search"></i> Search Songs</button>' +
			'</div>' +
			'</div>';
		return;
	}

	var ul = document.createElement("ul");
	ul.className = "fav-songs-ul";

	favs.forEach(function (song, idx) {
		var li = document.createElement("li");
		li.className = "fav-song-row";
		var isActive = (playlist === favs && playlist_index === idx);
		if (isActive) {
			li.classList.add("active");
		}

		var trackNum = document.createElement("span");
		trackNum.className = "track-idx";
		trackNum.textContent = (idx + 1 < 10 ? "0" : "") + (idx + 1);

		var imgWrapper = document.createElement("div");
		imgWrapper.className = "song-cover-wrapper";
		var img = document.createElement("img");
		img.className = "song-cover";
		img.src = song.cover || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80";
		img.alt = song.title;
		imgWrapper.appendChild(img);

		var infoDiv = document.createElement("div");
		infoDiv.className = "song-info";

		var titleSpan = document.createElement("span");
		titleSpan.className = "song-title";
		titleSpan.textContent = song.title;

		var metaLine = document.createElement("div");
		metaLine.className = "song-meta-line";

		var artistSpan = document.createElement("span");
		artistSpan.className = "song-artist";
		artistSpan.textContent = song.artist;
		metaLine.appendChild(artistSpan);

		if (song.album && song.album !== "JioSaavn") {
			var albumTag = document.createElement("span");
			albumTag.className = "album-tag";
			albumTag.textContent = song.album;
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
		durSpan.textContent = song.durationStr || "--:--";

		// Unfavorite heart button
		var favBtn = document.createElement("button");
		favBtn.className = "row-fav-btn active";
		favBtn.title = "Remove from Favorites";
		favBtn.innerHTML = '<i class="fa fa-heart"></i>';
		favBtn.onclick = function (e) {
			e.stopPropagation();
			FavoritesManager.toggleFavorite(song);
		};

		var playRowBtn = document.createElement("button");
		playRowBtn.className = "row-play-btn";
		playRowBtn.innerHTML = isActive && !audio.paused ? '<i class="fa fa-pause"></i>' : '<i class="fa fa-play"></i>';

		li.appendChild(trackNum);
		li.appendChild(imgWrapper);
		li.appendChild(infoDiv);
		li.appendChild(eqIcon);
		li.appendChild(durSpan);
		li.appendChild(favBtn);
		li.appendChild(playRowBtn);

		li.onclick = function () {
			playlist = favs;
			playTrackAtIndex(idx);
			renderFavoritesScreen();
		};

		ul.appendChild(li);
	});

	favListContainer.appendChild(ul);
}

function initFavoritesEvents() {
	var playAllBtn = document.getElementById("fav_play_all_btn");
	if (playAllBtn) {
		playAllBtn.onclick = function () {
			var favs = FavoritesManager.getFavorites();
			if (favs.length > 0) {
				playlist = favs.slice();
				playTrackAtIndex(0);
				renderFavoritesScreen();
				showToast("▶ Playing all " + favs.length + " favorite songs");
			}
		};
	}

	var shuffleBtn = document.getElementById("fav_shuffle_btn");
	if (shuffleBtn) {
		shuffleBtn.onclick = function () {
			var favs = FavoritesManager.getFavorites();
			if (favs.length > 0) {
				var shuffled = favs.slice().sort(function () { return 0.5 - Math.random(); });
				playlist = shuffled;
				playTrackAtIndex(0);
				renderFavoritesScreen();
				showToast("🔀 Shuffled & playing " + favs.length + " favorite songs");
			}
		};
	}

	var clearBtn = document.getElementById("fav_clear_btn");
	if (clearBtn) {
		clearBtn.onclick = function () {
			if (confirm("Are you sure you want to clear all favorite songs?")) {
				FavoritesManager.clearAll();
			}
		};
	}

	var playerDockFavBtn = document.getElementById("player_fav_btn");
	if (playerDockFavBtn) {
		playerDockFavBtn.onclick = function (e) {
			e.stopPropagation();
			var curSong = (playlist && playlist[playlist_index]) || null;
			if (curSong) {
				FavoritesManager.toggleFavorite(curSong);
			} else {
				showToast("No song is currently playing");
			}
		};
	}

	var lyricsFavBtn = document.getElementById("lyrics_fav_btn");
	if (lyricsFavBtn) {
		lyricsFavBtn.onclick = function (e) {
			e.stopPropagation();
			var curSong = (playlist && playlist[playlist_index]) || null;
			if (curSong) {
				FavoritesManager.toggleFavorite(curSong);
			}
		};
	}
}

// Home Page Feeds Loading
async function loadHomeFeeds() {
	var latestPromise = SaavnAPI.searchSongs("latest telugu songs", 1, 8);
	var motivationalPromise = SaavnAPI.searchAlbums("bollywood", 1, 8);
	var deepFocusPromise = SaavnAPI.searchAlbums("hollywood", 1, 8);

	var results = await Promise.all([latestPromise, motivationalPromise, deepFocusPromise]);

	homeFeeds.latest = results[0] && results[0].length > 0 ? results[0] : fallbackPlaylist;
	homeFeeds.motivational = results[1] && results[1].length > 0 ? results[1] : fallbackPlaylist;
	homeFeeds.deep_focus = results[2] && results[2].length > 0 ? results[2] : fallbackPlaylist;

	// Populate Home Page Grids
	renderCardsGrid("latest_songs_list", homeFeeds.latest, "latest");
	renderAlbumsList("bollywood_songs_list", homeFeeds.motivational, "motivational");
	renderAlbumsList("hollywood_songs_list", homeFeeds.deep_focus, "deep_focus");

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
		var isFav = (typeof FavoritesManager !== "undefined") && FavoritesManager.isFavorite(song);
		var favIconClass = isFav ? "fa fa-heart" : "fa fa-heart-o";
		var favActiveClass = isFav ? " active" : "";

		card.innerHTML =
			'<div class="card-thumb-wrapper">' +
			'<img class="card-thumb" src="' + song.cover + '" alt="' + song.title + '" loading="lazy">' +
			'<span class="hd-badge"><i class="fa fa-bolt"></i> HD</span>' +
			'<button class="card-fav-btn' + favActiveClass + '" data-fav-song-title="' + song.title.replace(/"/g, '&quot;') + '" data-fav-song-artist="' + (song.artist || '').replace(/"/g, '&quot;') + '" title="' + (isFav ? 'Remove from Favorites' : 'Add to Favorites') + '"><i class="' + favIconClass + '"></i></button>' +
			playingOverlay +
			'<div class="play-overlay">' +
			'<div class="play-btn-circle"><i class="fa fa-play"></i></div>' +
			'</div>' +
			'</div>' +
			'<div class="card-title" title="' + song.title + '">' + song.title + '</div>' +
			'<div class="card-artist" title="' + song.artist + '">' + song.artist + '</div>';

		var favBtn = card.querySelector(".card-fav-btn");
		if (favBtn) {
			favBtn.onclick = function (e) {
				e.stopPropagation();
				if (typeof FavoritesManager !== "undefined") {
					FavoritesManager.toggleFavorite(song);
				}
			};
		}

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
	renderAlbumsList("bollywood_songs_list", homeFeeds.motivational, "bollywood");
	renderAlbumsList("hollywood_songs_list", homeFeeds.deep_focus, "hollywood");
	renderSongsList(playlist);
	if (typeof FavoritesManager !== "undefined") {
		FavoritesManager.updateAllUI();
	}
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

		// Favorite heart button on song row
		var isFav = (typeof FavoritesManager !== "undefined") && FavoritesManager.isFavorite(songItem);
		var favBtn = document.createElement("button");
		favBtn.className = "row-fav-btn" + (isFav ? " active" : "");
		favBtn.setAttribute("data-fav-song-title", songItem.title);
		favBtn.setAttribute("data-fav-song-artist", songItem.artist || "");
		favBtn.title = isFav ? "Remove from Favorites" : "Add to Favorites";
		favBtn.innerHTML = isFav ? '<i class="fa fa-heart"></i>' : '<i class="fa fa-heart-o"></i>';
		favBtn.onclick = function (e) {
			e.stopPropagation();
			if (typeof FavoritesManager !== "undefined") {
				FavoritesManager.toggleFavorite(songItem);
			}
		};

		var playRowBtn = document.createElement("button");
		playRowBtn.className = "row-play-btn";
		playRowBtn.innerHTML = isActive && !audio.paused ? '<i class="fa fa-pause"></i>' : '<i class="fa fa-play"></i>';

		li.appendChild(trackNum);
		li.appendChild(imgWrapper);
		li.appendChild(infoDiv);
		li.appendChild(eqIcon);
		li.appendChild(durSpan);
		li.appendChild(favBtn);
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
	if (typeof FavoritesManager !== "undefined") {
		FavoritesManager.updateAllUI();
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

var currentActivePlayerLyricIdx = -1;

function updatePlayerSingleLineLyric(text, animate) {
	var lyricEl = document.getElementById("player_lyric_text");
	if (!lyricEl) return;
	var cleanText = (text || "").trim();
	if (lyricEl.textContent === cleanText) return;

	if (animate) {
		lyricEl.classList.remove("lyric-animate");
		// Trigger DOM reflow to restart CSS keyframe animation
		void lyricEl.offsetWidth;
		lyricEl.textContent = cleanText;
		lyricEl.classList.add("lyric-animate");
	} else {
		lyricEl.classList.remove("lyric-animate");
		lyricEl.textContent = cleanText;
	}
}

function setPlayerLyricPlayingState(isPlaying) {
	var bar = document.getElementById("player_lyric_bar");
	if (bar) {
		if (isPlaying) {
			bar.classList.add("playing");
		} else {
			bar.classList.remove("playing");
		}
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

	currentActivePlayerLyricIdx = -1;
	updatePlayerSingleLineLyric("♪ Fetching lyrics...", true);

	var lyricsData = await LyricsService.fetchLyrics(song.artist, song.title);
	var timed = [];
	console.log('lyrics', lyricsData);
	if (lyricsData) {
		if (Array.isArray(lyricsData.timed_lyrics) && lyricsData.timed_lyrics.length > 0) {
			timed = lyricsData.timed_lyrics;
		} else if (lyricsData.lyrics) {
			timed = LyricsService.parseLrcText(lyricsData.lyrics);
		}
	}

	LyricsService.currentTimedLyrics = timed;

	if (!timed || timed.length === 0) {
		updatePlayerSingleLineLyric("♪ " + song.title + " • " + song.artist, false);
	} else {
		updatePlayerSingleLineLyric("♪ " + song.title + " • Synced Lyrics Ready", true);
	}

	if (lyricsData && lyricsData?.hasTimestamps == false) {
		timed = [];
		if (lyricsData.lyrics) {
			// render the lyricsdata.lyrics here]
			containers.forEach(function (c) {
				if (!c) return;
				c.innerHTML = "";
				c.classList.add("no-scroll");
				c.innerHTML = '<p class="synced-lyrics">' + lyricsData.lyrics.split("\n").join("<br>") + '</p>';
			});
			return;
		}
	}

	containers.forEach(function (c) {
		if (!c) return;
		c.innerHTML = "";

		if (!timed || timed.length === 0) {
			c.innerHTML = '<div class="no-lyrics-placeholder"><i class="fa fa-info-circle"></i> No synced lyrics found for this track.</div>';
			hideNoLyricsPlaceholder();
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

function hideNoLyricsPlaceholder() {
	setTimeout(() => {
		const noLyricsPlaceholder = document.querySelector('.no-lyrics-placeholder');
		if (noLyricsPlaceholder) {
			noLyricsPlaceholder.style.display = 'none';
		}
	}, 5000);
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
		// Highlight active line in full lyrics views & auto-scroll
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

		// Animate 1-line synced lyric inside bottom player section
		if (activeIndex !== currentActivePlayerLyricIdx) {
			currentActivePlayerLyricIdx = activeIndex;
			var lineText = timed[activeIndex].text;
			if (lineText && lineText.trim()) {
				updatePlayerSingleLineLyric(lineText.trim(), true);
			}
		}
	} else {
		// Instrumental or before first timestamp
		if (currentActivePlayerLyricIdx !== -1 && timed.length > 0 && currentMs < timed[0].start_time) {
			currentActivePlayerLyricIdx = -1;
			var currentSong = playlist && playlist[playlist_index];
			var infoMsg = currentSong ? "♪ " + currentSong.title + " • Intro" : "♪ Instrumental...";
			updatePlayerSingleLineLyric(infoMsg, true);
		}
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
	if (window.innerWidth < 600) {
		bars = 50;
	} else {
		bars = 250;
	}
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
		var barGap = (canvas.width / bars) + 2;
		var bWidth = Math.max(2, barGap - 3);

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
// Tab navigation & View handling with URL Hash Synchronization
function switchTab(tabName, skipHashUpdate) {
	activeTab = tabName;
	var navItems = document.querySelectorAll(".nav-tabs .col, .nav-icon");
	navItems.forEach(function (el) {
		el.classList.toggle("active", el.getAttribute("data-tab") === tabName);
	});

	var homeView = document.getElementById("home_view");
	var searchView = document.getElementById("search_view");
	var lyricsView = document.getElementById("lyrics_view");
	var chatView = document.getElementById("chat_view");
	var albumView = document.getElementById("album_view");
	var favoritesView = document.getElementById("favorites_view");
	var header = document.getElementById("header");

	if (homeView) homeView.classList.remove("active");
	if (searchView) searchView.classList.remove("active");
	if (lyricsView) lyricsView.classList.remove("active");
	if (chatView) chatView.classList.remove("active");
	if (albumView) albumView.classList.remove("active");
	if (favoritesView) favoritesView.classList.remove("active");
	if (header) header.classList.remove("hide-mobile");
	var floatingChatBtn = document.getElementById("floating_chat_btn");

	if (tabName === "home") {
		if (homeView) homeView.classList.add("active");
		if (!skipHashUpdate) updateUrlHash("home");
	} else if (tabName === "favorites") {
		if (favoritesView) favoritesView.classList.add("active");
		renderFavoritesScreen();
		if (!skipHashUpdate) updateUrlHash("favorites");
	} else if (tabName === "lyrics") {
		if (lyricsView) lyricsView.classList.add("active");
		loadLyricsForCurrentSong();
		if (header) header.classList.add("hide-mobile");
		if (!skipHashUpdate) {
			var cur = playlist && playlist[playlist_index];
			if (cur && cur.title) {
				updateUrlHash("lyrics", { song: cur.title, artist: cur.artist });
			} else {
				updateUrlHash("lyrics");
			}
		}
	} else if (tabName === "album") {
		if (albumView) albumView.classList.add("active");
	} else if (tabName === "ai_chat") {
		if (chatView) {
			chatView.classList.add("active");
			var chatInput = document.getElementById("chat_input");
			if (chatInput) {
				setTimeout(function () { chatInput.focus(); }, 150);
			}
		}
		if (!skipHashUpdate) updateUrlHash("ai_chat");
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
			if (!skipHashUpdate) updateUrlHash("latest");
		} else if (tabName === "bollywood" || tabName === "motivational") {
			if (viewTitle) viewTitle.innerHTML = '<i class="fa-solid fa-compact-disc section-icon"></i> Bollywood Albums';
			if (homeFeeds.motivational && homeFeeds.motivational.length > 0) {
				renderAlbumsList(homeFeeds.motivational);
			} else {
				SaavnAPI.searchAlbums("bollywood", 1, 20).then(function (res) {
					homeFeeds.motivational = res;
					renderAlbumsList(res);
				});
			}
			if (!skipHashUpdate) updateUrlHash("bollywood");
		} else if (tabName === "hollywood" || tabName === "deep_focus") {
			if (viewTitle) viewTitle.innerHTML = '<i class="fa-solid fa-compact-disc section-icon"></i> Hollywood Albums';
			if (homeFeeds.deep_focus && homeFeeds.deep_focus.length > 0) {
				renderAlbumsList(homeFeeds.deep_focus);
			} else {
				SaavnAPI.searchAlbums("hollywood", 1, 20).then(function (res) {
					homeFeeds.deep_focus = res;
					renderAlbumsList(res);
				});
			}
			if (!skipHashUpdate) updateUrlHash("hollywood");
		} else if (tabName === "search") {
			if (viewTitle) viewTitle.textContent = "Search Music";
			if (songSearch) songSearch.focus();
			if (!skipHashUpdate) updateUrlHash("search");
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

	// Mobile Menu Button & Popup Handler (<= 768px)
	var mobileMenuBtn = document.getElementById("mobile_menu_btn");
	var menuContainer = document.querySelector(".menu-container");

	function toggleMobileMenu(forceState) {
		if (!menuContainer || !mobileMenuBtn) return;
		var shouldOpen = typeof forceState === "boolean" ? forceState : !menuContainer.classList.contains("open");
		menuContainer.classList.toggle("open", shouldOpen);
		mobileMenuBtn.classList.toggle("active", shouldOpen);
		var icon = mobileMenuBtn.querySelector("i");
		if (icon) {
			icon.className = shouldOpen ? "fa fa-times" : "fa fa-bars";
		}
	}

	if (mobileMenuBtn) {
		mobileMenuBtn.addEventListener("click", function (e) {
			e.stopPropagation();
			toggleMobileMenu();
		});
	}

	// Close mobile menu when clicking outside
	document.addEventListener("click", function (e) {
		if (menuContainer && menuContainer.classList.contains("open")) {
			if (!menuContainer.contains(e.target) && e.target !== mobileMenuBtn && !mobileMenuBtn.contains(e.target)) {
				toggleMobileMenu(false);
			}
		}
	});

	// Tab Clicks Event Listeners
	document.addEventListener("click", function (e) {
		var target = e.target.closest("[data-tab]");
		if (target) {
			var tab = target.getAttribute("data-tab");
			switchTab(tab);
			toggleMobileMenu(false);
		}
	});

	// Open Lyrics Screen on Player Meta Container Click in Mobile Screens (<= 900px)
	var playerMetaContainer = document.getElementById("player-meta-container") || document.querySelector(".player-meta-container");
	if (playerMetaContainer) {
		playerMetaContainer.addEventListener("click", function () {
			if (window.innerWidth <= 900) {
				switchTab("lyrics");
			}
		});
	}

	// Back Button from Lyrics View
	var lyricsBackBtn = document.getElementById("lyrics_back_btn");
	if (lyricsBackBtn) {
		lyricsBackBtn.addEventListener("click", function (e) {
			e.stopPropagation();
			switchTab("home");
		});
	}

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

	// Single-line Player Bar Lyric Click to Open Modal
	var playerLyricBar = document.getElementById("player_lyric_bar");
	if (playerLyricBar) {
		playerLyricBar.addEventListener("click", function () {
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

	// Search Type (songs vs albums)
	var currentSearchType = "songs";
	var searchFilterPills = document.querySelectorAll(".search-filter-pill");
	searchFilterPills.forEach(function (pill) {
		pill.addEventListener("click", function () {
			searchFilterPills.forEach(function (p) { p.classList.remove("active"); });
			this.classList.add("active");
			currentSearchType = this.getAttribute("data-search-type") || "songs";
			var q = songSearch ? songSearch.value.trim() : "";
			if (q) {
				triggerSearch(q);
			}
		});
	});

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
			songsContainer.innerHTML = '<div class="loading-state"><i class="fa fa-circle-o-notch fa-spin"></i> Searching JioSaavn for ' + currentSearchType + ' "' + q + '"...</div>';
		}

		searchDebounceTimer = setTimeout(async function () {
			if (currentSearchType === "albums") {
				var albumResults = await SaavnAPI.searchAlbums(q, 1, 20);
				if (albumResults.length > 0) {
					renderAlbumsList(albumResults);
				} else if (songsContainer) {
					songsContainer.innerHTML = '<div class="no-songs"><i class="fa-solid fa-compact-disc"></i> No albums found matching "' + q + '". Try another keyword.</div>';
				}
			} else {
				var searchResults = await SaavnAPI.searchSongs(q, 1, 20);
				if (searchResults.length > 0) {
					playlist = searchResults;
					renderSongsList(playlist);
				} else if (songsContainer) {
					songsContainer.innerHTML = '<div class="no-songs"><i class="fa-frown-o"></i> No songs found matching "' + q + '". Try another keyword.</div>';
				}
			}
		}, 300);
	};
	window.triggerSearchGlobal = triggerSearch;

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

	// Album Back Button Listener
	var albumBackBtn = document.getElementById("album_back_btn");
	if (albumBackBtn) {
		albumBackBtn.addEventListener("click", function () {
			switchTab("search");
		});
	}

	// Share Lyrics Button Listener
	var shareLyricsBtn = document.getElementById("share_lyrics_btn");
	if (shareLyricsBtn) {
		shareLyricsBtn.addEventListener("click", function () {
			shareCurrentLyrics();
		});
	}

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

	var volumePopup = document.getElementById("volume_popup");
	var quickMuteBtn = document.getElementById("quick_mute_btn");
	var volumeValBadge = document.getElementById("volume_val_badge");
	var volumeTrackWrap = document.querySelector(".volume-slider-track-wrap");

	if (playbtn) playbtn.addEventListener("click", playPause);

	// Prevent clicks/drags inside volume popup from bubbling to document (which would close it)
	if (volumePopup) {
		volumePopup.addEventListener("click", function (e) {
			e.stopPropagation();
		});
		volumePopup.addEventListener("mousedown", function (e) {
			e.stopPropagation();
		});
		volumePopup.addEventListener("touchstart", function (e) {
			e.stopPropagation();
		}, { passive: true });
	}

	// Volume Button Toggles Vertical Popup
	if (mutebtn) {
		mutebtn.addEventListener("click", function (e) {
			e.stopPropagation();
			if (volumePopup) {
				volumePopup.classList.toggle("active");
			}
		});
	}

	// Quick Mute inside Vertical Popup
	if (quickMuteBtn) {
		quickMuteBtn.addEventListener("click", function (e) {
			e.stopPropagation();
			mute();
		});
	}

	// Close Volume Popup when clicking anywhere outside
	document.addEventListener("click", function (e) {
		if (volumePopup && volumePopup.classList.contains("active")) {
			if (!e.target.closest("#volume_control_wrapper")) {
				volumePopup.classList.remove("active");
			}
		}
	});

	if (seekslider) {
		// Native input & change events for instant responsiveness across all desktop and mobile browsers
		seekslider.addEventListener("input", function () {
			seeking = true;
			if (audio.duration) {
				var pct = parseFloat(this.value) / 500;
				audio.currentTime = pct * audio.duration;
				updateSyncedLyrics();
			}
		});

		seekslider.addEventListener("change", function () {
			seeking = false;
			if (audio.duration) {
				var pct = parseFloat(this.value) / 500;
				audio.currentTime = pct * audio.duration;
				updateSyncedLyrics();
			}
		});

		// Mouse events for desktop dragging
		seekslider.addEventListener("mousedown", function (event) {
			seeking = true;
			seek(event);
		});
		window.addEventListener("mousemove", function (event) {
			if (seeking) {
				seek(event);
			}
		});
		window.addEventListener("mouseup", function () {
			seeking = false;
		});

		// Touch events for mobile scrub dragging
		seekslider.addEventListener("touchstart", function (event) {
			seeking = true;
			seek(event);
		}, { passive: true });

		window.addEventListener("touchmove", function (event) {
			if (seeking) {
				seek(event);
			}
		}, { passive: true });

		window.addEventListener("touchend", function () {
			seeking = false;
		});
		window.addEventListener("touchcancel", function () {
			seeking = false;
		});
	}

	if (volumeslider) {
		volumeslider.addEventListener("input", setvolume);
		volumeslider.addEventListener("change", setvolume);
	}

	// Interactive Vertical Scrubbing on Track Wrapper
	if (volumeTrackWrap) {
		var isScrubbingVol = false;
		function handleVerticalScrub(e) {
			var rect = volumeTrackWrap.getBoundingClientRect();
			var clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
			var offsetY = rect.bottom - clientY;
			var pct = Math.max(0, Math.min(1, offsetY / rect.height));
			if (volumeslider) {
				volumeslider.value = Math.round(pct * 100);
			}
			setvolume();
		}

		volumeTrackWrap.addEventListener("mousedown", function (e) {
			isScrubbingVol = true;
			handleVerticalScrub(e);
		});
		window.addEventListener("mousemove", function (e) {
			if (isScrubbingVol) {
				handleVerticalScrub(e);
			}
		});
		window.addEventListener("mouseup", function () {
			isScrubbingVol = false;
		});

		volumeTrackWrap.addEventListener("touchstart", function (e) {
			isScrubbingVol = true;
			handleVerticalScrub(e);
		}, { passive: true });
		window.addEventListener("touchmove", function (e) {
			if (isScrubbingVol) {
				handleVerticalScrub(e);
			}
		}, { passive: true });
		window.addEventListener("touchend", function () {
			isScrubbingVol = false;
		});
	}

	audio.addEventListener("timeupdate", function () {
		seektimeupdate();
		updateSyncedLyrics();
	});
	audio.addEventListener("play", function () {
		setPlayerLyricPlayingState(true);
	});
	audio.addEventListener("pause", function () {
		setPlayerLyricPlayingState(false);
	});
	audio.addEventListener("ended", function () {
		setPlayerLyricPlayingState(false);
		switchTrack();
	});

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
				setPlayerLyricPlayingState(true);
			}).catch(function (err) {
				console.warn("Play error:", err);
			});
		} else {
			audio.pause();
			if (playbtn) playbtn.className = "play";
			setPlayerLyricPlayingState(false);
		}
		renderSongsList(playlist);
	}

	function updateVolumeUI(skipSliderInput) {
		var isMuted = audio.muted || audio.volume === 0;
		var volPct = Math.round(audio.muted ? 0 : audio.volume * 100);

		if (volumeValBadge) {
			volumeValBadge.textContent = isMuted ? "0%" : volPct + "%";
		}
		if (volumeslider && !skipSliderInput) {
			volumeslider.value = isMuted ? 0 : Math.round(audio.volume * 100);
		}
		if (mutebtn) {
			mutebtn.className = isMuted ? "mute" : "volume";
		}
		if (quickMuteBtn) {
			quickMuteBtn.innerHTML = isMuted ? '<i class="fa fa-volume-off"></i>' : '<i class="fa fa-volume-up"></i>';
		}
	}

	function mute() {
		if (audio.muted) {
			audio.muted = false;
			if (audio.volume === 0) {
				audio.volume = 0.7;
			}
		} else {
			audio.muted = true;
		}
		updateVolumeUI();
	}

	function seek(event) {
		if (!seekslider || !audio.duration) return;
		var clientX = event.clientX;
		if (event.touches && event.touches.length > 0) {
			clientX = event.touches[0].clientX;
		} else if (event.changedTouches && event.changedTouches.length > 0) {
			clientX = event.changedTouches[0].clientX;
		}
		if (clientX === undefined) {
			var pct = parseFloat(seekslider.value) / 500;
			audio.currentTime = pct * audio.duration;
			updateSyncedLyrics();
			return;
		}
		var rect = seekslider.getBoundingClientRect();
		var offsetX = clientX - rect.left;
		var pct = Math.max(0, Math.min(1, offsetX / rect.width));
		audio.currentTime = pct * audio.duration;
		seekslider.value = pct * 500;
		updateSyncedLyrics();
	}

	function setvolume() {
		if (!volumeslider) return;
		var val = parseFloat(volumeslider.value);
		if (val > 0) {
			audio.muted = false;
		} else {
			audio.muted = true;
		}
		audio.volume = Math.max(0, Math.min(1, val / 100));
		updateVolumeUI(true);
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
	window.showToast = showToast;

	// Feedback & Funding Modals
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

	// Initialize Voice Search
	initVoiceSearch(triggerSearch);

	// Initialize Favorites Listeners
	initFavoritesEvents();

	// Initialize URL Hash Deep-Linking
	setTimeout(handleUrlHashNavigation, 300);
}

function renderAlbumsList(containerOrList, maybeAlbumsList, categoryKey) {
	var targetContainer = null;
	var albumsList = null;

	if (typeof containerOrList === "string") {
		targetContainer = document.getElementById(containerOrList);
		albumsList = maybeAlbumsList;
	} else if (containerOrList && containerOrList.nodeType) {
		targetContainer = containerOrList;
		albumsList = maybeAlbumsList;
	} else {
		targetContainer = document.getElementById("songslistcon");
		albumsList = containerOrList;
	}

	if (!targetContainer) return;
	targetContainer.innerHTML = "";

	if (!albumsList || albumsList.length === 0) {
		targetContainer.innerHTML = '<div class="no-songs"><i class="fa-solid fa-compact-disc"></i> No albums found.</div>';
		return;
	}

	var isDirectGrid = targetContainer.classList.contains("cards-grid");
	var parentContainer = targetContainer;

	if (!isDirectGrid) {
		var grid = document.createElement("div");
		grid.className = "cards-grid";
		targetContainer.appendChild(grid);
		parentContainer = grid;
	}

	albumsList.forEach(function (album) {
		var card = document.createElement("div");
		card.className = "song-card album-card";

		card.innerHTML =
			'<div class="card-thumb-wrapper">' +
			'<img class="card-thumb" src="' + album.cover + '" alt="' + album.title + '" loading="lazy">' +
			'<span class="hd-badge album-badge"><i class="fa-solid fa-compact-disc"></i> ' + (album.songCount ? album.songCount + ' Songs' : 'Album') + '</span>' +
			'<div class="play-overlay">' +
			'<div class="play-btn-circle"><i class="fa fa-play"></i></div>' +
			'</div>' +
			'</div>' +
			'<div class="card-title" title="' + album.title + '">' + album.title + '</div>' +
			'<div class="card-artist" title="' + album.artists + '">' + album.artists + (album.year ? ' • ' + album.year : '') + '</div>';

		card.onclick = function () {
			openAlbumDetails(album.id);
		};

		parentContainer.appendChild(card);
	});
}

async function openAlbumDetails(albumId, autoPlay) {
	if (!albumId) return;
	switchTab("album", true);
	updateUrlHash("album", { id: albumId });

	var albumTitleEl = document.getElementById("album_hero_title");
	var albumArtistsEl = document.getElementById("album_hero_artists");
	var albumCoverEl = document.getElementById("album_hero_cover");
	var albumYearEl = document.getElementById("album_hero_year");
	var albumCountEl = document.getElementById("album_hero_count");
	var albumLangEl = document.getElementById("album_hero_lang");
	var albumSongsListEl = document.getElementById("album_songs_list");
	var albumGlowEl = document.getElementById("album_cover_glow");

	if (albumSongsListEl) {
		albumSongsListEl.innerHTML = '<div class="loading-state"><i class="fa fa-circle-o-notch fa-spin"></i> Loading album tracks...</div>';
	}

	var album = await SaavnAPI.getAlbumDetails(albumId);
	if (!album) {
		if (albumSongsListEl) {
			albumSongsListEl.innerHTML = '<div class="no-songs"><i class="fa fa-exclamation-triangle"></i> Could not load album details. Please try again.</div>';
		}
		return;
	}

	if (albumTitleEl) albumTitleEl.textContent = album.title;
	if (albumArtistsEl) albumArtistsEl.textContent = album.artists;
	if (albumCoverEl) albumCoverEl.src = album.cover;
	if (albumGlowEl) albumGlowEl.style.backgroundImage = "url('" + album.cover + "')";
	if (albumYearEl) albumYearEl.textContent = album.year || "2024";
	if (albumCountEl) albumCountEl.textContent = (album.songs ? album.songs.length : 0) + " Songs";
	if (albumLangEl) albumLangEl.textContent = album.language ? album.language.toUpperCase() : "MUSIC";

	// Render Tracklist
	if (albumSongsListEl) {
		albumSongsListEl.innerHTML = "";
		if (!album.songs || album.songs.length === 0) {
			albumSongsListEl.innerHTML = '<div class="no-songs">No songs found in this album.</div>';
			return;
		}

		album.songs.forEach(function (song, idx) {
			var trackRow = document.createElement("div");
			trackRow.className = "album-track-row";
			var isActive = (playlist === album.songs && playlist_index === idx);
			if (isActive) trackRow.classList.add("active");

			var isFav = (typeof FavoritesManager !== "undefined") && FavoritesManager.isFavorite(song);
			var favIconClass = isFav ? "fa fa-heart" : "fa fa-heart-o";
			var favActiveClass = isFav ? " active" : "";

			trackRow.innerHTML =
				'<div class="track-left-group">' +
				'<div class="track-index">' + (idx + 1) + '</div>' +
				'<img class="track-row-thumb" src="' + (song.cover || album.cover) + '" alt="' + song.title + '">' +
				'<div class="track-row-info">' +
				'<div class="track-row-title">' + song.title + '</div>' +
				'<div class="track-row-artist">' + song.artist + '</div>' +
				'</div>' +
				'</div>' +
				'<div class="track-right-group">' +
				'<span class="track-duration">' + (song.durationStr || '3:30') + '</span>' +
				'<button class="row-fav-btn' + favActiveClass + '" data-fav-song-title="' + song.title.replace(/"/g, '&quot;') + '" data-fav-song-artist="' + (song.artist || '').replace(/"/g, '&quot;') + '" title="' + (isFav ? 'Remove from Favorites' : 'Add to Favorites') + '"><i class="' + favIconClass + '"></i></button>' +
				'<button class="track-play-btn" title="Play Track"><i class="fa fa-play"></i></button>' +
				'</div>';

			var favBtn = trackRow.querySelector(".row-fav-btn");
			if (favBtn) {
				favBtn.onclick = function (e) {
					e.stopPropagation();
					if (typeof FavoritesManager !== "undefined") {
						FavoritesManager.toggleFavorite(song);
					}
				};
			}

			trackRow.onclick = function () {
				playlist = album.songs;
				playTrackAtIndex(idx);
				updateAlbumActiveTrack(idx);
			};

			albumSongsListEl.appendChild(trackRow);
		});
	}

	// Play All & Shuffle Buttons
	var playAllBtn = document.getElementById("album_play_all_btn");
	if (playAllBtn) {
		playAllBtn.onclick = function () {
			if (album.songs && album.songs.length > 0) {
				playlist = album.songs;
				playTrackAtIndex(0);
				updateAlbumActiveTrack(0);
			}
		};
	}

	var shuffleBtn = document.getElementById("album_shuffle_btn");
	if (shuffleBtn) {
		shuffleBtn.onclick = function () {
			if (album.songs && album.songs.length > 0) {
				var shuffled = album.songs.slice().sort(function () { return 0.5 - Math.random(); });
				playlist = shuffled;
				playTrackAtIndex(0);
				showToast("🔀 Shuffled & playing " + album.title);
			}
		};
	}

	var shareAlbumBtn = document.getElementById("share_album_btn");
	if (shareAlbumBtn) {
		shareAlbumBtn.onclick = function () {
			var shareUrl = window.location.origin + window.location.pathname + "#album?id=" + encodeURIComponent(albumId);
			if (navigator.share) {
				navigator.share({
					title: album.title + " - Sangeetham Music",
					text: "Listen to " + album.title + " on Sangeetham AI Music Player",
					url: shareUrl
				}).catch(function () { });
			} else {
				navigator.clipboard.writeText(shareUrl).then(function () {
					showToast("🔗 Album link copied to clipboard!");
				}).catch(function () {
					showToast("Album Link: " + shareUrl);
				});
			}
		};
	}

	if (autoPlay && album.songs && album.songs.length > 0) {
		playlist = album.songs;
		playTrackAtIndex(0);
	}
}

function updateAlbumActiveTrack(index) {
	var rows = document.querySelectorAll(".album-track-row");
	rows.forEach(function (r, idx) {
		r.classList.toggle("active", idx === index);
	});
}

function updateUrlHash(tabName, params) {
	var hash = "#" + tabName;
	if (params) {
		var queryParts = [];
		for (var k in params) {
			if (params[k]) {
				queryParts.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
			}
		}
		if (queryParts.length > 0) {
			hash += "?" + queryParts.join("&");
		}
	}
	history.replaceState(null, "", hash);
}

function shareCurrentLyrics() {
	var currentSong = playlist && playlist[playlist_index];
	if (!currentSong) {
		showToast("Select or play a song to share its lyrics!");
		return;
	}
	var shareUrl = window.location.origin + window.location.pathname + "#lyrics?song=" + encodeURIComponent(currentSong.title) + "&artist=" + encodeURIComponent(currentSong.artist);

	if (navigator.share) {
		navigator.share({
			title: currentSong.title + " - Live Lyrics | Sangeetham",
			text: "Check out the live synced lyrics for \"" + currentSong.title + "\" on Sangeetham Music Player!",
			url: shareUrl
		}).catch(function () { });
	} else {
		navigator.clipboard.writeText(shareUrl).then(function () {
			showToast("🔗 Live Lyrics link copied to clipboard!");
		}).catch(function () {
			showToast("Lyrics link: " + shareUrl);
		});
	}
}

async function handleUrlHashNavigation() {
	var hash = window.location.hash.substring(1);
	if (!hash) return;

	var parts = hash.split("?");
	var route = parts[0];
	var queryStr = parts[1] || "";
	var params = {};

	if (queryStr) {
		queryStr.split("&").forEach(function (pair) {
			var p = pair.split("=");
			if (p[0]) {
				params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
			}
		});
	}

	if (route === "album" && params.id) {
		openAlbumDetails(params.id, false);
	} else if (route === "lyrics") {
		switchTab("lyrics", true);
		if (params.song) {
			var currentSong = playlist && playlist[playlist_index];
			if (!currentSong || currentSong.title.toLowerCase() !== params.song.toLowerCase()) {
				var query = params.song + (params.artist ? " " + params.artist : "");
				var searchResults = await SaavnAPI.searchSongs(query, 1, 5);
				if (searchResults.length > 0) {
					playDirectSong(searchResults[0]);
				}
			} else {
				loadLyricsForCurrentSong();
			}
		} else {
			loadLyricsForCurrentSong();
		}
	} else if (route === "search") {
		switchTab("search", true);
		if (params.q) {
			var songSearch = document.getElementById("song_search");
			if (songSearch) songSearch.value = params.q;
			var triggerFn = window.triggerSearchGlobal;
			if (typeof triggerFn === "function") triggerFn(params.q);
		}
	} else if (["home", "favorites", "ai_chat", "motivational", "deep_focus", "latest"].indexOf(route) !== -1) {
		switchTab(route, true);
	}
}

window.addEventListener("hashchange", handleUrlHashNavigation);

function playDirectSong(song) {
	if (!song) return;
	var foundIdx = -1;
	for (var i = 0; i < playlist.length; i++) {
		if (playlist[i].file === song.file || (playlist[i].title === song.title && playlist[i].artist === song.artist)) {
			foundIdx = i;
			break;
		}
	}
	if (foundIdx !== -1) {
		playTrackAtIndex(foundIdx);
	} else {
		playlist.unshift(song);
		renderSongsList(playlist);
		playTrackAtIndex(0);
	}
	showToast("▶ Playing: " + song.title);
}

function initVoiceSearch(triggerSearchFn) {
	var voiceBtn = document.getElementById("voice_search_btn");
	var voiceModal = document.getElementById("voice_search_modal");
	var closeVoiceBtn = document.getElementById("close_voice_modal");
	var transcriptEl = document.getElementById("voice_transcript");
	var statusHeading = document.getElementById("voice_status_heading");

	var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
	var recognition = null;
	var isListening = false;

	if (SpeechRecognition) {
		recognition = new SpeechRecognition();
		recognition.continuous = false;
		recognition.interimResults = true;
		recognition.lang = "en-IN";

		recognition.onstart = function () {
			isListening = true;
			if (voiceModal) voiceModal.classList.add("active");
			if (statusHeading) statusHeading.textContent = "Listening...";
			if (transcriptEl) transcriptEl.textContent = "Speak clearly into your microphone...";
		};

		recognition.onresult = function (event) {
			var interimTranscript = "";
			var finalTranscript = "";

			for (var i = event.resultIndex; i < event.results.length; ++i) {
				if (event.results[i].isFinal) {
					finalTranscript += event.results[i][0].transcript;
				} else {
					interimTranscript += event.results[i][0].transcript;
				}
			}

			var currentText = finalTranscript || interimTranscript;
			if (transcriptEl && currentText) {
				transcriptEl.textContent = '"' + currentText + '"';
			}

			if (finalTranscript) {
				processVoiceQuery(finalTranscript.trim());
			}
		};

		recognition.onerror = function (event) {
			console.warn("Speech recognition error:", event.error);
			isListening = false;
			if (statusHeading) statusHeading.textContent = "Didn't catch that";
			if (transcriptEl) transcriptEl.textContent = "Tap the mic to try again, or type in search box.";
		};

		recognition.onend = function () {
			isListening = false;
		};
	}

	function startVoiceSearch() {
		if (!recognition) {
			showToast("Voice search is not supported in this browser. Please type to search.");
			return;
		}
		try {
			recognition.start();
		} catch (err) {
			console.warn("Recognition start error:", err);
		}
	}

	function stopVoiceSearch() {
		if (recognition && isListening) {
			try { recognition.stop(); } catch (e) { }
		}
		if (voiceModal) voiceModal.classList.remove("active");
	}

	function processVoiceQuery(query) {
		if (!query) return;
		var clean = query.replace(/^(play|search for|find|listen to)\s+/i, "").trim();
		setTimeout(function () {
			stopVoiceSearch();
			switchTab("search");
			var songSearch = document.getElementById("song_search");
			if (songSearch) songSearch.value = clean || query;
			if (typeof triggerSearchFn === "function") {
				triggerSearchFn(clean || query);
			}
			showToast("🎤 Searching for: " + (clean || query));
		}, 600);
	}

	if (voiceBtn) {
		voiceBtn.addEventListener("click", function () {
			startVoiceSearch();
		});
	}

	if (closeVoiceBtn) {
		closeVoiceBtn.addEventListener("click", function () {
			stopVoiceSearch();
		});
	}

	if (voiceModal) {
		voiceModal.addEventListener("click", function (e) {
			if (e.target === voiceModal) {
				stopVoiceSearch();
			}
		});
	}

	var voiceChips = document.querySelectorAll(".voice-hint-chip");
	voiceChips.forEach(function (chip) {
		chip.addEventListener("click", function () {
			var sampleQuery = this.getAttribute("data-speak");
			processVoiceQuery(sampleQuery);
		});
	});
}

window.addEventListener("load", initAudioPlayer);
