function searchResults(html) {
    const results = [];
    const baseUrl = "https://faselhd.cam";

    const itemRegex = /<div class="Small--Box">[\s\S]*?<a\s+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+data-src="([^"]+)"[^>]*>[\s\S]*?<h3 class="title">([\s\S]*?)<\/h3>/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null) {
        const href = match[1].startsWith("http") ? match[1] : baseUrl + match[1];
        const image = match[2];
        const title = match[3].replace(/\s+/g, " ").trim();

        results.push({
            title: title,
            image: image,
            href: href
        });
    }

    return results;
}

function extractDetails(html) {
    const descriptionMatch = html.match(/<div class="text-sm md:text-base leading-loose text-justify">([^<]+)<\/div>/);
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/);
    const aliases = titleMatch ? titleMatch[1].trim() : '';
    return [{
        description,
        aliases,
        airdate: "N/A"
    }];
}

function extractEpisodes(html) {
    const episodes = [];
    const regex = /<div class="EpisAs">([\s\S]*?)<\/div>/;
    const match = html.match(regex);
    if (match) {
        const epRegex = /<a href="([^"]+\/watch)">[^<]*الحلقة[^<]*(\d+)[^<]*<\/a>/g;
        let epMatch;
        while ((epMatch = epRegex.exec(match[1])) !== null) {
            episodes.push({
                href: epMatch[1],
                number: epMatch[2]
            });
        }
    }
    return episodes;
}

async function extractStreamUrl(html) {
    const match = html.match(/data-watch="([^"]+)"/);
    if (!match) return null;
    const iframeUrl = match[1];
    const response = await fetch(iframeUrl);
    const innerHtml = await response.text();
    const directSource = innerHtml.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/);
    if (directSource) return directSource[1];
    const jwplayerSource = innerHtml.match(/file:\s*["']([^"']+\.mp4[^"']*)["']/);
    if (jwplayerSource) return jwplayerSource[1];
    const obfuscatedScript = innerHtml.match(/eval\(function\(p,a,c,k,e,d[\s\S]+?\)\)/);
    if (obfuscatedScript) {
        const unpacked = unpack(obfuscatedScript[0]);
        const unpackedSource = unpacked.match(/file:\s*["']([^"']+\.mp4[^"']*)["']/);
        if (unpackedSource) return unpackedSource[1];
    }
    return null;
}

function detect(source) {
    return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
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
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                return {
                    payload: args[1],
                    symtab: args[4].split("|"),
                    radix: parseInt(args[2]),
                    count: parseInt(args[3]),
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
            95: "' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
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
            ret += (Math.pow(this.base, index)) * this.dictionary[cipher];
        });
        return ret;
    }
}
