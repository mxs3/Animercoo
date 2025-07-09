async function searchResults(keyword) {
    const uniqueResults = new Map();

    const url = `https://faselhd.cam/?s=${encodeURIComponent(keyword)}`;
    const response = await fetchv2(url);
    const html = await response.text();

    const regex = /<div class="Small--Box">[\s\S]*?<a\s+href="([^"]+)"[^>]*>[\s\S]*?data-src="([^"]+)"[^>]*>[\s\S]*?<h3 class="title">([\s\S]*?)<\/h3>/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
        const href = match[1].startsWith("http") ? match[1] : `https://faselhd.cam${match[1]}`;
        const image = match[2];
        const rawTitle = match[3].replace(/<[^>]+>/g, "").trim();

        const cleanedTitle = rawTitle
            .replace(/الحلقة\s*\d+(\.\d+)?(-\d+)?/gi, '')
            .replace(/الحلقة\s*\d+/gi, '')
            .replace(/والاخيرة/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!uniqueResults.has(cleanedTitle)) {
            uniqueResults.set(cleanedTitle, {
                title: cleanedTitle,
                image,
                href
            });
        }
    }

    const deduplicated = Array.from(uniqueResults.values());
    return JSON.stringify(deduplicated);
}

async function extractDetails(url) {
    const response = await fetchv2(url);
    const html = await response.text();

    const title = (html.match(/<h1[^>]*class="Title"[^>]*>(.*?)<\/h1>/i) || [null, null])[1]?.trim() || 'N/A';

    const description = (html.match(/<div class="StoryArea">\s*<p>(.*?)<\/p>/i) || [null, null])[1]
        ?.replace(/^(?:القصة|القصه)\s*[:：]?\s*/i, "")
        ?.trim() || 'N/A';

    const year = (html.match(/تاريخ (?:الاصدار|الإصدار)[^<]*?<a[^>]*>(\d{4})<\/a>/i) || [null, null])[1] || 'N/A';

    const poster = (html.match(/<img[^>]+class="imgLoaded"[^>]+src="([^"]+)"/i) || [null, null])[1] || 'N/A';

    const genresBlock = html.match(/<div class="Generes[^>]*>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);
    let genres = [];

    if (genresBlock) {
        genres = [...genresBlock[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(m => m[1].trim());
    }

    const aliases = [];

    const metaSection = html.match(/<ul class="RightTaxContent">([\s\S]*?)<\/ul>/i);
    if (metaSection) {
        const liMatches = [...metaSection[1].matchAll(/<li[^>]*>(.*?)<\/li>/g)];
        for (const li of liMatches) {
            const labelMatch = li[1].match(/<span[^>]*>(.*?)<\/span>/);
            const valueMatch = li[1].match(/<\/span>([\s\S]*)/);
            const label = labelMatch ? labelMatch[1].trim() : '';
            let values = [];

            if (valueMatch) {
                values = [...valueMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(x => x[1].trim());
                if (values.length === 0) {
                    const strongVal = valueMatch[1].match(/<strong>([^<]+)<\/strong>/);
                    if (strongVal) values.push(strongVal[1].trim());
                }
            }

            if (label && values.length > 0) {
                aliases.push(`${label}: ${values.join(', ')}`);
            }
        }
    }

    return {
        title,
        description,
        year,
        poster,
        genres,
        aliases: aliases.join('\n')
    };
}

async function extractEpisodes(html, url = "") {
    if (url.includes("/watch")) {
        const cleanedUrl = url.replace(/\/watch\/?$/, "/");
        const response = await fetchv2(cleanedUrl);
        html = await response.text();
    }

    const episodes = [];
    const blockMatch = html.match(/<div class="EpisAs">([\s\S]*?)<\/div>/);
    if (blockMatch) {
        const epRegex = /<a href="([^"]+\/watch)">[^<]*الحلقة[^<]*(\d+)[^<]*<\/a>/g;
        let epMatch;
        while ((epMatch = epRegex.exec(blockMatch[1])) !== null) {
            episodes.push({
                href: epMatch[1],
                number: epMatch[2]
            });
        }
    }
    return episodes;
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
