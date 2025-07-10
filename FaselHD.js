async function fetchAndSearch(keyword) {
    const url = `https://faselhd.cam/?s=${encodeURIComponent(keyword)}`;
    const res = await fetch(url);
    const html = await res.text();
    return await searchResults(html);
}

async function searchResults(html) {
    const results = [];
    const regex = /<div class="AnimationBox">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<div class="Title">([^<]+)<\/div>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        results.push({
            title: match[2].trim(),
            url: match[1],
        });
    }
    return results;
}

async function extractDetails(url) {
    const res = await fetch(url);
    const html = await res.text();

    const titleMatch = html.match(/<h1[^>]*class="entry-title"[^>]*>(.*?)<\/h1>/);
    const title = titleMatch ? titleMatch[1].trim() : null;

    const descMatch = html.match(/<meta name="description" content="(.*?)"/);
    const description = descMatch ? descMatch[1].trim() : null;

    const genres = [];
    const genreRegex = /<li class="genre">(.*?)<\/li>/g;
    let genreMatch;
    while ((genreMatch = genreRegex.exec(html)) !== null) {
        genres.push(genreMatch[1].trim());
    }

    return {
        title,
        description,
        genres,
        url,
    };
}

async function extractEpisodes(html, url) {
    const episodes = [];
    const base = url.split("/").slice(0, 3).join("/");

    const listMatch = html.match(/<div class="EpisAs">(.*?)<\/div>\s*<\/div>/s);
    if (!listMatch) return [];

    const listHtml = listMatch[1];
    const regex = /<a[^>]*href="(.*?)"[^>]*>(.*?)<\/a>/g;
    let match;
    while ((match = regex.exec(listHtml)) !== null) {
        episodes.push({
            title: match[2].trim(),
            url: match[1].startsWith("http") ? match[1] : base + match[1],
        });
    }
    return episodes;
}

async function extractStreamUrl(url) {
    const res = await fetch(url);
    const html = await res.text();

    const watchBtnMatch = html.match(/<a[^>]*class="watchBTN"[^>]*href="([^"]+)"/);
    if (!watchBtnMatch) return [];

    const watchUrl = new URL(watchBtnMatch[1], url).href;
    const watchRes = await fetch(watchUrl);
    const watchHtml = await watchRes.text();

    const iframeMatch = watchHtml.match(/<iframe[^>]*src="([^"]+)"/);
    if (iframeMatch) {
        return [{ url: iframeMatch[1] }];
    }

    const evalMatch = watchHtml.match(/eval\(function\(p,a,c,k,e,d\).*?\)/s);
    if (evalMatch) {
        const unpacked = unpack(evalMatch[0]);
        const srcMatch = unpacked.match(/src=['"]([^'"]+)['"]/);
        if (srcMatch) {
            return [{ url: srcMatch[1] }];
        }
    }

    return [];
}

function unpack(packed) {
    function evalInSandbox(p, a, c, k, e, d) {
        while (c--) {
            if (k[c]) {
                p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
            }
        }
        return p;
    }
    const pattern = /eval\(function\(p,a,c,k,e,(?:r|d)\)\{.*?\}\((.*?)\)\)/s;
    const argsMatch = packed.match(pattern);
    if (!argsMatch) return '';
    const argsRaw = `[${argsMatch[1]}]`;
    const args = eval(argsRaw);
    return evalInSandbox(...args);
}
