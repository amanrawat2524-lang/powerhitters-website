/* Public navigation and a read-only photo selection. Never writes to Supabase. */
document.addEventListener('DOMContentLoaded', function () {
  var menu = document.getElementById('site-menu');
  var toggle = document.querySelector('.site-nav .burger');
  if (menu && toggle) {
    // main.js owns the existing open/close behaviour.
    var updateExpanded = function () { toggle.setAttribute('aria-expanded', String(menu.classList.contains('open'))); };
    toggle.addEventListener('click', updateExpanded);
    menu.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', updateExpanded); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menu.classList.contains('open')) {
        menu.classList.remove('open'); updateExpanded(); toggle.focus();
      }
    });
  }
  var grid = document.getElementById('homeGallery');
  if (!grid || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') return;
  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 8000);
  fetch(SUPABASE_URL + '/rest/v1/gallery_photos?select=image_url,caption,category&order=created_at.desc&limit=3', {
    headers: { apikey: SUPABASE_KEY }, signal: controller.signal
  }).then(function (response) {
    if (!response.ok) throw new Error('Gallery unavailable');
    return response.json();
  }).then(function (photos) {
    if (!Array.isArray(photos)) return;
    var labels = { season1: 'SEASON 1', season2: 'SEASON 2', season3: 'SEASON 3', winners: 'WINNERS' };
    var items = photos.filter(function (photo) {
      try {
        var image = new URL(photo.image_url);
        return image.protocol === 'https:' && image.origin === new URL(SUPABASE_URL).origin;
      } catch (error) { return false; }
    }).map(function (photo) {
      var link = document.createElement('a'); link.className = 'archive-photo';
      link.href = ['season1', 'season2', 'season3'].indexOf(photo.category) !== -1 ? 'gallery.html?season=' + photo.category : 'gallery.html';
      var img = document.createElement('img'); img.src = photo.image_url;
      img.alt = photo.caption || 'Photo from the PowerHitters archive'; img.loading = 'lazy';
      img.width = 800; img.height = 600;
      var caption = document.createElement('span');
      var category = document.createElement('small'); category.textContent = labels[photo.category] || 'FROM THE ARCHIVE';
      var title = document.createElement('strong'); title.textContent = photo.caption || 'POWERHITTERS MOMENTS';
      caption.append(category, title); link.append(img, caption); return link;
    });
    // Keep the real repository photo fallback when no usable gallery photos exist.
    if (items.length) grid.replaceChildren.apply(grid, items);
  }).catch(function () {
    // Existing archive photos remain visible when the read is unavailable.
  }).finally(function () { clearTimeout(timeout); });
});
