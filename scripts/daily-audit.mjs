#!/usr/bin/env node
/**
 * Google Ads Daily Audit Script v2
 * Campaign-centric diagnosis: for each active campaign, diagnoses WHY it's not meeting
 * its objective through the conversion funnel (Budget → Impressions → Clicks → Conversions).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { diagnoseCampaigns } from './lib/campaign-diagnosis.js';
import { generatePeriodInsights } from './lib/period-insights.js';

// ===== CONFIGURATION =====
const PROJECT_DIR = '/Users/spirosmaragkoudakis/google-ads-ai-agent';
const DATA_DIR = path.join(PROJECT_DIR, 'data');
const LOG_DIR = path.join(PROJECT_DIR, 'logs');
const CONFIG_DIR = path.join(PROJECT_DIR, 'config');
const DEFAULT_LOGIN_ID = 8092443494;

fs.mkdirSync(LOG_DIR, { recursive: true });

const logFile = path.join(LOG_DIR, 'audit.log');
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

// ===== ACCOUNT CONFIG =====
function loadAccountConfig() {
  const configPath = path.join(CONFIG_DIR, 'accounts.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return { forceInclude: [] };
}

// ===== GAQL QUERIES =====
// Focused on campaign-level data needed for meaningful diagnosis
const QUERIES = {
  campaign_diagnosis: `SELECT
    campaign.id, campaign.name, campaign.status, campaign.serving_status,
    campaign.advertising_channel_type, campaign.bidding_strategy_type,
    campaign_budget.amount_micros,
    metrics.impressions, metrics.clicks, metrics.conversions,
    metrics.conversions_value, metrics.cost_micros,
    metrics.search_impression_share,
    metrics.search_budget_lost_impression_share,
    metrics.search_rank_lost_impression_share,
    metrics.average_cpc
    FROM campaign
    WHERE campaign.status = 'ENABLED'
    AND segments.date DURING LAST_30_DAYS`,

  campaign_keywords: `SELECT
    campaign.name, ad_group.name,
    ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
    ad_group_criterion.status, ad_group_criterion.approval_status,
    ad_group_criterion.quality_info.quality_score,
    metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros
    FROM keyword_view
    WHERE campaign.status = 'ENABLED'
    AND segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC LIMIT 500`,

  campaign_search_terms: `SELECT
    campaign.name, search_term_view.search_term,
    metrics.impressions, metrics.clicks, metrics.conversions,
    metrics.conversions_value, metrics.cost_micros
    FROM search_term_view
    WHERE campaign.status = 'ENABLED'
    AND segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC LIMIT 300`,

  campaign_negatives: `SELECT
    campaign.name, campaign_criterion.keyword.text,
    campaign_criterion.keyword.match_type, campaign_criterion.negative
    FROM campaign_criterion
    WHERE campaign_criterion.type = 'KEYWORD' AND campaign.status = 'ENABLED'`,

  campaign_ads: `SELECT
    campaign.name, ad_group.name,
    ad_group_ad.status, ad_group_ad.policy_summary.approval_status,
    ad_group_ad.ad_strength, ad_group_ad.ad.type
    FROM ad_group_ad
    WHERE campaign.status = 'ENABLED'`,

  conversion_actions: `SELECT
    conversion_action.id, conversion_action.name,
    conversion_action.type, conversion_action.status,
    conversion_action.category, conversion_action.include_in_conversions_metric
    FROM conversion_action WHERE conversion_action.status = 'ENABLED'`
};

// ===== PERIOD DEFINITIONS =====
function getPeriodDateFilter(periodKey, todayStr) {
  // todayStr = 'YYYY-MM-DD' (today, so yesterday = today - 1)
  const d = new Date(todayStr + 'T00:00:00');
  const fmt = (dt) => dt.toISOString().split('T')[0].replace(/-/g, '');
  const sub = (days) => { const r = new Date(d); r.setDate(r.getDate() - days); return r; };
  const yesterday = sub(1);

  switch (periodKey) {
    case 'yesterday':
      return `segments.date DURING YESTERDAY`;
    case 'last3d': {
      const from = sub(3);
      return `segments.date BETWEEN '${from.toISOString().split('T')[0]}' AND '${yesterday.toISOString().split('T')[0]}'`;
    }
    case 'last7d':
      return `segments.date DURING LAST_7_DAYS`;
    case 'last14d':
      return `segments.date DURING LAST_14_DAYS`;
    case 'last30d':
      return `segments.date DURING LAST_30_DAYS`;
    default:
      return `segments.date DURING LAST_30_DAYS`;
  }
}

function buildPeriodQuery(dateFilter) {
  return `SELECT
    campaign.id, campaign.name, campaign.status,
    campaign.advertising_channel_type, campaign.bidding_strategy_type,
    campaign_budget.amount_micros,
    metrics.impressions, metrics.clicks, metrics.conversions,
    metrics.conversions_value, metrics.cost_micros,
    metrics.search_impression_share,
    metrics.search_budget_lost_impression_share,
    metrics.search_rank_lost_impression_share,
    metrics.average_cpc
    FROM campaign
    WHERE campaign.status = 'ENABLED'
    AND ${dateFilter}`;
}

function getPeriodLabel(periodKey, todayStr) {
  const d = new Date(todayStr + 'T00:00:00');
  const sub = (days) => { const r = new Date(d); r.setDate(r.getDate() - days); return r.toISOString().split('T')[0]; };
  const labels = {
    yesterday: sub(1),
    last3d: `${sub(3)} to ${sub(1)}`,
    last7d: `${sub(7)} to ${sub(1)}`,
    last14d: `${sub(14)} to ${sub(1)}`,
    last30d: `${sub(30)} to ${sub(1)}`
  };
  return labels[periodKey] || periodKey;
}

const PERIOD_KEYS = ['yesterday', 'last3d', 'last7d', 'last14d', 'last30d'];
const PERIOD_DISPLAY = {
  yesterday: 'Yesterday', last3d: 'Last 3 Days', last7d: 'Last 7 Days',
  last14d: 'Last 14 Days', last30d: 'Last 30 Days'
};

function aggregatePeriodRows(rows) {
  let totalSpend = 0, totalImpr = 0, totalClicks = 0, totalConv = 0, totalValue = 0;
  const campaigns = [];

  for (const row of rows) {
    if ((row.campaign?.status || '').toUpperCase() !== 'ENABLED') continue;
    const spend = microsToDollars(row.metrics?.costMicros);
    const impressions = Number(row.metrics?.impressions || 0);
    const clicks = Number(row.metrics?.clicks || 0);
    const conversions = Number(row.metrics?.conversions || 0);
    const convValue = Number(row.metrics?.conversionsValue || 0);
    const avgCpc = microsToDollars(row.metrics?.averageCpc);
    const budget = microsToDollars(row.campaignBudget?.amountMicros);
    const toIS = v => v != null ? Math.round(Number(v) * 10000) / 100 : null;

    totalSpend += spend; totalImpr += impressions;
    totalClicks += clicks; totalConv += conversions; totalValue += convValue;

    const cpa = conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : null;
    const roas = spend > 0 ? Math.round((convValue / spend) * 100) / 100 : null;
    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;

    campaigns.push({
      name: row.campaign?.name || 'Unknown',
      type: row.campaign?.advertisingChannelType || 'UNKNOWN',
      bidding: row.campaign?.biddingStrategyType || '',
      budget: Math.round(budget * 100) / 100,
      spend: Math.round(spend * 100) / 100,
      impressions, clicks,
      conversions: Math.round(conversions * 100) / 100,
      convValue: Math.round(convValue * 100) / 100,
      cpa, roas, ctr: Math.round(ctr * 100) / 100,
      avgCpc: Math.round(avgCpc * 100) / 100,
      searchIS: toIS(row.metrics?.searchImpressionShare)
    });
  }

  const acctCpa = totalConv > 0 ? Math.round((totalSpend / totalConv) * 100) / 100 : null;
  const acctRoas = totalSpend > 0 ? Math.round((totalValue / totalSpend) * 100) / 100 : null;
  const acctCtr = totalImpr > 0 ? Math.round((totalClicks / totalImpr) * 10000) / 100 : 0;
  const acctAvgCpc = totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : null;

  return {
    account: {
      spend: Math.round(totalSpend * 100) / 100,
      conversions: Math.round(totalConv * 100) / 100,
      convValue: Math.round(totalValue * 100) / 100,
      roas: acctRoas, cpa: acctCpa,
      impressions: totalImpr, clicks: totalClicks,
      ctr: acctCtr, avgCpc: acctAvgCpc
    },
    campaigns
  };
}

async function collectPeriodMetrics(client, customerId, loginCustomerId, todayStr) {
  const periodMetrics = {};

  for (const key of PERIOD_KEYS) {
    const dateFilter = getPeriodDateFilter(key, todayStr);
    const query = buildPeriodQuery(dateFilter);
    log(`  Period query: ${key}`);

    const rows = await executeQuery(client, customerId, query, loginCustomerId);
    const agg = aggregatePeriodRows(rows);

    periodMetrics[key] = {
      label: PERIOD_DISPLAY[key],
      dateRange: getPeriodLabel(key, todayStr),
      account: agg.account,
      campaigns: agg.campaigns,
      insights: [] // filled after all periods collected
    };

    await new Promise(r => setTimeout(r, 400));
  }

  // Generate doctor-style diagnosis for each period
  for (const key of PERIOD_KEYS) {
    const result = generatePeriodInsights(
      periodMetrics[key], periodMetrics, key
    );
    periodMetrics[key].insights = result.insights;
    periodMetrics[key].campaignDiagnoses = result.campaignDiagnoses;
  }

  return periodMetrics;
}

// ===== MCP CONNECTION =====
function getMCPConfig() {
  const mcpPath = path.join(homedir(), '.mcp.json');
  const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
  return config.mcpServers.gads;
}

async function connectMCP() {
  const config = getMCPConfig();
  log(`Connecting to MCP server: ${config.command} ${config.args.join(' ').replace(/--token=.*/, '--token=***')}`);

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...process.env, ...(config.env || {}) }
  });

  const client = new Client({ name: 'google-ads-daily-audit', version: '2.0.0' }, {});
  await client.connect(transport);
  log('MCP connection established');
  return { client, transport };
}

async function callTool(client, toolName, args) {
  const result = await client.callTool({ name: toolName, arguments: args });
  if (result.content && result.content.length > 0) {
    const text = result.content[0].text;
    const jsonStart = text.indexOf('{');
    if (jsonStart === -1) return text;
    try {
      return JSON.parse(text.substring(jsonStart));
    } catch {
      return text;
    }
  }
  return null;
}

function transformColumnarData(queryResult) {
  if (!queryResult || !queryResult.result) return [];
  const { columns, data } = queryResult.result;
  if (!columns || !data) return [];

  return data.map(row => {
    const obj = {};
    columns.forEach((col, i) => {
      const parts = col.split('.');
      let current = obj;
      for (let j = 0; j < parts.length - 1; j++) {
        if (!current[parts[j]]) current[parts[j]] = {};
        current = current[parts[j]];
      }
      let val = row[i];
      if (val === 'true' || val === 'True') val = true;
      else if (val === 'false' || val === 'False') val = false;
      current[parts[parts.length - 1]] = val;
    });
    return obj;
  });
}

async function executeQuery(client, customerId, query, loginCustomerId) {
  try {
    const raw = await callTool(client, 'execute-gaql-query', {
      query,
      customerId: Number(String(customerId).replace(/-/g, '')),
      loginCustomerId: Number(String(loginCustomerId || DEFAULT_LOGIN_ID).replace(/-/g, '')),
      reportAggregation: ''
    });
    return transformColumnarData(raw);
  } catch (err) {
    log(`  Query error: ${err.message}`);
    return [];
  }
}

// ===== HELPERS =====
function slugify(name) {
  return name.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function microsToDollars(micros) {
  return (Number(micros) || 0) / 1_000_000;
}

// ===== ACCOUNT DISCOVERY =====
async function getActiveAccounts(client) {
  log('Fetching accounts...');
  const raw = await callTool(client, 'get-accounts', {});
  const accounts = raw?.result || [];
  const subAccounts = accounts.filter(a =>
    a.name && !a.name.startsWith('Unnamed')
  );
  log(`Found ${accounts.length} total accounts, ${subAccounts.length} named accounts`);
  return subAccounts;
}

async function resolveAccountList(client) {
  const config = loadAccountConfig();
  const forceIds = new Set(config.forceInclude.map(a => String(a.customerId).replace(/-/g, '')));
  const allAccounts = await getActiveAccounts(client);

  const activeAccounts = [];
  const processedIds = new Set();

  // First: force-include all whitelisted accounts
  for (const forced of config.forceInclude) {
    const fid = String(forced.customerId).replace(/-/g, '');
    // Try to find in MCP accounts for correct loginCustomerId
    const found = allAccounts.find(a => String(a.customerId).replace(/-/g, '') === fid);
    if (found) {
      log(`  Force-included: ${found.name} (${fid})`);
      activeAccounts.push(found);
    } else {
      log(`  Force-added (not in MCP): ${forced.name} (${fid})`);
      activeAccounts.push({
        name: forced.name,
        customerId: Number(fid),
        loginCustomerId: Number(String(forced.loginCustomerId).replace(/-/g, ''))
      });
    }
    processedIds.add(fid);
  }

  // Then: add any other accounts with recent spend that aren't already included
  for (const acct of allAccounts) {
    const cid = String(acct.customerId || '').replace(/-/g, '');
    if (!cid || processedIds.has(cid)) continue;

    try {
      const rows = await executeQuery(client, cid,
        'SELECT metrics.cost_micros FROM customer WHERE segments.date DURING LAST_30_DAYS',
        acct.loginCustomerId);
      const spend = rows.reduce((sum, r) => sum + microsToDollars(r.metrics?.costMicros || 0), 0);
      if (spend > 0) {
        log(`  Active (non-whitelist): ${acct.name} — $${spend.toFixed(2)}`);
        activeAccounts.push(acct);
        processedIds.add(cid);
      }
    } catch { /* skip */ }
    await new Promise(r => setTimeout(r, 300));
  }

  return activeAccounts;
}

// ===== DATA COLLECTION =====
async function collectAccountData(client, customerId, loginCustomerId) {
  const data = {};
  for (const [key, query] of Object.entries(QUERIES)) {
    log(`  Query: ${key}`);
    data[key] = await executeQuery(client, customerId, query, loginCustomerId);
    await new Promise(r => setTimeout(r, 500));
  }
  return data;
}

// ===== RUN AUDIT =====
function runAudit(account, rawData, date, periodMetrics) {
  const diagnosis = diagnoseCampaigns(rawData);

  // Fix action items to use account name (not campaign name)
  for (const item of diagnosis.actionItems || []) {
    item.account = account.name;
  }

  // Attach period metrics to diagnosis
  if (periodMetrics) {
    diagnosis.periodMetrics = periodMetrics;
  }

  return {
    account: account.name,
    customerId: String(account.customerId),
    date,
    diagnosis
  };
}

// ===== FILE OUTPUT =====
function writeAuditFile(account, date, audit) {
  const slug = slugify(account.name);
  const dir = path.join(DATA_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(audit, null, 2));
  log(`  Written: ${filePath}`);
  return slug;
}

function updateManifest(auditedAccounts, date) {
  const manifestPath = path.join(DATA_DIR, 'manifest.json');
  let manifest = { accounts: [], lastUpdated: '' };

  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }

  for (const acct of auditedAccounts) {
    const slug = slugify(acct.name);
    const existing = manifest.accounts.find(a => a.id === slug);
    if (existing) {
      if (!existing.dates.includes(date)) {
        existing.dates.push(date);
        existing.dates.sort();
      }
    } else {
      manifest.accounts.push({
        id: slug,
        name: acct.name,
        customerId: String(acct.customerId),
        dates: [date]
      });
    }
  }

  manifest.lastUpdated = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log(`Manifest updated: ${manifest.accounts.length} accounts`);
}

function writeActionItemsManifest(allActionItems, date) {
  const manifestPath = path.join(DATA_DIR, 'action-items.json');
  let existing = { items: [], lastUpdated: '' };

  if (fs.existsSync(manifestPath)) {
    try { existing = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch { /* reset */ }
  }

  // Keep historical approved/rejected, replace pending for today
  const historicalItems = existing.items.filter(item =>
    item.status !== 'pending' || item.date !== date
  );

  const merged = [...historicalItems, ...allActionItems];
  existing.items = merged;
  existing.lastUpdated = new Date().toISOString();

  fs.writeFileSync(manifestPath, JSON.stringify(existing, null, 2));
  log(`Action items: ${allActionItems.length} new, ${merged.length} total`);
}

// ===== GIT PUSH =====
function gitPush(date) {
  try {
    execSync('git add data/ config/', { cwd: PROJECT_DIR });
    execSync(`git commit -m "Daily audit ${date} (v2 campaign diagnosis)"`, { cwd: PROJECT_DIR });
    execSync('git push origin main', { cwd: PROJECT_DIR });
    log('Changes pushed to GitHub');
  } catch (err) {
    if (err.message?.includes('nothing to commit')) {
      log('No changes to commit');
    } else {
      log(`Git push error: ${err.message}`);
    }
  }
}

// ===== MAIN =====
async function main() {
  const today = new Date().toISOString().split('T')[0];
  log(`\n${'='.repeat(60)}`);
  log(`Starting campaign diagnosis audit for ${today}`);
  log(`${'='.repeat(60)}`);

  let mcpClient, transport;
  try {
    const conn = await connectMCP();
    mcpClient = conn.client;
    transport = conn.transport;
  } catch (err) {
    log(`FATAL: Cannot connect to MCP server: ${err.message}`);
    process.exit(1);
  }

  // Resolve account list (force-include whitelist + any other active accounts)
  let activeAccounts;
  try {
    activeAccounts = await resolveAccountList(mcpClient);
  } catch (err) {
    log(`FATAL: Cannot resolve accounts: ${err.message}`);
    process.exit(1);
  }

  log(`\n${activeAccounts.length} accounts to audit\n`);

  // Audit each account
  const auditedAccounts = [];
  const allActionItems = [];

  for (const acct of activeAccounts) {
    const customerId = String(acct.customerId || '').replace(/-/g, '');
    const loginId = acct.loginCustomerId;
    log(`\n--- Auditing: ${acct.name} (${customerId}) ---`);

    try {
      const rawData = await collectAccountData(mcpClient, customerId, loginId);

      // Collect multi-period metrics (5 periods)
      log(`  Collecting period metrics...`);
      const periodMetrics = await collectPeriodMetrics(mcpClient, customerId, loginId, today);

      const audit = runAudit(acct, rawData, today, periodMetrics);
      writeAuditFile(acct, today, audit);
      auditedAccounts.push(acct);

      // Collect action items
      if (audit.diagnosis?.actionItems) {
        allActionItems.push(...audit.diagnosis.actionItems);
      }

      const summary = audit.diagnosis?.accountSummary;
      const periodCount = Object.keys(periodMetrics).length;
      log(`  Verdict: ${summary?.overallVerdict || 'N/A'} | Campaigns: ${summary?.totalCampaigns || 0} | Issues: ${summary?.criticalIssues || 0} critical | Periods: ${periodCount}`);
    } catch (err) {
      log(`  ERROR: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // Update manifest, write action items, push
  if (auditedAccounts.length > 0) {
    updateManifest(auditedAccounts, today);
    if (allActionItems.length > 0) {
      writeActionItemsManifest(allActionItems, today);
    }
    gitPush(today);
  } else {
    log('No accounts audited — nothing to push');
  }

  try { await mcpClient.close(); } catch { /* ignore */ }

  log(`\nAudit complete. ${auditedAccounts.length} accounts, ${allActionItems.length} action items.`);
  log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
