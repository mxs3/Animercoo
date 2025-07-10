async function fetchv2(url, headers = {}, method = "GET", body = null) {
    const options = { method, headers };
    if (method === "POST" && body) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        options.body = body;
    }
    return await fetch(url, options);
}

function decodeHTMLEntities(text) {
    const txt = document.createElement('textarea');
    txt.innerHTML = text;
    return txt.value;
}

async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const searchUrl = `https://go.animerco.org/?s=${encodedKeyword}`;
        const response = await fetchv2(searchUrl);
        const responseText = await response.text();

        const results = [];

        const itemRegex = /<div id="post-\d+" class="col-12[\s\S]*?<a href="([^"]+)" class="image[^"]*"[^>]*?data-src="([^"]+)"[^>]*?title="([^"]+)"[\s\S]*?<div class="info">/g;
        let match;

        while ((match = itemRegex.exec(responseText)) !== null) {
            const href = match[1].trim();
            const image = match[2].trim();
            const title = decodeHTMLEntities(match[3].trim());
            results.push({ title, href, image });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in searchResults:', error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(url);
        const responseText = await response.text();

        const details = [];

        if (url.includes('movies')) {
            const descriptionMatch = responseText.match(/<div class="content">\s*<p>(.*?)<\/p>\s*<\/div>/s);
            let description = descriptionMatch 
                ? decodeHTMLEntities(descriptionMatch[1].trim()) 
                : 'N/A';

            const airdateMatch = responseText.match(/<li>\s*بداية العرض:\s*<span>\s*<a [^>]*rel="tag"[^>]*>([^<]+)<\/a>/);
            let airdate = airdateMatch ? airdateMatch[1].trim() : 'Unknown';

            const genres = [];
            const aliasesMatch = responseText.match(/<div\s+class="genres">([\s\S]*?)<\/div>/);
            const inner = aliasesMatch ? aliasesMatch[1] : '';

            const anchorRe = /<a[^>]*>([^<]+)<\/a>/g;
            let m;
            while ((m = anchorRe.exec(inner)) !== null) {
                genres.push(decodeHTMLEntities(m[1].trim()));
            }

            details.push({
                description: description,
                aliases: genres.join(', '),
                airdate: `Released: ${airdate}`
            });

        } else if (url.includes('animes')) {
            const descriptionMatch = responseText.match(/<div class="content">\s*<p>(.*?)<\/p>\s*<\/div>/s);
            let description = descriptionMatch 
                ? decodeHTMLEntities(descriptionMatch[1].trim()) 
                : 'N/A';

            const airdateMatch = responseText.match(/<li>\s*بداية العرض:\s*<a [^>]*rel="tag"[^>]*>([^<]+)<\/a>/);
            let airdate = airdateMatch ? airdateMatch[1].trim() : 'Unknown';

            const genres = [];
            const aliasesMatch = responseText.match(/<div\s+class="genres">([\s\S]*?)<\/div>/);
            const inner = aliasesMatch ? aliasesMatch[1] : '';

            const anchorRe = /<a[^>]*>([^<]+)<\/a>/g;
            let m;
            while ((m = anchorRe.exec(inner)) !== null) {
                genres.push(decodeHTMLEntities(m[1].trim()));
            }

            details.push({
                description: description,
                aliases: genres.join(', '),
                airdate: `Aired: ${airdate}`
            });

        } else {
            throw new Error("URL does not match known anime or movie paths.");
        }

        return JSON.stringify(details);

    } catch (error) {
        console.log('Details error:', error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Aliases: Unknown',
            airdate: 'Aired: Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const pageResponse = await fetchv2(url);
        const html = typeof pageResponse === 'object' ? await pageResponse.text() : await pageResponse;

        const episodes = [];

        if (url.includes('movies')) {
            episodes.push({ number: 1, href: url });
            return JSON.stringify(episodes);
        }

        const seasonUrlRegex = /<li\s+data-number='[^']*'>\s*<a\s+href='([^']+)'/g;
        const seasonUrls = [...html.matchAll(seasonUrlRegex)].map(match => match[1]);

        for (const seasonUrl of seasonUrls) {
            const seasonResponse = await fetchv2(seasonUrl);
            const seasonHtml = typeof seasonResponse === 'object' ? await seasonResponse.text() : await seasonResponse;

            const episodeRegex = /data-number='(\d+)'[\s\S]*?href='([^']+)'/g;
            for (const match of seasonHtml.matchAll(episodeRegex)) {
                episodes.push({
                    number: parseInt(match[1]),
                    href: match[2]
                });
            }
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("extractEpisodes failed:", error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    if (typeof _0xCheck === "function" && !_0xCheck()) return 'https://files.catbox.moe/avolvc.mp4';

    const multiStreams = {
        streams: [],
        subtitles: null
    };

    try {
        const res = await fetchv2(url);
        const html = await res.text();
        const method = 'POST';

        const servers = ['mp4upload', 'yourupload', 'streamwish', 'sfastwish', 'sibnet', 'uqload'];
        
        for (const server of servers) {
            const regex = new RegExp(
                `<a[^>]+class=['"][^'"]*option[^'"]*['"][^>]+data-type=['"]([^'"]+)['"][^>]+data-post=['"]([^'"]+)['"][^>]+data-nume=['"]([^'"]+)['"][^>]*>(?:(?!<span[^>]*class=['"]server['"]>).)*<span[^>]*class=['"]server['"]>\\s*${server}\\s*<\\/span>`,
                "gi"
            );

            const matches = [...html.matchAll(regex)];
            
            for (const match of matches) {
                const [_, type, post, nume] = match;
                const body = `action=player_ajax&post=${post}&nume=${nume}&type=${type}`;
                const headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
                    'Origin': 'https://go.animerco.org',
                    'Referer': url,
                };

                try {
                    const response = await fetchv2("https://go.animerco.org/wp-admin/admin-ajax.php", headers, method, body);
                    const json = await response.json();

                    if (!json?.embed_url) {
                        console.log(`No embed URL found for ${server}`);
                        continue;
                    }

                    let streamData;
                    try {
                        if (server === 'mp4upload') {
                            streamData = await mp4Extractor(json.embed_url);
                        } else if (server === 'yourupload') {
                            streamData = await youruploadExtractor(json.embed_url);
                        } else if (server === 'streamwish' || server === 'sfastwish') {
                            streamData = await streamwishExtractor(json.embed_url);
                        } else if (server === 'sibnet') {
                            streamData = await sibnetExtractor(json.embed_url);
                        } else if (server === 'uqload') {
                            streamData = await uqloadExtractor(json.embed_url);
                        }

                        if (streamData?.url) {
                            multiStreams.streams.push({
                                title: server,
                                streamUrl: streamData.url,
                                headers: streamData.headers,
                                subtitles: null
                            });
                        }
                    } catch (_) {}
                } catch (_) {}
            }
        }

        return JSON.stringify(multiStreams);
    } catch (_) {
        return JSON.stringify({ streams: [], subtitles: null });
    }
}
