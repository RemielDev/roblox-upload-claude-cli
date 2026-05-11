const $ = (sel) => document.querySelector(sel);
const els = {
  tabs: document.querySelectorAll('.tab'),
  uploadsPanel: $('#uploadsPanel'),
  logsPanel: $('#logsPanel'),
  uploadsBody: $('#uploadsBody'),
  logsBody: $('#logsBody'),
  uploadsEmpty: $('#uploadsEmpty'),
  logsEmpty: $('#logsEmpty'),
  search: $('#search'),
  statusFilter: $('#statusFilter'),
  levelFilter: $('#levelFilter'),
  refresh: $('#refresh'),
  stats: $('#stats'),
  dbPath: $('#dbPath'),
  toast: $('#toast'),
};

let activeTab = 'uploads';

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove('show'), 1600);
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString();
}

function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const s = await res.json();
  els.dbPath.textContent = s.dbPath;
  els.dbPath.title = s.dbPath;
  els.stats.innerHTML = `
    <div class="stat"><div class="label">Total Uploads</div><div class="value">${s.total}</div></div>
    <div class="stat success"><div class="label">Successful</div><div class="value">${s.successful}</div></div>
    <div class="stat failed"><div class="label">Failed</div><div class="value">${s.failed}</div></div>
    <div class="stat"><div class="label">Last 7 Days</div><div class="value">${s.last7}</div></div>
  `;
}

async function loadUploads() {
  const params = new URLSearchParams();
  if (els.search.value) params.set('search', els.search.value);
  if (els.statusFilter.value) params.set('status', els.statusFilter.value);
  const res = await fetch('/api/uploads?' + params);
  const rows = await res.json();
  els.uploadsEmpty.hidden = rows.length > 0;
  els.uploadsBody.innerHTML = rows.map(r => {
    const assetCell = r.asset_id
      ? `<span class="asset-id" data-copy="${r.asset_id}" title="Click to copy">${r.asset_id}<span class="copy-hint">copy</span></span>`
      : '<span class="muted">—</span>';
    const errorRow = r.error
      ? `<div class="error-text">${escapeHtml(r.error)}</div>`
      : '';
    const took = r.duration_ms ? (r.duration_ms / 1000).toFixed(1) + 's' : '';
    const creator = r.creator_type && r.creator_id
      ? `${r.creator_type} ${r.creator_id}`
      : '<span class="muted">—</span>';
    const sessionLabel = r.session_label
      ? escapeHtml(r.session_label)
      : '<span class="muted">—</span>';
    return `
      <tr>
        <td title="${escapeHtml(r.uploaded_at)}">${fmtTime(r.uploaded_at)}</td>
        <td>
          <div>${escapeHtml(r.filename)}</div>
          <div class="muted mono" style="font-size:11px">${fmtSize(r.file_size)}</div>
          ${errorRow}
        </td>
        <td>${escapeHtml(r.asset_type)}</td>
        <td>${assetCell}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td class="mono" style="font-size:11px">${creator}</td>
        <td>${sessionLabel}</td>
        <td class="mono" style="font-size:11px">${took}</td>
      </tr>
    `;
  }).join('');

  els.uploadsBody.querySelectorAll('.asset-id').forEach(el => {
    el.addEventListener('click', () => {
      const v = el.dataset.copy;
      navigator.clipboard.writeText(v).then(() => showToast(`Copied ${v}`));
    });
  });
}

async function loadLogs() {
  const params = new URLSearchParams();
  if (els.levelFilter.value) params.set('level', els.levelFilter.value);
  const res = await fetch('/api/logs?' + params);
  const rows = await res.json();
  els.logsEmpty.hidden = rows.length > 0;
  els.logsBody.innerHTML = rows.map(r => {
    let ctx = '';
    if (r.context) {
      try { ctx = JSON.stringify(JSON.parse(r.context), null, 2); }
      catch { ctx = r.context; }
    }
    return `
      <tr>
        <td title="${escapeHtml(r.logged_at)}">${fmtTime(r.logged_at)}</td>
        <td><span class="badge ${r.level}">${r.level}</span></td>
        <td>${escapeHtml(r.message)}</td>
        <td><pre class="context-cell">${escapeHtml(ctx)}</pre></td>
      </tr>
    `;
  }).join('');
}

async function refresh() {
  await loadStats();
  if (activeTab === 'uploads') await loadUploads();
  else await loadLogs();
}

els.tabs.forEach(t => {
  t.addEventListener('click', () => {
    els.tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    activeTab = t.dataset.tab;
    els.uploadsPanel.hidden = activeTab !== 'uploads';
    els.logsPanel.hidden = activeTab !== 'logs';
    els.statusFilter.hidden = activeTab !== 'uploads';
    els.levelFilter.hidden = activeTab !== 'logs';
    els.search.placeholder = activeTab === 'uploads'
      ? 'Search filename, asset ID, name...'
      : '(search not available for logs)';
    els.search.disabled = activeTab !== 'uploads';
    refresh();
  });
});

let searchTimer;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refresh, 200);
});
els.statusFilter.addEventListener('change', refresh);
els.levelFilter.addEventListener('change', refresh);
els.refresh.addEventListener('click', refresh);

setInterval(refresh, 5000);
refresh();
