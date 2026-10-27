// Power Hitters — Gallery (Supabase Storage + database backed)
// Everyone can VIEW photos. Only the logged-in admin can UPLOAD new ones.

document.addEventListener('DOMContentLoaded', function () {
  var galGrid = document.getElementById('galGrid');
  if (!galGrid) return; // not on the gallery page

  var SUPABASE_URL = 'https://icebgysininolvjbueet.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_h654diItHmAibeSCRd1y6w_iyLyPB-4';
  var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  var requestedSeason = new URLSearchParams(window.location.search).get('season');
  var currentFilter = ['season1', 'season2', 'season3'].indexOf(requestedSeason) !== -1 ? requestedSeason : 'all';
  document.querySelectorAll('.gal-filter').forEach(function (button) {
    button.classList.toggle('active', button.dataset.filter === currentFilter);
    button.setAttribute('aria-pressed', String(button.dataset.filter === currentFilter));
  });
  var isAdmin = false;
  var allPhotos = [];

  var emptyMessages = {
    season3: 'No Season 3 photos yet.',
    season2: 'No Season 2 photos yet.',
    season1: 'No Season 1 photos yet.',
    winners: 'No winner photos yet.'
  };

  // ---------- Load + render photos (everyone) ----------
  function loadPhotos() {
    supabaseClient
      .from('gallery_photos')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function (result) {
        if (result.error) {
          galGrid.innerHTML = '<div class="gal-item empty"><span>Could not load photos.</span></div>';
          return;
        }
        allPhotos = result.data || [];
        render();
      });
  }

  function render() {
    var filtered = currentFilter === 'all' ? allPhotos : allPhotos.filter(function (p) { return p.category === currentFilter; });
    galGrid.innerHTML = '';

    if (isAdmin) {
      var addTile = document.createElement('div');
      addTile.className = 'gal-add-tile';
      addTile.innerHTML = '<div class="plus">+</div><span>Add Photo</span>';
      addTile.addEventListener('click', function () {
        document.getElementById('uploadModal').classList.add('open');
      });
      galGrid.appendChild(addTile);
    }

    if (filtered.length === 0) {
      var msg = currentFilter === 'all' ? 'No photos yet.' : (emptyMessages[currentFilter] || 'No photos in this category yet.');
      var empty = document.createElement('div');
      empty.className = 'gal-item empty';
      empty.innerHTML = '<div class="ic">📷</div><span>' + msg + '</span>';
      galGrid.appendChild(empty);
      return;
    }

    filtered.forEach(function (p) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'gal-item';
      item.setAttribute('aria-label', 'View photo: ' + (p.caption || 'PowerHitters tournament photo'));
      var image = document.createElement('img');
      image.src = p.image_url;
      image.alt = p.caption || 'Power Hitters photo';
      image.loading = 'lazy';
      image.width = 800; image.height = 800;
      var caption = document.createElement('span');
      caption.className = 'cap'; caption.textContent = p.caption || '';
      item.append(image, caption);
      item.addEventListener('click', function () {
        openLightbox(p.image_url, p.caption);
      });
      galGrid.appendChild(item);
    });
  }

  // filters
  document.querySelectorAll('.gal-filter').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.gal-filter').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
      currentFilter = btn.dataset.filter;
      render();
    });
  });

  // lightbox
  var lightbox = document.getElementById('lightbox');
  var lbImg = document.getElementById('lightboxImg');
  var lbCap = document.getElementById('lightboxCap');
  var photoTrigger = null;
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Tournament photo');
  function openLightbox(src, cap) {
    photoTrigger = document.activeElement;
    lbImg.src = src;
    lbImg.alt = cap || "PowerHitters tournament photo";
    lbCap.textContent = cap || '';
    lightbox.classList.add('open');
    document.getElementById('lightboxClose').focus();
  }
  function closeLightbox() {
    lightbox.classList.remove('open');
    if (photoTrigger && photoTrigger.isConnected) photoTrigger.focus();
  }
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function (event) {
    if (!lightbox.classList.contains('open')) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'Tab') {
      event.preventDefault(); document.getElementById('lightboxClose').focus();
    }
  });
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  // ---------- Admin: check login + upload ----------
  var modal = document.getElementById('uploadModal');
  var uploadForm = document.getElementById('uploadForm');
  var fileInput = document.getElementById('uploadFile');

  document.getElementById('uploadCancel').addEventListener('click', function () {
    modal.classList.remove('open');
    uploadForm.reset();
  });

  uploadForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    try { await window.PowerHittersRequireAdmin(supabaseClient); }
    catch (error) { isAdmin = false; modal.classList.remove('open'); render(); alert(error.message); return; }
    var file = fileInput.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024 || !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
      alert('Choose a JPEG, PNG, WebP, GIF or HEIC photo up to 20 MB.'); return;
    }
    var category = document.getElementById('uploadCategory').value;
    var caption = document.getElementById('uploadCaption').value.trim();
    if (!['season1', 'season2', 'season3', 'winners'].includes(category) || caption.length > 500) { alert('Choose a valid category and a caption up to 500 characters.'); return; }
    var submitBtn = uploadForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';

    // iPhone photos are often in HEIC format, which browsers can't display.
    // Detect and convert to JPEG first so the photo actually shows up.
    var isHeic = /\.heic$|\.heif$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';

    function proceedWithFile(finalFile, extension) {
      var filePath = category + '/' + Date.now() + '-' + file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\-_]/g, '') + '.' + extension;

      supabaseClient.storage
        .from('gallery-photos')
        .upload(filePath, finalFile)
        .then(function (uploadResult) {
          if (uploadResult.error) {
            alert('Upload failed: ' + uploadResult.error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Upload';
            return;
          }
          var publicUrlData = supabaseClient.storage.from('gallery-photos').getPublicUrl(filePath);
          var imageUrl = publicUrlData.data.publicUrl;

          return supabaseClient
            .from('gallery_photos')
            .insert([{ category: category, caption: caption, image_url: imageUrl }])
            .then(function (insertResult) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Upload';
              if (insertResult.error) {
                alert('Could not save photo info: ' + insertResult.error.message);
                return;
              }
              modal.classList.remove('open');
              uploadForm.reset();
              loadPhotos();
            });
        });
    }

    if (isHeic && window.heic2any) {
      submitBtn.textContent = 'Converting...';
      heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 })
        .then(function (convertedBlob) {
          proceedWithFile(convertedBlob, 'jpg');
        })
        .catch(function (err) {
          alert('Could not convert this HEIC photo. Try a different photo or convert it to JPEG first.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Upload';
        });
    } else {
      var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      proceedWithFile(file, ext);
    }
  });

  // Public photos remain available when no approved admin session exists.
  loadPhotos();
  async function refreshAccess() {
    try { await window.PowerHittersRequireAdmin(supabaseClient); isAdmin = true; }
    catch (error) { isAdmin = false; modal.classList.remove('open'); }
    render();
  }
  refreshAccess();
  supabaseClient.auth.onAuthStateChange(function () {
    // Do not call Supabase methods inside the auth callback lock.
    setTimeout(refreshAccess, 0);
  });
});
