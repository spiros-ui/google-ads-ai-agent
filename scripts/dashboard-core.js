/**
 * dashboard-core.js
 * Initialization, data loading, tab switching, formatting utilities.
 * Stores all loaded data on window.appData for other modules.
 */
(function () {
  'use strict';

  var DATA_BASE = 'data';

  window.appData = {
    manifest: null,
    accounts: {},   // keyed by slug
    actionStates: {}
  };

  // --------------- localStorage for action items ---------------

  function loadActionStates() {
    try {
      var raw = localStorage.getItem('actionItemState');
      if (raw) { window.appData.actionStates = JSON.parse(raw); }
    } catch (e) { /* ignore */ }
  }

  function saveActionStates() {
    try {
      localStorage.setItem('actionItemState', JSON.stringify(window.appData.actionStates));
    } catch (e) { /* ignore */ }
  }

  window.saveActionStates = saveActionStates;

  // --------------- Formatting helpers ---------------

  function formatCurrency(n) {
    if (n === null || n === undefined) return '--';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function formatCurrencyDecimal(n) {
    if (n === null || n === undefined) return '--';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatNumber(n) {
    if (n === null || n === undefined) return '--';
    return Number(n).toLocaleString('en-US');
  }

  function formatPct(n) {
    if (n === null || n === undefined) return '--';
    return Number(n).toFixed(1) + '%';
  }

  function formatRoas(n) {
    if (n === null || n === undefined) return '--';
    return Number(n).toFixed(2) + 'x';
  }

  function formatDateShort(dateStr) {
    // "2026-03-02" → "Mar 2, 2026"
    if (!dateStr) return '--';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    return months[m] + ' ' + d + ', ' + parts[0];
  }

  function formatDateRelative(dateStr) {
    if (!dateStr) return '';
    var now = new Date();
    now.setHours(0,0,0,0);
    var target = new Date(dateStr + 'T00:00:00');
    var diff = Math.round((now - target) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return diff + ' days ago';
    if (diff < 30) return Math.floor(diff / 7) + 'w ago';
    return Math.floor(diff / 30) + 'mo ago';
  }

  window.fmt = {
    currency: formatCurrency,
    currencyDec: formatCurrencyDecimal,
    number: formatNumber,
    pct: formatPct,
    roas: formatRoas,
    dateShort: formatDateShort,
    dateRel: formatDateRelative
  };

  // --------------- Severity / Status helpers ---------------

  function getStatusColor(status) {
    if (!status) return 'grey';
    var s = status.toLowerCase();
    if (s === 'good' || s === 'healthy') return 'green';
    if (s === 'warning' || s === 'attention') return 'yellow';
    if (s === 'critical' || s === 'bad' || s === 'error') return 'red';
    return 'grey';
  }

  function severityPill(severity) {
    if (!severity) return '';
    var s = severity.toLowerCase();
    var cls = s === 'critical' ? 'pill-critical'
            : s === 'high'     ? 'pill-high'
            : s === 'medium'   ? 'pill-medium'
            : 'pill-low';
    return '<span class="pill ' + cls + '">' + severity + '</span>';
  }

  function typePill(type) {
    if (!type) return '';
    return '<span class="pill pill-type">' + type.replace(/_/g, ' ') + '</span>';
  }

  function verdictPill(verdict) {
    if (!verdict) return '<span class="verdict-pill verdict-inactive">No Data</span>';
    var v = verdict.toLowerCase();
    var cls = 'verdict-inactive';
    if (v.indexOf('healthy') !== -1 || v.indexOf('good') !== -1 || v.indexOf('strong') !== -1) cls = 'verdict-healthy';
    else if (v.indexOf('attention') !== -1 || v.indexOf('warning') !== -1 || v.indexOf('monitor') !== -1) cls = 'verdict-attention';
    else if (v.indexOf('critical') !== -1 || v.indexOf('poor') !== -1 || v.indexOf('bad') !== -1 || v.indexOf('failing') !== -1) cls = 'verdict-critical';
    else if (v.indexOf('not spending') !== -1 || v.indexOf('paused') !== -1 || v.indexOf('inactive') !== -1) cls = 'verdict-inactive';
    else cls = 'verdict-attention';
    return '<span class="verdict-pill ' + cls + '">' + verdict + '</span>';
  }

  function statusDot(status) {
    var label = status || 'unknown';
    return '<span class="status-dot ' + getStatusColor(status) + '" title="' + label.charAt(0).toUpperCase() + label.slice(1) + '"></span>';
  }

  window.ui = {
    getStatusColor: getStatusColor,
    severityPill: severityPill,
    typePill: typePill,
    verdictPill: verdictPill,
    statusDot: statusDot
  };

  // --------------- Data normalization ---------------
  // The dashboard must handle both the OLD audit JSON format (healthScore, categories, etc.)
  // and the NEW diagnosis-based format. This function normalizes old data into the new shape.

  function normalizeData(raw) {
    // If data already has the diagnosis key, return as-is
    if (raw.diagnosis) return raw;

    // Build a minimal diagnosis from old-format data
    var snap = raw.snapshot || {};
    var campaigns = [];
    if (raw.campaignPerformance && raw.campaignPerformance.length) {
      campaigns = raw.campaignPerformance.map(function (cp) {
        var status = 'good';
        if (cp.conversions === 0 && cp.spend > 100) status = 'critical';
        else if (cp.conversions === 0) status = 'warning';
        else if (cp.roas !== null && cp.roas < 1) status = 'warning';
        return {
          name: cp.name,
          type: cp.type || 'UNKNOWN',
          objective: '--',
          bidding: '--',
          budget: null,
          metrics: {
            spend: cp.spend || 0,
            impressions: null,
            clicks: null,
            conversions: cp.conversions || 0,
            conversionValue: cp.value || 0,
            cpa: cp.cpa || null,
            roas: cp.roas || null,
            ctr: cp.ctr || null,
            avgCpc: null,
            searchIS: null,
            budgetLostIS: null,
            rankLostIS: null
          },
          meetingObjective: cp.conversions > 0,
          status: status,
          issues: cp.verdict && cp.verdict.toLowerCase().indexOf('zero') !== -1
            ? [{ severity: 'High', title: cp.verdict, reasoning: '', action: 'Review campaign performance and consider pausing.', estimatedImpact: '', type: 'review' }]
            : [],
          strengths: [],
          keywordSummary: null,
          searchTermSummary: null
        };
      });
    }

    // Count issues from old categories
    var issueCount = 0;
    var critCount = 0;
    if (raw.categories) {
      raw.categories.forEach(function (cat) {
        if (cat.checks) {
          cat.checks.forEach(function (c) {
            if (c.result === 'FAIL') {
              issueCount++;
              if (c.severity === 'Critical') critCount++;
            }
          });
        }
      });
    }

    var overallVerdict = raw.verdict || 'Unknown';

    return {
      account: raw.account,
      customerId: raw.customerId,
      date: raw.date,
      diagnosis: {
        accountSummary: {
          totalSpend: snap.spend30d || 0,
          totalConversions: snap.conversions30d || 0,
          totalCampaigns: snap.totalCampaigns || campaigns.length,
          criticalIssues: critCount,
          overallVerdict: overallVerdict
        },
        campaigns: campaigns,
        actionItems: (raw.quickWins || []).map(function (qw, i) {
          return {
            id: (raw.account || 'acc').replace(/\s/g, '-').toLowerCase() + '-legacy-' + i,
            account: raw.account,
            date: raw.date,
            type: 'review',
            severity: qw.impact || 'Medium',
            title: qw.action || '',
            description: qw.check || '',
            estimatedSaving: null,
            campaign: '',
            status: 'pending'
          };
        })
      },
      // Preserve legacy fields for reference
      _legacy: {
        healthScore: raw.healthScore,
        categories: raw.categories,
        snapshot: raw.snapshot,
        quickWins: raw.quickWins,
        recommendations: raw.recommendations,
        topWastedProducts: raw.topWastedProducts,
        topPerformingProducts: raw.topPerformingProducts
      }
    };
  }

  window.normalizeData = normalizeData;

  // --------------- Tab switching ---------------

  function switchTab(tabId) {
    var tabs = document.querySelectorAll('.tab');
    var contents = document.querySelectorAll('.tab-content');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    for (var j = 0; j < contents.length; j++) contents[j].classList.remove('active');

    var tabEl = document.querySelector('[data-tab="' + tabId + '"]');
    var contentEl = document.getElementById('content-' + tabId);
    if (tabEl) tabEl.classList.add('active');
    if (contentEl) contentEl.classList.add('active');

    // Inject breadcrumb for account tabs
    _injectBreadcrumb(tabId);

    // Render tab content on demand
    if (tabId === 'overview' && typeof window.renderOverview === 'function') {
      window.renderOverview();
    } else if (tabId === 'actions' && typeof window.renderActionItems === 'function') {
      window.renderActionItems();
    } else if (typeof window.renderAccount === 'function') {
      window.renderAccount(tabId);
    }
  }

  window.switchTab = switchTab;

  // --------------- Breadcrumb navigation ---------------

  function _injectBreadcrumb(tabId) {
    // Remove any existing breadcrumb
    var existing = document.getElementById('ux-breadcrumb');
    if (existing) existing.remove();

    // Only show breadcrumb for account tabs (not overview or actions)
    if (tabId === 'overview' || tabId === 'actions') return;

    var manifest = window.appData.manifest;
    if (!manifest || !manifest.accounts) return;
    var accountName = null;
    for (var i = 0; i < manifest.accounts.length; i++) {
      if (manifest.accounts[i].id === tabId) {
        accountName = manifest.accounts[i].name;
        break;
      }
    }
    if (!accountName) return;

    var bc = document.createElement('div');
    bc.id = 'ux-breadcrumb';
    bc.className = 'ux-breadcrumb';
    bc.innerHTML = '<span class="ux-breadcrumb-link" onclick="switchTab(\'overview\')">Overview</span> <span class="ux-breadcrumb-sep">&rsaquo;</span> <span class="ux-breadcrumb-current">' + accountName + '</span>';

    var contentEl = document.getElementById('content-' + tabId);
    if (contentEl) {
      contentEl.insertBefore(bc, contentEl.firstChild);
    }
  }

  // --------------- Load a specific date for an account ---------------

  function loadDate(accountSlug, date) {
    fetch(DATA_BASE + '/' + accountSlug + '/' + date + '.json')
      .then(function (r) { return r.json(); })
      .then(function (raw) {
        window.appData.accounts[accountSlug] = normalizeData(raw);
        window.appData.accounts[accountSlug]._selectedDate = date;
        if (typeof window.renderAccount === 'function') {
          window.renderAccount(accountSlug);
        }
      })
      .catch(function (e) {
        console.error('Failed to load', accountSlug, date, e);
      });
  }

  window.loadDate = loadDate;

  // --------------- Initialization ---------------

  function init() {
    loadActionStates();

    fetch(DATA_BASE + '/manifest.json')
      .then(function (r) { return r.json(); })
      .then(function (m) {
        window.appData.manifest = m;
        document.getElementById('lastUpdated').textContent = 'Last updated: ' + m.lastUpdated;
        buildTabs(m);
        buildContentShells(m);
        return loadAllLatest(m);
      })
      .then(function () {
        switchTab('overview');
      })
      .catch(function (e) {
        document.getElementById('contentContainer').innerHTML =
          '<div class="empty-state"><h2>No data available</h2><p>Manifest file not found. Run the audit script first.</p></div>';
        console.error(e);
      });
  }

  function buildTabs(m) {
    var html = '<div class="tab active" data-tab="overview" onclick="switchTab(\'overview\')">Overview</div>';
    html += '<div class="tab" data-tab="actions" onclick="switchTab(\'actions\')">Action Items</div>';
    m.accounts.forEach(function (a) {
      var safe = a.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      html += '<div class="tab" data-tab="' + a.id + '" title="' + safe + '" onclick="switchTab(\'' + a.id + '\')">' + a.name + '</div>';
    });
    document.getElementById('tabsContainer').innerHTML = html;
  }

  function buildContentShells(m) {
    var html = '<div class="tab-content active" id="content-overview"><div class="content"><div class="empty-state"><h2>Loading...</h2></div></div></div>';
    html += '<div class="tab-content" id="content-actions"><div class="content"><div class="empty-state"><h2>Loading...</h2></div></div></div>';
    m.accounts.forEach(function (a) {
      html += '<div class="tab-content" id="content-' + a.id + '"><div class="content"><div class="empty-state"><h2>Loading...</h2></div></div></div>';
    });
    document.getElementById('contentContainer').innerHTML = html;
  }

  function loadAllLatest(m) {
    var promises = m.accounts.map(function (acc) {
      var latestDate = acc.dates[acc.dates.length - 1];
      return fetch(DATA_BASE + '/' + acc.id + '/' + latestDate + '.json')
        .then(function (r) { return r.json(); })
        .then(function (raw) {
          var normalized = normalizeData(raw);
          normalized._selectedDate = latestDate;
          window.appData.accounts[acc.id] = normalized;
        })
        .catch(function (e) {
          console.error('Failed to load', acc.id, latestDate, e);
          window.appData.accounts[acc.id] = null;
        });
    });
    return Promise.all(promises);
  }

  // --------------- Google Ads Date Picker ---------------

  var _gdpState = {}; // { slug: { pendingDate, activePreset } }

  function gdpOpen(slug) {
    var panel = document.getElementById('gdp-panel-' + slug);
    var overlay = document.getElementById('gdp-overlay-' + slug);
    var trigger = document.getElementById('gdp-trigger-' + slug);
    if (!panel) return;
    panel.classList.add('show');
    if (overlay) overlay.classList.add('show');
    if (trigger) trigger.classList.add('open');
    // Init pending state
    var data = window.appData.accounts[slug];
    _gdpState[slug] = { pendingDate: (data && data._selectedDate) || null, activePreset: null };
    gdpHighlight(slug);
    // Scroll to selected month
    setTimeout(function () { gdpScrollToSelected(slug); }, 50);
  }

  function gdpClose(slug) {
    var panel = document.getElementById('gdp-panel-' + slug);
    var overlay = document.getElementById('gdp-overlay-' + slug);
    var trigger = document.getElementById('gdp-trigger-' + slug);
    if (panel) panel.classList.remove('show');
    if (overlay) overlay.classList.remove('show');
    if (trigger) trigger.classList.remove('open');
  }

  function gdpApply(slug) {
    var st = _gdpState[slug];
    if (st && st.pendingDate) {
      loadDate(slug, st.pendingDate);
    }
    gdpClose(slug);
  }

  function gdpSelectDay(slug, date) {
    _gdpState[slug] = _gdpState[slug] || {};
    _gdpState[slug].pendingDate = date;
    _gdpState[slug].activePreset = null;
    gdpHighlight(slug);
  }

  function gdpPreset(slug, presetKey) {
    var accMeta = null;
    var m = window.appData.manifest;
    if (m) {
      for (var i = 0; i < m.accounts.length; i++) {
        if (m.accounts[i].id === slug) { accMeta = m.accounts[i]; break; }
      }
    }
    if (!accMeta || !accMeta.dates.length) return;
    var dates = accMeta.dates;
    var today = new Date(); today.setHours(0,0,0,0);
    var todayStr = today.toISOString().split('T')[0];
    var target = null;

    if (presetKey === 'latest') {
      target = dates[dates.length - 1];
    } else if (presetKey === 'today') {
      target = dates.indexOf(todayStr) !== -1 ? todayStr : dates[dates.length - 1];
    } else if (presetKey === 'yesterday') {
      var yd = new Date(today); yd.setDate(yd.getDate() - 1);
      var ydStr = yd.toISOString().split('T')[0];
      target = dates.indexOf(ydStr) !== -1 ? ydStr : null;
    } else if (presetKey === 'last7') {
      var cutoff7 = new Date(today); cutoff7.setDate(cutoff7.getDate() - 7);
      for (var j = dates.length - 1; j >= 0; j--) {
        if (new Date(dates[j] + 'T00:00:00') >= cutoff7) { target = dates[j]; break; }
      }
    } else if (presetKey === 'last14') {
      var cutoff14 = new Date(today); cutoff14.setDate(cutoff14.getDate() - 14);
      for (var k = dates.length - 1; k >= 0; k--) {
        if (new Date(dates[k] + 'T00:00:00') >= cutoff14) { target = dates[k]; break; }
      }
    } else if (presetKey === 'last30') {
      var cutoff30 = new Date(today); cutoff30.setDate(cutoff30.getDate() - 30);
      for (var l = dates.length - 1; l >= 0; l--) {
        if (new Date(dates[l] + 'T00:00:00') >= cutoff30) { target = dates[l]; break; }
      }
    } else if (presetKey === 'earliest') {
      target = dates[0];
    }
    if (!target) target = dates[dates.length - 1];
    _gdpState[slug] = { pendingDate: target, activePreset: presetKey };
    gdpHighlight(slug);
  }

  function gdpHighlight(slug) {
    var st = _gdpState[slug] || {};
    var pending = st.pendingDate;
    // Update input
    var inp = document.getElementById('gdp-input-' + slug);
    if (inp) inp.value = pending ? formatDateShort(pending) : '';
    // Highlight calendar day
    var panel = document.getElementById('gdp-panel-' + slug);
    if (!panel) return;
    var days = panel.querySelectorAll('.gdp-day[data-date]');
    for (var i = 0; i < days.length; i++) {
      days[i].classList.toggle('selected', days[i].getAttribute('data-date') === pending);
    }
    // Highlight preset
    var presets = panel.querySelectorAll('.gdp-preset');
    for (var j = 0; j < presets.length; j++) {
      presets[j].classList.toggle('active', presets[j].getAttribute('data-preset') === st.activePreset);
    }
  }

  function gdpScrollToSelected(slug) {
    var st = _gdpState[slug] || {};
    var sel = document.querySelector('#gdp-panel-' + slug + ' .gdp-day.selected');
    if (sel) {
      var container = sel.closest('.gdp-months');
      if (container) {
        var monthEl = sel.closest('.gdp-month');
        if (monthEl) container.scrollTop = monthEl.offsetTop - 8;
      }
    }
  }

  // Build calendar HTML for all months between first and last available date
  function gdpBuildCalendar(slug, availableDates, selectedDate) {
    if (!availableDates || !availableDates.length) return '';
    var dateSet = {};
    availableDates.forEach(function (d) { dateSet[d] = true; });

    var first = new Date(availableDates[0] + 'T00:00:00');
    var last = new Date(availableDates[availableDates.length - 1] + 'T00:00:00');
    var today = new Date(); today.setHours(0,0,0,0);
    var todayStr = today.toISOString().split('T')[0];
    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var dow = ['M','T','W','T','F','S','S'];

    var html = '';
    var cur = new Date(first.getFullYear(), first.getMonth(), 1);
    var endMonth = new Date(last.getFullYear(), last.getMonth() + 1, 0);

    while (cur <= endMonth) {
      var y = cur.getFullYear();
      var m = cur.getMonth();
      var daysInMonth = new Date(y, m + 1, 0).getDate();
      // Day of week for 1st (0=Sun, convert to Mon-based: Mon=0)
      var firstDow = new Date(y, m, 1).getDay();
      firstDow = (firstDow + 6) % 7; // Mon=0, Sun=6

      html += '<div class="gdp-month" data-month="' + y + '-' + String(m + 1).padStart(2, '0') + '">';
      html += '<div class="gdp-month-label">' + months[m] + ' ' + y + '</div>';
      html += '<div class="gdp-grid">';
      for (var h = 0; h < 7; h++) html += '<div class="gdp-dow">' + dow[h] + '</div>';

      // Empty cells before first day
      for (var e = 0; e < firstDow; e++) html += '<div class="gdp-day empty"></div>';

      for (var d = 1; d <= daysInMonth; d++) {
        var dateStr = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        var hasData = dateSet[dateStr] || false;
        var isSelected = dateStr === selectedDate;
        var isToday = dateStr === todayStr;
        var cls = 'gdp-day';
        if (hasData) cls += ' has-data';
        if (isSelected) cls += ' selected';
        if (isToday) cls += ' today';

        if (hasData) {
          html += '<button class="' + cls + '" data-date="' + dateStr + '" onclick="gdpSelectDay(\'' + slug + '\',\'' + dateStr + '\')">' + d + '</button>';
        } else {
          html += '<div class="' + cls + '">' + d + '</div>';
        }
      }

      html += '</div></div>';
      cur = new Date(y, m + 1, 1);
    }
    return html;
  }

  window.gdpBuildCalendar = gdpBuildCalendar;
  window.gdpOpen = gdpOpen;
  window.gdpClose = gdpClose;
  window.gdpApply = gdpApply;
  window.gdpSelectDay = gdpSelectDay;
  window.gdpPreset = gdpPreset;

  // --------------- Keyboard navigation ---------------

  var _helpOverlayVisible = false;

  function _initKeyboardNav() {
    document.addEventListener('keydown', function (e) {
      // Ignore when typing in an input
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Escape') {
        // Close any open date picker panels
        var openPanels = document.querySelectorAll('.gdp-panel.show');
        for (var i = 0; i < openPanels.length; i++) {
          var panelId = openPanels[i].id || '';
          var slug = panelId.replace('gdp-panel-', '');
          if (slug) gdpClose(slug);
        }
        // Collapse all open diagnosis panels
        var openDiags = document.querySelectorAll('.diagnosis-panel.open');
        for (var j = 0; j < openDiags.length; j++) {
          var prev = openDiags[j].previousElementSibling;
          if (prev) prev.classList.remove('expanded');
          openDiags[j].classList.remove('open');
          var td = openDiags[j].querySelector('td');
          if (td) td.innerHTML = '';
        }
        // Close help overlay if open
        _hideHelpOverlay();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        _toggleHelpOverlay();
      }
    });
  }

  function _toggleHelpOverlay() {
    _helpOverlayVisible ? _hideHelpOverlay() : _showHelpOverlay();
  }

  function _showHelpOverlay() {
    if (document.getElementById('ux-help-overlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'ux-help-overlay';
    overlay.className = 'ux-help-overlay';
    overlay.onclick = function () { _hideHelpOverlay(); };
    overlay.innerHTML =
      '<div class="ux-help-panel" onclick="event.stopPropagation()">' +
      '<div class="ux-help-title">Keyboard Shortcuts</div>' +
      '<div class="ux-help-row"><kbd>?</kbd> Toggle this help</div>' +
      '<div class="ux-help-row"><kbd>Esc</kbd> Close panels / collapse campaigns</div>' +
      '</div>';
    document.body.appendChild(overlay);
    _helpOverlayVisible = true;
  }

  function _hideHelpOverlay() {
    var el = document.getElementById('ux-help-overlay');
    if (el) el.remove();
    _helpOverlayVisible = false;
  }

  // --------------- Sort campaigns ---------------

  // --------------- Period switching ---------------

  window.currentPeriod = {}; // keyed by account slug, default 'last30d'

  window.switchPeriod = function (accountSlug, periodKey) {
    window.currentPeriod[accountSlug] = periodKey;
    if (typeof window.renderAccount === 'function') {
      window.renderAccount(accountSlug);
    }
  };

  window.getActivePeriod = function (accountSlug) {
    return window.currentPeriod[accountSlug] || 'last30d';
  };

  // --------------- Sort campaigns ---------------

  window.currentSort = { slug: null, col: null, dir: 'asc' };

  window.sortCampaigns = function (accountSlug, column, direction) {
    var data = window.appData.accounts[accountSlug];
    if (!data || !data.diagnosis || !data.diagnosis.campaigns) return;

    window.currentSort = { slug: accountSlug, col: column, dir: direction };

    var campaigns = data.diagnosis.campaigns;
    var metricCols = ['spend', 'impressions', 'clicks', 'conversions', 'cpa', 'roas', 'searchIS'];
    var directCols = ['name', 'objective', 'bidding', 'status'];
    var mult = direction === 'desc' ? -1 : 1;

    campaigns.sort(function (a, b) {
      var va, vb;
      if (column === 'budget') {
        va = a.budget; vb = b.budget;
      } else if (metricCols.indexOf(column) !== -1) {
        va = a.metrics ? a.metrics[column] : null;
        vb = b.metrics ? b.metrics[column] : null;
      } else if (directCols.indexOf(column) !== -1) {
        va = a[column]; vb = b[column];
      } else {
        return 0;
      }

      // Nulls go last regardless of direction
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      if (typeof va === 'string') {
        return mult * va.localeCompare(vb);
      }
      return mult * (va - vb);
    });

    if (typeof window.renderAccount === 'function') {
      window.renderAccount(accountSlug);
    }
  };

  // --------------- Expand all / Collapse all campaigns ---------------

  window.expandAllCampaigns = function (accountSlug) {
    var data = window.appData.accounts[accountSlug];
    if (!data || !data.diagnosis || !data.diagnosis.campaigns) return;
    // We need to set expansion state and re-render.
    // The expansion state lives inside dashboard-account.js's closure,
    // so we set flags on the panels directly and re-render.
    var campaigns = data.diagnosis.campaigns;
    for (var i = 0; i < campaigns.length; i++) {
      var panel = document.getElementById('diag-' + accountSlug + '-' + i);
      var row = panel ? panel.previousElementSibling : null;
      if (panel) {
        panel.classList.add('open');
        if (data.diagnosis.campaigns[i]) {
          var td = panel.querySelector('td');
          // Only fill if not already populated
          if (td && !td.innerHTML.trim()) {
            // Trigger toggle which properly sets expansion state
          }
        }
      }
      if (row) row.classList.add('expanded');
    }
    // Full re-render is safest to ensure diagnosis content is built
    if (typeof window.renderAccount === 'function') {
      // Set a flag the account renderer can check
      window._uxExpandAll = window._uxExpandAll || {};
      window._uxExpandAll[accountSlug] = true;
      window.renderAccount(accountSlug);
      delete window._uxExpandAll[accountSlug];
    }
  };

  window.collapseAllCampaigns = function (accountSlug) {
    var data = window.appData.accounts[accountSlug];
    if (!data || !data.diagnosis || !data.diagnosis.campaigns) return;
    var campaigns = data.diagnosis.campaigns;
    for (var i = 0; i < campaigns.length; i++) {
      var panel = document.getElementById('diag-' + accountSlug + '-' + i);
      var row = panel ? panel.previousElementSibling : null;
      if (panel) {
        panel.classList.remove('open');
        var td = panel.querySelector('td');
        if (td) td.innerHTML = '';
      }
      if (row) row.classList.remove('expanded');
    }
    // Also signal collapse for re-render
    window._uxCollapseAll = window._uxCollapseAll || {};
    window._uxCollapseAll[accountSlug] = true;
    if (typeof window.renderAccount === 'function') {
      window.renderAccount(accountSlug);
      delete window._uxCollapseAll[accountSlug];
    }
  };

  // --------------- Back to top button ---------------

  function _initBackToTop() {
    var btn = document.createElement('button');
    btn.className = 'ux-back-to-top';
    btn.id = 'ux-back-to-top';
    btn.innerHTML = '&uarr;';
    btn.title = 'Back to top';
    btn.style.display = 'none';
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(btn);

    window.addEventListener('scroll', function () {
      btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
    }, { passive: true });
  }

  // --------------- Issue count badges on tabs ---------------

  function _updateTabBadges() {
    var manifest = window.appData.manifest;
    var accounts = window.appData.accounts;
    if (!manifest || !manifest.accounts) return;

    manifest.accounts.forEach(function (acc) {
      var data = accounts[acc.id];
      if (!data || !data.diagnosis || !data.diagnosis.campaigns) return;

      var count = 0;
      data.diagnosis.campaigns.forEach(function (c) {
        if (c.issues) {
          c.issues.forEach(function (issue) {
            var sev = (issue.severity || '').toLowerCase();
            if (sev === 'critical' || sev === 'high') count++;
          });
        }
      });

      var tabEl = document.querySelector('[data-tab="' + acc.id + '"]');
      if (!tabEl) return;

      // Remove existing badge
      var existingBadge = tabEl.querySelector('.ux-tab-badge');
      if (existingBadge) existingBadge.remove();

      if (count > 0) {
        var badge = document.createElement('span');
        badge.className = 'ux-tab-badge';
        badge.textContent = count;
        tabEl.style.position = 'relative';
        tabEl.appendChild(badge);
      }
    });
  }

  // --------------- Export campaign CSV ---------------

  window.exportCampaignCSV = function (accountSlug) {
    var data = window.appData.accounts[accountSlug];
    if (!data || !data.diagnosis || !data.diagnosis.campaigns) return;

    var campaigns = data.diagnosis.campaigns;
    var headers = ['Campaign', 'Objective', 'Bidding', 'Budget/day', 'Spend', 'Impressions', 'Clicks', 'Conversions', 'CPA', 'ROAS', 'IS%', 'Status'];
    var rows = [headers.join(',')];

    campaigns.forEach(function (c) {
      var m = c.metrics || {};
      var row = [
        '"' + (c.name || '').replace(/"/g, '""') + '"',
        '"' + (c.objective || '').replace(/"/g, '""') + '"',
        '"' + (c.bidding || '').replace(/"/g, '""') + '"',
        c.budget != null ? c.budget : '',
        m.spend != null ? m.spend : '',
        m.impressions != null ? m.impressions : '',
        m.clicks != null ? m.clicks : '',
        m.conversions != null ? m.conversions : '',
        m.cpa != null ? m.cpa : '',
        m.roas != null ? m.roas : '',
        m.searchIS != null ? m.searchIS : '',
        '"' + (c.status || '').replace(/"/g, '""') + '"'
      ];
      rows.push(row.join(','));
    });

    var csvContent = rows.join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = accountSlug + '-campaigns-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --------------- Overview search/filter ---------------

  window.overviewSearchFilter = '';

  window.filterOverviewAccounts = function (query) {
    window.overviewSearchFilter = (query || '').toLowerCase().trim();
    if (typeof window.renderOverview === 'function') {
      window.renderOverview();
    }
  };

  // Start
  _initKeyboardNav();
  _initBackToTop();

  // Patch init to update tab badges after all data loads
  var _origInit = init;
  init = function () {
    loadActionStates();

    fetch(DATA_BASE + '/manifest.json')
      .then(function (r) { return r.json(); })
      .then(function (m) {
        window.appData.manifest = m;
        document.getElementById('lastUpdated').textContent = 'Last updated: ' + m.lastUpdated;
        buildTabs(m);
        buildContentShells(m);
        return loadAllLatest(m);
      })
      .then(function () {
        switchTab('overview');
        // Update tab badges after all data is loaded
        _updateTabBadges();
      })
      .catch(function (e) {
        document.getElementById('contentContainer').innerHTML =
          '<div class="empty-state"><h2>No data available</h2><p>Manifest file not found. Run the audit script first.</p></div>';
        console.error(e);
      });
  };

  init();
})();
