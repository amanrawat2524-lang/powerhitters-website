// Power Hitters — Admin dashboard
// Login via Supabase Auth (email + password), then view/manage registrations.

document.addEventListener('DOMContentLoaded', function () {
  var SUPABASE_URL = 'https://icebgysininolvjbueet.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_h654diItHmAibeSCRd1y6w_iyLyPB-4';
  var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  var loginSection = document.getElementById('loginSection');
  var dashboardSection = document.getElementById('dashboardSection');
  var loginForm = document.getElementById('loginForm');
  var loginError = document.getElementById('loginError');
  var logoutBtn = document.getElementById('logoutBtn');
  var tableBody = document.getElementById('regTableBody');
  var loadingMsg = document.getElementById('loadingMsg');
  var statsBar = document.getElementById('statsBar');

  function showDashboard() {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    logoutBtn.style.display = 'inline-flex';
    loadRegistrations();
  }

  function showLogin() {
    loginSection.style.display = 'block';
    dashboardSection.style.display = 'none';
    logoutBtn.style.display = 'none';
  }

  // Check if already logged in (session persists across visits)
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
    var email = document.getElementById('adminEmail').value;
    var password = document.getElementById('adminPassword').value;
    var btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    supabaseClient.auth.signInWithPassword({ email: email, password: password }).then(function (result) {
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
    supabaseClient.auth.signOut().then(function () {
      showLogin();
    });
  });

  function loadRegistrations() {
    loadingMsg.style.display = 'block';
    tableBody.innerHTML = '';
    supabaseClient
      .from('registrations')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function (result) {
        loadingMsg.style.display = 'none';
        if (result.error) {
          tableBody.innerHTML = '<tr><td colspan="8">Error loading data: ' + escapeHtml(result.error.message) + '</td></tr>';
          return;
        }
        renderRows(result.data || []);
      });
  }

  function renderRows(rows) {
    if (rows.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8">No registrations yet.</td></tr>';
      statsBar.textContent = '';
      return;
    }

    var paidCount = rows.filter(function (r) { return r.payment_status === 'paid'; }).length;
    statsBar.textContent = rows.length + ' total registrations · ' + paidCount + ' paid · ' + (rows.length - paidCount) + ' pending';

    tableBody.innerHTML = '';
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      var dateStr = row.created_at ? new Date(row.created_at).toLocaleString('en-IN') : '';

      tr.innerHTML =
        '<td>' + escapeHtml(row.team_name) + '</td>' +
        '<td>' + escapeHtml(row.captain_name) + '</td>' +
        '<td>' + escapeHtml(row.phone) + '</td>' +
        '<td>' + escapeHtml(row.players || '') + '</td>' +
        '<td>' + escapeHtml(row.area || '') + '</td>' +
        '<td>' + escapeHtml(row.notes || '') + '</td>' +
        '<td>' + dateStr + '</td>' +
        '<td class="pay-cell"></td>';

      var payCell = tr.querySelector('.pay-cell');

      var badge = document.createElement('span');
      badge.className = 'badge ' + (row.payment_status === 'paid' ? 'open' : 'done');
      badge.textContent = row.payment_status === 'paid' ? 'Paid' : 'Pending';
      payCell.appendChild(badge);

      var toggleBtn = document.createElement('button');
      toggleBtn.className = 'copy-btn';
      toggleBtn.style.marginLeft = '8px';
      toggleBtn.textContent = row.payment_status === 'paid' ? 'Mark Pending' : 'Mark Paid';
      toggleBtn.addEventListener('click', function () {
        var newStatus = row.payment_status === 'paid' ? 'pending' : 'paid';
        toggleBtn.disabled = true;
        toggleBtn.textContent = 'Saving...';
        supabaseClient
          .from('registrations')
          .update({
            payment_status: newStatus,
            paid_at: newStatus === 'paid' ? new Date().toISOString() : null
          })
          .eq('id', row.id)
          .then(function (result) {
            if (result.error) {
              alert('Could not update: ' + result.error.message);
              toggleBtn.disabled = false;
              toggleBtn.textContent = row.payment_status === 'paid' ? 'Mark Pending' : 'Mark Paid';
              return;
            }
            loadRegistrations();
          });
      });
      payCell.appendChild(toggleBtn);

      tableBody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
