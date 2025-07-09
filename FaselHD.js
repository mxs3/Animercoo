// 1. البحث عن الأنميات/المسلسلات
async function searchResults(keyword) {
  const url = `https://faselhd.cam/?s=${encodeURIComponent(keyword)}`;
  const html = await (await fetchv2(url)).text();
  const regex = /<div class="Small--Box">[\s\S]*?<a\s+href="([^"]+)"[^>]*>[\s\S]*?data-src="([^"]+)"[^>]*>[\s\S]*?<h3 class="title">([\s\S]*?)<\/h3>/g;

  const seen = new Set(), results = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    const href = m[1].startsWith('http') ? m[1] : `https://faselhd.cam${m[1]}`;
    if (seen.has(href)) continue;
    seen.add(href);

    const rawTitle = m[3].replace(/<[^>]+>/g, '').trim();
    const image = m[2];
    results.push({ title: rawTitle, href, image });
  }
  return results; // JSON.stringify(results) حسب استخدام Sora
}

// 2. استخراج بيانات الأنمي/المسلسل
async function extractDetails(pageUrl) {
  const html = await (await fetchv2(pageUrl)).text();
  
  const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || ['', ''])[1].trim() || 'N/A';
  const description = ((html.match(/<div class="StoryArea">[\s\S]*?<p>([\s\S]*?)<\/p>/) || ['', ''])[1]
    .replace(/^(?:القصة|القصه)\s*[:：]?/i, '').trim()) || 'N/A';
  const year = (html.match(/تاريخ\s+اصدار[^<]*<[^>]*>(\d{4})<\/a>/i) || ['', 'N/A'])[1];
  const poster = (html.match(/<div class="Poster">[\s\S]*?<img[^>]+data-src="([^"]+)"/i) || ['', ''])[1] || '';

  const genres = [...html.matchAll(/نوع المسلسل[^<]*<a[^>]*>([^<]+)<\/a>/g)].map(g => g[1].trim());
  const duration = (html.match(/مدة\s+المسلسل[^<]*<a[^>]*>([^<]+)<\/a>/i) || ['', ''])[1] || '';
  const awards = (html.match(/جوائز\s+المسلسل[^<]*<a[^>]*>([^<]+)<\/a>/i) || ['', ''])[1] || '';

  const aliases = [];
  const block = html.match(/<ul class="RightTaxContent">([\s\S]*?)<\/ul>/i);
  if (block) {
    for (const li of block[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
      const inner = li[1];
      const lbl = (inner.match(/<span[^>]*>([^<]+)<\/span>/) || ['', ''])[1].trim();
      let vals = [...inner.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(x => x[1].trim());
      if (vals.length === 0) {
        const s = (inner.match(/<strong>([^<]+)<\/strong>/) || ['', ''])[1];
        if (s) vals.push(s.trim());
      }
      if (lbl && vals.length) aliases.push(`${lbl}: ${vals.join(', ')}`);
    }
  }

  return { title, description, year, poster, genres, duration, awards, aliases: aliases.join('\n') };
}

// 3. استخراج الحلقات وروابط السيرفرات
async function extractEpisodes(pageUrl) {
  const baseUrl = pageUrl.endsWith('/watch/') ? pageUrl.replace(/\/watch\/$/, '/') : pageUrl;
  const html = await (await fetchv2(baseUrl)).text();
  
  const listBlock = html.match(/<div class="EpisodesList">([\s\S]*?)<\/div>/);
  if (!listBlock) return [];

  const episodes = [];
  for (const a of listBlock[1].matchAll(/<a[^>]+href="([^"]+)"[^>]*>\s*الحلقة\s*<em>(\d+)<\/em>/g)) {
    const epUrl = a[1].startsWith('http') ? a[1] : `https://faselhd.cam${a[1]}`;
    const epHtml = await (await fetchv2(epUrl)).text();

    const sources = [...epHtml.matchAll(/<li\s+data-watch="([^"]+)"[^>]*><span>[^<]*<\/span>([^<]+)<\/li>/g)]
      .map(x => ({ name: x[2].trim(), url: x[1] }));
    episodes.push({ number: a[2], url: epUrl, sources });
  }
  return episodes;
}

// 4. استخراج رابط الفيديو نفسه
async function extractStreamUrl(sourceUrl) {
  const html = await (await fetchv2(sourceUrl)).text();
  const iframeUrl = (html.match(/data-watch="([^"]+)"/) || ['', ''])[1];
  if (!iframeUrl) return null;

  const iframeHtml = await (await fetchv2(iframeUrl)).text();
  const direct = iframeHtml.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/);
  const jw = iframeHtml.match(/file:\s*["']([^"']+\.mp4[^"]*)["']/);
  const obf = iframeHtml.match(/eval\(function\(p,a,c,k,e,d[\s\S]+?\)\)/);

  let mediaUrl = direct ? direct[1] : jw ? jw[1] : null;
  if (!mediaUrl && obf) {
    const up = unpack(obf[0]);
    mediaUrl = (up.match(/file:\s*["']([^"']+\.mp4[^"]*)["']/) || ['', ''])[1];
  }
  if (!mediaUrl) return null;
  return { url: mediaUrl, type: 'mp4', quality: 'Auto', headers: { Referer: iframeUrl } };
}

// 5. دعم فك تشفير الأكواد
function unpack(packedCode) {
    const args = _filterArgs(packedCode);
    if (!args) return '';

    const { payload, symtab, radix, count } = args;
    if (count !== symtab.length) throw new Error("Malformed p.a.c.k.e.r. symtab.");

    const unbase = new Unbaser(radix);

    function lookup(word) {
        const value = radix === 1 ? parseInt(word) : unbase.unbase(word);
        return symtab[value] || word;
    }

    const unpacked = payload.replace(/\b\w+\b/g, lookup);
    return unpacked;
}

function _filterArgs(source) {
    const pattern = /}\('(.*)', *(\d+), *(\d+), *'(.*)'\.split\('\|'\)/;
    const match = pattern.exec(source);
    if (!match) return null;

    return {
        payload: match[1],
        radix: parseInt(match[2]),
        count: parseInt(match[3]),
        symtab: match[4].split('|')
    };
}

class Unbaser {
    constructor(base) {
        this.base = base;
        this.ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        this.dict = {};

        for (let i = 0; i < this.ALPHABET.length; i++) {
            this.dict[this.ALPHABET[i]] = i;
        }
    }

    unbase(str) {
        let result = 0;
        for (let i = 0; i < str.length; i++) {
            result = result * this.base + this.dict[str[i]];
        }
        return result;
    }
}
