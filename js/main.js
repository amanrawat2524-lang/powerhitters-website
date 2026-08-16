// Power Hitters — shared site behaviour

// ---------- SUPABASE (real database backend) ----------
// Publishable key is safe to expose in browser code — it can only do what
// the Row Level Security policies on the database allow (insert new
// registrations, update payment status). It cannot read other people's data.
var SUPABASE_URL = 'https://icebgysininolvjbueet.supabase.co';
var SUPABASE_KEY = 'sb_publishable_h654diItHmAibeSCRd1y6w_iyLyPB-4';
var supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

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

  // Registration form (register.html) — Step 1 of 2.
  // On submit: saves the registration to the Supabase database, then goes
  // to payment.html (Step 2), carrying the new row's id along.
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

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      function goToPayment(id) {
        var params = new URLSearchParams({ team: teamName });
        if (id) params.set('id', id);
        window.location.href = 'payment.html?' + params.toString();
      }

      if (!supabaseClient) {
        console.error('Power Hitters: Supabase client not loaded — check that the CDN script tag is present and not blocked.');
        goToPayment(null);
        return;
      }

      // Generate the row's id ourselves so we don't need Supabase to read
      // the row back after inserting (that read requires a SELECT policy,
      // which we intentionally don't grant — visitors can submit data but
      // can't read anyone's registrations, including their own).
      var newId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());

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
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Submit & Continue to Payment';
            }
            alert('Could not save your registration (' + result.error.message + '). Please try again or contact us directly.');
            return;
          }
          var box = document.getElementById('formSuccess');
          if (box) box.classList.add('show');
          setTimeout(function () { goToPayment(newId); }, 500);
        });
    });
  }

  // Payment page (payment.html) — Step 2 of 2.
  var paidBtn = document.getElementById('paidBtn');
  if (paidBtn) {
    var urlParams = new URLSearchParams(window.location.search);
    var teamFromUrl = urlParams.get('team') || '';
    var idFromUrl = urlParams.get('id') || '';

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
      function showSuccess() {
        var successBox = document.getElementById('paidSuccess');
        if (successBox) {
          successBox.classList.add('show');
          successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        paidBtn.textContent = 'Marked as Paid ✓';
        paidBtn.disabled = true;
      }

      if (!supabaseClient || !idFromUrl) {
        showSuccess();
        return;
      }

      supabaseClient
        .from('registrations')
        .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', idFromUrl)
        .then(function (result) {
          if (result.error) {
            console.error('Power Hitters: payment update failed —', result.error);
          }
          showSuccess();
        });
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
