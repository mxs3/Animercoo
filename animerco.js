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

        console.log(results);
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
    if (!_0xCheck()) return JSON.stringify({ streams: [], subtitles: null });

    const multiStreams = { streams: [], subtitles: null };
    try {
        const res = await fetchv2(url);
        const html = await res.text();

        const servers = ['mp4upload', 'uqload', 'yourupload', 'sibnet'];

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
                    'User-Agent': 'Mozilla/5.0',
                    'Origin': 'https://web.animerco.org',
                    'Referer': url,
                };

                try {
                    const response = await fetchv2("https://go.animerco.org/wp-admin/admin-ajax.php", headers, 'POST', body);
                    const json = await response.json();
                    if (!json?.embed_url) continue;

                    const streamData = await genericMp4Extractor(json.embed_url, server);
                    if (streamData?.url) {
                        const qualityMatch = streamData.url.match(/(\\d{3,4})p/i);
                        const label = qualityMatch ? `${qualityMatch[1]}p` : getDefaultLabelForServer(server);

                        multiStreams.streams.push({
                            title: label,
                            streamUrl: streamData.url,
                            headers: streamData.headers,
                            subtitles: null
                        });
                    }
                } catch (err) {
                    console.error(`Error fetching from ${server}`, err);
                }
            }
        }

        return JSON.stringify(multiStreams);
    } catch (error) {
        console.error("extractStreamUrl error:", error);
        return JSON.stringify({ streams: [], subtitles: null });
    }
}

// ===================== UTILITIES =========================

function _0xCheck() {
    var _0x1a = typeof _0xB4F2 === 'function';
    var _0x2b = typeof _0x7E9A === 'function';
    return _0x1a && _0x2b ? (function (_0x3c) {
        return _0x7E9A(_0x3c);
    })(_0xB4F2()) : !1;
}

function _0x7E9A(_) {
    return ((___, ____, _____, ______, _______, ________, _________, __________, ___________, ____________) =>
        (____ = typeof ___,
            _____ = ___ && ___["length"],
            ______ = [..."cranci"],
            _______ = ___ ? [...___["toLowerCase"]()] : [],
            (________ = ______["slice"]()) &&
            _______["forEach"]((_________, __________) => (___________ = ______["indexOf"](_________)) >= 0 && ______["splice"](___________, 1)),
            ____ === "string" && _____ === 16 && ______["length"] === 0))
        (_)
}

// ============== Extractor (Generic for MP4 servers) =============

async function genericMp4Extractor(embedUrl, server) {
    const headers = getHeadersForServer(server, embedUrl);
    const res = await fetchv2(embedUrl, headers);
    const html = await res.text();
    const streamUrl = extractMp4Script(html);
    return {
        url: streamUrl,
        headers
    };
}

function getHeadersForServer(server, referer) {
    switch (server) {
        case 'mp4upload':
            return { "Referer": "https://mp4upload.com" };
        case 'yourupload':
            return { "Referer": "https://www.yourupload.com/" };
        case 'uqload':
            return { "Referer": referer, "Origin": "https://uqload.net" };
        case 'sibnet':
            return { "Referer": "https://video.sibnet.ru" };
        default:
            return { "Referer": referer };
    }
}

function getDefaultLabelForServer(server) {
    switch (server) {
        case 'mp4upload':
            return '1080p';
        case 'uqload':
            return '480p';
        case 'yourupload':
            return '360p';
        case 'sibnet':
            return '720p';
        default:
            return 'Unknown';
    }
}

// ============== Script Extractor ==============

function extractMp4Script(htmlText) {
    const scripts = extractScriptTags(htmlText);
    let scriptContent = scripts.find(script => script.includes('player.src'));
    return scriptContent?.split(".src(")[1]?.split(")")[0]?.split("src:")[1]?.split('"')[1] || '';
}

function extractScriptTags(html) {
    const scriptRegex = /<script[^>]*>([\\s\\S]*?)<\\/script>/gi;
    const scripts = [];
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        scripts.push(match[1]);
    }
    return scripts;
}

function decodeHTMLEntities(text) {
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
    
    const entities = {
        '&quot;': '"',
        '&amp;': '&',
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>'
    };
    
    for (const entity in entities) {
        text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    }

    return text;
}

class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            95: "' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
        };
        this.dictionary = {};
        this.base = base;
        if (36 < base && base < 62) {
            this.ALPHABET[base] = this.ALPHABET[base] ||
                this.ALPHABET[62].substr(0, base);
        }
        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        }
        else {
            try {
                [...this.ALPHABET[base]].forEach((cipher, index) => {
                    this.dictionary[cipher] = index;
                });
            }
            catch (er) {
                throw Error("Unsupported base encoding.");
            }
            this.unbase = this._dictunbaser;
        }
    }
    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((cipher, index) => {
            ret = ret + ((Math.pow(this.base, index)) * this.dictionary[cipher]);
        });
        return ret;
    }
}

function detect(source) {
    return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
}

function unpack(source) {
    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    let unbase;
    try {
        unbase = new Unbaser(radix);
    }
    catch (e) {
        throw Error("Unknown p.a.c.k.e.r. encoding.");
    }
    function lookup(match) {
        const word = match;
        let word2;
        if (radix == 1) {
            word2 = symtab[parseInt(word)];
        }
        else {
            word2 = symtab[unbase.unbase(word)];
        }
        return word2 || word;
    }
    source = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(source);
    function _filterargs(source) {
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                let a = args;
                if (a[2] == "[]") {
                }
                try {
                    return {
                        payload: a[1],
                        symtab: a[4].split("|"),
                        radix: parseInt(a[2]),
                        count: parseInt(a[3]),
                    };
                }
                catch (ValueError) {
                    throw Error("Corrupted p.a.c.k.e.r. data.");
                }
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
    }
    function _replacestrings(source) {
        return source;
    }
}
