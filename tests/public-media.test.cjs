const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../js/public.js'), 'utf8');
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
}
async function mount(fetchImpl) {
  const grid = new Element('grid');
  const fallback = new Element('fallback'); grid.children = [fallback];
  let ready, request;
  const document = {
    addEventListener(event, fn) { if (event === 'DOMContentLoaded') ready = fn; },
    getElementById(id) { return id === 'homeGallery' ? grid : null; },
    querySelector() { return null; },
    createElement(tag) { return new Element(tag); }
  };
  vm.runInNewContext(source, { document, URL, AbortController, setTimeout, clearTimeout,
    SUPABASE_URL: 'https://photos.supabase.co', SUPABASE_KEY: 'public-test-key',
    fetch: async (url, options) => { request = { url, options }; return fetchImpl(); }
  });
  ready();
  await new Promise(resolve => setImmediate(resolve));
  return { grid, fallback, request };
}
test('homepage gallery only reads public photo columns', async () => {
  const ui = await mount(() => ({ ok: true, json: async () => [] }));
  assert.match(ui.request.url, /select=image_url,caption,category/);
  assert.equal(ui.request.options.method, undefined); // fetch defaults to GET
  assert.equal(ui.request.options.headers.apikey, 'public-test-key');
  assert.equal(ui.grid.children[0], ui.fallback);
});
test('gallery failures retain actual repository photos', async () => {
  for (const fetchImpl of [() => { throw Error('offline'); }, () => ({ ok: false })]) {
    const ui = await mount(fetchImpl);
    assert.equal(ui.grid.children[0], ui.fallback);
  }
});
test('invalid gallery payload retains fallback', async () => {
  for (const payload of [null, {}, []]) {
    const ui = await mount(() => ({ ok: true, json: async () => payload }));
    assert.equal(ui.grid.children[0], ui.fallback);
  }
});
test('untrusted photo URLs are rejected without losing fallback', async () => {
  const photos = ['javascript:alert(1)', 'https://other.example/a.jpg', 'http://photos.supabase.co/a.jpg']
    .map(image_url => ({ image_url, category: 'season3', caption: 'test' }));
  const ui = await mount(() => ({ ok: true, json: async () => photos }));
  assert.equal(ui.grid.children[0], ui.fallback);
});
test('verified photo caption is text, with correct season destination', async () => {
  const caption = '<img src=x onerror=alert(1)>';
  const ui = await mount(() => ({ ok: true, json: async () => [{
    image_url: 'https://photos.supabase.co/storage/v1/object/public/gallery-photos/a.jpg',
    category: 'season2', caption
  }] }));
  const link = ui.grid.children[0];
  assert.equal(link.href, 'gallery.html?season=season2');
  assert.equal(link.children[0].alt, caption);
  assert.equal(link.children[0].loading, 'lazy');
  assert.equal(link.children[1].children[0].textContent, 'SEASON 2');
  assert.equal(link.children[1].children[1].textContent, caption);
  assert.equal(link.children[1].children[1].children.length, 0);
});
