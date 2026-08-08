// Power Hitters — shared site behaviour

document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav toggle
  var burger = document.querySelector('.burger');
  var navlinks = document.querySelector('.navlinks');
  if (burger && navlinks) {
    burger.addEventListener('click', function () {
      navlinks.classList.toggle('open');
    });
    navlinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navlinks.classList.remove('open');
      });
    });
  }

  // ---------- COUNTDOWN TIMER (Season 3: 8 Aug 2026, 9:00 AM) ----------
  var cdEl = document.getElementById('countdown');
  if (cdEl) {
    var target = new Date('2026-08-08T09:00:00+05:30').getTime();
    var d = document.getElementById('cd-days');
    var h = document.getElementById('cd-hours');
    var m = document.getElementById('cd-mins');
    var s = document.getElementById('cd-secs');
    function tick() {
      var now = Date.now();
      var diff = target - now;
      if (diff <= 0) {
        cdEl.classList.add('done');
        return;
      }
      var days = Math.floor(diff / 86400000);
      var hours = Math.floor((diff % 86400000) / 3600000);
      var mins = Math.floor((diff % 3600000) / 60000);
      var secs = Math.floor((diff % 60000) / 1000);
      if (d) d.textContent = days;
      if (h) h.textContent = String(hours).padStart(2, '0');
      if (m) m.textContent = String(mins).padStart(2, '0');
      if (s) s.textContent = String(secs).padStart(2, '0');
    }
    tick();
    setInterval(tick, 1000);
  }

  // ---------- GALLERY (localStorage-backed, client-side only) ----------
  // Photos live in the visitor's own browser (localStorage) until you wire
  // up real hosting/a backend. Good enough for you to preview how the
  // gallery works and to drop in your own photos for now.
  var galGrid = document.getElementById('galGrid');
  if (galGrid) {
    var STORAGE_KEY = 'ph_gallery_photos_v1';
    var currentFilter = 'all';

    function getPhotos() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      } catch (e) {
        return [];
      }
    }
    function savePhotos(photos) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
      } catch (e) {
        alert('Could not save photo — it may be too large for browser storage.');
      }
    }

    var emptyMessages = {
      season3: 'No Season 3 photos yet — add match day shots here.',
      season2: 'No Season 2 photos yet — add match day shots here.',
      season1: 'No Season 1 photos yet — add match day shots here.',
      winners: 'No winner photos yet — add trophy moments here.'
    };

    function render() {
      var photos = getPhotos();
      var filtered = currentFilter === 'all' ? photos : photos.filter(function (p) { return p.category === currentFilter; });
      galGrid.innerHTML = '';

      // Add-photo tile always first
      var addTile = document.createElement('div');
      addTile.className = 'gal-add-tile';
      addTile.id = 'galAddTile';
      addTile.innerHTML = '<div class="plus">+</div><span>Add Photo</span>';
      addTile.addEventListener('click', openUploadModal);
      galGrid.appendChild(addTile);

      if (filtered.length === 0) {
        var msg = currentFilter === 'all' ? 'No photos yet — click "Add Photo" to upload your first one.' : (emptyMessages[currentFilter] || 'No photos in this category yet.');
        var empty = document.createElement('div');
        empty.className = 'gal-item empty';
        empty.innerHTML = '<div class="ic">📷</div><span>' + msg + '</span>';
        galGrid.appendChild(empty);
        return;
      }

      filtered.slice().reverse().forEach(function (p) {
        var item = document.createElement('div');
        item.className = 'gal-item';
        item.innerHTML = '<img src="' + p.src + '" alt="' + (p.caption || 'Power Hitters photo') + '"><div class="cap">' + (p.caption || '') + '</div>';
        item.addEventListener('click', function () {
          openLightbox(p.src, p.caption);
        });
        galGrid.appendChild(item);
      });
    }

    // filters
    document.querySelectorAll('.gal-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.gal-filter').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        render();
      });
    });

    // lightbox
    var lightbox = document.getElementById('lightbox');
    var lbImg = document.getElementById('lightboxImg');
    var lbCap = document.getElementById('lightboxCap');
    function openLightbox(src, cap) {
      lbImg.src = src;
      lbCap.textContent = cap || '';
      lightbox.classList.add('open');
    }
    document.getElementById('lightboxClose').addEventListener('click', function () {
      lightbox.classList.remove('open');
    });
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) lightbox.classList.remove('open');
    });

    // upload modal
    var modal = document.getElementById('uploadModal');
    var uploadForm = document.getElementById('uploadForm');
    var fileInput = document.getElementById('uploadFile');
    function openUploadModal() { modal.classList.add('open'); }
    document.getElementById('uploadCancel').addEventListener('click', function () {
      modal.classList.remove('open');
      uploadForm.reset();
    });
    uploadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var file = fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var photos = getPhotos();
        photos.push({
          src: ev.target.result,
          caption: document.getElementById('uploadCaption').value,
          category: document.getElementById('uploadCategory').value
        });
        savePhotos(photos);
        modal.classList.remove('open');
        uploadForm.reset();
        render();
      };
      reader.readAsDataURL(file);
    });

    // clear all (manage)
    var clearBtn = document.getElementById('galClearAll');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (confirm('Remove all photos you\'ve added on this device?')) {
          localStorage.removeItem(STORAGE_KEY);
          render();
        }
      });
    }

    render();
  }

  // Registration form (register.html) — Step 1 of 2.
  // On submit: sends a WhatsApp notification with the team's details,
  // then redirects to payment.html for Step 2 (paying the entry fee).
  var WHATSAPP_NUMBER = '918329337246'; // country code + number, no + or spaces
  var form = document.getElementById('registerForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var teamName = document.getElementById('teamName').value;
      var captainName = document.getElementById('captainName').value;
      var phone = document.getElementById('phone').value;
      var players = document.getElementById('players').value;
      var area = document.getElementById('area').value;
      var notes = document.getElementById('notes').value;

      var lines = [
        '🏏 NEW REGISTRATION — Power Hitters',
        '',
        'Team Name: ' + teamName,
        'Captain: ' + captainName,
        'Contact Number: ' + phone,
        'Players: ' + players,
        area ? ('Area: ' + area) : null,
        notes ? ('Notes: ' + notes) : null,
        '',
        'Team will now be redirected to complete payment.'
      ].filter(Boolean).join('\n');

      var waUrl = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines);

      var box = document.getElementById('formSuccess');
      if (box) {
        box.classList.add('show');
      }

      // Notification 1: registration details, sent in a new tab.
      window.open(waUrl, '_blank');

      // Move to Step 2 — payment — carrying the team name along.
      var params = new URLSearchParams({ team: teamName });
      setTimeout(function () {
        window.location.href = 'payment.html?' + params.toString();
      }, 900);
    });
  }

  // Payment page (payment.html) — Step 2 of 2.
  var paidBtn = document.getElementById('paidBtn');
  if (paidBtn) {
    var urlParams = new URLSearchParams(window.location.search);
    var teamFromUrl = urlParams.get('team') || '';

    // Personalise the greeting and the UPI deep link with the team name.
    var greeting = document.getElementById('teamGreeting');
    if (greeting && teamFromUrl) {
      greeting.textContent = teamFromUrl + ', your registration is in! One last step — pay the entry fee to lock your slot.';
    }
    var upiBtn = document.getElementById('upiPayBtn');
    if (upiBtn) {
      var note = teamFromUrl ? ('Power Hitters Entry - ' + teamFromUrl) : 'Power Hitters Entry Fee';
      upiBtn.href = 'upi://pay?pa=amanrawat2524-3@okicici&pn=Power%20Hitters&am=2500&cu=INR&tn=' + encodeURIComponent(note);
    }

    paidBtn.addEventListener('click', function () {
      var msg = [
        '💰 PAYMENT DONE — Power Hitters',
        '',
        teamFromUrl ? ('Team Name: ' + teamFromUrl) : 'Team: (see registration message above)',
        'Amount: ₹2,500',
        '',
        'Attaching payment screenshot below.'
      ].join('\n');
      var waUrl = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg);

      // Notification 2: payment confirmation, sent separately from registration.
      window.open(waUrl, '_blank');

      var successBox = document.getElementById('paidSuccess');
      if (successBox) {
        successBox.classList.add('show');
        successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // Copy UPI ID button (payment.html)
  var copyBtn = document.getElementById('copyUpiBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var text = document.getElementById('upiIdText').textContent;
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(function () {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 1800);
      });
    });
  }
});
