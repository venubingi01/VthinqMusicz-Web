// Copyright (c) 2026 Vthinq. All rights reserved.
// Developer name : Venu Bingi
// Sangeetham AI Music Player - Synced Karaoke & Plain Lyrics Service

(function (global) {
	"use strict";

	var LyricsService = {
		baseUrl: 'https://test-0k.onrender.com/lyrics/',
		cache: {},
		inFlightRequests: {},
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

			// Return cached response if already fetched (even if null / not found)
			if (Object.prototype.hasOwnProperty.call(this.cache, cacheKey)) {
				return this.cache[cacheKey];
			}

			// If a fetch for this exact song is already in progress, reuse the existing promise
			if (this.inFlightRequests[cacheKey]) {
				return this.inFlightRequests[cacheKey];
			}

			var self = this;
			var fetchPromise = (async function () {
				try {
					// 1. Primary: fetch with artist and song title with timestamps
					try {
						var url = self.baseUrl + "?artist=" + encodeURIComponent(cleanArtist) + "&song=" + encodeURIComponent(cleanTitle) + "&timestamps=true";
						var res = await fetch(url);
						if (res.ok) {
							var data = await res.json();
							if (data && data.status === "success" && data.data) {
								self.cache[cacheKey] = data.data;
								return data.data;
							}
						}
					} catch (e1) {
						console.warn("Lyrics primary fetch error:", e1);
					}

					// 2. Secondary fallback: fetch with song title only (no artist param — empty string causes 400)
					try {
						var url2 = self.baseUrl + "?song=" + encodeURIComponent(cleanTitle) + "&timestamps=true";
						var res2 = await fetch(url2);
						if (res2.ok) {
							var data2 = await res2.json();
							if (data2 && data2.status === "success" && data2.data) {
								self.cache[cacheKey] = data2.data;
								return data2.data;
							}
						}
					} catch (e2) {
						console.warn("Lyrics secondary fetch error:", e2);
					}

					// 3. Tertiary fallback: with artist and song fetch with timestamp false (plain text lyrics)
					try {
						var url3 = self.baseUrl + "?artist=" + encodeURIComponent(cleanArtist) + "&song=" + encodeURIComponent(cleanTitle) + "&timestamps=false";
						var res3 = await fetch(url3);
						if (res3.ok) {
							var data3 = await res3.json();
							if (data3 && data3.status === "success" && data3.data) {
								data3.data.timestamps = false;
								self.cache[cacheKey] = data3.data;
								return data3.data;
							}
						}
					} catch (e3) {
						console.warn("Lyrics tertiary fetch error:", e3);
					}

					// Cache null so subsequent requests for tracks without lyrics don't repeatedly make 3 API calls
					self.cache[cacheKey] = null;
					return null;
				} finally {
					delete self.inFlightRequests[cacheKey];
				}
			})();

			this.inFlightRequests[cacheKey] = fetchPromise;
			return fetchPromise;
		},

		// Parse standard LRC format string into structured timed lines
		parseLrcText: function (lrcText) {
			if (!lrcText) return [];
			var lines = lrcText.split("\n");
			var raw = [];
			var regExp = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

			lines.forEach(function (line, idx) {
				var matches = regExp.exec(line.trim());
				if (matches) {
					var mins = parseInt(matches[1], 10);
					var secs = parseInt(matches[2], 10);
					var ms = parseInt(matches[3].padEnd(3, "0"), 10);
					var startTime = (mins * 60 + secs) * 1000 + ms;
					var text = matches[4].trim();
					raw.push({
						origIdx: idx,
						time: startTime,
						text: text
					});
				}
			});

			var result = [];
			for (var i = 0; i < raw.length; i++) {
				if (raw[i].text) {
					var endTime = 0;
					if (i < raw.length - 1) {
						endTime = raw[i + 1].time;
					} else {
						endTime = raw[i].time + 5000;
					}

					result.push({
						id: "lrc_" + raw[i].origIdx,
						start_time: raw[i].time,
						end_time: endTime,
						text: raw[i].text
					});
				}
			}

			return result;
		},

		// Estimate reasonable vocal singing duration (ms) based on word count & character length analysis
		estimateVocalDuration: function (text) {
			if (!text) return 2000;
			var clean = text.replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()?"'…।॥]/g, " ").trim();
			var words = clean.split(/\s+/).filter(Boolean).length;
			var chars = clean.replace(/\s+/g, "").length;
			if (words === 0 && chars === 0) return 2000;

			// Words estimate: ~650ms per word + 1000ms base
			var wordsEstimate = words * 650 + 1000;
			// Characters estimate: ~120ms per char + 1000ms base (accurate for scripts without whitespace)
			var charsEstimate = chars * 120 + 1000;

			// Minimum vocal time: 2000ms, scales smoothly with text length
			return Math.max(2000, Math.min(wordsEstimate, charsEstimate));
		},

		// Insert music symbol lines between any lines where gap between end_time and start_time is more than 2 seconds (2000ms),
		// or within lines where duration has too much difference compared to the text/word length
		insertMusicBreaks: function (timedList) {
			if (!Array.isArray(timedList) || timedList.length === 0) return [];

			// Clone and sort by start_time
			var list = timedList.slice().sort(function (a, b) {
				return (a.start_time || 0) - (b.start_time || 0);
			});

			var self = this;

			// Analyze text/word length for each line:
			// If line contains three dots ('...' or '…'), it indicates a sustained/extended vocal note:
			// - Do NOT add music symbol if duration is <= 5 seconds (5000ms).
			// - If it takes more than 5 seconds, allocate 5s for the sustained vocal and show music symbol for the remainder.
			// If no three dots, analyze expected vocal duration and split if difference >= 4000ms.
			list.forEach(function (item) {
				if (item.isMusic) return;
				// Normalize end_time in case API returned seconds (< 1000 while start_time is in ms)
				if (item.end_time < 1000 && item.start_time > 1000) {
					item.end_time = item.end_time * 1000;
				}
				var dur = (item.end_time || 0) - (item.start_time || 0);
				var hasDots = /\.{3,}|…/.test(item.text);

				if (hasDots) {
					if (dur > 5000) {
						item.originalEnd = item.end_time;
						item.end_time = item.start_time + 5000;
						item.hasSplit = true;
					}
				} else {
					var estVocal = self.estimateVocalDuration(item.text);
					if (dur - estVocal >= 4000) {
						item.originalEnd = item.end_time;
						item.end_time = item.start_time + estVocal;
						item.hasSplit = true;
					}
				}
			});

			var result = [];

			// 1. Intro music interlude: if first lyric starts more than 2 seconds (2000ms) after song starts
			if (list[0].start_time > 2000) {
				result.push({
					id: "music_intro",
					start_time: 0,
					end_time: list[0].start_time,
					text: "♪ ♪ ♪",
					isMusic: true
				});
			}

			for (var i = 0; i < list.length; i++) {
				result.push(list[i]);

				if (i < list.length - 1) {
					var currentEnd = list[i].end_time;
					var nextStart = list[i + 1].start_time;

					// If gap between current end_time and next start_time is substantial (or line was split)
					var gapThreshold = list[i].hasSplit ? 1000 : 4000;
					if (typeof currentEnd === "number" && typeof nextStart === "number" && (nextStart - currentEnd) >= gapThreshold) {
						result.push({
							id: "music_break_" + i,
							start_time: currentEnd,
							end_time: nextStart,
							text: "♪ ♪ ♪",
							isMusic: true
						});
					}
				} else if (list[i].originalEnd && (list[i].originalEnd - list[i].end_time) >= 1000) {
					// Outro music break for the final line if it had a leftover duration
					result.push({
						id: "music_outro",
						start_time: list[i].end_time,
						end_time: list[i].originalEnd,
						text: "♪ ♪ ♪",
						isMusic: true
					});
				}
			}

			return result;
		}
	};

	global.LyricsService = LyricsService;
})(typeof window !== "undefined" ? window : this);
