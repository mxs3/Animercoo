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
    if (!_0xCheck()) return 'https://files.catbox.moe/avolvc.mp4';

    const multiStreams = {
        streams: [],
        subtitles: null
    };

    try {
        console.log("Page URL received:", url);
        const res = await fetchv2(url);
        const html = await res.text();
        const method = 'POST';

        const servers = ['mp4upload', 'yourupload', 'streamwish', 'sfastwish', 'sibnet', 'uqload', 'vk'];

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
                    'Origin': 'https://web.animerco.org',
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
                        } else if (server === 'vk') {
                            streamData = await vkExtractor(json.embed_url);
                        }

                        if (streamData?.allStreams?.length) {
                            multiStreams.streams.push(...streamData.allStreams);
                        } else if (streamData?.url) {
                            multiStreams.streams.push({
                                title: server,
                                streamUrl: streamData.url,
                                headers: streamData.headers,
                                subtitles: null
                            });
                        } else {
                            console.log(`No stream URL found for ${server}`);
                        }
                    } catch (extractorError) {
                        console.error(`Extractor error for ${server}:`, extractorError);
                    }
                } catch (error) {
                    console.error(`Error processing ${server}:`, error);
                }
            }
        }

        if (multiStreams.streams.length === 0) {
            console.error("No valid streams were extracted from any provider");
            return JSON.stringify({ streams: [], subtitles: null });
        }

        console.log(`Extracted ${multiStreams.streams.length} streams`);
        return JSON.stringify(multiStreams);
    } catch (error) {
        console.error("Error in extractStreamUrl:", error);
        return JSON.stringify({ streams: [], subtitles: null });
    }
}

function _0xCheck() {
    var _0x1a = typeof _0xB4F2 === 'function';
    var _0x2b = typeof _0x7E9A === 'function';
    return _0x1a && _0x2b ? (function(_0x3c) {
        return _0x7E9A(_0x3c);
    })(_0xB4F2()) : !1;
}

function _0x7E9A(_){return((___,____,_____,______,_______,________,_________,__________,___________,____________)=>(____=typeof ___,_____=___&&___[String.fromCharCode(...[108,101,110,103,116,104])],______=[...String.fromCharCode(...[99,114,97,110,99,105])],_______=___?[...___[String.fromCharCode(...[116,111,76,111,119,101,114,67,97,115,101])]()]:[],(________=______[String.fromCharCode(...[115,108,105,99,101])]())&&_______[String.fromCharCode(...[102,111,114,69,97,99,104])]((_________,__________)=>(___________=________[String.fromCharCode(...[105,110,100,101,120,79,102])](_________))>=0&&________[String.fromCharCode(...[115,112,108,105,99,101])](___________,1)),____===String.fromCharCode(...[115,116,114,105,110,103])&&_____===16&&________[String.fromCharCode(...[108,101,110,103,116,104])]===0))(_)}

async function uqloadExtractor(embedUrl) {
    const headers = {
        "Referer": embedUrl,
        "Origin": "https://uqload.net"
    };

    const response = await fetchv2(embedUrl, headers);
    const htmlText = await response.text();

    const match = htmlText.match(/sources:\s*\[\s*"([^"]+\.mp4)"\s*\]/);
    const videoSrc = match ? match[1] : '';

    return {
        url: videoSrc,
        headers: headers
    };
}

async function streamwishExtractor(embedUrl) {
    const headers = {
        "Referer": embedUrl,
        "User-Agent": "Mozilla/5.0"
    };

    try {
        const response = await fetchv2(embedUrl, headers);
        const html = await response.text();

        const obfuscatedScript = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
        if (obfuscatedScript) {
            const unpackedScript = unpack(obfuscatedScript[1]);
            const m3u8Match = unpackedScript.match(/file:"([^"]+\.m3u8)"/);
            if (m3u8Match) {
                return {
                    url: m3u8Match[1],
                    headers: headers
                };
            }
        }

        const directMatch = html.match(/sources:\s*\[\{file:"([^"]+\.m3u8)"/);
        if (directMatch) {
            return {
                url: directMatch[1],
                headers: headers
            };
        }

        throw new Error("No m3u8 URL found");
    } catch (error) {
        console.error("StreamWish extractor error:", error);
        return null;
    }
}

async function sibnetExtractor(embedUrl) {
    const headers = {
        "Referer": "https://video.sibnet.ru"
    };

    try {
        const response = await fetchv2(embedUrl, headers);
        const html = await response.text();

        const vidMatch = html.match(/player.src\(\[\{src: \"([^\"]+)/);
        if (!vidMatch || !vidMatch[1]) {
            throw new Error("video link not found");
        }

        const vidLink = `https://video.sibnet.ru${vidMatch[1]}`;
        return {
            url: vidLink,
            headers: headers
        };
    } catch (error) {
        console.error("SibNet extractor error:", error);
        return null;
    }
}

async function youruploadExtractor(embedUrl) {
    const headers = { "Referer": "https://www.yourupload.com/" };
    const response = await fetchv2(embedUrl, headers);
    const html = await response.text();
    const match = html.match(/file:\s*['"]([^'"]+\.mp4)['"]/);
    return {
        url: match?.[1] || null,
        headers: headers
    };
}

async function mp4Extractor(url) {
    const headers = { "Referer": "https://mp4upload.com" };
    const response = await fetchv2(url, headers);
    const htmlText = await response.text();
    const streamUrl = extractMp4Script(htmlText);
    return {
        url: streamUrl,
        headers: headers
    };
}

function extractMp4Script(htmlText) {
    const scripts = extractScriptTags(htmlText);
    let scriptContent = scripts.find(script => script.includes('player.src'));
    return scriptContent?.split(".src(")[1]?.split(")")[0]?.split("src:")[1]?.split('"')[1] || '';
}

function extractScriptTags(html) {
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    const scripts = [];
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        scripts.push(match[1]);
    }
    return scripts;
}

async function vkExtractor(embedUrl) {
    const headers = {
        "Referer": embedUrl,
        "User-Agent": "Mozilla/5.0"
    };

    try {
        const response = await fetchv2(embedUrl, headers);
        const html = await response.text();

        const jsonMatch = html.match(/var\s+video_balancer[\s\S]*?=\s*({.*?});<\/script>/);
        if (!jsonMatch) {
            console.warn("No VK video JSON found");
            return null;
        }

        const videoJson = JSON.parse(jsonMatch[1]);

        const qualities = Object.entries(videoJson).filter(([k, v]) => /^url\d+$/.test(k));
        const sorted = qualities.sort((a, b) => parseInt(b[0].replace("url", "")) - parseInt(a[0].replace("url", ""))).reverse();

        return {
            url: sorted[0][1],
            headers: headers,
            allStreams: sorted.map(([label, link]) => ({
                title: `vk ${label.replace('url', '')}p`,
                streamUrl: link,
                headers
            }))
        };
    } catch (err) {
        console.error("VK extractor error:", err);
        return null;
    }
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
