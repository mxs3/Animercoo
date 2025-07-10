async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const searchUrl = `https://go.animerco.org/?s=${encodedKeyword}`;
        const response = await fetchv2(searchUrl);
        const responseText = await response.text();

        const results = [];

        const itemRegex = /<div class="result-item">[\s\S]*?<a href="([^"]+)"[\s\S]*?<img src="([^"]+)"[\s\S]*?<h3>([\s\S]*?)<\/h3>/g;
        let match;

        while ((match = itemRegex.exec(responseText)) !== null) {
            const href = match[1].trim();
            const image = match[2].trim();
            const title = decodeHTMLEntities(match[3].trim());
            results.push({ title, href, image });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error('Fetch error in searchResults:', error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(url);
        const responseText = await response.text();

        const details = [];

        const descriptionMatch = responseText.match(/<div class="description">([\s\S]*?)<\/div>/);
        const description = descriptionMatch ? decodeHTMLEntities(descriptionMatch[1].trim()) : 'No description available';

        const infoMatch = responseText.match(/<div class="info">([\s\S]*?)<\/div>/);
        let infoText = infoMatch ? infoMatch[1] : '';
        
        const airdateMatch = infoText.match(/تاريخ الإصدار:[\s\S]*?<span>([^<]+)</);
        const airdate = airdateMatch ? airdateMatch[1].trim() : 'Unknown';

        const genres = [];
        const genreMatches = infoText.matchAll(/<a href="[^"]*\/genre\/[^"]*"[^>]*>([^<]+)<\/a>/g);
        for (const genreMatch of genreMatches) {
            genres.push(decodeHTMLEntities(genreMatch[1].trim()));
        }

        details.push({
            description: description,
            aliases: genres.join(', '),
            airdate: `Released: ${airdate}`
        });

        return JSON.stringify(details);

    } catch (error) {
        console.error('Details error:', error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Unknown',
            airdate: 'Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const episodes = [];
        const episodeRegex = /<li class="episode-item"[^>]*>[\s\S]*?<a href="([^"]+)"[\s\S]*?الحلقة (\d+)/g;
        let match;

        while ((match = episodeRegex.exec(html)) !== null) {
            episodes.push({
                href: match[1].trim(),
                number: parseInt(match[2])
            });
        }

        // Sort episodes by number
        episodes.sort((a, b) => a.number - b.number);

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("extractEpisodes failed:", error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        // Try to find direct stream URL first
        const directMatch = html.match(/<video[^>]+src="([^"]+\.mp4)"/i);
        if (directMatch) {
            return JSON.stringify({
                streams: [{
                    title: "Direct",
                    streamUrl: directMatch[1],
                    headers: {
                        "Referer": "https://go.animerco.org/"
                    }
                }],
                subtitles: null
            });
        }

        // If no direct URL, try embedded players
        const embedMatch = html.match(/<iframe[^>]+src="([^"]+)"/i);
        if (embedMatch) {
            const embedUrl = embedMatch[1];
            if (embedUrl.includes('streamwish')) {
                const streamData = await streamwishExtractor(embedUrl);
                if (streamData) {
                    return JSON.stringify({
                        streams: [{
                            title: "StreamWish",
                            streamUrl: streamData.url,
                            headers: streamData.headers
                        }],
                        subtitles: null
                    });
                }
            }
            // Add other embed handlers as needed
        }

        // Fallback to default error
        return JSON.stringify({ streams: [], subtitles: null });
    } catch (error) {
        console.error("extractStreamUrl failed:", error);
        return JSON.stringify({ streams: [], subtitles: null });
    }
}

// Helper functions
async function fetchv2(url, headers = {}, method = "GET", body = null) {
    const options = { method, headers };
    if (body) {
        options.body = body;
    }
    return await fetch(url, options);
}

function decodeHTMLEntities(text) {
    const entities = {
        '&quot;': '"',
        '&amp;': '&',
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>',
        '&#039;': "'"
    };
    return text.replace(/&[^;]+;/g, match => entities[match] || match);
}

async function streamwishExtractor(embedUrl) {
    const headers = { 
        "Referer": embedUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    
    try {
        const response = await fetchv2(embedUrl, headers);
        const html = await response.text();
        
        const m3u8Match = html.match(/file:\s*"([^"]+\.m3u8)"/);
        if (m3u8Match) {
            return {
                url: m3u8Match[1],
                headers: headers
            };
        }
        
        throw new Error("No m3u8 URL found");
    } catch (error) {
        console.error("StreamWish extractor error:", error);
        return null;
    }
}
