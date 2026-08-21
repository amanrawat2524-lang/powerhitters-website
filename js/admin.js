// Power Hitters — Admin Dashboard
// Supabase Auth + Registrations + Razorpay Payments

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


  loginForm.addEventListener('submit', function (e) {

    e.preventDefault();

    loginError.style.display = 'none';

    var email =
      document.getElementById('adminEmail').value;

    var password =
      document.getElementById('adminPassword').value;

    var btn =
      loginForm.querySelector('button[type="submit"]');

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

          loginError.textContent =
            result.error.message;

          loginError.style.display = 'block';

          return;

        }

        showDashboard();

      });

  });


  logoutBtn.addEventListener('click', function () {

    supabaseClient.auth.signOut().then(function () {

      showLogin();

    });

  });


  // =========================================
  // LOAD REGISTRATIONS + PAYMENTS
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
            escapeHtml(
              registrationsResult.error.message
            ) +
            '</td></tr>';

          return;

        }


        if (paymentsResult.error) {

          tableBody.innerHTML =
            '<tr><td colspan="10">Error loading payments: ' +
            escapeHtml(
              paymentsResult.error.message
            ) +
            '</td></tr>';

          return;

        }


        var registrations =
          registrationsResult.data || [];

        var payments =
          paymentsResult.data || [];


        var paymentMap =
          buildPaymentMap(payments);


        renderRows(
          registrations,
          paymentMap
        );

      });

  }


  // =========================================
  // CHOOSE BEST PAYMENT FOR EACH REGISTRATION
  // =========================================

  function buildPaymentMap(payments) {

    var map = {};


    payments.forEach(function (payment) {

      var registrationId =
        payment.registration_id;


      if (!registrationId) return;


      // First payment found = latest payment
      if (!map[registrationId]) {

        map[registrationId] = payment;

        return;

      }


      // Prefer a captured + verified payment
      // over an incomplete/created attempt
      var current =
        map[registrationId];


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
  // RENDER TABLE
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


    var verifiedCount = 0;


    Object.keys(paymentMap).forEach(
      function (registrationId) {

        var payment =
          paymentMap[registrationId];

        if (
          payment &&
          payment.verified === true &&
          payment.status === 'captured'
        ) {

          verifiedCount++;

        }

      }
    );


    statsBar.textContent =
      rows.length +
      ' total registrations · ' +
      paidCount +
      ' paid · ' +
      (rows.length - paidCount) +
      ' pending · ' +
      verifiedCount +
      ' Razorpay verified';


    tableBody.innerHTML = '';


    rows.forEach(function (row) {

      var payment =
        paymentMap[row.id] || null;


      var tr =
        document.createElement('tr');


      var dateStr =
        row.created_at
          ? new Date(
              row.created_at
            ).toLocaleString('en-IN')
          : '';


      // -----------------------------------------
      // NORMAL REGISTRATION DATA
      // -----------------------------------------

      tr.innerHTML =

        '<td>' +
        escapeHtml(row.team_name) +
        '</td>' +

        '<td>' +
        escapeHtml(row.captain_name) +
        '</td>' +

        '<td>' +
        escapeHtml(row.phone) +
        '</td>' +

        '<td>' +
        escapeHtml(row.players || '') +
        '</td>' +

        '<td>' +
        escapeHtml(row.area || '') +
        '</td>' +

        '<td>' +
        escapeHtml(row.notes || '') +
        '</td>' +

        '<td>' +
        escapeHtml(dateStr) +
        '</td>' +

        '<td class="pay-cell"></td>' +

        '<td class="advance-cell"></td>' +

        '<td class="razorpay-cell"></td>';


      // =========================================
      // PAYMENT STATUS COLUMN
      // =========================================

      var payCell =
        tr.querySelector('.pay-cell');


      var badge =
        document.createElement('span');


      badge.className =
        'badge ' +
        (
          row.payment_status === 'paid'
            ? 'open'
            : 'done'
        );


      badge.textContent =
        row.payment_status === 'paid'
          ? 'Paid'
          : 'Pending';


      payCell.appendChild(badge);


      var isRazorpayVerified =
        payment &&
        payment.verified === true &&
        payment.status === 'captured';


      if (isRazorpayVerified) {

        var autoVerified =
          document.createElement('div');

        autoVerified.style.marginTop = '8px';
        autoVerified.style.fontSize = '10px';
        autoVerified.style.color = '#8fe0a8';
        autoVerified.style.fontWeight = '700';

        autoVerified.textContent =
          'AUTO VERIFIED 🔒';

        payCell.appendChild(autoVerified);

      } else {

        var toggleBtn =
          document.createElement('button');

        toggleBtn.className = 'copy-btn';
        toggleBtn.style.marginLeft = '8px';

        toggleBtn.textContent =
          row.payment_status === 'paid'
            ? 'Mark Pending'
            : 'Mark Paid';

        toggleBtn.addEventListener('click', function () {

          var newStatus =
            row.payment_status === 'paid'
              ? 'pending'
              : 'paid';

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
                  row.payment_status === 'paid'
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
      // ADVANCE COLUMN
      // =========================================

      var advanceCell =
        tr.querySelector('.advance-cell');


      if (
        payment &&
        payment.verified === true &&
        payment.status === 'captured'
      ) {

        var paidAmount =
          payment.amount_paise / 100;


        var remainingAmount =
          Math.max(
            2499 - paidAmount,
            0
          );


        advanceCell.innerHTML =

          '<strong style="color:#8fe0a8;">' +
          formatRupees(paidAmount) +
          ' Paid ✓</strong>' +

          '<br>' +

          '<span style="font-size:11px;">' +
          formatRupees(remainingAmount) +
          ' Remaining</span>';

      } else if (payment) {

        advanceCell.innerHTML =

          '<strong>' +
          formatRupees(
            payment.amount_paise / 100
          ) +
          '</strong>' +

          '<br>' +

          '<span style="font-size:11px;">' +
          escapeHtml(
            payment.status || 'Pending'
          ) +
          '</span>';

      } else {

        advanceCell.textContent =
          'No payment';

      }


      // =========================================
      // RAZORPAY DETAILS COLUMN
      // =========================================

      var razorpayCell =
        tr.querySelector('.razorpay-cell');


      if (!payment) {

        razorpayCell.innerHTML =
          '<span style="font-size:11px;">No Razorpay payment yet</span>';

      } else {

        var verifiedText =
          payment.verified === true
            ? 'Verified ✓'
            : 'Not Verified';


        var method =
          payment.payment_method
            ? formatMethod(
                payment.payment_method
              )
            : '—';


        var paymentId =
          payment.razorpay_payment_id ||
          '—';


        var orderId =
          payment.razorpay_order_id ||
          '—';


        var paymentTime =
          payment.paid_at
            ? new Date(
                payment.paid_at
              ).toLocaleString('en-IN')
            : '—';


        razorpayCell.innerHTML =

          '<div style="font-size:11px;line-height:1.7;min-width:190px;">' +

          '<strong>Status:</strong> ' +
          escapeHtml(
            payment.status || '—'
          ) +

          '<br>' +

          '<strong>Verified:</strong> ' +
          escapeHtml(
            verifiedText
          ) +

          '<br>' +

          '<strong>Method:</strong> ' +
          escapeHtml(method) +

          '<br>' +

          '<strong>Payment ID:</strong><br>' +

          '<span style="font-family:JetBrains Mono,monospace;word-break:break-all;">' +
          escapeHtml(paymentId) +
          '</span>' +

          '<br>' +

          '<strong>Order ID:</strong><br>' +

          '<span style="font-family:JetBrains Mono,monospace;word-break:break-all;">' +
          escapeHtml(orderId) +
          '</span>' +

          '<br>' +

          '<strong>Paid:</strong> ' +
          escapeHtml(paymentTime) +

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

    if (
      str === null ||
      str === undefined
    ) {

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
