async function searchResults(keyword) {
    const url = `https://faselhd.cam/?s=${encodeURIComponent(keyword)}`;
    const response = await fetchv2(url);
    const html = await response.text();

    const results = [];
    const regex = /<div class="Small--Box">[\s\S]*?<a\s+href="([^"]+)"[^>]*>[\s\S]*?data-src="([^"]+)"[^>]*>[\s\S]*?<h3 class="title">([\s\S]*?)<\/h3>/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
        const href = match[1].startsWith("http") ? match[1] : `https://faselhd.cam${match[1]}`;
        const image = match[2];
        const rawTitle = match[3].replace(/<[^>]+>/g, "").trim();

        const cleanedTitle = rawTitle
            .replace(/الحلقة\s*\d+(\.\d+)?(-\d+)?/gi, '')
            .replace(/والاخيرة/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!results.some(item => item.title === cleanedTitle)) {
            results.push({
                title: cleanedTitle,
                image,
                href
            });
        }
    }

    return JSON.stringify(results);
}

async function extractDetails(url) {
    const res = await fetchv2(url);
    const html = await res.text();

    const title = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '';
    const description = (html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
    const poster = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || '';
    const year = (html.match(/article:published_time[^"]*"content":"(\d{4})/) || [])[1] || '';
    const genres = [...html.matchAll(/genre\/([^/]+)\//g)].map(g => decodeURIComponent(g[1]));

    return {
        title,
        description,
        poster,
        year,
        genres,
        type: 'anime'
    };
}

async function extractEpisodes(url) {
    const response = await fetchv2(url.replace(/\/watch\/?$/, '/'));
    const html = await response.text();

    const matches = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*?>\s*الحلقة\s*<em>(\d+)<\/em>/g)];
    const episodes = [];

    for (const match of matches) {
        const href = match[1].startsWith("http") ? match[1] : `https://faselhd.cam${match[1]}`;
        const number = match[2];
        episodes.push({ url: href, number });
    }

    return episodes;
}

async function extractStreamUrl(url) {
    const response = await fetchv2(url);
    const html = await response.text();

    const iframeMatch = html.match(/data-watch="([^"]+)"/);
    if (!iframeMatch) return null;

    const iframeUrl = iframeMatch[1];
    const iframeRes = await fetchv2(iframeUrl);
    const iframeHtml = await iframeRes.text();

    const direct = iframeHtml.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/);
    if (direct) {
        return {
            url: direct[1],
            type: "mp4",
            quality: "Auto",
            headers: { Referer: iframeUrl }
        };
    }

    const jw = iframeHtml.match(/file:\s*["']([^"']+\.mp4[^"']*)["']/);
    if (jw) {
        return {
            url: jw[1],
            type: "mp4",
            quality: "Auto",
            headers: { Referer: iframeUrl }
        };
    }

    const obfuscated = iframeHtml.match(/eval\(function\(p,a,c,k,e,d[\s\S]+?\)\)/);
    if (obfuscated) {
        const unpacked = unpack(obfuscated[0]);
        const final = unpacked.match(/file:\s*["']([^"']+\.mp4[^"']*)["']/);
        if (final) {
            return {
                url: final[1],
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
    return source;
    function _filterargs(source) {
        const juicers = [/}\('(.*)', *(\d+), *(\d+), *'(.*)'\.split\('\|'\)/];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                return {
                    payload: args[1],
                    radix: parseInt(args[2]),
                    count: parseInt(args[3]),
                    symtab: args[4].split("|")
                };
            }
        }
        throw Error("Could not parse p.a.c.k.e.r");
    }
}

class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        };
        this.dictionary = {};
        this.base = base;
        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        } else {
            [...this.ALPHABET[base]].forEach((c, i) => this.dictionary[c] = i);
            this.unbase = this._dictunbaser;
        }
    }
    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((c, i) => {
            ret += Math.pow(this.base, i) * this.dictionary[c];
        });
        return ret;
    }
}
