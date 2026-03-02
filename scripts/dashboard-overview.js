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
      container.innerHTML = '<div class="content"><div class="empty-state"><h2>No data</h2></div></div>';
      return;
    }

    var totalSpend = 0;
    var totalIssues = 0;
    var totalConversions = 0;
    var needsAttentionCount = 0;
    var accountCards = [];

    manifest.accounts.forEach(function (acc) {
      var data = accounts[acc.id];
      if (!data || !data.diagnosis) {
        accountCards.push(buildNoDataCard(acc));
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

      accountCards.push(buildAccountCard(acc, summary, criticalCount, highCount, otherCount, campaignCount));
    });

    var html = '<div class="content">';

    // Summary bar
    html += '<div class="summary-bar">';
    html += buildSummaryStat('Total Spend (30d)', window.fmt.currency(totalSpend), manifest.accounts.length + ' accounts');
    html += buildSummaryStat('Total Conversions', window.fmt.number(totalConversions), '');
    html += buildSummaryStat('Open Issues', totalIssues.toString(), totalIssues > 0 ? 'Across all accounts' : 'All clear');
    html += buildSummaryStat('Needs Attention', needsAttentionCount.toString(), needsAttentionCount === 0 ? 'All accounts healthy' : needsAttentionCount + ' account' + (needsAttentionCount !== 1 ? 's' : ''));
    html += '</div>';

    // Account cards grid
    html += '<div class="accounts-grid">';
    html += accountCards.join('');
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }

  function buildSummaryStat(label, value, sub) {
    return '<div class="summary-stat">' +
      '<div class="label">' + label + '</div>' +
      '<div class="value">' + value + '</div>' +
      (sub ? '<div class="sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function buildAccountCard(acc, summary, criticalCount, highCount, otherCount, campaignCount) {
    var spend = summary.totalSpend || 0;
    var conversions = summary.totalConversions || 0;
    var verdict = summary.overallVerdict || 'Unknown';
    var totalIssueCount = criticalCount + highCount + otherCount;

    var html = '<div class="account-card" onclick="switchTab(\'' + acc.id + '\')">';

    // Header
    html += '<div class="card-header">';
    html += '<div class="card-name">' + acc.name + '</div>';
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

    html += '</div>';
    return html;
  }

  function buildNoDataCard(acc) {
    var html = '<div class="account-card" onclick="switchTab(\'' + acc.id + '\')">';
    html += '<div class="card-header">';
    html += '<div class="card-name">' + acc.name + '</div>';
    html += '<span class="verdict-pill verdict-inactive">No Data</span>';
    html += '</div>';
    html += '<div style="font-size:13px;color:var(--text-dim);padding-top:8px;">Data could not be loaded for this account.</div>';
    html += '</div>';
    return html;
  }

  window.renderOverview = renderOverview;
})();
