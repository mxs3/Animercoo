async function searchResults(keyword) {
    const uniqueResults = new Map();

    for (let i = 1; i <= 5; i++) {
        const url = `https://fasselhd.com/page/${i}/?s=${encodeURIComponent(keyword)}`;
        const response = await soraFetch(url);
        const html = await response.text();

        const regex = /<a href="([^"]+)"[^>]*class="item-link"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1].trim();
            const image = match[2].trim();
            const rawTitle = match[3].trim();

            const cleanedTitle = rawTitle
                .replace(/الحلقة\s*\d+(\.\d+)?(-\d+)?/gi, '')
                .replace(/الحلقة\s*\d+/gi, '')
                .replace(/والاخيرة/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            if (!uniqueResults.has(cleanedTitle)) {
                uniqueResults.set(cleanedTitle, {
                    title: cleanedTitle,
                    href,
                    image
                });
            }
        }
    }

    const deduplicated = Array.from(uniqueResults.values());
    console.log(deduplicated);
    return JSON.stringify(deduplicated);
}

async function extractDetails(url) {
    const response = await soraFetch(url);
    const html = await response.text();

    const descriptionMatch = html.match(/<div class="post-content-inner">[\s\S]*?<p>([\s\S]*?)<\/p>/);
    const description = descriptionMatch ? descriptionMatch[1].trim() : 'N/A';

    const airdateMatch = html.match(/<li><strong>السنة:<\/strong>\s*([^<]+)<\/li>/i);
    const airdate = airdateMatch ? airdateMatch[1].trim() : 'N/A';

    const genreMatches = [...html.matchAll(/<li><strong>النوع:<\/strong>\s*([^<]+)<\/li>/gi)];
    const genres = genreMatches.map(m => m[1].trim()).join(', ') || 'N/A';

    const directorMatch = html.match(/<li><strong>المخرج:<\/strong>\s*([^<]+)<\/li>/i);
    const director = directorMatch ? directorMatch[1].trim() : null;

    const statusMatch = html.match(/<li><strong>الحالة:<\/strong>\s*([^<]+)<\/li>/i);
    const status = statusMatch ? statusMatch[1].trim() : null;

    const result = { description, airdate, genres, director, status };
    console.log('Details:', result);
    return JSON.stringify(result);
}

async function extractEpisodes(url) {
    const response = await soraFetch(url);
    const html = await response.text();

    const isSeries = /class="seasons"/.test(html);
    const results = [];

    if (isSeries) {
        const seasonHrefs = [...html.matchAll(/<a href="([^"]+)"[^>]*class="season-link"/g)]
            .map(m => m[1].trim());

        for (const seasonUrl of seasonHrefs) {
            const seasonRes = await soraFetch(seasonUrl);
            const seasonHtml = await seasonRes.text();

            const episodeRegex = /<a href="([^"]+)"[^>]*class="episode-link"[^>]*>[\s\S]*?<span class="epi-num">(\d+)<\/span>/g;
            let m;
            while ((m = episodeRegex.exec(seasonHtml)) !== null) {
                results.push({
                    href: m[1].trim(),
                    number: parseInt(m[2], 10)
                });
            }
        }
    } else {
        const watchMatch = html.match(/<a[^>]*href="([^"]+)"[^>]*class="play-btn"/);
        if (watchMatch) {
            results.push({ href: watchMatch[1].trim(), number: 1 });
        }
    }

    results.reverse();
    console.log('Episodes:', results);
    return JSON.stringify(results);
}

async function extractStreamUrl(url) {
    if (!_0xCheck()) return 'https://files.catbox.moe/avolvc.mp4';

    const pageRes = await soraFetch(url);
    const pageHtml = await pageRes.text();
    const next = pageHtml.match(/<a class="watch" href="([^"]+)"/);
    const watchUrl = next ? next[1].trim() : null;
    if (!watchUrl) return JSON.stringify({ streams: [], subtitles: "" });

    const watchRes = await soraFetch(watchUrl);
    const watchHtml = await watchRes.text();
    const regex = /<li[^>]+data-id="([^"]+)"[^>]+data-server="([^"]+)"/g;
    const matches = [];
    let m;
    while ((m = regex.exec(watchHtml)) !== null) {
        matches.push({ dataId: m[1], dataServer: m[2] });
    }

    const embeds = [];
    for (const mm of matches) {
        const postUrl = "https://fasselhd.com/wp-content/themes/movies2023/Ajaxat/Single/Server.php";
        const headers = {
            "Host": "fasselhd.com",
            "Origin": "https://fasselhd.com",
            "Referer": watchUrl,
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
        };
        const res = await soraFetch(postUrl, {
            method: "POST",
            headers,
            body: `id=${mm.dataId}&i=${mm.dataServer}`
        });
        const text = await res.text();
        const f = text.match(/<iframe[^>]+src="([^"]+)"/);
        if (f) embeds.push(f[1].trim());
    }

    const streams = [];
    for (const embed of embeds) {
        const resEmbed = await soraFetch(embed, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": watchUrl,
                "Accept": "text/html"
            }
        });
        const htmlE = await resEmbed.text();
        const sMatch = htmlE.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]*?)<\/script>/);
        if (!sMatch) continue;
        const unpacked = unpack(sMatch[1]);

        let fileMatch = unpacked.match(/file:\s*"([^"]+)"/);
        if (fileMatch) {
            streams.push({ title: "FasselHD Stream", streamUrl: fileMatch[1].trim(), headers: {} });
            continue;
        }

        fileMatch = unpacked.match(/https?:\/\/[^"'\s]+\/hls2\/[^"'\s]+/g);
        if (fileMatch) {
            streams.push({ title: "FasselHD HLS", streamUrl: fileMatch[0].trim(), headers: {} });
            continue;
        }
    }

    streams.reverse();
    return JSON.stringify({ streams, subtitles: "" });
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers, options.method, options.body);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (e2) {
            return null;
        }
    }
}

function _0xCheck() {
    return true;
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
            [...this.ALPHABET[base]].forEach((c, i) => {
                this.dictionary[c] = i;
            });
            this.unbase = this._dictunbaser;
        }
    }
    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((c, idx) => {
            ret += Math.pow(this.base, idx) * this.dictionary[c];
        });
        return ret;
    }
}

function unpack(source) {
    const juicer1 = /\}$begin:math:text$'(.*)', *(\\d+|\\[\\]), *(\\d+), *'(.*)'\\.split\\('\\|'$end:math:text$, *(\d+), *(.*)\)\)/;
    const juicer2 = /\}$begin:math:text$'(.*)', *(\\d+|\\[\\]), *(\\d+), *'(.*)'\\.split\\('\\|'$end:math:text$/;
    let args = juicer1.exec(source) || juicer2.exec(source);
    if (!args) throw new Error("Bad Packer.");
    let payload = args[1];
    let radix = parseInt(args[2]);
    let count = parseInt(args[3]);
    let symtab = args[4].split('|');
    if (count !== symtab.length) throw new Error("Bad symtab");
    let unbase = new Unbaser(radix);
    function lookup(word) {
        return radix === 1 ? symtab[parseInt(word)] : symtab[unbase.unbase(word)] || word;
    }
    return payload.replace(/\b\w+\b/g, lookup);
}
