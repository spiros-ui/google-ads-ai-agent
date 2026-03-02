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
    return '<span class="status-dot ' + getStatusColor(status) + '"></span>';
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

  // --------------- Date picker toggle ---------------

  function toggleDatePicker(slug) {
    var dropdown = document.getElementById('dp-dropdown-' + slug);
    var btn = document.getElementById('dp-btn-' + slug);
    if (!dropdown) return;
    var isOpen = dropdown.classList.contains('show');
    // Close all open pickers first
    var allDropdowns = document.querySelectorAll('.date-picker-dropdown.show');
    var allBtns = document.querySelectorAll('.date-picker-btn.open');
    for (var i = 0; i < allDropdowns.length; i++) allDropdowns[i].classList.remove('show');
    for (var j = 0; j < allBtns.length; j++) allBtns[j].classList.remove('open');
    if (!isOpen) {
      dropdown.classList.add('show');
      if (btn) btn.classList.add('open');
    }
  }

  function selectDate(slug, date) {
    var dropdown = document.getElementById('dp-dropdown-' + slug);
    var btn = document.getElementById('dp-btn-' + slug);
    if (dropdown) dropdown.classList.remove('show');
    if (btn) btn.classList.remove('open');
    loadDate(slug, date);
  }

  window.toggleDatePicker = toggleDatePicker;
  window.selectDate = selectDate;

  // Close picker when clicking outside
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.date-picker-wrap')) {
      var allDropdowns = document.querySelectorAll('.date-picker-dropdown.show');
      var allBtns = document.querySelectorAll('.date-picker-btn.open');
      for (var i = 0; i < allDropdowns.length; i++) allDropdowns[i].classList.remove('show');
      for (var j = 0; j < allBtns.length; j++) allBtns[j].classList.remove('open');
    }
  });

  // Start
  init();
})();
