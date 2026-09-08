// Power Hitters — shared site behaviour

// ---------- SUPABASE ----------
var SUPABASE_URL = 'https://icebgysininolvjbueet.supabase.co';
var SUPABASE_KEY = 'sb_publishable_h654diItHmAibeSCRd1y6w_iyLyPB-4';
var supabaseClient = null;

if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

document.addEventListener('DOMContentLoaded', function () {

  // Mobile nav
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

  // Preserve existing countdown behaviour used elsewhere.
  var cdEl = document.getElementById('countdown');

  if (cdEl) {
    var target = new Date('2026-08-08T09:00:00+05:30').getTime();
    var d = document.getElementById('cd-days');
    var h = document.getElementById('cd-hours');
    var m = document.getElementById('cd-mins');
    var s = document.getElementById('cd-secs');

    function tick() {
      var diff = target - Date.now();

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

  // Copy UPI ID
  var copyBtn = document.getElementById('copyUpiBtn');

  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var upiText = document.getElementById('upiIdText');

      if (!upiText || !navigator.clipboard) return;

      navigator.clipboard.writeText(upiText.textContent)
        .then(function () {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');

          setTimeout(function () {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('copied');
          }, 1800);
        });
    });
  }

  // ---------- MANUAL UPI REGISTRATION FLOW ----------
  var form = document.getElementById('registerForm');

  if (form) {
    var submitBtn = document.getElementById('registerSubmitBtn');
    var successBox = document.getElementById('formSuccess');
    var errorBox = document.getElementById('formError');

    var registrationSaved = false;
    var savedWhatsAppUrl = '';

    function setError(message) {
      if (!errorBox) return;

      errorBox.textContent = message;
      errorBox.classList.add('show');
    }

    function clearError() {
      if (!errorBox) return;

      errorBox.textContent = '';
      errorBox.classList.remove('show');
    }

    function resetButton() {
      if (!submitBtn) return;

      submitBtn.disabled = false;

      submitBtn.textContent = registrationSaved
        ? 'Open WhatsApp Again'
        : 'I’ve Paid ₹500 — Submit & Send on WhatsApp';
    }

    function buildWhatsAppMessage(data, registrationId) {
      var shortId = String(registrationId || '').split('-')[0].toUpperCase();

      var lines = [
        '🏏 POWER HITTERS SEASON 3 REGISTRATION',
        '',
        'Registration ID: ' + shortId,
        'Team Name: ' + data.teamName,
        'Captain: ' + data.captainName,
        'Contact: ' + data.phone,
        'Players: ' + data.players,
        'Area: ' + (data.area || '—')
      ];

      if (data.notes) {
        lines.push('Notes: ' + data.notes);
      }

      lines.push(
        '',
        'Entry Fee: ₹2,499',
        'Advance Paid: ₹500',
        'Remaining: ₹1,999',
        '',
        'I have completed the ₹500 advance payment.',
        'I am attaching the payment screenshot in this WhatsApp chat for verification.'
      );

      return lines.join('\n');
    }

    function openWhatsApp(url) {
      window.location.href = url;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearError();

      // If the registration was already saved and the user came back,
      // reopen WhatsApp without creating a duplicate database row.
      if (registrationSaved && savedWhatsAppUrl) {
        openWhatsApp(savedWhatsAppUrl);
        return;
      }

      var teamName = document.getElementById('teamName').value.trim();
      var captainName = document.getElementById('captainName').value.trim();
      var phone = document.getElementById('phone').value.replace(/\D/g, '');
      var players = document.getElementById('players').value;
      var area = document.getElementById('area').value.trim();
      var notes = document.getElementById('notes').value.trim();

      if (phone.length !== 10) {
        setError('Please enter a valid 10-digit mobile number.');
        document.getElementById('phone').focus();
        return;
      }

      if (!supabaseClient) {
        setError(
          'Registration service is unavailable right now. Please try again or contact Power Hitters directly.'
        );
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving Registration...';
      }

      var newId = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now());

      var registrationData = {
        teamName: teamName,
        captainName: captainName,
        phone: phone,
        players: players,
        area: area,
        notes: notes
      };

      // payment_status remains the DB default ("pending").
      // A visitor can never mark themselves paid from the public page.
      supabaseClient
        .from('registrations')
        .insert([{
          id: newId,
          team_name: teamName,
          captain_name: captainName,
          phone: phone,
          players: players,
          area: area,
          notes: notes
        }])
        .then(function (result) {

          if (result.error) {
            console.error('Power Hitters: registration save failed —', result.error);

            setError(
              'Could not save your registration (' +
              result.error.message +
              '). Please try again.'
            );

            resetButton();
            return;
          }

          registrationSaved = true;

          var message = buildWhatsAppMessage(registrationData, newId);

          savedWhatsAppUrl =
            'https://wa.me/918329337246?text=' +
            encodeURIComponent(message);

          if (successBox) {
            successBox.classList.add('show');
          }

          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Open WhatsApp Again';
          }

          setTimeout(function () {
            openWhatsApp(savedWhatsAppUrl);
          }, 350);

        })
        .catch(function (error) {

          console.error('Power Hitters: unexpected registration error —', error);

          setError(
            'Something went wrong while saving the registration. Please try again.'
          );

          resetButton();
        });
    });
  }
});
