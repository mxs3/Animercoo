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
  return results;
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

// 3. استخراج روابط الحلقات فقط (بدون تحميل صفحاتها)
async function extractEpisodes(pageUrl) {
  const baseUrl = pageUrl.endsWith('/watch/') ? pageUrl.replace(/\/watch\/$/, '/') : pageUrl;
  const html = await (await fetchv2(baseUrl)).text();

  const matches = [...html.matchAll(/<a[^>]+href="([^"]+\/watch\/)"[^>]*>\s*الحلقة\s*<em>(\d+)<\/em>/g)];
  const episodes = matches.map(m => {
    const url = m[1].startsWith('http') ? m[1] : `https://faselhd.cam${m[1]}`;
    return { number: m[2], url };
  });

  return episodes;
}

// 4. استخراج رابط البث الحقيقي من صفحة السيرفر
async function extractStreamUrl(sourceUrl) {
  const html = await (await fetchv2(sourceUrl)).text();
  const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"[^>]*>/i);
  if (!iframeMatch) return null;

  const iframeUrl = iframeMatch[1].startsWith('http') ? iframeMatch[1] : `https:${iframeMatch[1]}`;
  const iframeHtml = await (await fetchv2(iframeUrl)).text();

  let mediaUrl = null;

  const direct = iframeHtml.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/);
  if (direct) mediaUrl = direct[1];

  const jw = iframeHtml.match(/file:\s*["']([^"']+\.mp4[^"]*)["']/);
  if (!mediaUrl && jw) mediaUrl = jw[1];

  const obf = iframeHtml.match(/eval\(function\(p,a,c,k,e,d[\s\S]+?\)\)/);
  if (!mediaUrl && obf) {
    const unpacked = unpack(obf[0]);
    mediaUrl = (unpacked.match(/file:\s*["']([^"']+\.mp4[^"]*)["']/) || ['', ''])[1];
  }

  if (!mediaUrl) return null;
  return { url: mediaUrl, type: 'mp4', quality: 'Auto', headers: { Referer: iframeUrl } };
}

// 5. فك تشفير الأكواد
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
