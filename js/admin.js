// Power Hitters — Admin Dashboard
// Manual UPI verification + preservation of older Razorpay verified payments.

document.addEventListener('DOMContentLoaded', function () {

  var SUPABASE_URL = 'https://icebgysininolvjbueet.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_h654diItHmAibeSCRd1y6w_iyLyPB-4';

  var supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  var loginSection = document.getElementById('loginSection');
  var dashboardSection = document.getElementById('dashboardSection');
  var loginForm = document.getElementById('loginForm');
  var loginError = document.getElementById('loginError');
  var logoutBtn = document.getElementById('logoutBtn');

  var tableBody = document.getElementById('regTableBody');
  var loadingMsg = document.getElementById('loadingMsg');
  var statsBar = document.getElementById('statsBar');


  // =========================================
  // LOGIN / LOGOUT
  // =========================================

  function showDashboard() {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    logoutBtn.style.display = 'inline-flex';

    loadDashboardData();
  }

  function showLogin() {
    loginSection.style.display = 'block';
    dashboardSection.style.display = 'none';
    logoutBtn.style.display = 'none';
  }

  supabaseClient.auth.getSession().then(function (res) {

    if (res.data && res.data.session) {
      showDashboard();
    } else {
      showLogin();
    }

  });

  loginForm.addEventListener('submit', function (event) {

    event.preventDefault();

    loginError.style.display = 'none';

    var email = document.getElementById('adminEmail').value;
    var password = document.getElementById('adminPassword').value;

    var btn = loginForm.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.textContent = 'Logging in...';

    supabaseClient.auth
      .signInWithPassword({
        email: email,
        password: password
      })
      .then(function (result) {

        btn.disabled = false;
        btn.textContent = 'Log In';

        if (result.error) {
          loginError.textContent = result.error.message;
          loginError.style.display = 'block';
          return;
        }

        showDashboard();
      });

  });

  logoutBtn.addEventListener('click', function () {
    supabaseClient.auth.signOut().then(showLogin);
  });


  // =========================================
  // LOAD REGISTRATIONS + OLD PAYMENTS
  // =========================================

  function loadDashboardData() {

    loadingMsg.style.display = 'block';
    tableBody.innerHTML = '';

    var registrationsRequest =
      supabaseClient
        .from('registrations')
        .select('*')
        .order('created_at', {
          ascending: false
        });

    // We keep reading the existing payments table so older Razorpay
    // registrations remain accurate in admin history.
    var paymentsRequest =
      supabaseClient
        .from('payments')
        .select('*')
        .order('created_at', {
          ascending: false
        });

    Promise.all([
      registrationsRequest,
      paymentsRequest
    ])
      .then(function (results) {

        loadingMsg.style.display = 'none';

        var registrationsResult = results[0];
        var paymentsResult = results[1];

        if (registrationsResult.error) {
          tableBody.innerHTML =
            '<tr><td colspan="10">Error loading registrations: ' +
            escapeHtml(registrationsResult.error.message) +
            '</td></tr>';

          return;
        }

        // If the old payments table cannot be read for any reason,
        // manual registration management still works.
        var payments = [];

        if (!paymentsResult.error) {
          payments = paymentsResult.data || [];
        }

        var registrations = registrationsResult.data || [];
        var paymentMap = buildPaymentMap(payments);

        renderRows(registrations, paymentMap);
      });

  }


  // =========================================
  // PICK BEST HISTORIC RAZORPAY PAYMENT
  // =========================================

  function buildPaymentMap(payments) {

    var map = {};

    payments.forEach(function (payment) {

      var registrationId = payment.registration_id;

      if (!registrationId) return;

      if (!map[registrationId]) {
        map[registrationId] = payment;
        return;
      }

      var current = map[registrationId];

      var currentVerified =
        current.verified === true &&
        current.status === 'captured';

      var newVerified =
        payment.verified === true &&
        payment.status === 'captured';

      if (!currentVerified && newVerified) {
        map[registrationId] = payment;
      }

    });

    return map;
  }


  // =========================================
  // RENDER
  // =========================================

  function renderRows(rows, paymentMap) {

    if (rows.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="10">No registrations yet.</td></tr>';

      statsBar.textContent = '';
      return;
    }

    var paidCount =
      rows.filter(function (row) {
        return row.payment_status === 'paid';
      }).length;

    var oldRazorpayVerifiedCount = 0;

    Object.keys(paymentMap).forEach(function (registrationId) {

      var payment = paymentMap[registrationId];

      if (
        payment &&
        payment.verified === true &&
        payment.status === 'captured'
      ) {
        oldRazorpayVerifiedCount++;
      }

    });

    statsBar.textContent =
      rows.length +
      ' total registrations · ' +
      paidCount +
      ' paid · ' +
      (rows.length - paidCount) +
      ' pending · ' +
      oldRazorpayVerifiedCount +
      ' older Razorpay verified';

    tableBody.innerHTML = '';

    rows.forEach(function (row) {

      var payment = paymentMap[row.id] || null;

      var isHistoricRazorpayVerified =
        payment &&
        payment.verified === true &&
        payment.status === 'captured';

      var isPaid = row.payment_status === 'paid';

      var dateStr =
        row.created_at
          ? new Date(row.created_at).toLocaleString('en-IN')
          : '';

      var tr = document.createElement('tr');

      tr.innerHTML =
        '<td>' + escapeHtml(row.team_name) + '</td>' +
        '<td>' + escapeHtml(row.captain_name) + '</td>' +
        '<td>' + escapeHtml(row.phone) + '</td>' +
        '<td>' + escapeHtml(row.players || '') + '</td>' +
        '<td>' + escapeHtml(row.area || '') + '</td>' +
        '<td>' + escapeHtml(row.notes || '') + '</td>' +
        '<td>' + escapeHtml(dateStr) + '</td>' +
        '<td class="pay-cell"></td>' +
        '<td class="advance-cell"></td>' +
        '<td class="verify-cell"></td>';

      var payCell = tr.querySelector('.pay-cell');
      var advanceCell = tr.querySelector('.advance-cell');
      var verifyCell = tr.querySelector('.verify-cell');


      // =========================================
      // PAYMENT STATUS
      // =========================================

      var badge = document.createElement('span');

      badge.className =
        'badge ' +
        (isPaid ? 'open' : 'done');

      badge.textContent =
        isPaid ? 'Paid' : 'Pending';

      payCell.appendChild(badge);


      // Historic Razorpay-verified registrations stay locked.
      if (isHistoricRazorpayVerified) {

        var autoVerified = document.createElement('div');

        autoVerified.style.marginTop = '8px';
        autoVerified.style.fontSize = '10px';
        autoVerified.style.color = '#8fe0a8';
        autoVerified.style.fontWeight = '700';

        autoVerified.textContent =
          'RAZORPAY VERIFIED 🔒';

        payCell.appendChild(autoVerified);

      } else {

        // New manual UPI registrations can be verified by the admin.
        var toggleBtn = document.createElement('button');

        toggleBtn.className = 'copy-btn';
        toggleBtn.style.marginLeft = '8px';

        toggleBtn.textContent =
          isPaid ? 'Mark Pending' : 'Mark Paid';

        toggleBtn.addEventListener('click', function () {

          var newStatus =
            isPaid ? 'pending' : 'paid';

          if (newStatus === 'paid') {

            var confirmed = window.confirm(
              'Have you verified this team’s ₹499 UPI payment screenshot / bank payment?'
            );

            if (!confirmed) return;
          }

          toggleBtn.disabled = true;
          toggleBtn.textContent = 'Saving...';

          supabaseClient
            .from('registrations')
            .update({
              payment_status: newStatus,
              paid_at:
                newStatus === 'paid'
                  ? new Date().toISOString()
                  : null
            })
            .eq('id', row.id)
            .then(function (result) {

              if (result.error) {

                alert(
                  'Could not update: ' +
                  result.error.message
                );

                toggleBtn.disabled = false;

                toggleBtn.textContent =
                  isPaid
                    ? 'Mark Pending'
                    : 'Mark Paid';

                return;
              }

              loadDashboardData();
            });

        });

        payCell.appendChild(toggleBtn);
      }


      // =========================================
      // ADVANCE
      // =========================================

      if (isHistoricRazorpayVerified) {

        var historicPaidAmount =
          Number(payment.amount_paise || 0) / 100;

        var historicRemaining =
          Math.max(
            1999 - historicPaidAmount,
            0
          );

        advanceCell.innerHTML =
          '<strong style="color:#8fe0a8;">' +
          formatRupees(historicPaidAmount) +
          ' Paid ✓</strong>' +
          '<br>' +
          '<span style="font-size:11px;">' +
          formatRupees(historicRemaining) +
          ' Remaining</span>';

      } else if (isPaid) {

        advanceCell.innerHTML =
          '<strong style="color:#8fe0a8;">₹499 Paid ✓</strong>' +
          '<br>' +
          '<span style="font-size:11px;">₹1,500 Remaining</span>';

      } else {

        advanceCell.innerHTML =
          '<strong>₹499 Pending</strong>' +
          '<br>' +
          '<span style="font-size:11px;">₹1,500 remaining after advance</span>';
      }


      // =========================================
      // VERIFICATION DETAILS
      // =========================================

      if (isHistoricRazorpayVerified) {

        var method =
          payment.payment_method
            ? formatMethod(payment.payment_method)
            : '—';

        var paymentId =
          payment.razorpay_payment_id || '—';

        var paymentTime =
          payment.paid_at
            ? new Date(payment.paid_at).toLocaleString('en-IN')
            : '—';

        verifyCell.innerHTML =
          '<div class="verify-details">' +
          '<strong>Historic Razorpay payment</strong><br>' +
          'Method: ' +
          escapeHtml(method) +
          '<br>' +
          'Payment ID:<br>' +
          '<span style="font-family:JetBrains Mono,monospace;word-break:break-all;">' +
          escapeHtml(paymentId) +
          '</span><br>' +
          'Paid: ' +
          escapeHtml(paymentTime) +
          '</div>';

      } else if (isPaid) {

        var paidAt =
          row.paid_at
            ? new Date(row.paid_at).toLocaleString('en-IN')
            : 'Verified by admin';

        verifyCell.innerHTML =
          '<div class="verify-details">' +
          '<strong>Manual UPI verified ✓</strong><br>' +
          escapeHtml(paidAt) +
          '</div>';

      } else {

        verifyCell.innerHTML =
          '<div class="verify-details">' +
          '<strong>Check WhatsApp screenshot</strong><br>' +
          'Verify the ₹499 UPI payment before using “Mark Paid”.' +
          '</div>';
      }


      tableBody.appendChild(tr);
    });
  }


  // =========================================
  // HELPERS
  // =========================================

  function formatRupees(amount) {

    return '₹' +
      Number(amount).toLocaleString(
        'en-IN',
        {
          maximumFractionDigits: 0
        }
      );
  }

  function formatMethod(method) {

    if (!method) return '—';

    return String(method)
      .charAt(0)
      .toUpperCase() +
      String(method).slice(1);
  }

  function escapeHtml(str) {

    if (str === null || str === undefined) {
      return '';
    }

    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

});
