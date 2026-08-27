// Copyright (c) 2026 Vthinq. All rights reserved.
// Developer name : Venu Bingi
// Sangeetham AI Music Player - Synced Karaoke & Plain Lyrics Service

(function (global) {
	"use strict";

	var LyricsService = {
		baseUrl: 'https://test-0k.onrender.com/lyrics/',
		cache: {},
		currentTimedLyrics: [],

		// Clean artist and song titles for optimal lyric matching
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

		// Fetch lyrics with multi-tier fallbacks (timestamps=true -> song only -> timestamps=false)
		fetchLyrics: async function (artist, songTitle) {
			var cleanArtist = this.cleanQuery(artist);
			var cleanTitle = this.cleanQuery(songTitle);
			var cacheKey = (cleanArtist + "_" + cleanTitle).toLowerCase();

			if (this.cache[cacheKey]) {
				return this.cache[cacheKey];
			}

			// 1. Primary: fetch with artist and song title with timestamps
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

			// 3. Tertiary fallback: with artist and song fetch with timestamp false (plain text lyrics)
			try {
				var url3 = this.baseUrl + "?artist=" + encodeURIComponent(cleanArtist) + "&song=" + encodeURIComponent(cleanTitle) + "&timestamps=false";
				var res3 = await fetch(url3);
				if (res3.ok) {
					var data3 = await res3.json();
					if (data3 && data3.status === "success" && data3.data) {
						this.cache[cacheKey] = data3.data;
						data3.data.timestamps = false;
						return data3.data;
					}
				}
			} catch (e3) {
				console.warn("Lyrics tertiary fetch error:", e3);
			}

			return null;
		},

		// Parse standard LRC format string into structured timed lines
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

	global.LyricsService = LyricsService;
})(typeof window !== "undefined" ? window : this);
