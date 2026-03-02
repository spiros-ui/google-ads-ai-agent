/**
 * dashboard-account.js
 * Renders account detail tabs with campaign table and expandable diagnosis panels.
 */
(function () {
  'use strict';

  // Track which campaign rows are expanded per account
  var expandedCampaigns = {};

  function renderAccount(accountSlug) {
    var container = document.getElementById('content-' + accountSlug);
    if (!container) return;

    var data = window.appData.accounts[accountSlug];
    if (!data || !data.diagnosis) {
      container.innerHTML = '<div class="content"><div class="empty-state"><h2>No data available</h2><p>Audit data not found for this account.</p></div></div>';
      return;
    }

    var manifest = window.appData.manifest;
    var accMeta = null;
    if (manifest && manifest.accounts) {
      for (var i = 0; i < manifest.accounts.length; i++) {
        if (manifest.accounts[i].id === accountSlug) {
          accMeta = manifest.accounts[i];
          break;
        }
      }
    }

    var diag = data.diagnosis;
    var summary = diag.accountSummary || {};
    var campaigns = diag.campaigns || [];
    var selectedDate = data._selectedDate || data.date;

    var html = '<div class="content">';

    // Google Ads-style date picker
    if (accMeta && accMeta.dates && accMeta.dates.length > 0) {
      var dates = accMeta.dates;
      var s = accountSlug;

      // Trigger button
      html += '<div style="position:relative;display:inline-block">';
      html += '<button class="gdp-trigger" id="gdp-trigger-' + s + '" onclick="gdpOpen(\'' + s + '\')">';
      html += '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
      html += '<span>' + window.fmt.dateShort(selectedDate) + '</span>';
      html += '<svg class="gdp-arrow" viewBox="0 0 10 10"><polyline points="2,3.5 5,7 8,3.5" fill="none" stroke="currentColor"/></svg>';
      html += '</button>';

      // Overlay (click-outside-to-close)
      html += '<div class="gdp-overlay" id="gdp-overlay-' + s + '" onclick="gdpClose(\'' + s + '\')"></div>';

      // Panel
      html += '<div class="gdp-panel" id="gdp-panel-' + s + '">';
      html += '<div class="gdp-body">';

      // Left: presets
      html += '<div class="gdp-presets">';
      html += '<button class="gdp-preset" data-preset="latest" onclick="gdpPreset(\'' + s + '\',\'latest\')">Latest</button>';
      html += '<button class="gdp-preset" data-preset="today" onclick="gdpPreset(\'' + s + '\',\'today\')">Today</button>';
      html += '<button class="gdp-preset" data-preset="yesterday" onclick="gdpPreset(\'' + s + '\',\'yesterday\')">Yesterday</button>';
      html += '<button class="gdp-preset" data-preset="last7" onclick="gdpPreset(\'' + s + '\',\'last7\')">Last 7 days</button>';
      html += '<button class="gdp-preset" data-preset="last14" onclick="gdpPreset(\'' + s + '\',\'last14\')">Last 14 days</button>';
      html += '<button class="gdp-preset" data-preset="last30" onclick="gdpPreset(\'' + s + '\',\'last30\')">Last 30 days</button>';
      html += '<button class="gdp-preset" data-preset="earliest" onclick="gdpPreset(\'' + s + '\',\'earliest\')">Earliest</button>';
      html += '</div>';

      // Right: calendar
      html += '<div class="gdp-calendar">';

      // Date input
      html += '<div class="gdp-inputs">';
      html += '<div class="gdp-input-group"><div class="gdp-input-label">Audit date</div>';
      html += '<input class="gdp-input" id="gdp-input-' + s + '" type="text" readonly value="' + window.fmt.dateShort(selectedDate) + '"/>';
      html += '</div></div>';

      // Scrollable months
      html += '<div class="gdp-months">';
      html += window.gdpBuildCalendar(s, dates, selectedDate);
      html += '</div>';

      html += '</div>'; // gdp-calendar
      html += '</div>'; // gdp-body

      // Footer
      html += '<div class="gdp-footer">';
      html += '<button class="gdp-btn gdp-btn-cancel" onclick="gdpClose(\'' + s + '\')">Cancel</button>';
      html += '<button class="gdp-btn gdp-btn-apply" onclick="gdpApply(\'' + s + '\')">Apply</button>';
      html += '</div>';

      html += '</div>'; // gdp-panel
      html += '</div>'; // wrapper
    }

    // Account summary bar
    html += '<div class="summary-bar">';
    html += buildStat('Account', data.account || accMeta.name, summary.overallVerdict ? window.ui.verdictPill(summary.overallVerdict) : '');
    html += buildStat('30d Spend', window.fmt.currency(summary.totalSpend), '');
    html += buildStat('Conversions', window.fmt.number(summary.totalConversions), '');
    html += buildStat('Campaigns', String(summary.totalCampaigns || campaigns.length), '');
    html += buildStat('Critical Issues', '<span style="color:var(--red)">' + (summary.criticalIssues || 0) + '</span>', '');
    html += '</div>';

    // Campaign table
    if (campaigns.length === 0) {
      html += '<div class="empty-state" style="padding:40px"><h2>No campaign data</h2><p>This audit does not contain per-campaign diagnosis.</p></div>';
    } else {
      html += '<table id="campaign-table-' + accountSlug + '">';
      html += '<thead><tr>';
      html += '<th>Campaign</th><th>Obj.</th><th>Bidding</th>';
      html += '<th class="num">Budget/day</th><th class="num">30d Spend</th>';
      html += '<th class="num">Impr.</th><th class="num">Clicks</th>';
      html += '<th class="num">Conv</th><th class="num">CPA</th><th class="num">ROAS</th>';
      html += '<th class="num">IS%</th><th>Status</th>';
      html += '</tr></thead><tbody>';

      for (var ci = 0; ci < campaigns.length; ci++) {
        var camp = campaigns[ci];
        var m = camp.metrics || {};
        var isExpanded = expandedCampaigns[accountSlug + '-' + ci];

        // Campaign row
        html += '<tr class="campaign-row' + (isExpanded ? ' expanded' : '') + '" onclick="toggleCampaign(\'' + accountSlug + '\',' + ci + ')">';
        html += '<td style="font-weight:500" title="' + escapeAttr(camp.name) + '">' + escapeHtml(camp.name) + '</td>';
        html += '<td title="' + escapeAttr(camp.objective || '') + '">' + escapeHtml(camp.objective || '--') + '</td>';
        html += '<td style="font-size:12px" title="' + escapeAttr(camp.bidding || '') + '">' + escapeHtml(camp.bidding || '--') + '</td>';
        html += '<td class="num">' + (camp.budget != null ? window.fmt.currency(camp.budget) : '--') + '</td>';
        html += '<td class="num">' + window.fmt.currency(m.spend) + '</td>';
        html += '<td class="num">' + window.fmt.number(m.impressions) + '</td>';
        html += '<td class="num">' + window.fmt.number(m.clicks) + '</td>';
        html += '<td class="num">' + window.fmt.number(m.conversions) + '</td>';
        html += '<td class="num">' + (m.cpa != null ? window.fmt.currencyDec(m.cpa) : '--') + '</td>';
        html += '<td class="num">' + (m.roas != null ? window.fmt.roas(m.roas) : '--') + '</td>';
        html += '<td class="num">' + (m.searchIS != null ? window.fmt.pct(m.searchIS) : '--') + '</td>';
        html += '<td>' + window.ui.statusDot(camp.status) + '</td>';
        html += '</tr>';

        // Diagnosis panel row
        html += '<tr class="diagnosis-panel' + (isExpanded ? ' open' : '') + '" id="diag-' + accountSlug + '-' + ci + '">';
        html += '<td colspan="12">';
        if (isExpanded) {
          html += buildDiagnosisPanel(camp);
        }
        html += '</td></tr>';
      }

      html += '</tbody></table>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  function buildStat(label, value, sub) {
    return '<div class="summary-stat">' +
      '<div class="label">' + label + '</div>' +
      '<div class="value">' + value + '</div>' +
      (sub ? '<div class="sub">' + sub + '</div>' : '') +
      '</div>';
  }

  // --------------- Toggle campaign expansion ---------------

  function toggleCampaign(accountSlug, campIndex) {
    var key = accountSlug + '-' + campIndex;
    expandedCampaigns[key] = !expandedCampaigns[key];

    var panel = document.getElementById('diag-' + accountSlug + '-' + campIndex);
    var row = panel ? panel.previousElementSibling : null;

    if (expandedCampaigns[key]) {
      // Expand
      if (row) row.classList.add('expanded');
      if (panel) {
        panel.classList.add('open');
        var data = window.appData.accounts[accountSlug];
        if (data && data.diagnosis && data.diagnosis.campaigns[campIndex]) {
          panel.querySelector('td').innerHTML = buildDiagnosisPanel(data.diagnosis.campaigns[campIndex]);
        }
      }
    } else {
      // Collapse
      if (row) row.classList.remove('expanded');
      if (panel) {
        panel.classList.remove('open');
        panel.querySelector('td').innerHTML = '';
      }
    }
  }

  window.toggleCampaign = toggleCampaign;

  // --------------- Build diagnosis panel ---------------

  function buildDiagnosisPanel(camp) {
    var m = camp.metrics || {};
    var html = '<div class="diagnosis-inner">';

    // Objective bar
    html += '<div class="obj-bar">';
    html += '<div class="obj-item"><span class="obj-label">Objective:</span> <span class="obj-value">' + escapeHtml(camp.objective || '--') + '</span></div>';
    html += '<div class="obj-item"><span class="obj-label">Bidding:</span> <span class="obj-value">' + escapeHtml(camp.bidding || '--') + '</span></div>';
    html += '<div class="obj-item"><span class="obj-label">Budget:</span> <span class="obj-value">' + (camp.budget != null ? window.fmt.currency(camp.budget) + '/day' : '--') + '</span></div>';
    html += '<div class="obj-item"><span class="obj-label">Meeting objective:</span> ';
    if (camp.meetingObjective === true) {
      html += '<span class="obj-yes">YES</span>';
    } else if (camp.meetingObjective === false) {
      html += '<span class="obj-no">NO</span>';
    } else {
      html += '<span class="obj-value">--</span>';
    }
    html += '</div>';
    html += '</div>';

    // Impression Share bar
    if (m.searchIS != null) {
      html += renderImpressionShareBar(m.searchIS, m.budgetLostIS, m.rankLostIS);
    }

    // Issues
    var issues = camp.issues || [];
    if (issues.length > 0) {
      html += '<div class="issues-section">';
      html += '<div class="issues-section-title">Issues (' + issues.length + ')</div>';
      html += renderIssues(issues);
      html += '</div>';
    }

    // Strengths
    var strengths = camp.strengths || [];
    if (strengths.length > 0) {
      html += '<div class="strengths-section">';
      html += '<div class="issues-section-title" style="color:var(--green)">Strengths</div>';
      strengths.forEach(function (s) {
        html += '<div class="strength-item"><div><span class="strength-title">' + escapeHtml(s.title || '') + '</span>';
        if (s.detail) html += ' <span class="strength-detail">' + escapeHtml(s.detail) + '</span>';
        html += '</div></div>';
      });
      html += '</div>';
    }

    // Keyword summary
    if (camp.keywordSummary && camp.keywordSummary.topWasters && camp.keywordSummary.topWasters.length > 0) {
      html += '<div class="issues-section">';
      html += '<div class="issues-section-title">Top Wasting Keywords</div>';
      html += '<table class="mini-table"><thead><tr>';
      html += '<th>Keyword</th><th>Match Type</th><th class="num">Spend</th><th class="num">Conv</th><th>Action</th>';
      html += '</tr></thead><tbody>';
      camp.keywordSummary.topWasters.forEach(function (kw) {
        html += '<tr>';
        html += '<td>' + escapeHtml(kw.keyword || kw.text || '') + '</td>';
        html += '<td>' + escapeHtml(kw.matchType || '') + '</td>';
        html += '<td class="num" style="color:var(--red)">' + window.fmt.currencyDec(kw.spend) + '</td>';
        html += '<td class="num">' + (kw.conversions != null ? kw.conversions : '--') + '</td>';
        html += '<td>' + escapeHtml(kw.action || '') + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      html += '</div>';
    }

    // Search term summary
    if (camp.searchTermSummary) {
      var waste = camp.searchTermSummary.topWaste || [];
      var perf = camp.searchTermSummary.topPerformers || [];

      if (waste.length > 0) {
        html += '<div class="issues-section">';
        html += '<div class="issues-section-title">Top Wasting Search Terms</div>';
        html += '<table class="mini-table"><thead><tr>';
        html += '<th>Search Term</th><th class="num">Spend</th><th class="num">Clicks</th><th class="num">Conv</th>';
        html += '</tr></thead><tbody>';
        waste.forEach(function (st) {
          html += '<tr>';
          html += '<td>' + escapeHtml(st.term || st.searchTerm || '') + '</td>';
          html += '<td class="num" style="color:var(--red)">' + window.fmt.currencyDec(st.spend) + '</td>';
          html += '<td class="num">' + window.fmt.number(st.clicks) + '</td>';
          html += '<td class="num">' + (st.conversions != null ? st.conversions : '--') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
        html += '</div>';
      }

      if (perf.length > 0) {
        html += '<div class="issues-section">';
        html += '<div class="issues-section-title" style="color:var(--green)">Top Performing Search Terms</div>';
        html += '<table class="mini-table"><thead><tr>';
        html += '<th>Search Term</th><th class="num">Spend</th><th class="num">Clicks</th><th class="num">Conv</th>';
        html += '</tr></thead><tbody>';
        perf.forEach(function (st) {
          html += '<tr>';
          html += '<td>' + escapeHtml(st.term || st.searchTerm || '') + '</td>';
          html += '<td class="num">' + window.fmt.currencyDec(st.spend) + '</td>';
          html += '<td class="num">' + window.fmt.number(st.clicks) + '</td>';
          html += '<td class="num" style="color:var(--green)">' + (st.conversions != null ? st.conversions : '--') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
        html += '</div>';
      }
    }

    html += '</div>';
    return html;
  }

  // --------------- Impression Share Bar ---------------

  function renderImpressionShareBar(searchIS, budgetLostIS, rankLostIS) {
    var is = searchIS || 0;
    var budget = budgetLostIS || 0;
    var rank = rankLostIS || 0;
    var other = Math.max(0, 100 - is - budget - rank);

    var html = '<div class="is-bar-container">';
    html += '<div class="is-bar-label">Impression Share Breakdown</div>';
    html += '<div class="is-bar">';

    if (is > 0) {
      html += '<div class="is-segment is-won" style="width:' + is + '%">' + (is >= 8 ? is.toFixed(0) + '%' : '') + '</div>';
    }
    if (budget > 0) {
      html += '<div class="is-segment is-budget" style="width:' + budget + '%">' + (budget >= 8 ? budget.toFixed(0) + '%' : '') + '</div>';
    }
    if (rank > 0) {
      html += '<div class="is-segment is-rank" style="width:' + rank + '%">' + (rank >= 8 ? rank.toFixed(0) + '%' : '') + '</div>';
    }
    if (other > 0) {
      html += '<div class="is-segment is-other" style="width:' + other + '%"></div>';
    }

    html += '</div>';
    html += '<div class="is-legend">';
    html += '<span><span class="is-legend-dot" style="background:var(--accent)"></span>Won: ' + is.toFixed(1) + '%</span>';
    html += '<span><span class="is-legend-dot" style="background:var(--orange)"></span>Budget lost: ' + budget.toFixed(1) + '%</span>';
    html += '<span><span class="is-legend-dot" style="background:var(--yellow)"></span>Rank lost: ' + rank.toFixed(1) + '%</span>';
    if (other > 0) {
      html += '<span><span class="is-legend-dot" style="background:var(--surface2)"></span>Other: ' + other.toFixed(1) + '%</span>';
    }
    html += '</div>';
    html += '</div>';
    return html;
  }

  // --------------- Render Issues ---------------

  function renderIssues(issues) {
    // Sort by severity: Critical > High > Medium > Low
    var severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    var sorted = issues.slice().sort(function (a, b) {
      var sa = severityOrder[(a.severity || '').toLowerCase()] || 3;
      var sb = severityOrder[(b.severity || '').toLowerCase()] || 3;
      return sa - sb;
    });

    var html = '';
    sorted.forEach(function (issue) {
      html += '<div class="issue-card">';
      html += '<div class="issue-header">';
      html += window.ui.severityPill(issue.severity);
      if (issue.type) html += window.ui.typePill(issue.type);
      html += '<span class="issue-title" title="' + escapeAttr(issue.title || '') + '">' + escapeHtml(issue.title || '') + '</span>';
      html += '</div>';

      if (issue.reasoning) {
        html += '<div class="issue-reasoning">' + escapeHtml(issue.reasoning) + '</div>';
      }

      if (issue.action) {
        html += '<div class="issue-action"><strong>Action:</strong> ' + escapeHtml(issue.action) + '</div>';
      }

      if (issue.estimatedImpact) {
        html += '<div class="issue-impact">Estimated impact: ' + escapeHtml(issue.estimatedImpact) + '</div>';
      }

      html += '</div>';
    });
    return html;
  }

  // --------------- Escape helpers ---------------

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;');
  }

  window.renderAccount = renderAccount;
})();
