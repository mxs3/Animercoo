async function searchResults(keyword) {
    const uniqueResults = new Map();
    const url = `https://faselhd.cam/?s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url);
    const html = await res.text();

    const regex = /<div class="Small--Box">[\s\S]*?<a\s+href="([^"]+)"[^>]*>[\s\S]*?data-src="([^"]+)"[\s\S]*?<h3 class="title">([\s\S]*?)<\/h3>/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
        const href = match[1].startsWith("http") ? match[1] : `https://faselhd.cam${match[1]}`;
        const image = match[2].trim();
        const rawTitle = match[3].replace(/<[^>]+>/g, "").trim();
        const title = rawTitle.replace(/الحلقة\s*\d+.*/gi, '').replace(/والاخيرة/gi, '').trim();

        if (!uniqueResults.has(title)) {
            uniqueResults.set(title, { title, href, image });
        }
    }

    return JSON.stringify(Array.from(uniqueResults.values()));
}

async function extractDetails(url) {
    const res = await fetchv2(url);
    const html = await res.text();

    const title = (html.match(/<h1[^>]*class="Title"[^>]*>(.*?)<\/h1>/i) || [])[1]?.trim() || 'N/A';

    const description = (html.match(/<div class="StoryArea">\s*<p>(.*?)<\/p>/i) || [])[1]
        ?.replace(/^(?:القصة|القصه)\s*[:：]?\s*/i, "")
        ?.trim() || 'N/A';

    const year = (html.match(/تاريخ (?:الاصدار|الإصدار)[^<]*?<a[^>]*>(\d{4})<\/a>/i) || [])[1] || 'N/A';

    const poster = (html.match(/<img[^>]+class="imgLoaded"[^>]+src="([^"]+)"/i) || [])[1] || 'N/A';

    const genres = [...(html.match(/<div class="Generes[^>]*>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i)?.[1] || '')
        .matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(m => m[1].trim());

    const aliases = [...(html.match(/<ul class="RightTaxContent">([\s\S]*?)<\/ul>/i)?.[1] || '')
        .matchAll(/<li[^>]*>\s*<span[^>]*>(.*?)<\/span>\s*(.*?)<\/li>/g)]
        .map(([, label, value]) => {
            const vals = [...value.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(v => v[1]) || [];
            return `${label.trim()}: ${vals.join(', ')}`;
        });

    return JSON.stringify({
        title, description, year, poster, genres, aliases: aliases.join('\n')
    });
}

async function extractEpisodes(url) {
    let res = await fetchv2(url);
    let html = await res.text();

    if (url.includes("/watch")) {
        const newUrl = url.replace(/\/watch\/?$/, "/");
        res = await fetchv2(newUrl);
        html = await res.text();
    }

    const listMatch = html.match(/<div class="EpisodesList">([\s\S]+?)<\/div>/);
    if (!listMatch) return JSON.stringify([]);

    const episodes = [];
    const regex = /<a[^>]+href="([^"]+)"[^>]*>\s*الحلقة\s*<em>([^<]+)<\/em>/g;
    let match;

    while ((match = regex.exec(listMatch[1])) !== null) {
        const fullUrl = match[1].startsWith('http') ? match[1] : `https://faselhd.cam${match[1]}`;
        episodes.push({ number: match[2].trim(), url: fullUrl });
    }

    return JSON.stringify(episodes);
}

async function extractStreamUrl(url) {
    const response = await fetchv2(url);
    const html = await response.text();
    const match = html.match(/data-watch="([^"]+)"/);
    if (!match) return null;

    const iframeUrl = match[1];
    const iframeRes = await fetchv2(iframeUrl);
    const iframeHtml = await iframeRes.text();

    const directSource = iframeHtml.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/);
    if (directSource) {
        return {
            url: directSource[1],
            type: "mp4",
            quality: "Auto",
            headers: { Referer: iframeUrl }
        };
    }

    const jwSource = iframeHtml.match(/file:\s*["']([^"']+\.mp4[^"']*)["']/);
    if (jwSource) {
        return {
            url: jwSource[1],
            type: "mp4",
            quality: "Auto",
            headers: { Referer: iframeUrl }
        };
    }

    const obfuscatedScript = iframeHtml.match(/eval\(function\(p,a,c,k,e,d[\s\S]+?\)\)/);
    if (obfuscatedScript) {
        const unpacked = unpack(obfuscatedScript[0]);
        const unpackedSource = unpacked.match(/file:\s*["']([^"']+\.mp4[^"']*)["']/);
        if (unpackedSource) {
            return {
                url: unpackedSource[1],
                type: "mp4",
                quality: "Auto",
                headers: { Referer: iframeUrl }
            };
        }
    }

    return null;
}

function unpack(source) {
    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) throw Error("Malformed p.a.c.k.e.r. symtab.");
    let unbase = new Unbaser(radix);
    function lookup(match) {
        const word = match;
        let word2 = radix == 1 ? symtab[parseInt(word)] : symtab[unbase.unbase(word)];
        return word2 || word;
    }
    source = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(source);
    function _filterargs(source) {
        const juicers = [/}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                return {
                    payload: args[1],
                    symtab: args[4].split("|"),
                    radix: parseInt(args[2]),
                    count: parseInt(args[3])
                };
            }
        }
        throw Error("Could not parse p.a.c.k.e.r");
    }
    function _replacestrings(source) {
        return source;
    }
}

class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            95: "' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'"
        };
        this.dictionary = {};
        this.base = base;

        if (36 < base && base < 62) {
            this.ALPHABET[base] = this.ALPHABET[base] || this.ALPHABET[62].substr(0, base);
        }

        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        } else {
            try {
                [...this.ALPHABET[base]].forEach((cipher, index) => {
                    this.dictionary[cipher] = index;
                });
            } catch (er) {
                throw Error("Unsupported base encoding.");
            }
            this.unbase = this._dictunbaser;
        }
    }

    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((cipher, index) => {
            ret += Math.pow(this.base, index) * this.dictionary[cipher];
        });
        return ret;
    }
}
