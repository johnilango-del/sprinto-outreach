import * as cheerio from 'cheerio';
import { norm, wordCount } from './text.js';

// Elements that start a new line when turning HTML into text.
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'button', 'caption', 'dd', 'details', 'dialog', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'label',
  'legend', 'li', 'main', 'nav', 'ol', 'option', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'ul',
]);

const ALWAYS_REMOVE = 'script, style, noscript, template, svg, canvas, iframe, object, embed, link, meta';
const MAX_RAW = 200000;
const MAX_CLEAN = 8000;

function walk(node, out) {
  const children = node.children || [];
  for (const child of children) {
    if (child.type === 'text') {
      out.push(child.data || '');
    } else if (child.type === 'tag' || child.type === 'script' || child.type === 'style') {
      const name = (child.name || '').toLowerCase();
      if (name === 'img') {
        // Certification badges are often images: keep their alt text.
        const alt = (child.attribs && (child.attribs.alt || child.attribs.title)) || '';
        if (alt.trim()) out.push('\n' + alt + '\n');
        continue;
      }
      const isBlock = BLOCK.has(name);
      if (isBlock) out.push('\n');
      walk(child, out);
      if (isBlock) out.push('\n');
    }
  }
}

function toLines(root) {
  const out = [];
  if (root) walk(root, out);
  const lines = out
    .join('')
    .split('\n')
    .map((l) => l.replace(/[\s ]+/g, ' ').trim())
    .filter(Boolean);
  // drop immediately repeated lines (common in menus and carousels)
  const result = [];
  for (const l of lines) if (result[result.length - 1] !== l) result.push(l);
  return result;
}

function rootOf($) {
  const body = $('body').get(0);
  return body || $.root().get(0);
}

// Raw text: the whole page INCLUDING header, footer and badges. Used for the certification check.
function rawText(html) {
  const $ = cheerio.load(html);
  $(ALWAYS_REMOVE).remove();
  return toLines(rootOf($)).join('\n').slice(0, MAX_RAW);
}

const BANNER_RE = /cookie|consent|onetrust|cookiebot|cc-window|cc-banner|truste|gdpr-banner|osano|termly|iubenda/i;

// Clean text: main content only, for the AI.
function cleanText(html) {
  const $ = cheerio.load(html);
  $(ALWAYS_REMOVE).remove();
  $('nav, footer, aside, form, dialog, [role="navigation"], [role="contentinfo"], [role="dialog"], [aria-modal="true"]').remove();
  // <header> is removed unless it holds the page's main heading (many sites put the hero in a header tag).
  $('header, [role="banner"]').each((_, el) => {
    if ($(el).find('h1').length === 0) $(el).remove();
  });
  // cookie / consent banners
  const banners = [];
  $('[id], [class]').each((_, el) => {
    const name = (el.name || '').toLowerCase();
    if (name === 'html' || name === 'body' || name === 'main') return;
    const sig = `${el.attribs?.id || ''} ${el.attribs?.class || ''}`;
    if (BANNER_RE.test(sig) && wordCount($(el).text()) < 300) banners.push(el);
  });
  for (const el of banners) $(el).remove();

  const lines = toLines(rootOf($));

  // Build blocks: a long line is its own block; consecutive short lines are grouped
  // (so a pricing card like "Enterprise / SSO / Audit logs / Contact us" survives).
  // Blocks under 8 words are dropped, duplicate blocks are removed.
  const blocks = [];
  let group = [];
  const flush = () => {
    if (group.length) blocks.push(group.join('\n'));
    group = [];
  };
  for (const line of lines) {
    if (wordCount(line) >= 8) {
      flush();
      blocks.push(line);
    } else {
      group.push(line);
      if (group.length >= 12) flush();
    }
  }
  flush();

  const seen = new Set();
  const kept = [];
  let total = 0;
  for (const b of blocks) {
    if (wordCount(b) < 8) continue;
    const key = norm(b);
    if (seen.has(key)) continue;
    seen.add(key);
    if (total + b.length + 2 > MAX_CLEAN) {
      if (total === 0) kept.push(b.slice(0, MAX_CLEAN));
      break;
    }
    kept.push(b);
    total += b.length + 2;
  }
  return kept.join('\n\n');
}

function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const links = [];
  $('a[href]').each((_, el) => {
    if (links.length >= 400) return;
    const href = (el.attribs?.href || '').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    let abs;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(abs.protocol)) return;
    abs.hash = '';
    const key = abs.toString();
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ href: key, text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 80) });
  });
  return links;
}

export function extractPage(html, baseUrl) {
  const $ = cheerio.load(html);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 200);
  const raw_text = rawText(html);
  const clean_text = cleanText(html);
  return {
    title,
    raw_text,
    clean_text,
    word_count: wordCount(clean_text),
    links: extractLinks(html, baseUrl),
  };
}
