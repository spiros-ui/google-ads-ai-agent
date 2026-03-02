/**
 * dashboard-actions.js
 * Renders the Action Items approval queue tab.
 * Stores approval state in localStorage.
 */
(function () {
  'use strict';

  var currentFilter = 'all';       // all | pending | approved | rejected
  var currentAccount = 'all';      // all | account slug

  function renderActionItems() {
    var container = document.getElementById('content-actions');
    if (!container) return;

    var manifest = window.appData.manifest;
    var accounts = window.appData.accounts;
    var states = window.appData.actionStates || {};
    if (!manifest) {
      container.innerHTML = '<div class="content"><div class="empty-state"><h2>No data</h2></div></div>';
      return;
    }

    // Collect all action items across accounts
    var allItems = [];
    manifest.accounts.forEach(function (acc) {
      var data = accounts[acc.id];
      if (!data || !data.diagnosis || !data.diagnosis.actionItems) return;
      data.diagnosis.actionItems.forEach(function (item) {
        allItems.push({
          item: item,
          accountSlug: acc.id,
          accountName: acc.name,
          state: states[item.id] || null
        });
      });
    });

    // Apply filters
    var filtered = allItems.filter(function (entry) {
      var effectiveStatus = entry.state ? entry.state.status : 'pending';

      if (currentFilter !== 'all' && effectiveStatus !== currentFilter) return false;
      if (currentAccount !== 'all' && entry.accountSlug !== currentAccount) return false;
      return true;
    });

    // Counts
    var pendingCount = 0;
    var approvedCount = 0;
    var rejectedCount = 0;
    var estSavings = 0;
    allItems.forEach(function (entry) {
      var effectiveStatus = entry.state ? entry.state.status : 'pending';
      if (effectiveStatus === 'pending') pendingCount++;
      else if (effectiveStatus === 'approved') {
        approvedCount++;
        if (entry.item.estimatedSaving) estSavings += entry.item.estimatedSaving;
      }
      else if (effectiveStatus === 'rejected') rejectedCount++;
    });

    var html = '<div class="content">';

    // Summary bar
    html += '<div class="summary-bar">';
    html += buildStat('Pending', String(pendingCount), '');
    html += buildStat('Approved', String(approvedCount), '');
    html += buildStat('Rejected', String(rejectedCount), '');
    html += buildStat('Est. Savings', window.fmt.currency(estSavings), 'From approved items');
    html += '</div>';

    // Filter bar
    html += '<div class="action-filters">';
    html += filterButton('all', 'All (' + allItems.length + ')');
    html += filterButton('pending', 'Pending (' + pendingCount + ')');
    html += filterButton('approved', 'Approved (' + approvedCount + ')');
    html += filterButton('rejected', 'Rejected (' + rejectedCount + ')');

    // Account dropdown
    html += '<select class="filter-select" onchange="filterActionsByAccount(this.value)">';
    html += '<option value="all"' + (currentAccount === 'all' ? ' selected' : '') + '>All Accounts</option>';
    manifest.accounts.forEach(function (acc) {
      html += '<option value="' + acc.id + '"' + (currentAccount === acc.id ? ' selected' : '') + '>' + escapeHtml(acc.name) + '</option>';
    });
    html += '</select>';

    // Export button
    if (approvedCount > 0) {
      html += '<button class="btn btn-export" onclick="exportApproved()">Export Approved</button>';
    }
    html += '</div>';

    // Items grouped by account
    if (filtered.length === 0) {
      html += '<div class="empty-state" style="padding:40px"><h2>No action items</h2><p>No items match the current filter.</p></div>';
    } else {
      var groupedByAccount = {};
      var accountOrder = [];
      filtered.forEach(function (entry) {
        if (!groupedByAccount[entry.accountSlug]) {
          groupedByAccount[entry.accountSlug] = { name: entry.accountName, items: [] };
          accountOrder.push(entry.accountSlug);
        }
        groupedByAccount[entry.accountSlug].items.push(entry);
      });

      accountOrder.forEach(function (slug) {
        var group = groupedByAccount[slug];
        html += '<div class="action-group-label">' + escapeHtml(group.name) + ' (' + group.items.length + ' items)</div>';
        group.items.forEach(function (entry) {
          html += buildActionItem(entry);
        });
      });
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

  function filterButton(filter, label) {
    var active = currentFilter === filter ? ' active' : '';
    return '<button class="filter-btn' + active + '" onclick="filterActions(\'' + filter + '\')">' + label + '</button>';
  }

  function buildActionItem(entry) {
    var item = entry.item;
    var state = entry.state;
    var effectiveStatus = state ? state.status : 'pending';

    var html = '<div class="action-item">';
    html += '<div class="ai-info">';

    // Pills
    html += '<div class="ai-pills">';
    html += window.ui.severityPill(item.severity);
    if (item.type) html += window.ui.typePill(item.type);
    html += '</div>';

    // Title
    html += '<div class="ai-title" title="' + escapeAttr(item.title) + '">' + escapeHtml(item.title) + '</div>';

    // Description
    if (item.description) {
      html += '<div class="ai-desc">' + escapeHtml(item.description) + '</div>';
    }

    // Meta
    html += '<div class="ai-meta">';
    if (item.campaign) html += 'Campaign: <strong>' + escapeHtml(item.campaign) + '</strong> &nbsp; ';
    if (item.estimatedSaving != null) html += 'Saving: <strong style="color:var(--green)">' + window.fmt.currency(item.estimatedSaving) + '</strong>';
    html += '</div>';

    html += '</div>';

    // Buttons or status badge
    html += '<div class="ai-buttons">';
    if (effectiveStatus === 'pending') {
      html += '<button class="btn btn-approve" onclick="approveItem(\'' + escapeAttr(item.id) + '\')">Approve</button>';
      html += '<button class="btn btn-reject" onclick="rejectItem(\'' + escapeAttr(item.id) + '\')">Reject</button>';
    } else if (effectiveStatus === 'approved') {
      html += '<span class="status-badge status-approved">Approved</span>';
    } else if (effectiveStatus === 'rejected') {
      html += '<span class="status-badge status-rejected">Rejected</span>';
    }
    html += '</div>';

    html += '</div>';
    return html;
  }

  // --------------- Filter functions ---------------

  function filterActions(filter) {
    currentFilter = filter;
    renderActionItems();
  }

  function filterActionsByAccount(slug) {
    currentAccount = slug;
    renderActionItems();
  }

  window.filterActions = filterActions;
  window.filterActionsByAccount = filterActionsByAccount;

  // --------------- Approve / Reject ---------------

  function approveItem(id) {
    window.appData.actionStates[id] = {
      status: 'approved',
      timestamp: new Date().toISOString()
    };
    window.saveActionStates();
    renderActionItems();
  }

  function rejectItem(id) {
    window.appData.actionStates[id] = {
      status: 'rejected',
      timestamp: new Date().toISOString()
    };
    window.saveActionStates();
    renderActionItems();
  }

  window.approveItem = approveItem;
  window.rejectItem = rejectItem;

  // --------------- Export ---------------

  function exportApproved() {
    var states = window.appData.actionStates || {};
    var manifest = window.appData.manifest;
    var accounts = window.appData.accounts;

    var approved = [];
    if (manifest && manifest.accounts) {
      manifest.accounts.forEach(function (acc) {
        var data = accounts[acc.id];
        if (!data || !data.diagnosis || !data.diagnosis.actionItems) return;
        data.diagnosis.actionItems.forEach(function (item) {
          var st = states[item.id];
          if (st && st.status === 'approved') {
            approved.push({
              id: item.id,
              account: item.account || acc.name,
              date: item.date,
              type: item.type,
              severity: item.severity,
              title: item.title,
              description: item.description,
              campaign: item.campaign,
              estimatedSaving: item.estimatedSaving,
              approvedAt: st.timestamp
            });
          }
        });
      });
    }

    var blob = new Blob([JSON.stringify(approved, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'approved-actions-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.exportApproved = exportApproved;

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

  window.renderActionItems = renderActionItems;
})();
