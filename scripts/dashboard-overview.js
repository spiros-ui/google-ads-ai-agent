/**
 * dashboard-overview.js
 * Renders the Overview tab: summary bar + account cards grid.
 */
(function () {
  'use strict';

  function renderOverview() {
    var container = document.getElementById('content-overview');
    if (!container) return;

    var manifest = window.appData.manifest;
    var accounts = window.appData.accounts;
    if (!manifest) {
      container.innerHTML = '<div class="content"><div class="empty-state">' +
        '<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="8" y="12" width="48" height="40" rx="4" stroke="currentColor" stroke-width="2" opacity="0.3"/>' +
        '<path d="M16 44L26 30L34 38L42 24L48 32" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>' +
        '<circle cx="26" cy="30" r="2" fill="currentColor" opacity="0.3"/><circle cx="34" cy="38" r="2" fill="currentColor" opacity="0.3"/>' +
        '<circle cx="42" cy="24" r="2" fill="currentColor" opacity="0.3"/></svg>' +
        '<h2>No data available</h2><p>Audit data has not been loaded yet. Run an audit to see results here.</p></div></div>';
      return;
    }

    var totalSpend = 0;
    var totalIssues = 0;
    var totalConversions = 0;
    var needsAttentionCount = 0;
    var accountCards = [];
    var maxSpend = 0;
    var cardData = [];

    // First pass: collect data and find max spend for sparkline bars
    manifest.accounts.forEach(function (acc) {
      var data = accounts[acc.id];
      if (!data || !data.diagnosis) {
        cardData.push({ acc: acc, noData: true });
        return;
      }

      var diag = data.diagnosis;
      var summary = diag.accountSummary || {};
      var spend = summary.totalSpend || 0;
      var conversions = summary.totalConversions || 0;
      var campaignCount = summary.totalCampaigns || 0;
      var verdict = summary.overallVerdict || 'Unknown';

      totalSpend += spend;
      totalConversions += conversions;
      if (spend > maxSpend) maxSpend = spend;

      // Count issues by severity
      var criticalCount = 0;
      var highCount = 0;
      var otherCount = 0;
      if (diag.campaigns) {
        diag.campaigns.forEach(function (c) {
          if (c.issues) {
            c.issues.forEach(function (issue) {
              totalIssues++;
              var sev = (issue.severity || '').toLowerCase();
              if (sev === 'critical') criticalCount++;
              else if (sev === 'high') highCount++;
              else otherCount++;
            });
          }
        });
      }

      // Determine if this account needs attention
      var v = verdict.toLowerCase();
      if (v.indexOf('attention') !== -1 || v.indexOf('critical') !== -1 ||
          v.indexOf('poor') !== -1 || v.indexOf('bad') !== -1 || v.indexOf('failing') !== -1) {
        needsAttentionCount++;
      }

      cardData.push({ acc: acc, summary: summary, criticalCount: criticalCount, highCount: highCount, otherCount: otherCount, campaignCount: campaignCount, spend: spend });
    });

    // Second pass: build card HTML with relative spend bars
    cardData.forEach(function (d) {
      if (d.noData) {
        accountCards.push(buildNoDataCard(d.acc));
      } else {
        accountCards.push(buildAccountCard(d.acc, d.summary, d.criticalCount, d.highCount, d.otherCount, d.campaignCount, maxSpend));
      }
    });

    var html = '<div class="content">';

    // Summary bar
    html += '<div class="summary-bar">';
    html += buildSummaryStat('Total Spend (30d)', window.fmt.currency(totalSpend), manifest.accounts.length + ' accounts', 'stat-spend');
    html += buildSummaryStat('Total Conversions', window.fmt.number(totalConversions), '', 'stat-conversions');
    html += buildSummaryStat('Open Issues', totalIssues.toString(), totalIssues > 0 ? 'Across all accounts' : 'All clear', 'stat-issues');
    html += buildSummaryStat('Needs Attention', needsAttentionCount.toString(), needsAttentionCount === 0 ? 'All accounts healthy' : needsAttentionCount + ' account' + (needsAttentionCount !== 1 ? 's' : ''), 'stat-attention');
    html += '</div>';

    // Account cards grid
    html += '<div class="accounts-grid">';
    html += accountCards.join('');
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }

  function buildSummaryStat(label, value, sub, accentClass) {
    return '<div class="summary-stat' + (accentClass ? ' ' + accentClass : '') + '">' +
      '<div class="label">' + label + '</div>' +
      '<div class="value">' + value + '</div>' +
      (sub ? '<div class="sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function buildAccountCard(acc, summary, criticalCount, highCount, otherCount, campaignCount, maxSpend) {
    var spend = summary.totalSpend || 0;
    var conversions = summary.totalConversions || 0;
    var verdict = summary.overallVerdict || 'Unknown';
    var totalIssueCount = criticalCount + highCount + otherCount;

    // Determine verdict border class
    var v = verdict.toLowerCase();
    var borderClass = 'verdict-border-inactive';
    if (v.indexOf('healthy') !== -1 || v.indexOf('good') !== -1 || v.indexOf('strong') !== -1) {
      borderClass = 'verdict-border-healthy';
    } else if (v.indexOf('attention') !== -1 || v.indexOf('moderate') !== -1 || v.indexOf('fair') !== -1 || v.indexOf('mixed') !== -1) {
      borderClass = 'verdict-border-attention';
    } else if (v.indexOf('critical') !== -1 || v.indexOf('poor') !== -1 || v.indexOf('bad') !== -1 || v.indexOf('failing') !== -1) {
      borderClass = 'verdict-border-critical';
    }

    var spendPct = maxSpend > 0 ? Math.round((spend / maxSpend) * 100) : 0;

    var html = '<div class="account-card ' + borderClass + '" onclick="switchTab(\'' + acc.id + '\')">';

    // Header
    html += '<div class="card-header">';
    html += '<div class="card-name" title="' + acc.name.replace(/"/g, '&quot;') + '">' + acc.name + '</div>';
    html += window.ui.verdictPill(verdict);
    html += '</div>';

    // Metrics
    html += '<div class="card-metrics">';
    html += '<div class="card-metric">30d Spend<strong>' + window.fmt.currency(spend) + '</strong></div>';
    html += '<div class="card-metric">Conversions<strong>' + window.fmt.number(conversions) + '</strong></div>';
    html += '<div class="card-metric">Campaigns<strong>' + campaignCount + '</strong></div>';
    html += '<div class="card-metric">Issues<strong style="color:' +
      (criticalCount > 0 ? 'var(--red)' : totalIssueCount > 0 ? 'var(--yellow)' : 'var(--green)') + '">' +
      totalIssueCount + '</strong></div>';
    html += '</div>';

    // Issue breakdown
    if (totalIssueCount > 0) {
      html += '<div class="card-issues">';
      if (criticalCount > 0) html += '<span style="color:var(--red)">' + criticalCount + ' critical</span>';
      if (highCount > 0) html += '<span style="color:var(--orange)">' + highCount + ' high</span>';
      if (otherCount > 0) html += '<span style="color:var(--text-dim)">' + otherCount + ' other</span>';
      html += '</div>';
    }

    // Spend bar sparkline (relative to highest spending account)
    html += '<div class="spend-bar" style="width:' + spendPct + '%"></div>';

    html += '</div>';
    return html;
  }

  function buildNoDataCard(acc) {
    var html = '<div class="account-card" onclick="switchTab(\'' + acc.id + '\')">';
    html += '<div class="card-header">';
    html += '<div class="card-name" title="' + acc.name.replace(/"/g, '&quot;') + '">' + acc.name + '</div>';
    html += '<span class="verdict-pill verdict-inactive">No Data</span>';
    html += '</div>';
    html += '<div style="font-size:13px;color:var(--text-dim);padding-top:8px;">Data could not be loaded for this account.</div>';
    html += '</div>';
    return html;
  }

  window.renderOverview = renderOverview;
})();
