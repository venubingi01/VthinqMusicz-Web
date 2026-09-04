// Copyright (c) 2026 Vthinq. All rights reserved.
// Developer name : Venu Bingi
// This AI Music Player use JioSaavn Open Source API for music streaming.

var topCharts = [
	"SP Balasubramanyam telugu hits",
	"HSK 50 Most Popular Hindi Songs",
	"Trending today",
	"Random picks",
	"K. S. Chithra telugu hits"
];

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
		var quality = "320kbps";
		var isHD = true;
		if (encUrl) {
			var dec = this.decryptMediaUrl(encUrl);
			if (dec) {
				var u320 = dec.replace("_96.mp4", "_320.mp4").replace("_96.m4a", "_320.mp4").replace("_96_p.mp4", "_320.mp4").replace("_160.mp4", "_320.mp4").replace("_160.m4a", "_320.mp4");
				var u160 = dec.replace("_96.mp4", "_160.mp4").replace("_96.m4a", "_160.mp4").replace("_96_p.mp4", "_160.mp4").replace("_320.mp4", "_160.mp4").replace("_320.m4a", "_160.mp4");
				var u96 = dec;

				var userQualityPref = (typeof localStorage !== "undefined" && localStorage.getItem("sangeetham_stream_quality")) || "320";
				if (userQualityPref === "160") {
					mainUrl = u160;
					fallbacks.push(u320, u96);
					quality = "160kbps";
					isHD = false;
				} else {
					mainUrl = u320;
					fallbacks.push(u160, u96);
					quality = "320kbps";
					isHD = true;
				}
			}
		}

		// 2. Secondary: Process downloadUrl array (filter & upgrade 12kbps links)
		// NOTE: API changed field name from 'link' to 'url' — check both for compatibility
		if (Array.isArray(raw.downloadUrl) && raw.downloadUrl.length > 0) {
			var validDownloads = raw.downloadUrl
				.map(function (dl) { return dl.url ? sanitizeUrl(dl.url) : (dl.link ? sanitizeUrl(dl.link) : null); })
				.filter(Boolean);

			var userQualityPref = (typeof localStorage !== "undefined" && localStorage.getItem("sangeetham_stream_quality")) || "320";
			var targetQuality = userQualityPref === "160" ? "160kbps" : "320kbps";

			if (!mainUrl) {
				var preferred = null;
				raw.downloadUrl.forEach(function (dl) {
					var q = dl.quality || '';
					if (q === targetQuality) {
						var u = sanitizeUrl(dl.url || dl.link);
						if (u && !preferred) { preferred = u; quality = q; }
					}
				});

				if (!preferred) {
					raw.downloadUrl.forEach(function (dl) {
						var q = dl.quality || '';
						if (q === '320kbps' || q === '160kbps') {
							var u = sanitizeUrl(dl.url || dl.link);
							if (u && !preferred) { preferred = u; quality = q; }
						}
					});
				}

				mainUrl = preferred || validDownloads[validDownloads.length - 1] || null;
				isHD = (quality === "320kbps" || (mainUrl && mainUrl.indexOf('_320') !== -1));
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
			quality: quality || (mainUrl && mainUrl.indexOf('_320') !== -1 ? '320kbps' : '160kbps'),
			isHD: isHD || (mainUrl && mainUrl.indexOf('_320') !== -1),
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
	},

	normalizePlaylist: function (raw) {
		if (!raw) return null;
		var id = raw.id || raw.listid || "";
		var title = decodeHTMLEntities(raw.name || raw.title || raw.listname || "Top Chart");
		var songCount = raw.songCount || raw.count || raw.song_count || raw.list_count || (raw.songs ? raw.songs.length : 0) || "";
		var language = raw.language || "";
		var artists = raw.artists ? (Array.isArray(raw.artists) ? raw.artists.map(function (a) { return a.name; }).join(", ") : (raw.artists.primary ? raw.artists.primary.map(function (a) { return a.name; }).join(", ") : "")) : "";
		var description = decodeHTMLEntities(raw.description || (raw.subtitle_desc ? raw.subtitle_desc.join(" • ") : "") || "");
		if (!artists && language) {
			artists = language.charAt(0).toUpperCase() + language.slice(1) + (songCount ? " • " + songCount + " Songs" : " • Top Charts");
		} else if (!artists) {
			artists = songCount ? songCount + " Songs • Top Charts" : "Top Charts Playlist";
		}

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
			description: description,
			songCount: songCount,
			language: language,
			cover: coverUrl,
			type: "playlist",
			raw: raw
		};
	},

	searchPlaylists: async function (query, page, limit) {
		page = page || 1;
		limit = limit || 15;
		var self = this;
		var endpoints = [
			self.primaryApiUrl + "/search/playlists?query=" + encodeURIComponent(query) + "&page=" + page + "&limit=" + limit,
			self.secondaryFallbackApiUrl + "/search/playlists?query=" + encodeURIComponent(query) + "&page=" + page + "&limit=" + limit,
			self.fallbackApiUrl + "/search/playlists?query=" + encodeURIComponent(query) + "&page=" + page + "&limit=" + limit,
			"https://www.jiosaavn.com/api.php?__call=search.getPlaylistResults&_format=json&_marker=0&p=" + page + "&n=" + limit + "&q=" + encodeURIComponent(query)
		];

		for (var i = 0; i < endpoints.length; i++) {
			try {
				var res = await fetch(endpoints[i]);
				if (res.ok) {
					var data = await res.json();
					var list = (data.data && data.data.results) || data.results || data.data || [];
					if (Array.isArray(list) && list.length > 0) {
						return list.map(function (item) { return self.normalizePlaylist(item); }).filter(Boolean);
					}
				}
			} catch (err) {
				console.warn("searchPlaylists endpoint error:", endpoints[i], err);
			}
		}
		return [];
	},

	getPlaylistDetails: async function (playlistId, limit) {
		if (!playlistId) return null;
		limit = limit || 50;
		var self = this;
		var endpoints = [
			self.primaryApiUrl + "/playlists?id=" + encodeURIComponent(playlistId) + "&limit=" + limit,
			self.secondaryFallbackApiUrl + "/playlists?id=" + encodeURIComponent(playlistId) + "&limit=" + limit,
			self.fallbackApiUrl + "/playlists?id=" + encodeURIComponent(playlistId) + "&limit=" + limit,
			"https://www.jiosaavn.com/api.php?__call=playlist.getDetails&_format=json&listid=" + encodeURIComponent(playlistId)
		];

		for (var i = 0; i < endpoints.length; i++) {
			try {
				var res = await fetch(endpoints[i]);
				if (res.ok) {
					var data = await res.json();
					var playlistData = data.data || data;
					if (playlistData && (playlistData.name || playlistData.title || playlistData.listname)) {
						var rawSongs = playlistData.songs || playlistData.list || [];
						if (Array.isArray(rawSongs) && rawSongs.length > 0) {
							var normalized = self.normalizePlaylist(playlistData);
							normalized.songs = rawSongs.map(function (s) { return self.normalizeSong(s); }).filter(Boolean);
							return normalized;
						}
					}
				}
			} catch (err) {
				console.warn("getPlaylistDetails endpoint error:", endpoints[i], err);
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
window.audio = audio;
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
var previousTabBeforeDetails = "home";
var homeFeeds = {
	latest: [],
	motivational: [],
	top_charts: [],
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

// ==========================================================================
// Audio FX Engine: Multi-Band Equalizer & 3D Spatial Audio Engine
// ==========================================================================
var AudioFXEngine = {
	STORAGE_KEY: "sangeetham_audio_fx_v2",

	// 7-Band Equalizer Configuration
	bandsConfig: [
		{ freq: 60, type: "lowshelf", label: "60Hz" },
		{ freq: 170, type: "peaking", label: "170Hz", q: 1.2 },
		{ freq: 350, type: "peaking", label: "350Hz", q: 1.2 },
		{ freq: 1000, type: "peaking", label: "1kHz", q: 1.2 },
		{ freq: 3500, type: "peaking", label: "3.5kHz", q: 1.2 },
		{ freq: 10000, type: "peaking", label: "10kHz", q: 1.2 },
		{ freq: 14000, type: "highshelf", label: "14kHz" }
	],

	// Presets for 7 bands + preamp dB
	presets: {
		flat: { name: "Flat", gains: [0, 0, 0, 0, 0, 0, 0], preamp: 0 },
		bass_boost: { name: "Bass Booster", gains: [7, 6, 3, 0, 0, 0, 0], preamp: -1 },
		bass_reduce: { name: "Bass Reducer", gains: [-7, -5, -3, 0, 0, 0, 0], preamp: 1 },
		treble_boost: { name: "Treble Booster", gains: [0, 0, 0, 2, 4, 7, 8], preamp: -1 },
		vocal_boost: { name: "Vocal Booster", gains: [-2, -1, 2, 6, 5, 2, 0], preamp: 0 },
		rock: { name: "Rock", gains: [5, 4, -1, 1, 4, 6, 6], preamp: 0 },
		pop: { name: "Pop", gains: [-1, 2, 5, 5, 3, -1, 2], preamp: 0 },
		jazz: { name: "Jazz", gains: [3, 3, 1, 3, 1, 2, 3], preamp: 0 },
		electronic: { name: "Electronic / EDM", gains: [6, 5, 0, -2, 3, 5, 6], preamp: -1 },
		classical: { name: "Classical", gains: [4, 3, 2, 2, -1, 3, 4], preamp: 0 },
		acoustic: { name: "Acoustic", gains: [3, 2, 1, 2, 4, 4, 3], preamp: 0 },
		hiphop: { name: "Hip Hop", gains: [7, 6, 1, 2, -1, 3, 4], preamp: -1 },
		cinema: { name: "Dolby Cinema", gains: [6, 4, 1, 3, 5, 6, 7], preamp: -1 },
		deep: { name: "Deep Lounge", gains: [5, 4, 2, 0, -2, -3, -4], preamp: 0 },
		custom: { name: "Custom", gains: [0, 0, 0, 0, 0, 0, 0], preamp: 0 }
	},

	// State
	state: {
		eqEnabled: true,
		currentPreset: "flat",
		preamp: 0,
		gains: [0, 0, 0, 0, 0, 0, 0],

		spatialEnabled: false,
		spatialMode: "orbit", // 'orbit' | 'wide' | 'hall' | 'cinema' | 'vocal'
		autoOrbit: true,
		orbitSpeed: 1.0,
		soundstageWidth: 120, // 0 - 200%
		reverbSize: 35, // 0 - 100%
		subBass: 3, // 0 - 10 dB

		radarAngle: 0, // degrees (0 = Front)
		radarDist: 1.5 // meters (0.4 to 2.5)
	},

	// Audio Nodes
	ctx: null,
	nodes: {
		source: null,
		preampGain: null,
		filters: [],

		// Spatial Subgraph
		spatialInput: null,
		spatialDryGain: null,
		spatialOutputGain: null,

		// 3D Panner
		pannerNode: null,
		pannerGain: null,

		// Wide Stereo Branch
		splitter: null,
		merger: null,
		haasL: null,
		haasR: null,
		crossGainL: null,
		crossGainR: null,
		wideGain: null,

		// Reverb Branch
		convolver: null,
		reverbWetGain: null,

		// Sub-Bass Branch
		subBassFilter: null,
		subBassGain: null
	},

	// Animation frame IDs
	orbitAnimId: null,
	lastOrbitTimestamp: 0,
	isDraggingRadar: false,

	init: function (audioCtx, sourceNode, analyserNode) {
		if (!audioCtx || !sourceNode) return;
		this.ctx = audioCtx;
		this.nodes.source = sourceNode;

		try {
			this.loadSettings();
			this.buildAudioGraph(analyserNode);
			this.applyEQ();
			this.applySpatial();
			this.initRadarCanvas();
			this.initEQCanvas();
			this.startOrbitLoop();
			this.updateActiveIndicators();
		} catch (e) {
			console.warn("[AudioFXEngine] Error during init:", e);
			try {
				sourceNode.connect(analyserNode);
				analyserNode.connect(audioCtx.destination);
			} catch (err) { }
		}
	},

	buildAudioGraph: function (analyserNode) {
		var ctx = this.ctx;
		var src = this.nodes.source;

		// 1. Equalizer Preamp & Filter Chain
		this.nodes.preampGain = ctx.createGain();
		var lastNode = this.nodes.preampGain;
		src.connect(lastNode);

		this.nodes.filters = [];
		for (var i = 0; i < this.bandsConfig.length; i++) {
			var conf = this.bandsConfig[i];
			var filter = ctx.createBiquadFilter();
			filter.type = conf.type;
			filter.frequency.value = conf.freq;
			if (conf.q) filter.Q.value = conf.q;
			filter.gain.value = 0;

			lastNode.connect(filter);
			lastNode = filter;
			this.nodes.filters.push(filter);
		}

		// 2. Spatial Audio Hub
		this.nodes.spatialInput = ctx.createGain();
		lastNode.connect(this.nodes.spatialInput);

		this.nodes.spatialDryGain = ctx.createGain();
		this.nodes.spatialOutputGain = ctx.createGain();
		this.nodes.spatialInput.connect(this.nodes.spatialDryGain);
		this.nodes.spatialDryGain.connect(this.nodes.spatialOutputGain);

		// 3. 3D HRTF Panner Node
		try {
			if (ctx.createPanner) {
				var panner = ctx.createPanner();
				panner.panningModel = 'HRTF';
				panner.distanceModel = 'inverse';
				panner.refDistance = 1;
				panner.maxDistance = 10000;
				panner.rolloffFactor = 1;
				panner.coneInnerAngle = 360;
				this.nodes.pannerNode = panner;

				this.nodes.pannerGain = ctx.createGain();
				this.nodes.spatialInput.connect(panner);
				panner.connect(this.nodes.pannerGain);
				this.nodes.pannerGain.connect(this.nodes.spatialOutputGain);
			}
		} catch (e) {
			console.warn("[AudioFX] Panner HRTF fallback:", e);
		}

		// 4. Holographic Wide Soundstage Branch (Binaural Cross-Feed & Haas Micro-delay)
		try {
			this.nodes.splitter = ctx.createChannelSplitter(2);
			this.nodes.merger = ctx.createChannelMerger(2);

			this.nodes.haasL = ctx.createDelay();
			this.nodes.haasR = ctx.createDelay();
			this.nodes.haasL.delayTime.value = 0.018; // 18ms Haas effect
			this.nodes.haasR.delayTime.value = 0.018;

			this.nodes.crossGainL = ctx.createGain();
			this.nodes.crossGainR = ctx.createGain();
			this.nodes.crossGainL.gain.value = -0.35; // Inverted out-of-phase crossfeed
			this.nodes.crossGainR.gain.value = -0.35;

			this.nodes.wideGain = ctx.createGain();

			this.nodes.spatialInput.connect(this.nodes.splitter);

			// Direct L/R to merger
			this.nodes.splitter.connect(this.nodes.merger, 0, 0);
			this.nodes.splitter.connect(this.nodes.merger, 1, 1);

			// Cross-feed L -> delay -> gain -> R
			this.nodes.splitter.connect(this.nodes.haasL, 0);
			this.nodes.haasL.connect(this.nodes.crossGainL);
			this.nodes.crossGainL.connect(this.nodes.merger, 0, 1);

			// Cross-feed R -> delay -> gain -> L
			this.nodes.splitter.connect(this.nodes.haasR, 1);
			this.nodes.haasR.connect(this.nodes.crossGainR);
			this.nodes.crossGainR.connect(this.nodes.merger, 0, 0);

			this.nodes.merger.connect(this.nodes.wideGain);
			this.nodes.wideGain.connect(this.nodes.spatialOutputGain);
		} catch (e) {
			console.warn("[AudioFX] Wide stereo setup notice:", e);
		}

		// 5. Concert Hall Synthetic Reverb Branch
		try {
			this.nodes.convolver = ctx.createConvolver();
			this.nodes.convolver.buffer = this.generateImpulseResponse(2.4, 2.2);
			this.nodes.reverbWetGain = ctx.createGain();

			this.nodes.spatialInput.connect(this.nodes.convolver);
			this.nodes.convolver.connect(this.nodes.reverbWetGain);
			this.nodes.reverbWetGain.connect(this.nodes.spatialOutputGain);
		} catch (e) {
			console.warn("[AudioFX] Convolver setup notice:", e);
		}

		// 6. Sub-Bass Immersion Filter
		try {
			this.nodes.subBassFilter = ctx.createBiquadFilter();
			this.nodes.subBassFilter.type = "lowpass";
			this.nodes.subBassFilter.frequency.value = 90;
			this.nodes.subBassFilter.Q.value = 2.0;

			this.nodes.subBassGain = ctx.createGain();
			this.nodes.spatialInput.connect(this.nodes.subBassFilter);
			this.nodes.subBassFilter.connect(this.nodes.subBassGain);
			this.nodes.subBassGain.connect(this.nodes.spatialOutputGain);
		} catch (e) {
			console.warn("[AudioFX] Sub-bass setup notice:", e);
		}

		// 7. Connect Master FX Output to Analyser -> Destination
		this.nodes.spatialOutputGain.connect(analyserNode);
		analyserNode.connect(ctx.destination);
	},

	generateImpulseResponse: function (duration, decay) {
		var ctx = this.ctx;
		var sampleRate = ctx.sampleRate;
		var length = Math.floor(sampleRate * (duration || 2.0));
		var impulse = ctx.createBuffer(2, length, sampleRate);
		var left = impulse.getChannelData(0);
		var right = impulse.getChannelData(1);
		decay = decay || 2.0;

		for (var i = 0; i < length; i++) {
			var factor = Math.pow(1 - i / length, decay);
			var earlyReflect = (i < sampleRate * 0.06 && i % 400 === 0) ? 0.4 : 0;
			left[i] = ((Math.random() * 2 - 1) * factor + earlyReflect * factor);
			right[i] = ((Math.random() * 2 - 1) * factor + earlyReflect * factor);
		}
		return impulse;
	},

	// ==========================================
	// Equalizer Control Methods
	// ==========================================
	setBandGain: function (bandIdx, gainDb) {
		gainDb = parseFloat(gainDb) || 0;
		if (bandIdx >= 0 && bandIdx < this.state.gains.length) {
			this.state.gains[bandIdx] = gainDb;
			this.state.currentPreset = "custom";
			this.applyEQ();
			this.updateEQUI();
			this.saveSettings();
		}
	},

	setPreamp: function (gainDb) {
		gainDb = parseFloat(gainDb) || 0;
		this.state.preamp = gainDb;
		this.applyEQ();
		this.updateEQUI();
		this.saveSettings();
	},

	setPreset: function (presetKey) {
		var preset = this.presets[presetKey];
		if (!preset) return;
		this.state.currentPreset = presetKey;
		this.state.gains = preset.gains.slice();
		this.state.preamp = preset.preamp || 0;
		this.applyEQ();
		this.updateEQUI();
		this.saveSettings();
	},

	toggleEQ: function (enabled) {
		this.state.eqEnabled = typeof enabled === "boolean" ? enabled : !this.state.eqEnabled;
		this.applyEQ();
		this.updateEQUI();
		this.saveSettings();
		this.updateActiveIndicators();
	},

	resetEQ: function () {
		this.setPreset("flat");
	},

	applyEQ: function () {
		if (!this.ctx || !this.nodes.preampGain) return;
		var now = this.ctx.currentTime;
		var isEnabled = this.state.eqEnabled;

		// Preamp Gain (dB to linear)
		var preampGainVal = isEnabled ? Math.pow(10, this.state.preamp / 20) : 1.0;
		if (this.nodes.preampGain.gain.setTargetAtTime) {
			this.nodes.preampGain.gain.setTargetAtTime(preampGainVal, now, 0.04);
		} else {
			this.nodes.preampGain.gain.value = preampGainVal;
		}

		// Filter Bands
		for (var i = 0; i < this.nodes.filters.length; i++) {
			var filter = this.nodes.filters[i];
			var targetGain = isEnabled ? (this.state.gains[i] || 0) : 0;
			if (filter && filter.gain) {
				if (filter.gain.setTargetAtTime) {
					filter.gain.setTargetAtTime(targetGain, now, 0.04);
				} else {
					filter.gain.value = targetGain;
				}
			}
		}

		this.drawEQCurve();
	},

	// ==========================================
	// 3D Spatial Audio Control Methods
	// ==========================================
	toggleSpatial: function (enabled) {
		this.state.spatialEnabled = typeof enabled === "boolean" ? enabled : !this.state.spatialEnabled;
		this.applySpatial();
		this.updateSpatialUI();
		this.saveSettings();
		this.updateActiveIndicators();
	},

	setSpatialMode: function (modeKey) {
		this.state.spatialMode = modeKey;
		this.applySpatial();
		this.updateSpatialUI();
		this.saveSettings();
	},

	setOrbitSpeed: function (speed) {
		this.state.orbitSpeed = Math.max(0.1, Math.min(3.0, parseFloat(speed) || 1.0));
		this.updateSpatialUI();
		this.saveSettings();
	},

	toggleAutoOrbit: function (active) {
		this.state.autoOrbit = typeof active === "boolean" ? active : !this.state.autoOrbit;
		this.updateSpatialUI();
		this.saveSettings();
	},

	setSoundstageWidth: function (widthPct) {
		this.state.soundstageWidth = Math.max(0, Math.min(200, parseFloat(widthPct) || 100));
		this.applySpatial();
		this.updateSpatialUI();
		this.saveSettings();
	},

	setReverbSize: function (reverbPct) {
		this.state.reverbSize = Math.max(0, Math.min(100, parseFloat(reverbPct) || 35));
		this.applySpatial();
		this.updateSpatialUI();
		this.saveSettings();
	},

	setSubBass: function (bassDb) {
		this.state.subBass = Math.max(0, Math.min(10, parseFloat(bassDb) || 0));
		this.applySpatial();
		this.updateSpatialUI();
		this.saveSettings();
	},

	setSoundPosition: function (angleDeg, distance) {
		this.state.radarAngle = (angleDeg % 360 + 360) % 360;
		if (typeof distance === "number") {
			this.state.radarDist = Math.max(0.4, Math.min(2.5, distance));
		}
		this.applySpatialPosition();
		this.updateRadarHUD();
	},

	applySpatial: function () {
		if (!this.ctx || !this.nodes.spatialDryGain) return;
		var now = this.ctx.currentTime;
		var isSpatial = this.state.spatialEnabled;
		var mode = this.state.spatialMode;

		var dryVal = 1.0;
		var pannerVal = 0.0;
		var wideVal = 0.0;
		var reverbVal = 0.0;
		var subBassVal = 0.0;

		if (isSpatial) {
			var widthRatio = this.state.soundstageWidth / 100;
			var reverbRatio = this.state.reverbSize / 100;
			var bassRatio = Math.pow(10, this.state.subBass / 20) - 1.0;

			if (mode === "orbit") {
				dryVal = 0.15;
				pannerVal = 0.95;
				reverbVal = 0.18 * reverbRatio;
				subBassVal = 0.25 * bassRatio;
			} else if (mode === "wide") {
				dryVal = 0.25;
				wideVal = 0.85 * widthRatio;
				reverbVal = 0.12 * reverbRatio;
				subBassVal = 0.3 * bassRatio;
			} else if (mode === "hall") {
				dryVal = 0.45;
				reverbVal = 0.65 * reverbRatio;
				wideVal = 0.4 * widthRatio;
				subBassVal = 0.3 * bassRatio;
			} else if (mode === "cinema") {
				dryVal = 0.4;
				wideVal = 0.6 * widthRatio;
				reverbVal = 0.3 * reverbRatio;
				subBassVal = 0.75 * Math.max(0.3, bassRatio);
			} else if (mode === "vocal") {
				dryVal = 0.6;
				wideVal = 0.5 * widthRatio;
				reverbVal = 0.15 * reverbRatio;
				subBassVal = 0.1 * bassRatio;
			}
		}

		var setGain = function (node, val) {
			if (!node) return;
			if (node.gain.setTargetAtTime) {
				node.gain.setTargetAtTime(val, now, 0.05);
			} else {
				node.gain.value = val;
			}
		};

		setGain(this.nodes.spatialDryGain, dryVal);
		setGain(this.nodes.pannerGain, pannerVal);
		setGain(this.nodes.wideGain, wideVal);
		setGain(this.nodes.reverbWetGain, reverbVal);
		setGain(this.nodes.subBassGain, subBassVal);

		this.applySpatialPosition();
	},

	applySpatialPosition: function () {
		if (!this.ctx || !this.nodes.pannerNode) return;
		var panner = this.nodes.pannerNode;
		var rad = (this.state.radarAngle - 90) * (Math.PI / 180);
		var dist = this.state.radarDist;

		var x = Math.cos(rad) * dist;
		var y = 0;
		var z = Math.sin(rad) * dist;

		var now = this.ctx.currentTime;
		if (panner.positionX && panner.positionX.setTargetAtTime) {
			panner.positionX.setTargetAtTime(x, now, 0.04);
			panner.positionY.setTargetAtTime(y, now, 0.04);
			panner.positionZ.setTargetAtTime(z, now, 0.04);
		} else if (panner.setPosition) {
			panner.setPosition(x, y, z);
		}
	},

	resetSpatial: function () {
		this.state.spatialMode = "orbit";
		this.state.autoOrbit = true;
		this.state.orbitSpeed = 1.0;
		this.state.soundstageWidth = 120;
		this.state.reverbSize = 35;
		this.state.subBass = 3;
		this.state.radarAngle = 0;
		this.state.radarDist = 1.5;
		this.applySpatial();
		this.updateSpatialUI();
		this.saveSettings();
	},

	// ==========================================
	// UI Updating & Synchronization
	// ==========================================
	updateEQUI: function () {
		var isEqOn = this.state.eqEnabled;
		var toggle = document.getElementById("eq_enable_toggle");
		if (toggle) toggle.checked = isEqOn;

		var presetSelect = document.getElementById("eq_preset_select");
		if (presetSelect) presetSelect.value = this.state.currentPreset;

		var activeBadge = document.getElementById("eq_active_preset_name");
		if (activeBadge) {
			var p = this.presets[this.state.currentPreset];
			activeBadge.textContent = p ? p.name : "Custom";
		}

		// Chips active class
		var chips = document.querySelectorAll("#eq_quick_chips .eq-chip");
		chips.forEach(function (chip) {
			var isMatch = chip.getAttribute("data-preset") === AudioFXEngine.state.currentPreset;
			chip.classList.toggle("active", isMatch);
		});

		// Preamp slider
		var preampSlider = document.getElementById("eq_band_preamp");
		var preampVal = document.getElementById("val_preamp");
		if (preampSlider) preampSlider.value = this.state.preamp;
		if (preampVal) preampVal.textContent = (this.state.preamp > 0 ? "+" : "") + this.state.preamp + "dB";

		// Band sliders
		for (var i = 0; i < this.state.gains.length; i++) {
			var slider = document.getElementById("eq_band_" + i);
			var valBox = document.getElementById("val_band_" + i);
			var g = this.state.gains[i] || 0;
			if (slider) slider.value = g;
			if (valBox) valBox.textContent = (g > 0 ? "+" : "") + g + "dB";
		}

		this.drawEQCurve();
	},

	updateSpatialUI: function () {
		var isSpatial = this.state.spatialEnabled;
		var toggle = document.getElementById("spatial_enable_toggle");
		if (toggle) toggle.checked = isSpatial;

		var statusBadge = document.getElementById("spatial_status_badge");
		if (statusBadge) {
			if (!isSpatial) {
				statusBadge.textContent = "Stereo Direct";
				statusBadge.classList.remove("active-fx");
			} else {
				var modeNames = {
					orbit: "360° Spatial Orbit 🪐",
					wide: "Holographic Wide 3D 🎧",
					hall: "Concert Hall 3D 🏛️",
					cinema: "Dolby Cinema 🎬",
					vocal: "Vocal Stage 🎙️"
				};
				statusBadge.textContent = modeNames[this.state.spatialMode] || "3D Spatial ON";
				statusBadge.classList.add("active-fx");
			}
		}

		// Mode cards
		var cards = document.querySelectorAll("#spatial_modes_grid .spatial-mode-card");
		cards.forEach(function (card) {
			var isMatch = card.getAttribute("data-mode") === AudioFXEngine.state.spatialMode;
			card.classList.toggle("active", isMatch);
		});

		// Controls
		var orbitSpeedSlider = document.getElementById("spatial_orbit_speed");
		var orbitSpeedVal = document.getElementById("spatial_orbit_speed_val");
		if (orbitSpeedSlider) orbitSpeedSlider.value = this.state.orbitSpeed;
		if (orbitSpeedVal) orbitSpeedVal.textContent = this.state.orbitSpeed.toFixed(1) + "x";

		var orbitToggleBtn = document.getElementById("spatial_orbit_toggle_btn");
		if (orbitToggleBtn) {
			orbitToggleBtn.classList.toggle("active", this.state.autoOrbit);
			orbitToggleBtn.innerHTML = this.state.autoOrbit
				? '<i class="fa-solid fa-circle-play"></i> Auto Orbit'
				: '<i class="fa-solid fa-circle-pause"></i> Paused';
		}

		var widthSlider = document.getElementById("spatial_width_slider");
		var widthVal = document.getElementById("spatial_width_val");
		if (widthSlider) widthSlider.value = this.state.soundstageWidth;
		if (widthVal) widthVal.textContent = Math.round(this.state.soundstageWidth) + "%";

		var reverbSlider = document.getElementById("spatial_reverb_slider");
		var reverbVal = document.getElementById("spatial_reverb_val");
		if (reverbSlider) reverbSlider.value = this.state.reverbSize;
		if (reverbVal) reverbVal.textContent = Math.round(this.state.reverbSize) + "%";

		var bassSlider = document.getElementById("spatial_bass_slider");
		var bassVal = document.getElementById("spatial_bass_val");
		if (bassSlider) bassSlider.value = this.state.subBass;
		if (bassVal) bassVal.textContent = "+" + this.state.subBass + " dB";

		this.updateRadarHUD();
	},

	updateRadarHUD: function () {
		var angleEl = document.getElementById("radar_angle_val");
		var distEl = document.getElementById("radar_dist_val");
		var deg = Math.round(this.state.radarAngle);

		var dirStr = "Front";
		if (deg >= 25 && deg < 65) dirStr = "Front Right";
		else if (deg >= 65 && deg < 115) dirStr = "Right";
		else if (deg >= 115 && deg < 155) dirStr = "Rear Right";
		else if (deg >= 155 && deg < 205) dirStr = "Rear";
		else if (deg >= 205 && deg < 245) dirStr = "Rear Left";
		else if (deg >= 245 && deg < 295) dirStr = "Left";
		else if (deg >= 295 && deg < 335) dirStr = "Front Left";

		if (angleEl) angleEl.textContent = "Angle: " + deg + "° (" + dirStr + ")";
		if (distEl) distEl.textContent = "Distance: " + this.state.radarDist.toFixed(1) + "m";
	},

	updateActiveIndicators: function () {
		var hasFx = (this.state.eqEnabled && this.state.currentPreset !== "flat") || this.state.spatialEnabled;
		var dockBtn = document.getElementById("audio_fx_btn");
		var lyricsBtn = document.getElementById("lyrics_audio_fx_btn");

		if (dockBtn) {
			dockBtn.classList.toggle("has-fx", hasFx);
			dockBtn.classList.toggle("active", hasFx);
		}
		if (lyricsBtn) {
			lyricsBtn.classList.toggle("has-fx", hasFx);
			lyricsBtn.classList.toggle("active", hasFx);
		}
	},

	// ==========================================
	// Visualizer: Live EQ Curve Canvas
	// ==========================================
	initEQCanvas: function () {
		var canvas = document.getElementById("eq_curve_canvas");
		if (!canvas) return;
		var dpr = window.devicePixelRatio || 1;
		var rect = canvas.getBoundingClientRect();
		canvas.width = (rect.width || 400) * dpr;
		canvas.height = (rect.height || 90) * dpr;
		this.drawEQCurve();
	},

	drawEQCurve: function () {
		var canvas = document.getElementById("eq_curve_canvas");
		if (!canvas) return;
		var ctx = canvas.getContext("2d");
		if (!ctx) return;

		var width = canvas.width;
		var height = canvas.height;
		var midY = height / 2;

		ctx.clearRect(0, 0, width, height);

		// Background grid lines (0dB center, +6dB, -6dB)
		ctx.lineWidth = 1;
		ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
		ctx.beginPath();
		ctx.moveTo(0, midY);
		ctx.lineTo(width, midY);
		ctx.moveTo(0, midY - height * 0.25);
		ctx.lineTo(width, midY - height * 0.25);
		ctx.moveTo(0, midY + height * 0.25);
		ctx.lineTo(width, midY + height * 0.25);
		ctx.stroke();

		// Calculate control points
		var points = [];
		var minLog = Math.log10(20);
		var maxLog = Math.log10(20000);
		var isEqOn = this.state.eqEnabled;

		// Start point at 20Hz
		var firstGain = isEqOn ? (this.state.gains[0] || 0) : 0;
		points.push({
			x: 0,
			y: midY - (firstGain / 12) * (height * 0.4)
		});

		for (var i = 0; i < this.bandsConfig.length; i++) {
			var f = this.bandsConfig[i].freq;
			var g = isEqOn ? (this.state.gains[i] || 0) : 0;
			var x = ((Math.log10(f) - minLog) / (maxLog - minLog)) * width;
			var y = midY - (g / 12) * (height * 0.4);
			points.push({ x: x, y: y, gain: g });
		}

		// End point at 20kHz
		var lastGain = isEqOn ? (this.state.gains[this.state.gains.length - 1] || 0) : 0;
		points.push({
			x: width,
			y: midY - (lastGain / 12) * (height * 0.4)
		});

		// Draw filled gradient under curve
		var grad = ctx.createLinearGradient(0, 0, 0, height);
		grad.addColorStop(0, "rgba(255, 45, 73, 0.35)");
		grad.addColorStop(0.5, "rgba(0, 240, 255, 0.2)");
		grad.addColorStop(1, "rgba(0, 240, 255, 0.0)");

		ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);

		for (var k = 0; k < points.length - 1; k++) {
			var p0 = points[k === 0 ? k : k - 1];
			var p1 = points[k];
			var p2 = points[k + 1];
			var p3 = points[k + 2 < points.length ? k + 2 : k + 1];

			var cp1x = p1.x + (p2.x - p0.x) / 6;
			var cp1y = p1.y + (p2.y - p0.y) / 6;
			var cp2x = p2.x - (p3.x - p1.x) / 6;
			var cp2y = p2.y - (p3.y - p1.y) / 6;

			ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
		}

		ctx.lineTo(width, height);
		ctx.lineTo(0, height);
		ctx.closePath();
		ctx.fillStyle = grad;
		ctx.fill();

		// Draw smooth curve stroke
		ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);

		for (var m = 0; m < points.length - 1; m++) {
			var pt0 = points[m === 0 ? m : m - 1];
			var pt1 = points[m];
			var pt2 = points[m + 1];
			var pt3 = points[m + 2 < points.length ? m + 2 : m + 1];

			var c1x = pt1.x + (pt2.x - pt0.x) / 6;
			var c1y = pt1.y + (pt2.y - pt0.y) / 6;
			var c2x = pt2.x - (pt3.x - pt1.x) / 6;
			var c2y = pt2.y - (pt3.y - pt1.y) / 6;

			ctx.bezierCurveTo(c1x, c1y, c2x, c2y, pt2.x, pt2.y);
		}

		var strokeGrad = ctx.createLinearGradient(0, 0, width, 0);
		strokeGrad.addColorStop(0, "#ff2d49");
		strokeGrad.addColorStop(0.5, "#00f0ff");
		strokeGrad.addColorStop(1, "#ffd00f");

		ctx.lineWidth = 2.5;
		ctx.strokeStyle = strokeGrad;
		ctx.shadowColor = "#00f0ff";
		ctx.shadowBlur = 8;
		ctx.stroke();
		ctx.shadowBlur = 0;

		// Draw control points
		for (var pIdx = 1; pIdx < points.length - 1; pIdx++) {
			var pt = points[pIdx];
			ctx.beginPath();
			ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
			ctx.fillStyle = "#ffffff";
			ctx.shadowColor = "#ff2d49";
			ctx.shadowBlur = 6;
			ctx.fill();
			ctx.shadowBlur = 0;
		}
	},

	// ==========================================
	// Visualizer: Interactive 3D Spatial Radar
	// ==========================================
	initRadarCanvas: function () {
		var canvas = document.getElementById("spatial_radar_canvas");
		if (!canvas) return;

		var self = this;
		var handleDrag = function (e) {
			var rect = canvas.getBoundingClientRect();
			var clientX = e.touches ? e.touches[0].clientX : e.clientX;
			var clientY = e.touches ? e.touches[0].clientY : e.clientY;

			var cx = rect.left + rect.width / 2;
			var cy = rect.top + rect.height / 2;
			var dx = clientX - cx;
			var dy = clientY - cy;

			// Convert dx, dy to Polar coordinates
			var rad = Math.atan2(dy, dx);
			var deg = (rad * (180 / Math.PI) + 90 + 360) % 360;
			var maxPixelR = Math.min(rect.width, rect.height) * 0.42;
			var curPixelR = Math.sqrt(dx * dx + dy * dy);
			var dist = (curPixelR / maxPixelR) * 2.0;

			self.setSoundPosition(deg, dist);
			self.state.autoOrbit = false;
			self.updateSpatialUI();
		};

		canvas.addEventListener("mousedown", function (e) {
			self.isDraggingRadar = true;
			handleDrag(e);
		});

		window.addEventListener("mousemove", function (e) {
			if (self.isDraggingRadar) handleDrag(e);
		});

		window.addEventListener("mouseup", function () {
			self.isDraggingRadar = false;
		});

		canvas.addEventListener("touchstart", function (e) {
			self.isDraggingRadar = true;
			handleDrag(e);
		}, { passive: false });

		window.addEventListener("touchmove", function (e) {
			if (self.isDraggingRadar) {
				handleDrag(e);
			}
		}, { passive: false });

		window.addEventListener("touchend", function () {
			self.isDraggingRadar = false;
		});
	},

	startOrbitLoop: function () {
		var self = this;
		var animate = function (timestamp) {
			if (!self.lastOrbitTimestamp) self.lastOrbitTimestamp = timestamp;
			var dt = (timestamp - self.lastOrbitTimestamp) / 1000;
			self.lastOrbitTimestamp = timestamp;

			if (self.state.spatialEnabled && self.state.autoOrbit && !self.isDraggingRadar) {
				// Advance orbit angle based on speed
				var degPerSec = 45 * self.state.orbitSpeed;
				self.state.radarAngle = (self.state.radarAngle + degPerSec * dt) % 360;
				self.applySpatialPosition();
				self.updateRadarHUD();
			}

			self.drawRadarCanvas();
			self.orbitAnimId = requestAnimationFrame(animate);
		};

		if (!this.orbitAnimId) {
			this.orbitAnimId = requestAnimationFrame(animate);
		}
	},

	drawRadarCanvas: function () {
		var canvas = document.getElementById("spatial_radar_canvas");
		if (!canvas) return;
		var ctx = canvas.getContext("2d");
		if (!ctx) return;

		var dpr = window.devicePixelRatio || 1;
		var rect = canvas.getBoundingClientRect();
		if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
			canvas.width = (rect.width || 280) * dpr;
			canvas.height = (rect.height || 180) * dpr;
		}

		var width = canvas.width;
		var height = canvas.height;
		var cx = width / 2;
		var cy = height / 2;
		var maxR = Math.min(width, height) * 0.42;

		ctx.clearRect(0, 0, width, height);

		// Background radar grid & rings
		ctx.lineWidth = 1;
		var rings = [0.33, 0.66, 1.0];
		for (var rIdx = 0; rIdx < rings.length; rIdx++) {
			var r = maxR * rings[rIdx];
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.strokeStyle = "rgba(0, 240, 255, " + (0.08 + rIdx * 0.05) + ")";
			ctx.stroke();
		}

		// Crosshair axis
		ctx.beginPath();
		ctx.moveTo(cx - maxR, cy);
		ctx.lineTo(cx + maxR, cy);
		ctx.moveTo(cx, cy - maxR);
		ctx.lineTo(cx, cy + maxR);
		ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
		ctx.stroke();

		// Direction labels (N, E, S, W)
		ctx.font = (10 * dpr) + "px " + (window.getComputedStyle(document.body).fontFamily || "sans-serif");
		ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("FRONT", cx, cy - maxR - 8 * dpr);
		ctx.fillText("REAR", cx, cy + maxR + 8 * dpr);
		ctx.fillText("L", cx - maxR - 8 * dpr, cy);
		ctx.fillText("R", cx + maxR + 8 * dpr, cy);

		// Center Listener Avatar (Head with glowing headphones)
		ctx.beginPath();
		ctx.arc(cx, cy, 14 * dpr, 0, Math.PI * 2);
		ctx.fillStyle = "#161b2c";
		ctx.strokeStyle = "#ff2d49";
		ctx.lineWidth = 2 * dpr;
		ctx.shadowColor = "#ff2d49";
		ctx.shadowBlur = 8 * dpr;
		ctx.fill();
		ctx.stroke();
		ctx.shadowBlur = 0;

		// Headphone ear-cups
		ctx.fillStyle = "#00f0ff";
		ctx.fillRect(cx - 18 * dpr, cy - 6 * dpr, 4 * dpr, 12 * dpr);
		ctx.fillRect(cx + 14 * dpr, cy - 6 * dpr, 4 * dpr, 12 * dpr);

		// Calculate Sound Source Position
		var rad = (this.state.radarAngle - 90) * (Math.PI / 180);
		var distNormalized = Math.min(2.0, this.state.radarDist) / 2.0;
		var soundR = maxR * distNormalized;
		var sx = cx + Math.cos(rad) * soundR;
		var sy = cy + Math.sin(rad) * soundR;

		// Animated Sound Waves expanding from source
		var isSpatialOn = this.state.spatialEnabled;
		var pulseT = (Date.now() % 1600) / 1600;
		if (isSpatialOn) {
			for (var w = 0; w < 3; w++) {
				var pOffset = (pulseT + w * 0.33) % 1.0;
				var waveR = (8 + pOffset * 28) * dpr;
				ctx.beginPath();
				ctx.arc(sx, sy, waveR, 0, Math.PI * 2);
				ctx.strokeStyle = "rgba(0, 240, 255, " + (1 - pOffset) * 0.4 + ")";
				ctx.lineWidth = 1.5 * dpr;
				ctx.stroke();
			}
		}

		// Line connecting listener to sound source
		ctx.beginPath();
		ctx.moveTo(cx, cy);
		ctx.lineTo(sx, sy);
		ctx.strokeStyle = isSpatialOn ? "rgba(0, 240, 255, 0.4)" : "rgba(255, 255, 255, 0.15)";
		ctx.lineWidth = 1.5 * dpr;
		ctx.setLineDash([4 * dpr, 3 * dpr]);
		ctx.stroke();
		ctx.setLineDash([]);

		// Sound Source Orb
		ctx.beginPath();
		ctx.arc(sx, sy, 8 * dpr, 0, Math.PI * 2);
		ctx.fillStyle = isSpatialOn ? "#00f0ff" : "#888888";
		ctx.shadowColor = isSpatialOn ? "#00f0ff" : "transparent";
		ctx.shadowBlur = 12 * dpr;
		ctx.fill();
		ctx.shadowBlur = 0;

		ctx.beginPath();
		ctx.arc(sx, sy, 3.5 * dpr, 0, Math.PI * 2);
		ctx.fillStyle = "#ffffff";
		ctx.fill();
	},

	// ==========================================
	// Modal Management & Event Wiring
	// ==========================================
	openModal: function (defaultTab) {
		var modal = document.getElementById("audio_fx_modal");
		if (!modal) return;
		modal.classList.add("active");

		if (defaultTab) {
			this.switchModalTab(defaultTab);
		}

		this.updateEQUI();
		this.updateSpatialUI();
		setTimeout(function () {
			AudioFXEngine.initEQCanvas();
		}, 100);
	},

	closeModal: function () {
		var modal = document.getElementById("audio_fx_modal");
		if (modal) modal.classList.remove("active");
	},

	switchModalTab: function (tabKey) {
		var tabs = document.querySelectorAll(".fx-nav-tab");
		tabs.forEach(function (tab) {
			var isMatch = tab.getAttribute("data-fxtab") === tabKey;
			tab.classList.toggle("active", isMatch);
		});

		var eqPanel = document.getElementById("fx_panel_eq");
		var spatialPanel = document.getElementById("fx_panel_spatial");
		if (eqPanel) eqPanel.classList.toggle("active", tabKey === "eq");
		if (spatialPanel) spatialPanel.classList.toggle("active", tabKey === "spatial");

		if (tabKey === "eq") {
			setTimeout(function () { AudioFXEngine.initEQCanvas(); }, 50);
		}
	},

	saveSettings: function () {
		try {
			var payload = {
				eqEnabled: this.state.eqEnabled,
				currentPreset: this.state.currentPreset,
				preamp: this.state.preamp,
				gains: this.state.gains,
				spatialEnabled: this.state.spatialEnabled,
				spatialMode: this.state.spatialMode,
				autoOrbit: this.state.autoOrbit,
				orbitSpeed: this.state.orbitSpeed,
				soundstageWidth: this.state.soundstageWidth,
				reverbSize: this.state.reverbSize,
				subBass: this.state.subBass,
				radarAngle: this.state.radarAngle,
				radarDist: this.state.radarDist
			};
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
		} catch (e) {
			console.warn("[AudioFXEngine] Error saving settings:", e);
		}
	},

	loadSettings: function () {
		try {
			var raw = localStorage.getItem(this.STORAGE_KEY);
			if (raw) {
				var parsed = JSON.parse(raw);
				if (parsed && typeof parsed === "object") {
					if (typeof parsed.eqEnabled === "boolean") this.state.eqEnabled = parsed.eqEnabled;
					if (parsed.currentPreset && this.presets[parsed.currentPreset]) this.state.currentPreset = parsed.currentPreset;
					if (typeof parsed.preamp === "number") this.state.preamp = parsed.preamp;
					if (Array.isArray(parsed.gains) && parsed.gains.length === 7) this.state.gains = parsed.gains;
					if (typeof parsed.spatialEnabled === "boolean") this.state.spatialEnabled = parsed.spatialEnabled;
					if (parsed.spatialMode) this.state.spatialMode = parsed.spatialMode;
					if (typeof parsed.autoOrbit === "boolean") this.state.autoOrbit = parsed.autoOrbit;
					if (typeof parsed.orbitSpeed === "number") this.state.orbitSpeed = parsed.orbitSpeed;
					if (typeof parsed.soundstageWidth === "number") this.state.soundstageWidth = parsed.soundstageWidth;
					if (typeof parsed.reverbSize === "number") this.state.reverbSize = parsed.reverbSize;
					if (typeof parsed.subBass === "number") this.state.subBass = parsed.subBass;
					if (typeof parsed.radarAngle === "number") this.state.radarAngle = parsed.radarAngle;
					if (typeof parsed.radarDist === "number") this.state.radarDist = parsed.radarDist;
				}
			}
		} catch (e) {
			console.warn("[AudioFXEngine] Error loading settings:", e);
		}
	}
};

window.AudioFXEngine = AudioFXEngine;

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
		AudioFXEngine.init(context, source, analyser);
	} catch (e) {
		console.warn("Audio Context source error:", e);
		try {
			source.connect(analyser);
			analyser.connect(context.destination);
		} catch (err) { }
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
	if (AudioFXEngine) AudioFXEngine.initEQCanvas();
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

// Fetch Top Charts based on topCharts array
async function fetchTopChartsPlaylists() {
	if (!topCharts || !Array.isArray(topCharts) || topCharts.length === 0) {
		return await SaavnAPI.searchPlaylists("Top charts", 1, 8);
	}
	var promises = topCharts.map(async function (chartQuery) {
		try {
			var res = await SaavnAPI.searchPlaylists(chartQuery, 1, 5);
			var queryClean = chartQuery.replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase();
			var queryWords = queryClean.split(/\s+/).filter(function (w) { return w.length > 2; });

			// Check if any result title matches one of the query words
			var best = res && res.find(function (item) {
				var itemTitle = (item.title || "").toLowerCase();
				return queryWords.some(function (w) { return itemTitle.indexOf(w) !== -1; });
			});

			if (!best) {
				// Try significant word search (e.g. "Chithra" for "K. S. Chithra")
				var significant = chartQuery.replace(/[.\-_]/g, " ").split(/\s+/).filter(function (w) { return w.length > 2; }).join(" ");
				if (significant && significant.toLowerCase() !== chartQuery.toLowerCase()) {
					var res2 = await SaavnAPI.searchPlaylists(significant, 1, 3);
					best = res2 && (res2.find(function (item) {
						var itemTitle = (item.title || "").toLowerCase();
						return queryWords.some(function (w) { return itemTitle.indexOf(w) !== -1; });
					}) || res2[0]);
				}
			}

			var finalPick = best || (res && res[0]) || null;
			return finalPick;
		} catch (e) {
			console.warn("Failed to fetch top chart playlist for query:", chartQuery, e);
		}
		return null;
	});

	var list = (await Promise.all(promises)).filter(Boolean);
	if (list.length === 0) {
		list = await SaavnAPI.searchPlaylists("Top charts", 1, 8);
	}
	return list;
}

function renderTopChartsChips() {
	var chipsContainer = document.getElementById("top_charts_chips");
	if (!chipsContainer || !topCharts || topCharts.length === 0) return;
	chipsContainer.innerHTML = "";

	var allChip = document.createElement("span");
	allChip.className = "chip active";
	allChip.innerHTML = '<i class="fa-solid fa-fire"></i> All Charts';
	allChip.onclick = function () {
		chipsContainer.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
		allChip.classList.add("active");
		renderPlaylistsList("top_charts_list", homeFeeds.top_charts, "top_charts");
	};
	chipsContainer.appendChild(allChip);

	topCharts.forEach(function (chartQuery) {
		var chip = document.createElement("span");
		chip.className = "chip";
		chip.innerHTML = '<i class="fa-solid fa-chart-line"></i> ' + chartQuery;
		chip.onclick = function () {
			chipsContainer.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
			chip.classList.add("active");
			var qClean = chartQuery.replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase();
			var qWords = qClean.split(/\s+/).filter(function (w) { return w.length > 2; });
			var matched = homeFeeds.top_charts.filter(function (p) {
				var pTitle = (p.title || "").toLowerCase();
				return qWords.some(function (w) { return pTitle.indexOf(w) !== -1; });
			});
			if (matched.length > 0) {
				renderPlaylistsList("top_charts_list", matched, "top_charts");
			} else {
				SaavnAPI.searchPlaylists(chartQuery, 1, 4).then(function (res) {
					if (res && res.length > 0) {
						renderPlaylistsList("top_charts_list", res, "top_charts");
					}
				});
			}
		};
		chipsContainer.appendChild(chip);
	});
}

// Home Page Feeds Loading
async function loadHomeFeeds() {
	var latestPromise = SaavnAPI.searchSongs("latest telugu songs", 1, 8);
	var motivationalPromise = SaavnAPI.searchAlbums("latest bollywood", 1, 8);
	var topChartsPromise = fetchTopChartsPlaylists();

	var results = await Promise.all([latestPromise, motivationalPromise, topChartsPromise]);

	homeFeeds.latest = results[0] && results[0].length > 0 ? results[0] : fallbackPlaylist;
	homeFeeds.motivational = results[1] && results[1].length > 0 ? results[1] : fallbackPlaylist;
	homeFeeds.top_charts = results[2] && results[2].length > 0 ? results[2] : [];
	homeFeeds.deep_focus = homeFeeds.top_charts;

	// Populate Home Page Grids
	renderCardsGrid("latest_songs_list", homeFeeds.latest, "latest");
	renderAlbumsList("bollywood_songs_list", homeFeeds.motivational, "motivational");
	renderPlaylistsList("top_charts_list", homeFeeds.top_charts, "top_charts");
	renderTopChartsChips();

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
	renderPlaylistsList("top_charts_list", homeFeeds.top_charts, "top_charts");
	renderPlaylistsList("hollywood_songs_list", homeFeeds.top_charts, "hollywood");
	renderSongsList(playlist);
	if (typeof FavoritesManager !== "undefined") {
		FavoritesManager.updateAllUI();
	}
	if (typeof updateQueueBadge === "function") {
		updateQueueBadge();
	}
	var queueModal = document.getElementById("current_playlist_modal");
	if (queueModal && queueModal.classList.contains("active") && typeof renderCurrentPlaylistModal === "function") {
		renderCurrentPlaylistModal();
	}
}

function createSongListItem(songItem, idx, songsList) {
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
	img.loading = "lazy";
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

	return li;
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
		var li = createSongListItem(songItem, idx, songsList);
		ul.appendChild(li);
	});
	songsContainer.appendChild(ul);
}

function appendSongsToList(newSongs) {
	var songsContainer = document.getElementById("songslistcon");
	if (!songsContainer || !newSongs || newSongs.length === 0) return;
	var ul = songsContainer.querySelector("ul");
	if (!ul) {
		renderSongsList(newSongs);
		return;
	}

	var startIdx = playlist.length;
	playlist = playlist.concat(newSongs);

	newSongs.forEach(function (songItem, i) {
		var li = createSongListItem(songItem, startIdx + i, playlist);
		ul.appendChild(li);
	});
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

	var is320k = song.isHD || (song.file && (song.file.indexOf('_320') !== -1 || song.file.indexOf('320') !== -1)) || song.quality === '320kbps';
	var hdBadge = document.getElementById("player_hd_badge");
	if (hdBadge) {
		if (is320k) {
			hdBadge.className = "audio-hd-badge is-hd active";
			hdBadge.innerHTML = '<i class="fa-solid fa-bolt"></i> HD';
			hdBadge.title = "Streaming in 320kbps Ultra HD Studio Quality 🔥";
		} else {
			hdBadge.className = "audio-hd-badge is-hq active";
			hdBadge.innerHTML = '<i class="fa-solid fa-music"></i> 160k';
			hdBadge.title = "Streaming in 160kbps High Quality";
		}
	}

	var lyricsHdBadge = document.getElementById("lyrics_hd_badge");
	if (lyricsHdBadge) {
		if (is320k) {
			lyricsHdBadge.className = "lyrics-hd-badge is-hd active";
			lyricsHdBadge.innerHTML = '<i class="fa-solid fa-bolt"></i> ULTRA HD ';
			lyricsHdBadge.title = "Streaming in 320kbps Ultra HD Studio Quality 🔥";
		} else {
			lyricsHdBadge.className = "lyrics-hd-badge is-hq active";
			lyricsHdBadge.innerHTML = '<i class="fa-solid fa-music"></i> HIGH QUALITY ';
			lyricsHdBadge.title = "Streaming in 160kbps High Quality";
		}
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

var currentLyricsSongKey = null;

async function loadLyricsForCurrentSong(forceReload) {
	if (!playlist || !playlist[playlist_index]) return;
	var song = playlist[playlist_index];
	var songKey = (song.id ? song.id + "_" : "") + (song.title || "") + "_" + (song.artist || "");

	// If lyrics are already loaded for this song, don't call API or wipe DOM until song changes
	if (!forceReload && currentLyricsSongKey === songKey) {
		updateSyncedLyrics();
		return;
	}

	currentLyricsSongKey = songKey;
	if (window.RealVideoLooper && typeof window.RealVideoLooper.onSongChange === "function") {
		window.RealVideoLooper.onSongChange(song);
	}

	var lyricsCover = document.getElementById("lyrics_cover");
	var modalCover = document.getElementById("modal_lyrics_cover");
	var artGlow = document.getElementById("lyrics_art_glow");
	if (lyricsCover) lyricsCover.src = song.cover;
	if (modalCover) modalCover.src = song.cover;
	if (artGlow && song.cover) {
		artGlow.style.backgroundImage = "url('" + song.cover + "')";
	}
	var embedContainer = document.getElementById("lyrics_video_embed_container");
	if (embedContainer && song.cover) {
		embedContainer.style.backgroundImage = "url('" + song.cover + "')";
		embedContainer.style.backgroundSize = "cover";
		embedContainer.style.backgroundPosition = "center center";
		embedContainer.style.backgroundRepeat = "no-repeat";
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

	// Check if active song changed while waiting for network response
	var currentSong = playlist && playlist[playlist_index];
	var activeSongKey = currentSong ? (currentSong.id ? currentSong.id + "_" : "") + (currentSong.title || "") + "_" + (currentSong.artist || "") : "";
	if (activeSongKey !== songKey) return;

	var timed = [];
	console.log('lyrics', lyricsData);
	if (lyricsData) {
		if (lyricsData.lyrics && /\[\d{2}:\d{2}\.\d{2,3}\]/.test(lyricsData.lyrics)) {
			timed = LyricsService.parseLrcText(lyricsData.lyrics);
		} else if (Array.isArray(lyricsData.timed_lyrics) && lyricsData.timed_lyrics.length > 0) {
			timed = lyricsData.timed_lyrics;
		} else if (lyricsData.lyrics) {
			timed = LyricsService.parseLrcText(lyricsData.lyrics);
		}
	}

	// Insert music symbol in-between if end time and start time is more than 2 seconds
	timed = LyricsService.insertMusicBreaks(timed);

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
			c.innerHTML = '<div class="no-lyrics-placeholder"><i class="fa-solid fa-guitar"></i> No synced lyrics found for this track.</div>';
			hideNoLyricsPlaceholder();
			return;
		}

		timed.forEach(function (line, index) {
			var p = document.createElement("p");
			p.className = "lyric-line" + (line.isMusic ? " music-line" : "");
			p.setAttribute("data-start", line.start_time);
			p.setAttribute("data-end", line.end_time || 0);
			p.setAttribute("data-idx", index);
			p.textContent = line.text;

			p.onclick = function () {
				var startSec = line.start_time / 1000;
				audio.currentTime = startSec;
				if (audio.paused) audio.play();
				if (window.RealVideoLooper && typeof window.RealVideoLooper.syncTimelineWithAudio === "function") {
					window.RealVideoLooper.syncTimelineWithAudio(true);
				}
			};

			c.appendChild(p);
		});
	});
}

function hideNoLyricsPlaceholder() {
	setTimeout(() => {
		const noLyricsPlaceholder = document.querySelector('.no-lyrics-placeholder');
		if (noLyricsPlaceholder) {
			//	noLyricsPlaceholder.style.display = 'none';
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
	if (window.RealVideoLooper && typeof window.RealVideoLooper.onSongChange === "function") {
		window.RealVideoLooper.onSongChange(song);
	}

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

// Search Filter Type State Management (Songs vs Albums vs Playlists)
var currentSearchType = "songs";
try {
	var savedSearchType = localStorage.getItem("sangeetham_search_type");
	if (savedSearchType && (savedSearchType === "songs" || savedSearchType === "albums" || savedSearchType === "playlists")) {
		currentSearchType = savedSearchType;
	}
} catch (e) { }

function updateSearchFilterPillsUI(type) {
	if (type) currentSearchType = type;
	var pills = document.querySelectorAll(".search-filter-pill");
	pills.forEach(function (p) {
		var pType = p.getAttribute("data-search-type") || "songs";
		p.classList.toggle("active", pType === currentSearchType);
	});
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

	if (tabName === "equalizer") {
		if (window.AudioFXEngine) {
			window.AudioFXEngine.openModal("eq");
		}
		return;
	}

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
		if (typeof openAISpotlight === "function") {
			openAISpotlight();
		}
		if (homeView) homeView.classList.add("active");
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
		} else if (tabName === "top_charts" || tabName === "charts" || tabName === "hollywood" || tabName === "deep_focus") {
			if (searchView) searchView.classList.add("active");
			var viewTitle = document.getElementById("view_title");
			if (viewTitle) viewTitle.innerHTML = '<i class="fa-solid fa-chart-line section-icon"></i> Top Charts';
			if (homeFeeds.top_charts && homeFeeds.top_charts.length > 0) {
				renderPlaylistsList(homeFeeds.top_charts);
			} else {
				SaavnAPI.searchPlaylists("Top charts", 1, 20).then(function (res) {
					homeFeeds.top_charts = res;
					homeFeeds.deep_focus = res;
					renderPlaylistsList(res);
				});
			}
			if (!skipHashUpdate) updateUrlHash("top_charts");
		} else if (tabName === "search") {
			if (viewTitle) viewTitle.textContent = "Search Music";
			updateSearchFilterPillsUI();
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

	// Current Playlist / Queue Modal Triggers
	var queueBtn = document.getElementById("current_queue_btn");
	var lyricsQueueBtn = document.getElementById("lyrics_queue_btn");
	var closeQueueBtn = document.getElementById("close_current_playlist_modal");
	var queueClearBtn = document.getElementById("queue_clear_btn");
	var queueShuffleBtn = document.getElementById("queue_shuffle_btn");
	var queueModal = document.getElementById("current_playlist_modal");

	if (queueBtn) {
		queueBtn.addEventListener("click", function (e) {
			e.stopPropagation();
			openCurrentPlaylistModal();
		});
	}

	if (lyricsQueueBtn) {
		lyricsQueueBtn.addEventListener("click", function (e) {
			e.stopPropagation();
			openCurrentPlaylistModal();
		});
	}

	if (closeQueueBtn) {
		closeQueueBtn.addEventListener("click", function () {
			closeCurrentPlaylistModal();
		});
	}

	if (queueModal) {
		queueModal.addEventListener("click", function (e) {
			if (e.target === queueModal) {
				closeCurrentPlaylistModal();
			}
		});
	}

	if (queueClearBtn) {
		queueClearBtn.addEventListener("click", function () {
			clearCurrentQueue();
		});
	}

	if (queueShuffleBtn) {
		queueShuffleBtn.addEventListener("click", function () {
			shuffleCurrentQueue();
		});
	}

	// Initialize Mobile Lyrics Toggle and Queue Badge Counter
	initMobileLyricsToggle();
	updateQueueBadge();

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
		var updateSens = function () {
			sensitivity = parseFloat(this.value) || 1.0;
			var badge = document.getElementById("sens_val_badge");
			if (badge) badge.textContent = sensitivity.toFixed(1) + "x";
		};
		sensSlider.addEventListener("input", updateSens);
		sensSlider.addEventListener("change", updateSens);
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

	// Search Type (songs vs albums vs playlists)
	var searchFilterPills = document.querySelectorAll(".search-filter-pill");
	updateSearchFilterPillsUI(currentSearchType);

	searchFilterPills.forEach(function (pill) {
		pill.addEventListener("click", function () {
			var selectedType = this.getAttribute("data-search-type") || "songs";
			currentSearchType = selectedType;
			try {
				localStorage.setItem("sangeetham_search_type", selectedType);
			} catch (e) { }
			updateSearchFilterPillsUI(selectedType);
			var q = songSearch ? songSearch.value.trim() : "";
			if (q) {
				triggerSearch(q);
			}
		});
	});

	// ==========================================================================
	// Infinite Scroll & Lazy Loading Search Engine
	// ==========================================================================
	var SearchPagination = {
		query: "",
		type: "songs",
		page: 1,
		limit: 20,
		isLoading: false,
		hasMore: true,
		totalLoaded: 0,
		observer: null,

		init: function () {
			var self = this;
			var loadMoreBtn = document.getElementById("search_load_more_btn");
			if (loadMoreBtn) {
				loadMoreBtn.onclick = function () {
					self.loadNextPage();
				};
			}

			var sentinel = document.getElementById("search_scroll_sentinel");
			if (sentinel && window.IntersectionObserver) {
				if (this.observer) this.observer.disconnect();
				this.observer = new IntersectionObserver(function (entries) {
					var entry = entries[0];
					if (entry && entry.isIntersecting && !self.isLoading && self.hasMore && self.query) {
						var searchView = document.getElementById("search_view");
						if (searchView && searchView.classList.contains("active")) {
							self.loadNextPage();
						}
					}
				}, { rootMargin: "300px" });
				this.observer.observe(sentinel);
			}
		},

		reset: function (query, type, initialItemsCount) {
			this.query = query || "";
			this.type = type || currentSearchType || "songs";
			this.page = 1;
			this.isLoading = false;
			this.totalLoaded = initialItemsCount || 0;
			this.hasMore = initialItemsCount >= 10;

			var controls = document.getElementById("search_lazy_controls");
			var loader = document.getElementById("search_lazy_loader");
			var loadMoreBtn = document.getElementById("search_load_more_btn");
			var endNotice = document.getElementById("search_end_notice");

			if (!this.query || this.totalLoaded === 0) {
				if (controls) controls.style.display = "none";
				return;
			}

			if (controls) controls.style.display = "flex";
			if (loader) loader.style.display = "none";
			if (loadMoreBtn) loadMoreBtn.style.display = this.hasMore ? "inline-flex" : "none";
			if (endNotice) endNotice.style.display = (!this.hasMore && this.totalLoaded > 0) ? "flex" : "none";
		},

		loadNextPage: async function () {
			if (this.isLoading || !this.hasMore || !this.query) return;
			this.isLoading = true;

			var loader = document.getElementById("search_lazy_loader");
			var loadMoreBtn = document.getElementById("search_load_more_btn");
			var endNotice = document.getElementById("search_end_notice");

			if (loader) {
				loader.style.display = "flex";
				var loaderSpan = loader.querySelector("span");
				if (loaderSpan) {
					loaderSpan.textContent = "Loading more " + (this.type === "albums" ? "albums" : (this.type === "playlists" ? "playlists" : "songs")) + "...";
				}
			}
			if (loadMoreBtn) loadMoreBtn.style.display = "none";

			var nextPage = this.page + 1;
			var newItems = [];

			try {
				if (this.type === "albums") {
					newItems = await SaavnAPI.searchAlbums(this.query, nextPage, this.limit);
				} else if (this.type === "playlists") {
					newItems = await SaavnAPI.searchPlaylists(this.query, nextPage, this.limit);
				} else {
					newItems = await SaavnAPI.searchSongs(this.query, nextPage, this.limit);
				}
			} catch (err) {
				console.warn("Lazy load pagination error:", err);
			}

			this.isLoading = false;
			if (loader) loader.style.display = "none";

			if (newItems && newItems.length > 0) {
				this.page = nextPage;
				this.totalLoaded += newItems.length;

				if (this.type === "albums") {
					appendAlbumsToList(newItems);
				} else if (this.type === "playlists") {
					appendPlaylistsToList(newItems);
				} else {
					appendSongsToList(newItems);
				}

				if (newItems.length < 5) {
					this.hasMore = false;
				}
			} else {
				this.hasMore = false;
			}

			if (loadMoreBtn) loadMoreBtn.style.display = this.hasMore ? "inline-flex" : "none";
			if (endNotice) endNotice.style.display = (!this.hasMore && this.totalLoaded > 0) ? "flex" : "none";
		}
	};
	window.SearchPagination = SearchPagination;
	SearchPagination.init();

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
			SearchPagination.reset("", currentSearchType, 0);
			if (clearSearchBtn) clearSearchBtn.style.display = "none";
			return;
		}

		if (clearSearchBtn) clearSearchBtn.style.display = "flex";
		if (activeTab !== "search") {
			switchTab("search");
		}

		var songsContainer = document.getElementById("songslistcon");
		if (songsContainer) {
			songsContainer.innerHTML = '<div class="loading-state"><i class="fa fa-circle-o-notch fa-spin"></i> Searching JioSaavn for ' + currentSearchType + ' "' + q + '"...</div>';
		}
		var lazyControls = document.getElementById("search_lazy_controls");
		if (lazyControls) lazyControls.style.display = "none";

		searchDebounceTimer = setTimeout(async function () {
			if (currentSearchType === "albums") {
				var albumResults = await SaavnAPI.searchAlbums(q, 1, 20);
				if (albumResults.length > 0) {
					renderAlbumsList(albumResults);
					SearchPagination.reset(q, "albums", albumResults.length);
				} else if (songsContainer) {
					songsContainer.innerHTML = '<div class="no-songs"><i class="fa-solid fa-compact-disc"></i> No albums found matching "' + q + '". Try another keyword.</div>';
					SearchPagination.reset(q, "albums", 0);
				}
			} else if (currentSearchType === "playlists") {
				var playlistResults = await SaavnAPI.searchPlaylists(q, 1, 20);
				if (playlistResults.length > 0) {
					renderPlaylistsList(playlistResults);
					SearchPagination.reset(q, "playlists", playlistResults.length);
				} else if (songsContainer) {
					songsContainer.innerHTML = '<div class="no-songs"><i class="fa-solid fa-chart-line"></i> No playlists or top charts found matching "' + q + '". Try another keyword.</div>';
					SearchPagination.reset(q, "playlists", 0);
				}
			} else {
				var searchResults = await SaavnAPI.searchSongs(q, 1, 20);
				if (searchResults.length > 0) {
					playlist = searchResults;
					renderSongsList(playlist);
					SearchPagination.reset(q, "songs", searchResults.length);
				} else if (songsContainer) {
					songsContainer.innerHTML = '<div class="no-songs"><i class="fa-frown-o"></i> No songs found matching "' + q + '". Try another keyword.</div>';
					SearchPagination.reset(q, "songs", 0);
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

	// Album & Playlist Back Button Listener
	var albumBackBtn = document.getElementById("album_back_btn");
	if (albumBackBtn) {
		albumBackBtn.addEventListener("click", function () {
			if (previousTabBeforeDetails && previousTabBeforeDetails !== "album") {
				switchTab(previousTabBeforeDetails);
			} else {
				switchTab("search");
			}
			updateSearchFilterPillsUI();
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
				if (window.RealVideoLooper && typeof window.RealVideoLooper.syncTimelineWithAudio === "function") {
					window.RealVideoLooper.syncTimelineWithAudio(false);
				}
			}
		});

		seekslider.addEventListener("change", function () {
			seeking = false;
			if (audio.duration) {
				var pct = parseFloat(this.value) / 500;
				audio.currentTime = pct * audio.duration;
				updateSyncedLyrics();
				if (window.RealVideoLooper && typeof window.RealVideoLooper.syncTimelineWithAudio === "function") {
					window.RealVideoLooper.syncTimelineWithAudio(true);
				}
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
			if (seeking) {
				seeking = false;
				if (window.RealVideoLooper && typeof window.RealVideoLooper.syncTimelineWithAudio === "function") {
					window.RealVideoLooper.syncTimelineWithAudio(true);
				}
			}
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
			if (seeking) {
				seeking = false;
				if (window.RealVideoLooper && typeof window.RealVideoLooper.syncTimelineWithAudio === "function") {
					window.RealVideoLooper.syncTimelineWithAudio(true);
				}
			}
		});
		window.addEventListener("touchcancel", function () {
			if (seeking) {
				seeking = false;
				if (window.RealVideoLooper && typeof window.RealVideoLooper.syncTimelineWithAudio === "function") {
					window.RealVideoLooper.syncTimelineWithAudio(true);
				}
			}
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
		if (window.RealVideoLooper && typeof window.RealVideoLooper.resumeVideo === "function") {
			window.RealVideoLooper.resumeVideo();
		}
	});
	audio.addEventListener("pause", function () {
		setPlayerLyricPlayingState(false);
		if (window.RealVideoLooper && typeof window.RealVideoLooper.pauseVideo === "function") {
			window.RealVideoLooper.pauseVideo();
		}
	});
	audio.addEventListener("ended", function () {
		setPlayerLyricPlayingState(false);
		if (window.RealVideoLooper && typeof window.RealVideoLooper.pauseVideo === "function") {
			window.RealVideoLooper.pauseVideo();
		}
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
			if (window.RealVideoLooper && typeof window.RealVideoLooper.syncTimelineWithAudio === "function") {
				window.RealVideoLooper.syncTimelineWithAudio(true);
			}
			return;
		}
		var rect = seekslider.getBoundingClientRect();
		var offsetX = clientX - rect.left;
		var pct = Math.max(0, Math.min(1, offsetX / rect.width));
		audio.currentTime = pct * audio.duration;
		seekslider.value = pct * 500;
		updateSyncedLyrics();
		if (window.RealVideoLooper && typeof window.RealVideoLooper.syncTimelineWithAudio === "function") {
			window.RealVideoLooper.syncTimelineWithAudio(false);
		}
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

	var topFundBtn = document.getElementById("top_funding_btn");
	var footerFundBtn = document.getElementById("footer_funding_btn");
	var closeFundBtn = document.getElementById("close_funding_modal");

	function openModal(modal) {
		if (modal) modal.classList.add("active");
	}

	function closeModal(modal) {
		if (modal) modal.classList.remove("active");
	}

	if (topFundBtn) topFundBtn.addEventListener("click", function () { openModal(fundingModal); });
	if (footerFundBtn) footerFundBtn.addEventListener("click", function () { openModal(fundingModal); });
	if (closeFundBtn) closeFundBtn.addEventListener("click", function () { closeModal(fundingModal); switchTab("search"); });

	var modalEqOptionBtn = document.getElementById("modal_eq_option_btn");
	if (modalEqOptionBtn) {
		modalEqOptionBtn.addEventListener("click", function () {
			closeModal(fundingModal);
			if (window.AudioFXEngine) window.AudioFXEngine.openModal("eq");
		});
	}

	// Audio FX Studio (Equalizer & 3D Spatial Audio) Event Listeners
	var audioFxBtn = document.getElementById("audio_fx_btn");
	var lyricsAudioFxBtn = document.getElementById("lyrics_audio_fx_btn");
	var closeAudioFxBtn = document.getElementById("close_audio_fx_modal");
	var audioFxModal = document.getElementById("audio_fx_modal");

	if (audioFxBtn) {
		audioFxBtn.addEventListener("click", function () {
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.openModal();
		});
	}

	if (lyricsAudioFxBtn) {
		lyricsAudioFxBtn.addEventListener("click", function () {
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.openModal();
		});
	}

	if (closeAudioFxBtn) {
		closeAudioFxBtn.addEventListener("click", function () {
			if (window.AudioFXEngine) window.AudioFXEngine.closeModal(); switchTab("lyrics");
		});
	}

	// Close on background click
	if (audioFxModal) {
		audioFxModal.addEventListener("click", function (e) {
			if (e.target === audioFxModal) {
				if (window.AudioFXEngine) window.AudioFXEngine.closeModal();
			}
		});
	}

	// FX Nav Tabs
	var fxNavTabs = document.querySelectorAll(".fx-nav-tab");
	fxNavTabs.forEach(function (tab) {
		tab.addEventListener("click", function () {
			var tabKey = this.getAttribute("data-fxtab");
			if (window.AudioFXEngine) window.AudioFXEngine.switchModalTab(tabKey);
		});
	});

	// Equalizer Master Toggle
	var eqToggle = document.getElementById("eq_enable_toggle");
	if (eqToggle) {
		eqToggle.addEventListener("change", function () {
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.toggleEQ(this.checked);
		});
	}

	// EQ Preset Dropdown
	var eqPresetSelect = document.getElementById("eq_preset_select");
	if (eqPresetSelect) {
		eqPresetSelect.addEventListener("change", function () {
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.setPreset(this.value);
		});
	}

	// EQ Reset Button
	var resetEqBtn = document.getElementById("reset_eq_btn");
	if (resetEqBtn) {
		resetEqBtn.addEventListener("click", function () {
			if (window.AudioFXEngine) {
				window.AudioFXEngine.resetEQ();
				showToast("Equalizer reset to Flat");
			}
		});
	}

	// EQ Quick Chips
	var eqChips = document.querySelectorAll("#eq_quick_chips .eq-chip");
	eqChips.forEach(function (chip) {
		chip.addEventListener("click", function () {
			var p = this.getAttribute("data-preset");
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.setPreset(p);
		});
	});

	// Audio Quality Select (320kbps vs 160kbps)
	var qualitySelect = document.getElementById("audio_quality_select");
	if (qualitySelect) {
		var savedQ = localStorage.getItem("sangeetham_stream_quality") || "320";
		qualitySelect.value = savedQ;
		qualitySelect.addEventListener("change", function () {
			localStorage.setItem("sangeetham_stream_quality", this.value);
			var qLabel = this.value === "320" ? "320kbps Ultra HD 🔥" : "160kbps High Quality";
			showToast("Audio streaming quality set to " + qLabel);
			if (playlist && playlist[playlist_index]) {
				var curSong = playlist[playlist_index];
				if (curSong.raw && typeof SaavnAPI !== "undefined") {
					var refreshed = SaavnAPI.normalizeSong(curSong.raw);
					if (refreshed) {
						playlist[playlist_index] = refreshed;
						updatePlayerMetadata(refreshed);
					}
				}
			}
		});
	}

	// HD Badges Clicks
	var playerHdBadge = document.getElementById("player_hd_badge");
	if (playerHdBadge) {
		playerHdBadge.addEventListener("click", function (e) {
			e.stopPropagation();
			var is320 = this.classList.contains("is-hd");
			showToast(is320 ? "Streaming in 320kbps Ultra HD Studio Quality 🔥" : "Streaming in 160kbps High Quality");
		});
	}

	var lyricsHdBadge = document.getElementById("lyrics_hd_badge");
	if (lyricsHdBadge) {
		lyricsHdBadge.addEventListener("click", function (e) {
			e.stopPropagation();
			var is320 = this.classList.contains("is-hd");
			showToast(is320 ? "Streaming in 320kbps Ultra HD Studio Quality 🔥" : "Streaming in 160kbps High Quality");
		});
	}

	// Preamp Slider
	var preampSlider = document.getElementById("eq_band_preamp");
	if (preampSlider) {
		var updatePreamp = function () {
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.setPreamp(this.value);
		};
		preampSlider.addEventListener("input", updatePreamp);
		preampSlider.addEventListener("change", updatePreamp);
	}

	// EQ Band Sliders
	for (var b = 0; b < 7; b++) {
		(function (idx) {
			var slider = document.getElementById("eq_band_" + idx);
			if (slider) {
				var updateBand = function () {
					if (context && context.state === "suspended") context.resume();
					if (window.AudioFXEngine) window.AudioFXEngine.setBandGain(idx, this.value);
				};
				slider.addEventListener("input", updateBand);
				slider.addEventListener("change", updateBand);
			}
		})(b);
	}

	// 3D Spatial Audio Master Toggle
	var spatialToggle = document.getElementById("spatial_enable_toggle");
	if (spatialToggle) {
		spatialToggle.addEventListener("change", function () {
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.toggleSpatial(this.checked);
		});
	}

	// Spatial Modes Grid
	var modeCards = document.querySelectorAll("#spatial_modes_grid .spatial-mode-card");
	modeCards.forEach(function (card) {
		card.addEventListener("click", function () {
			var m = this.getAttribute("data-mode");
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) {
				window.AudioFXEngine.setSpatialMode(m);
				if (!window.AudioFXEngine.state.spatialEnabled) {
					window.AudioFXEngine.toggleSpatial(true);
				}
			}
		});
	});

	// Spatial Reset Button
	var resetSpatialBtn = document.getElementById("reset_spatial_btn");
	if (resetSpatialBtn) {
		resetSpatialBtn.addEventListener("click", function () {
			if (window.AudioFXEngine) {
				window.AudioFXEngine.resetSpatial();
				showToast("3D Spatial Audio settings reset");
			}
		});
	}

	// Spatial Orbit Speed
	var orbitSpeedSlider = document.getElementById("spatial_orbit_speed");
	if (orbitSpeedSlider) {
		var updateOrbitSpeed = function () {
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.setOrbitSpeed(this.value);
		};
		orbitSpeedSlider.addEventListener("input", updateOrbitSpeed);
		orbitSpeedSlider.addEventListener("change", updateOrbitSpeed);
	}

	// Spatial Orbit Toggle Button
	var orbitToggleBtn = document.getElementById("spatial_orbit_toggle_btn");
	if (orbitToggleBtn) {
		orbitToggleBtn.addEventListener("click", function () {
			if (window.AudioFXEngine) {
				window.AudioFXEngine.toggleAutoOrbit();
			}
		});
	}

	// Spatial Soundstage Width
	var widthSlider = document.getElementById("spatial_width_slider");
	if (widthSlider) {
		var updateWidth = function () {
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.setSoundstageWidth(this.value);
		};
		widthSlider.addEventListener("input", updateWidth);
		widthSlider.addEventListener("change", updateWidth);
	}

	// Spatial Reverb Slider
	var reverbSlider = document.getElementById("spatial_reverb_slider");
	if (reverbSlider) {
		var updateReverb = function () {
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.setReverbSize(this.value);
		};
		reverbSlider.addEventListener("input", updateReverb);
		reverbSlider.addEventListener("change", updateReverb);
	}

	// Spatial Sub-Bass Slider
	var bassSlider = document.getElementById("spatial_bass_slider");
	if (bassSlider) {
		var updateBass = function () {
			if (context && context.state === "suspended") context.resume();
			if (window.AudioFXEngine) window.AudioFXEngine.setSubBass(this.value);
		};
		bassSlider.addEventListener("input", updateBass);
		bassSlider.addEventListener("change", updateBass);
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

}

function createPlaylistCard(playlistItem) {
	var card = document.createElement("div");
	card.className = "song-card album-card playlist-card";

	card.innerHTML =
		'<div class="card-thumb-wrapper">' +
		'<img class="card-thumb" src="' + playlistItem.cover + '" alt="' + playlistItem.title + '" loading="lazy">' +
		'<span class="hd-badge album-badge"><i class="fa-solid fa-chart-line"></i> ' + (playlistItem.songCount ? playlistItem.songCount + ' Songs' : 'Top Chart') + '</span>' +
		'<div class="play-overlay">' +
		'<div class="play-btn-circle"><i class="fa fa-play"></i></div>' +
		'</div>' +
		'</div>' +
		'<div class="card-title" title="' + playlistItem.title + '">' + playlistItem.title + '</div>' +
		'<div class="card-artist" title="' + (playlistItem.artists || '') + '">' + (playlistItem.artists || '') + '</div>';

	card.onclick = function () {
		openPlaylistDetails(playlistItem.id);
	};
	return card;
}

function renderPlaylistsList(containerOrList, maybePlaylistsList) {
	var targetContainer = null;
	var playlistsList = null;

	if (typeof containerOrList === "string") {
		targetContainer = document.getElementById(containerOrList);
		playlistsList = maybePlaylistsList;
	} else if (containerOrList && containerOrList.nodeType) {
		targetContainer = containerOrList;
		playlistsList = maybePlaylistsList;
	} else {
		targetContainer = document.getElementById("songslistcon");
		playlistsList = containerOrList;
	}

	if (!targetContainer) return;
	targetContainer.innerHTML = "";

	if (!playlistsList || playlistsList.length === 0) {
		targetContainer.innerHTML = '<div class="no-songs"><i class="fa-solid fa-chart-line"></i> No top charts found.</div>';
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

	playlistsList.forEach(function (playlistItem) {
		var card = createPlaylistCard(playlistItem);
		parentContainer.appendChild(card);
	});
}

function appendPlaylistsToList(newPlaylists) {
	var songsContainer = document.getElementById("songslistcon");
	if (!songsContainer || !newPlaylists || newPlaylists.length === 0) return;
	var grid = songsContainer.querySelector(".cards-grid");
	if (!grid) {
		renderPlaylistsList(newPlaylists);
		return;
	}
	newPlaylists.forEach(function (p) {
		grid.appendChild(createPlaylistCard(p));
	});
}

function createAlbumCard(album) {
	var card = document.createElement("div");
	card.className = "song-card album-card";
	var isPlaylist = (album.type === "playlist");
	var badgeIcon = isPlaylist ? "fa-solid fa-chart-line" : "fa-solid fa-compact-disc";
	var badgeText = album.songCount ? album.songCount + ' Songs' : (isPlaylist ? 'Top Chart' : 'Album');

	card.innerHTML =
		'<div class="card-thumb-wrapper">' +
		'<img class="card-thumb" src="' + album.cover + '" alt="' + album.title + '" loading="lazy">' +
		'<span class="hd-badge album-badge"><i class="' + badgeIcon + '"></i> ' + badgeText + '</span>' +
		'<div class="play-overlay">' +
		'<div class="play-btn-circle"><i class="fa fa-play"></i></div>' +
		'</div>' +
		'</div>' +
		'<div class="card-title" title="' + album.title + '">' + album.title + '</div>' +
		'<div class="card-artist" title="' + (album.artists || '') + '">' + (album.artists || '') + (album.year ? ' • ' + album.year : '') + '</div>';

	card.onclick = function () {
		if (isPlaylist) {
			openPlaylistDetails(album.id);
		} else {
			openAlbumDetails(album.id);
		}
	};
	return card;
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
		var card = createAlbumCard(album);
		parentContainer.appendChild(card);
	});
}

function appendAlbumsToList(newAlbums) {
	var songsContainer = document.getElementById("songslistcon");
	if (!songsContainer || !newAlbums || newAlbums.length === 0) return;
	var grid = songsContainer.querySelector(".cards-grid");
	if (!grid) {
		renderAlbumsList(newAlbums);
		return;
	}
	newAlbums.forEach(function (album) {
		grid.appendChild(createAlbumCard(album));
	});
}

async function openAlbumDetails(albumId, autoPlay) {
	if (!albumId) return;
	if (activeTab && activeTab !== "album") {
		previousTabBeforeDetails = activeTab;
	}
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
	var albumBadgeEl = document.querySelector("#album_view .album-type-badge");
	var tracklistHeadingEl = document.querySelector("#album_view .tracklist-heading h3");

	if (albumBadgeEl) albumBadgeEl.innerHTML = '<i class="fa-solid fa-compact-disc"></i> ALBUM';
	if (tracklistHeadingEl) tracklistHeadingEl.innerHTML = '<i class="fa-solid fa-list-ol"></i> Album Tracklist';

	if (albumSongsListEl) {
		albumSongsListEl.innerHTML = '<div class="loading-state"><i class="fa fa-circle-o-notch fa-spin"></i> Loading album tracks...</div>';
	}

	var album = await SaavnAPI.getAlbumDetails(albumId);
	if (!album) {
		if (albumSongsListEl) {
			albumSongsListEl.innerHTML = '<div class="no-songs"><i class="fa-exclamation-triangle"></i> Could not load album details. Please try again.</div>';
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

async function openPlaylistDetails(playlistId, autoPlay) {
	if (!playlistId) return;
	if (activeTab && activeTab !== "album") {
		previousTabBeforeDetails = activeTab;
	}
	switchTab("album", true);
	updateUrlHash("playlist", { id: playlistId });

	var albumTitleEl = document.getElementById("album_hero_title");
	var albumArtistsEl = document.getElementById("album_hero_artists");
	var albumCoverEl = document.getElementById("album_hero_cover");
	var albumYearEl = document.getElementById("album_hero_year");
	var albumCountEl = document.getElementById("album_hero_count");
	var albumLangEl = document.getElementById("album_hero_lang");
	var albumSongsListEl = document.getElementById("album_songs_list");
	var albumGlowEl = document.getElementById("album_cover_glow");
	var albumBadgeEl = document.querySelector("#album_view .album-type-badge");
	var tracklistHeadingEl = document.querySelector("#album_view .tracklist-heading h3");

	if (albumBadgeEl) albumBadgeEl.innerHTML = '<i class="fa-solid fa-chart-line"></i> TOP CHART';
	if (tracklistHeadingEl) tracklistHeadingEl.innerHTML = '<i class="fa-solid fa-list-ol"></i> Playlist Tracklist';

	if (albumSongsListEl) {
		albumSongsListEl.innerHTML = '<div class="loading-state"><i class="fa fa-circle-o-notch fa-spin"></i> Loading top chart tracks...</div>';
	}

	var playlistObj = await SaavnAPI.getPlaylistDetails(playlistId);
	if (!playlistObj || !playlistObj.songs || playlistObj.songs.length === 0) {
		if (albumSongsListEl) {
			albumSongsListEl.innerHTML = '<div class="no-songs"><i class="fa fa-exclamation-triangle"></i> Could not load top chart tracks. Please try again.</div>';
		}
		return;
	}

	if (albumTitleEl) albumTitleEl.textContent = playlistObj.title;
	if (albumArtistsEl) albumArtistsEl.textContent = playlistObj.description || playlistObj.artists || "Top Charts Playlist";
	if (albumCoverEl) albumCoverEl.src = playlistObj.cover;
	if (albumGlowEl) albumGlowEl.style.backgroundImage = "url('" + playlistObj.cover + "')";
	if (albumYearEl) albumYearEl.textContent = "CHARTS";
	if (albumCountEl) albumCountEl.textContent = (playlistObj.songs ? playlistObj.songs.length : 0) + " Songs";
	if (albumLangEl) albumLangEl.textContent = playlistObj.language ? playlistObj.language.toUpperCase() : "TOP CHARTS";

	// Render Tracklist
	if (albumSongsListEl) {
		albumSongsListEl.innerHTML = "";
		playlistObj.songs.forEach(function (song, idx) {
			var trackRow = document.createElement("div");
			trackRow.className = "album-track-row";
			var isActive = (playlist === playlistObj.songs && playlist_index === idx);
			if (isActive) trackRow.classList.add("active");

			var isFav = (typeof FavoritesManager !== "undefined") && FavoritesManager.isFavorite(song);
			var favIconClass = isFav ? "fa fa-heart" : "fa fa-heart-o";
			var favActiveClass = isFav ? " active" : "";

			trackRow.innerHTML =
				'<div class="track-left-group">' +
				'<div class="track-index">' + (idx + 1) + '</div>' +
				'<img class="track-row-thumb" src="' + (song.cover || playlistObj.cover) + '" alt="' + song.title + '">' +
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
				playlist = playlistObj.songs;
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
			if (playlistObj.songs && playlistObj.songs.length > 0) {
				playlist = playlistObj.songs;
				playTrackAtIndex(0);
				updateAlbumActiveTrack(0);
			}
		};
	}

	var shuffleBtn = document.getElementById("album_shuffle_btn");
	if (shuffleBtn) {
		shuffleBtn.onclick = function () {
			if (playlistObj.songs && playlistObj.songs.length > 0) {
				var shuffled = playlistObj.songs.slice().sort(function () { return 0.5 - Math.random(); });
				playlist = shuffled;
				playTrackAtIndex(0);
				showToast("🔀 Shuffled & playing " + playlistObj.title);
			}
		};
	}

	var shareAlbumBtn = document.getElementById("share_album_btn");
	if (shareAlbumBtn) {
		shareAlbumBtn.onclick = function () {
			var shareUrl = window.location.origin + window.location.pathname + "#playlist?id=" + encodeURIComponent(playlistId);
			if (navigator.share) {
				navigator.share({
					title: playlistObj.title + " - Sangeetham Music",
					text: "Listen to " + playlistObj.title + " on Sangeetham AI Music Player",
					url: shareUrl
				}).catch(function () { });
			} else {
				navigator.clipboard.writeText(shareUrl).then(function () {
					showToast("🔗 Playlist link copied to clipboard!");
				}).catch(function () {
					showToast("Playlist Link: " + shareUrl);
				});
			}
		};
	}

	if (autoPlay && playlistObj.songs && playlistObj.songs.length > 0) {
		playlist = playlistObj.songs;
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
	} else if (route === "playlist" && params.id) {
		openPlaylistDetails(params.id, false);
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
	} else if (["home", "favorites", "ai_chat", "motivational", "top_charts", "charts", "deep_focus", "latest"].indexOf(route) !== -1) {
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

/* ==========================================================================
   Current Playlist / Queue Management
   ========================================================================== */
function updateQueueBadge() {
	var badge = document.getElementById("queue_badge_count");
	if (!badge) return;
	var count = (typeof playlist !== "undefined" && playlist) ? playlist.length : 0;
	if (count > 0) {
		badge.textContent = count;
		badge.style.display = "block";
	} else {
		badge.style.display = "none";
	}
}

function openCurrentPlaylistModal() {
	var modal = document.getElementById("current_playlist_modal");
	if (!modal) return;
	renderCurrentPlaylistModal();
	modal.classList.add("active");
}

function closeCurrentPlaylistModal() {
	var modal = document.getElementById("current_playlist_modal");
	if (modal) modal.classList.remove("active");
}

function renderCurrentPlaylistModal() {
	var listContainer = document.getElementById("current_playlist_list");
	var countSubtitle = document.getElementById("queue_subtitle_count");
	if (!listContainer) return;

	listContainer.innerHTML = "";
	var total = (typeof playlist !== "undefined" && playlist) ? playlist.length : 0;

	if (countSubtitle) {
		countSubtitle.textContent = total + (total === 1 ? " track in queue" : " tracks in queue");
	}

	if (!playlist || playlist.length === 0) {
		listContainer.innerHTML = `
			<div style="text-align:center;padding:40px 16px;color:rgba(255,255,255,0.5);">
				<i class="fa-solid fa-list-ul" style="font-size:36px;color:#ff2d49;margin-bottom:12px;display:block;"></i>
				<p>Your queue is currently empty. Play songs or ask AI DJ to queue tracks!</p>
			</div>
		`;
		return;
	}

	playlist.forEach(function (song, idx) {
		var isPlaying = (idx === playlist_index);
		var item = document.createElement("div");
		item.className = "queue-item" + (isPlaying ? " is-playing" : "");

		var coverUrl = song.cover || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80";

		item.innerHTML = `
			<div class="queue-item-main">
				<span class="queue-track-idx">${idx + 1 < 10 ? '0' : ''}${idx + 1}</span>
				<div class="queue-now-playing-wave">
					<span></span><span></span><span></span>
				</div>
				<img src="${coverUrl}" alt="${song.title}" class="queue-thumb" loading="lazy">
				<div class="queue-meta">
					<div class="queue-title">${song.title}</div>
					<div class="queue-artist">${song.artist || 'Unknown'} • ${song.durationStr || '3:30'}</div>
				</div>
			</div>
			<div class="queue-item-actions">
				${isPlaying ? '<span class="queue-playing-badge">NOW PLAYING</span>' : ''}
				<button type="button" class="queue-remove-btn" title="Remove from Queue">
					<i class="fa fa-times"></i>
				</button>
			</div>
		`;

		// Click to play
		item.addEventListener("click", function (e) {
			if (e.target.closest(".queue-remove-btn")) return;
			playTrackAtIndex(idx);
			renderCurrentPlaylistModal();
		});

		// Remove from queue
		var removeBtn = item.querySelector(".queue-remove-btn");
		if (removeBtn) {
			removeBtn.addEventListener("click", function (e) {
				e.stopPropagation();
				removeSongFromQueue(idx);
			});
		}

		listContainer.appendChild(item);
	});
}

function removeSongFromQueue(idx) {
	if (!playlist || idx < 0 || idx >= playlist.length) return;
	if (playlist.length <= 1) {
		showToast("Cannot remove the only song currently playing");
		return;
	}

	var removed = playlist.splice(idx, 1)[0];
	if (idx < playlist_index) {
		playlist_index--;
	} else if (idx === playlist_index) {
		if (playlist_index >= playlist.length) {
			playlist_index = 0;
		}
		playTrackAtIndex(playlist_index);
	}

	renderSongsList(playlist);
	renderCurrentPlaylistModal();
	updateQueueBadge();
	if (removed) {
		showToast("Removed: " + removed.title);
	}
}

function clearCurrentQueue() {
	if (!playlist || playlist.length <= 1) {
		showToast("Queue is already empty except playing song");
		return;
	}
	var current = playlist[playlist_index];
	playlist = [current];
	playlist_index = 0;
	renderSongsList(playlist);
	renderCurrentPlaylistModal();
	updateQueueBadge();
	showToast("Cleared queue (kept current track)");
}

function shuffleCurrentQueue() {
	if (!playlist || playlist.length <= 2) {
		showToast("Add more songs to queue to shuffle");
		return;
	}
	var current = playlist[playlist_index];
	var remaining = playlist.filter(function (_, i) { return i !== playlist_index; });

	for (var i = remaining.length - 1; i > 0; i--) {
		var j = Math.floor(Math.random() * (i + 1));
		var temp = remaining[i];
		remaining[i] = remaining[j];
		remaining[j] = temp;
	}

	playlist = [current].concat(remaining);
	playlist_index = 0;
	renderSongsList(playlist);
	renderCurrentPlaylistModal();
	showToast("🔀 Queue shuffled");
}

/* ==========================================================================
   Mobile Lyrics Toggle Feature on Lyrics Page
   ========================================================================== */
function setMobileLyricsMode(showLyrics) {
	var lyricsView = document.getElementById("lyrics_view");
	var coverSeg = document.getElementById("mobile_seg_cover_btn");
	var lyricsSeg = document.getElementById("mobile_seg_lyrics_btn");
	var toggleBtn = document.getElementById("mobile_lyrics_toggle_btn");
	var toggleText = document.getElementById("mobile_lyrics_toggle_text");

	if (!lyricsView) return;

	if (showLyrics) {
		lyricsView.classList.add("mobile-lyrics-mode-active");
		if (coverSeg) coverSeg.classList.remove("active");
		if (lyricsSeg) lyricsSeg.classList.add("active");
		if (toggleText) toggleText.textContent = "Cover";
		if (toggleBtn) {
			var icon = toggleBtn.querySelector("i");
			if (icon) icon.className = "fa-solid fa-image";
			toggleBtn.classList.add("active");
		}
		// Center the current active lyric line smoothly
		setTimeout(function () {
			var activeLine = document.querySelector("#lyrics_container .lyric-line.active");
			if (activeLine) {
				activeLine.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		}, 120);
	} else {
		lyricsView.classList.remove("mobile-lyrics-mode-active");
		if (coverSeg) coverSeg.classList.add("active");
		if (lyricsSeg) lyricsSeg.classList.remove("active");
		if (toggleText) toggleText.textContent = "Lyrics";
		if (toggleBtn) {
			var icon2 = toggleBtn.querySelector("i");
			if (icon2) icon2.className = "fa-solid fa-quote-right";
			toggleBtn.classList.remove("active");
		}

		// Back to original: remove video-mode-active and restore original album cover view
		var leftPanel = document.getElementById("lyrics_left_panel");
		var rightPanel = document.getElementById("lyrics_right_panel");
		if (leftPanel) leftPanel.classList.remove("video-mode-active");
		if (rightPanel) rightPanel.classList.remove("video-mode-active");

		var artWrapper = document.getElementById("lyrics_art_wrapper");
		if (artWrapper) artWrapper.style.display = "";

		var videoBg = document.getElementById("lyrics_panel_video_bg");
		if (videoBg) videoBg.style.display = "none";

		var videoBar = document.getElementById("video_loop_bar");
		if (videoBar) videoBar.style.display = "none";

		var showVideoBtn = document.getElementById("show_video_btn");
		if (showVideoBtn) {
			showVideoBtn.classList.remove("active");
			var showVideoBtnText = document.getElementById("show_video_btn_text");
			if (showVideoBtnText) showVideoBtnText.textContent = "Show Video";
		}

		var activeVideoElements = document.querySelectorAll(".video-mode-active");
		activeVideoElements.forEach(function (el) {
			el.classList.remove("video-mode-active");
		});

		// Synchronize with RealVideoLooper / LyricsVideo
		var videoLooper = window.RealVideoLooper || window.LyricsVideo || window.SpotifyCanvas;
		if (videoLooper) {
			if (typeof videoLooper.toggleVideoDisplay === "function") {
				videoLooper.toggleVideoDisplay(false);
			}
			if (typeof videoLooper.pauseVideo === "function") {
				videoLooper.pauseVideo();
			}
			videoLooper.videoCycleState = 0;
			if (typeof videoLooper.updateCycleButtonUI === "function") {
				videoLooper.updateCycleButtonUI();
			}
		}
	}

}

function initMobileLyricsToggle() {
	var toggleBtn = document.getElementById("mobile_lyrics_toggle_btn");
	var coverSeg = document.getElementById("mobile_seg_cover_btn");
	var lyricsSeg = document.getElementById("mobile_seg_lyrics_btn");
	var lyricsView = document.getElementById("lyrics_view");

	if (toggleBtn) {
		toggleBtn.addEventListener("click", function (e) {
			e.preventDefault();
			var isLyricsActive = lyricsView && lyricsView.classList.contains("mobile-lyrics-mode-active");
			var textSpan = document.getElementById("mobile_lyrics_toggle_text");
			var isCoverText = textSpan && textSpan.textContent.trim().toLowerCase() === "cover";

			if (isLyricsActive || isCoverText) {
				setMobileLyricsMode(false);
			} else {
				setMobileLyricsMode(true);
			}
		});
	}

	if (coverSeg) {
		coverSeg.addEventListener("click", function () {
			setMobileLyricsMode(false);
		});
	}

	if (lyricsSeg) {
		lyricsSeg.addEventListener("click", function () {
			setMobileLyricsMode(true);
		});
	}
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
