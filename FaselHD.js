async function searchResults(keyword) {
    const url = `https://faselhd.cam/?s=${encodeURIComponent(keyword)}`;
    const response = await fetchv2(url);
    const html = await response.text();
    const results = [];
    const regex = /<div class="Small--Box">[\s\S]*?<a\s+href="([^"]+)"[^>]*>[\s\S]*?data-src="([^"]+)"[^>]*>[\s\S]*?<h3 class="title">([\s\S]*?)<\/h3>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const href = match[1].startsWith("http") ? match[1] : `https://faselhd.cam${match[1]}`;
        results.push({
            title: match[3].replace(/<[^>]+>/g, "").trim(),
            image: match[2].trim(),
            href
        });
    }
    return JSON.stringify(results);
}

async function extractDetails(url) {
    const response = await fetchv2(url);
    const html = await response.text();
    const title = (html.match(/<h1[^>]*>(.*?)<\/h1>/) || ["",""])[1].trim();
    const description = (html.match(/<div class="StoryArea">\s*<p>([\s\S]*?)<\/p>/) || ["",""])[1].replace(/^\s*القصة\s*:\s*/i,"").trim();
    const year = (html.match(/تاريخ اصدار[^<]*<[^>]*>(\d{4})<\/a>/) || ["",""])[1];
    const poster = (html.match(/<img[^>]+src="([^"]+)"[^>]*class="imgLoaded"/) || ["",""])[1];
    const genres = [...html.matchAll(/نوع المسلسل :[\s\S]*?<a[^>]*>(.*?)<\/a>/g)].map(m=>m[1].trim());
    return { title, description, year, poster, genres };
}

async function extractEpisodes(url) {
    const cleanUrl = url.includes("/watch") ? url.replace(/\/watch\/?$/,"/") : url;
    const resp = await fetchv2(cleanUrl);
    const html = await resp.text();
    const container = html.match(/<div class="EpisAs">([\s\S]*?)<\/div>/);
    const eps = [];
    if (container) {
        const re = /<a href="([^"]+\/watch)".*?>[^<]*الحلقة[^<]*<em>(\d+)<\/em>/g;
        let m;
        while ((m = re.exec(container[1])) !== null) {
            eps.push({ title: `الحلقة ${m[2]}`, url: m[1] });
        }
    }
    return eps;
}

async function extractStreamUrl(url) {
    const resp = await fetchv2(url);
    const html = await resp.text();
    const iframe = html.match(/data-watch="([^"]+)"/);
    if (!iframe) return null;
    const res2 = await fetchv2(iframe[1]);
    const html2 = await res2.text();
    const direct = html2.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/);
    if (direct) return { url: direct[1], type: "mp4", quality: "Auto", headers: { Referer: iframe[1] } };
    const jw = html2.match(/file:\s*['"]([^'"]+\.mp4[^'"]*)['"]/);
    if (jw) return { url: jw[1], type: "mp4", quality: "Auto", headers: { Referer: iframe[1] } };
    const ob = html2.match(/eval\(function\(p,a,c,k,e,d[\s\S]+?\)\)/);
    if (ob) {
        const unpacked = unpack(ob[0]);
        const us = unpacked.match(/file:\s*['"]([^'"]+\.mp4[^'"]*)['"]/);
        if (us) return { url: us[1], type: "mp4", quality: "Auto", headers: { Referer: iframe[1] } };
    }
    return null;
}

function unpack(source) {
    const juicer = /}\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*)'\.split\('\|'\)/;
    const args = juicer.exec(source);
    const [,payload,radix,count,sym] = args;
    const symtab = sym.split("|");
    const unbaser = new Unbaser(parseInt(radix));
    const lookup = w => symtab[(radix==1?parseInt(w):unbaser.unbase(w))]||w;
    let s = payload.replace(/\b\w+\b/g,lookup);
    return s;
}

class Unbaser {
    constructor(base) {
        this.ALPHABET = {62:"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"};
        this.base = base;
        if (base>36 && base<62) this.ALPHABET[base] = this.ALPHABET[62].substr(0,base);
        if (base<=36) this.unbase = v=>parseInt(v,base);
        else {
            this.dict={};
            [...this.ALPHABET[base]].forEach((c,i)=>this.dict[c]=i);
            this.unbase = w=>[...w].reverse().reduce((p,c,i)=>p+this.dict[c]*Math.pow(this.base,i),0);
        }
    }
}
