#!/usr/bin/env node
/**
 * Google Ads Daily Audit Script
 * Connects to Google Ads MCP server, runs GAQL queries for each active account,
 * generates audit JSON files, and pushes to GitHub Pages.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';

// ===== CONFIGURATION =====
const PROJECT_DIR = '/Users/spirosmaragkoudakis/google-ads-ai-agent';
const DATA_DIR = path.join(PROJECT_DIR, 'data');
const LOG_DIR = path.join(PROJECT_DIR, 'logs');
const LOGIN_CUSTOMER_ID = 8092443494;

// Ensure directories exist
fs.mkdirSync(LOG_DIR, { recursive: true });

// Logging
const logFile = path.join(LOG_DIR, 'audit.log');
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

// ===== INDUSTRY BENCHMARKS =====
const BENCHMARKS = {
  'E-commerce':        { cpc: 1.15, ctr_search: 4.13, ctr_shopping: 0.86, cvr: 2.81, roas: 3.68 },
  'Local Services':    { cpc: 11.42, ctr_search: 5.94, cvr: 11.17, roas: 5.0 },
  'Legal':             { cpc: 8.90, ctr_search: 5.59, cvr: 4.85, roas: 3.0 },
  'B2B SaaS':          { cpc: 6.25, ctr_search: 4.28, cvr: 1.65 },
  'Healthcare':        { cpc: 40.0, ctr_search: 4.90, cvr: 3.10, roas: 2.8 },
  'Finance':           { cpc: 3.62, ctr_search: 6.49, cvr: 3.03, roas: 3.5 },
  'Real Estate':       { cpc: 2.04, ctr_search: 8.43, cvr: 3.28 },
  'Education':         { cpc: 6.23, ctr_search: 6.66, cvr: 7.52 },
  'Travel':            { cpc: 2.12, ctr_search: 6.66, cvr: 7.52 },
  'General':           { cpc: 5.26, ctr_search: 6.66, cvr: 7.52, roas: 3.0 }
};

// Severity multipliers for scoring
const SEVERITY = { Critical: 5.0, High: 3.0, Medium: 1.5, Low: 0.5 };
const RESULT_SCORE = { PASS: 1.0, WARNING: 0.5, FAIL: 0.0 };

// Category weights for Google Ads
const CATEGORY_WEIGHTS = {
  'Conversion Tracking': 0.25,
  'Wasted Spend / Negatives': 0.20,
  'Account Structure': 0.15,
  'Keywords & Quality Score': 0.15,
  'Ads & Assets': 0.15,
  'Settings & Targeting + Bidding': 0.10
};

// ===== GAQL QUERIES =====
const QUERIES = {
  campaigns: `SELECT campaign.id, campaign.name, campaign.status,
    campaign.advertising_channel_type, campaign.bidding_strategy_type,
    campaign.network_settings.target_google_search,
    campaign.network_settings.target_search_network,
    campaign.network_settings.target_content_network
    FROM campaign`,

  campaign_budgets: `SELECT campaign.id, campaign.name, campaign.status,
    campaign_budget.amount_micros
    FROM campaign WHERE campaign.status = 'ENABLED'`,

  account_metrics: `SELECT metrics.impressions, metrics.clicks,
    metrics.conversions, metrics.conversions_value, metrics.cost_micros,
    metrics.search_impression_share
    FROM customer WHERE segments.date DURING LAST_30_DAYS`,

  campaign_metrics: `SELECT campaign.id, campaign.name, campaign.status,
    campaign.advertising_channel_type,
    metrics.impressions, metrics.clicks, metrics.conversions,
    metrics.conversions_value, metrics.cost_micros
    FROM campaign WHERE segments.date DURING LAST_30_DAYS`,

  conversion_actions: `SELECT conversion_action.id, conversion_action.name,
    conversion_action.type, conversion_action.status,
    conversion_action.category, conversion_action.include_in_conversions_metric
    FROM conversion_action`,

  ad_groups: `SELECT ad_group.id, ad_group.name, ad_group.status,
    campaign.id, campaign.name
    FROM ad_group`,

  keywords: `SELECT ad_group_criterion.keyword.text,
    ad_group_criterion.keyword.match_type,
    ad_group_criterion.quality_info.quality_score,
    ad_group_criterion.status
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = 'KEYWORD'`,

  ads: `SELECT ad_group_ad.ad.id, ad_group_ad.ad.type,
    ad_group_ad.status, ad_group_ad.ad_strength,
    campaign.id, campaign.advertising_channel_type
    FROM ad_group_ad`,

  assets: `SELECT asset.id, asset.name, asset.type FROM asset`,

  geo_targeting: `SELECT campaign.id,
    campaign.geo_target_type_setting.positive_geo_target_type
    FROM campaign WHERE campaign.status = 'ENABLED'`,

  shopping_performance: `SELECT segments.product_item_id, segments.product_title,
    metrics.impressions, metrics.clicks, metrics.conversions,
    metrics.conversions_value, metrics.cost_micros
    FROM shopping_performance_view
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC
    LIMIT 50`,

  negative_lists: `SELECT shared_set.id, shared_set.name, shared_set.type,
    shared_set.member_count
    FROM shared_set WHERE shared_set.type = 'NEGATIVE_KEYWORDS'`,

  user_lists: `SELECT user_list.id, user_list.name, user_list.type,
    user_list.membership_status
    FROM user_list`
};

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

  const client = new Client({ name: 'google-ads-daily-audit', version: '1.0.0' }, {});
  await client.connect(transport);
  log('MCP connection established');
  return { client, transport };
}

async function callTool(client, toolName, args) {
  const result = await client.callTool({ name: toolName, arguments: args });
  if (result.content && result.content.length > 0) {
    const text = result.content[0].text;
    // MCP server prefixes responses with "Accounts:\n" or "Query result:\n"
    // Strip everything before the first { to get the JSON
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

// Transform columnar MCP response {columns: [...], data: [[...]]} into objects
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
      // Convert string booleans and numbers
      let val = row[i];
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
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
      loginCustomerId: Number(String(loginCustomerId || LOGIN_CUSTOMER_ID).replace(/-/g, '')),
      reportAggregation: ''
    });
    return transformColumnarData(raw);
  } catch (err) {
    log(`  Query error: ${err.message}`);
    return [];
  }
}

// ===== DATA COLLECTION =====
async function getActiveAccounts(client) {
  log('Fetching accounts...');
  const raw = await callTool(client, 'get-accounts', {});
  const accounts = raw?.result || [];
  // Include all sub-accounts (exclude MCC-level accounts where customerId === loginCustomerId)
  // and exclude unnamed accounts
  const subAccounts = accounts.filter(a =>
    a.customerId !== a.loginCustomerId &&
    a.name && !a.name.startsWith('Unnamed')
  );
  log(`Found ${accounts.length} total accounts, ${subAccounts.length} named sub-accounts`);
  return subAccounts;
}

async function collectAccountData(client, customerId, loginCustomerId) {
  const data = {};

  for (const [key, query] of Object.entries(QUERIES)) {
    log(`  Running query: ${key}`);
    data[key] = await executeQuery(client, customerId, query, loginCustomerId);
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  return data;
}

// ===== HELPER FUNCTIONS =====
function safeArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return [];
}

function microsToDollars(micros) {
  return (Number(micros) || 0) / 1_000_000;
}

function slugify(name) {
  return name.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 10000) / 100;
}

// ===== INDUSTRY DETECTION =====
function detectIndustry(accountName, data) {
  const name = accountName.toLowerCase();
  const campaigns = safeArray(data.campaigns);
  const convActions = safeArray(data.conversion_actions);
  const products = safeArray(data.shopping_performance);

  // E-commerce signals
  if (products.length > 0) return 'E-commerce';
  const hasPurchase = convActions.some(r => {
    const cat = r.conversionAction?.category || '';
    return cat === 'PURCHASE' || cat === 'ADD_TO_CART';
  });
  if (hasPurchase) return 'E-commerce';

  // Shopping/PMax campaigns
  const hasShoppingOrPMax = campaigns.some(r => {
    const type = r.campaign?.advertisingChannelType || '';
    return type === 'SHOPPING' || type === 'PERFORMANCE_MAX';
  });
  if (hasShoppingOrPMax) return 'E-commerce';

  // Legal signals
  if (name.includes('law') || name.includes('legal') || name.includes('attorney')) return 'Legal';

  // Real estate
  if (name.includes('real estate') || name.includes('realty') || name.includes('roofing') ||
      name.includes('contracting') || name.includes('construction')) return 'Local Services';

  // Healthcare / Spa
  if (name.includes('spa') || name.includes('skin') || name.includes('dental') ||
      name.includes('health') || name.includes('diet') || name.includes('dna')) return 'Healthcare';

  // Travel
  if (name.includes('tour') || name.includes('travel') || name.includes('station')) return 'Travel';

  // Engineering
  if (name.includes('engineering')) return 'Local Services';

  // Tree service
  if (name.includes('tree')) return 'Local Services';

  return 'General';
}

// ===== AUDIT CHECKS =====

function checkConversionTracking(data) {
  const checks = [];
  const convActions = safeArray(data.conversion_actions);
  const acctMetrics = safeArray(data.account_metrics);

  let totalConv = 0;
  acctMetrics.forEach(r => { totalConv += Number(r.metrics?.conversions || 0); });

  // G42: Conversion actions defined
  const convCount = convActions.length;
  checks.push({
    id: 'G42', name: 'Conversion actions defined', severity: 'Critical',
    result: convCount > 0 ? 'PASS' : 'FAIL',
    finding: convCount > 0
      ? `${convCount} conversion actions configured. Without conversion tracking, Google cannot optimize bids, and all campaign data becomes unreliable for decision-making.`
      : 'CRITICAL: No conversion actions defined. Google Ads cannot optimize campaigns without conversion data — every dollar spent is essentially unguided. Set up purchase, lead form, or phone call tracking immediately.'
  });

  // G43: Enhanced conversions
  const hasEnhanced = convActions.some(r => (r.conversionAction?.type || '') === 'UPLOAD_CLICKS' || (r.conversionAction?.type || '') === 'UPLOAD_CALLS');
  checks.push({
    id: 'G43', name: 'Enhanced conversions enabled', severity: 'Critical',
    result: hasEnhanced ? 'PASS' : (totalConv < 30 ? 'FAIL' : 'WARNING'),
    finding: hasEnhanced
      ? 'Enhanced conversions or offline import detected — this recovers conversion data lost due to cookie restrictions and privacy changes, improving Smart Bidding accuracy by 5-15%.'
      : `Not enabled — with only ${Math.round(totalConv)} conversions/month, every lost signal significantly degrades bid optimization. Enhanced Conversions uses hashed first-party data (email, phone) to recover 5-15% of conversions lost to cookie restrictions. Enable in Google Ads > Goals > Conversions > Settings.`
  });

  // G44: Server-side tracking
  const hasServerSide = convActions.some(r => {
    const type = r.conversionAction?.type || '';
    return type === 'UPLOAD_CLICKS' || type === 'UPLOAD_CALLS' || type === 'STORE_SALES_DIRECT_UPLOAD';
  });
  checks.push({
    id: 'G44', name: 'Server-side tracking', severity: 'High',
    result: hasServerSide ? 'PASS' : 'FAIL',
    finding: hasServerSide
      ? 'Server-side or offline conversion import active — this provides more reliable data than client-side tracking alone, as it bypasses ad blockers and browser restrictions.'
      : 'No server-side tracking detected. Browser-based tracking misses 10-25% of conversions due to ad blockers, ITP, and cookie restrictions. Implement server-side GTM or Google Ads API conversion imports to close this data gap and give Smart Bidding more accurate signals.'
  });

  // G45: Consent Mode v2
  checks.push({ id: 'G45', name: 'Consent Mode v2 (EU/EEA)', severity: 'Critical', result: 'N/A', finding: 'EU targeting unclear from available data. If targeting EU/EEA users, Consent Mode v2 is legally required since March 2024 and enables conversion modeling for consenting users.' });

  // G46: Conversion window
  const categoryMix = {};
  convActions.forEach(r => { const cat = r.conversionAction?.category || 'UNKNOWN'; categoryMix[cat] = (categoryMix[cat] || 0) + 1; });
  checks.push({
    id: 'G46', name: 'Conversion window appropriate', severity: 'Medium',
    result: convCount > 0 ? 'WARNING' : 'N/A',
    finding: convCount > 0
      ? `${Object.keys(categoryMix).length} conversion categories detected (${Object.entries(categoryMix).map(([k,v]) => `${v}x ${k}`).join(', ')}). Verify the conversion window matches your sales cycle — high-ticket items need 60-90 day windows, while impulse purchases only need 7-30 days.`
      : 'No conversions to assess window settings.'
  });

  // G47: Micro vs macro separation
  const primaryActions = convActions.filter(r => r.conversionAction?.includeInConversionsMetric === true);
  const microCategories = ['PAGE_VIEW', 'ADD_TO_CART', 'BEGIN_CHECKOUT', 'GET_DIRECTIONS', 'ENGAGEMENT', 'SUBSCRIBE_PAID', 'OTHER'];
  const microAsPrimary = primaryActions.filter(r => microCategories.includes(r.conversionAction?.category || ''));
  checks.push({
    id: 'G47', name: 'Micro vs macro separation', severity: 'High',
    result: microAsPrimary.length === 0 ? 'PASS' : (microAsPrimary.length <= 2 ? 'WARNING' : 'FAIL'),
    finding: microAsPrimary.length === 0
      ? 'Good separation — only macro conversions (purchases, leads, calls) are set as Primary. This ensures Smart Bidding optimizes for real business outcomes, not inflated micro-actions.'
      : `${microAsPrimary.length} micro/irrelevant actions set as Primary (${microAsPrimary.map(r => r.conversionAction?.name || '').join(', ').substring(0, 100)}). This inflates conversion counts and misleads Smart Bidding — it optimizes for page views or add-to-carts instead of actual revenue. Set these to Secondary and keep only Purchase/Lead/Call as Primary.`
  });

  // G48: Attribution model
  checks.push({ id: 'G48', name: 'Attribution model', severity: 'Medium', result: 'N/A', finding: 'Cannot verify attribution model via API. Google now defaults to data-driven attribution which uses machine learning to distribute credit. Verify in Settings > Conversions that data-driven is selected for primary actions.' });

  // G49: Conversion value assignment
  checks.push({
    id: 'G49', name: 'Conversion value assignment', severity: 'High',
    result: primaryActions.length > 0 ? 'WARNING' : 'N/A',
    finding: primaryActions.length > 0
      ? `${primaryActions.length} primary actions configured. Verify that dynamic values are set (not static $1 defaults). Without accurate values, Target ROAS bidding cannot work — Google needs real revenue data to optimize for profit, not just conversion count.`
      : 'No primary actions to assess.'
  });

  // G-CT1: Duplicate counting
  const actionNames = convActions.map(r => (r.conversionAction?.name || '').toLowerCase());
  const duplicatePatterns = findDuplicatePatterns(actionNames);
  checks.push({
    id: 'G-CT1', name: 'No duplicate counting', severity: 'Critical',
    result: duplicatePatterns.length === 0 ? 'PASS' : (duplicatePatterns.length <= 1 ? 'WARNING' : 'FAIL'),
    finding: duplicatePatterns.length === 0
      ? 'No obvious duplicate conversion actions. Each conversion type is tracked once, ensuring accurate reporting and Smart Bidding optimization.'
      : `Potential duplicates found: ${duplicatePatterns.join('; ')}. Duplicate tracking inflates conversion counts by 2-3x, making CPA appear artificially low and causing Smart Bidding to overbid. Remove duplicates and keep only one source per conversion type (prefer GA4 over tag-based tracking).`
  });

  // G-CT2: GA4 linked
  const hasGA4 = convActions.some(r => (r.conversionAction?.type || '') === 'GOOGLE_ANALYTICS_4' || (r.conversionAction?.name || '').toLowerCase().includes('ga4'));
  checks.push({
    id: 'G-CT2', name: 'GA4 linked and flowing', severity: 'High',
    result: hasGA4 ? 'PASS' : 'WARNING',
    finding: hasGA4
      ? 'GA4 conversion actions detected and linked. GA4 provides cross-device tracking, better attribution modeling, and audience data that improves targeting across campaigns.'
      : 'No GA4 conversion actions found. Linking GA4 to Google Ads enables cross-device conversion tracking, richer audience insights, and data-driven attribution. Go to GA4 Admin > Google Ads Links to connect.'
  });

  // G-CT3: Google Tag firing
  const activeActions = convActions.filter(r => (r.conversionAction?.status || '') === 'ENABLED');
  checks.push({
    id: 'G-CT3', name: 'Google Tag firing', severity: 'Critical',
    result: activeActions.length > 0 && totalConv > 0 ? 'PASS' : (activeActions.length > 0 ? 'WARNING' : 'FAIL'),
    finding: activeActions.length > 0 && totalConv > 0
      ? `${activeActions.length} active actions recording ${Math.round(totalConv)} conversions in 30d. Tags are firing and data is flowing.`
      : (activeActions.length > 0
        ? `${activeActions.length} active actions but only ${Math.round(totalConv)} conversions in 30d — verify tags are firing correctly using Google Tag Assistant or Chrome DevTools Network tab. Low conversion counts may indicate broken tags, incorrect triggers, or landing page issues.`
        : 'No active conversion actions. All campaign optimization is blind without conversion tracking. Check Google Tag Manager for proper tag configuration and verify the Google Ads conversion tag fires on your conversion pages.')
  });

  return { name: 'Conversion Tracking', weight: '25%', checks };
}

function findDuplicatePatterns(names) {
  const patterns = [];
  const keywords = ['purchase', 'buy', 'order', 'phone', 'call', 'lead', 'form', 'submit', 'contact'];

  for (const kw of keywords) {
    const matches = names.filter(n => n.includes(kw));
    if (matches.length > 1) {
      patterns.push(`${matches.length}x "${kw}" actions`);
    }
  }
  return patterns;
}

function checkWastedSpend(data) {
  const checks = [];
  const campaigns = safeArray(data.campaigns);
  const negLists = safeArray(data.negative_lists);
  const products = safeArray(data.shopping_performance);

  const hasActiveSearch = campaigns.some(r => (r.campaign?.advertisingChannelType || '') === 'SEARCH' && (r.campaign?.status || '') === 'ENABLED');
  const hasActiveShopping = campaigns.some(r => {
    const type = r.campaign?.advertisingChannelType || '';
    return (type === 'SHOPPING' || type === 'PERFORMANCE_MAX') && (r.campaign?.status || '') === 'ENABLED';
  });

  checks.push({
    id: 'G13', name: 'Search term audit recency', severity: 'Critical',
    result: hasActiveSearch ? 'WARNING' : (hasActiveShopping ? 'WARNING' : 'N/A'),
    finding: hasActiveSearch
      ? 'Active search campaigns detected — search terms should be reviewed weekly. Google matches queries broadly, and without regular reviews, 20-40% of spend typically goes to irrelevant searches. Check Insights > Search Terms for the last 7 days and add negatives for any non-converting, irrelevant terms.'
      : (hasActiveShopping ? 'Shopping/PMax active — search terms should be reviewed bi-weekly via Insights > Search Terms. Even Shopping campaigns can match to irrelevant product queries.' : 'No active search/shopping campaigns.')
  });

  const listCount = negLists.length;
  const totalNegKw = negLists.reduce((sum, r) => sum + (Number(r.sharedSet?.memberCount) || 0), 0);
  checks.push({
    id: 'G14', name: 'Negative keyword lists exist', severity: 'Critical',
    result: listCount >= 3 ? 'PASS' : (listCount > 0 ? 'WARNING' : 'FAIL'),
    finding: listCount > 0
      ? `${listCount} list(s) with ${totalNegKw} total keywords. ${listCount >= 3 ? 'Good coverage with themed lists.' : 'Need at least 3 themed lists (e.g., Competitors, Job Seekers, Irrelevant Services) to properly filter traffic. A well-maintained negative list typically saves 15-20% of wasted spend.'}`
      : 'CRITICAL: No negative keyword lists exist. Without negatives, campaigns match to irrelevant searches — typically wasting 20-40% of budget. Create lists immediately: (1) Competitor names, (2) "free/cheap/DIY" terms, (3) Job-related terms like "salary/hiring/career".'
  });

  checks.push({
    id: 'G15', name: 'Account-level negatives applied', severity: 'High',
    result: listCount > 0 ? 'WARNING' : 'FAIL',
    finding: listCount > 0
      ? 'Negative keyword lists exist — verify they are applied to ALL active campaigns including Shopping and PMax. Unattached lists provide zero protection. Check Tools > Shared Library > Negative Keyword Lists.'
      : 'No negative keyword lists exist to apply. Build and attach lists to all campaigns to prevent irrelevant traffic from consuming budget.'
  });

  if (products.length > 0) {
    const zeroConvProducts = products.filter(r => (Number(r.metrics?.conversions) || 0) === 0);
    const zeroConvSpend = zeroConvProducts.reduce((sum, r) => sum + microsToDollars(r.metrics?.costMicros || 0), 0);
    const totalSpend = products.reduce((sum, r) => sum + microsToDollars(r.metrics?.costMicros || 0), 0);
    const wastePct = pct(zeroConvSpend, totalSpend);
    checks.push({
      id: 'G16', name: 'Wasted spend on irrelevant terms', severity: 'Critical',
      result: wastePct < 20 ? 'PASS' : (wastePct < 40 ? 'WARNING' : 'FAIL'),
      finding: `~${wastePct}% of top product spend ($${Math.round(zeroConvSpend)}) goes to zero-conversion products. ${wastePct > 30 ? 'This is a significant budget leak — reallocate spend from zero-converting products to proven winners. Use product group subdivisions to exclude or lower bids on non-performers, and increase bids on high-ROAS products.' : 'Monitor these products weekly and pause any that remain at zero conversions after 2x the average CPA in spend.'}`
    });
  } else {
    checks.push({
      id: 'G16', name: 'Wasted spend on irrelevant terms', severity: 'Critical',
      result: hasActiveSearch ? 'WARNING' : 'N/A',
      finding: hasActiveSearch ? 'Search active — review the Search Terms report for irrelevant queries consuming budget. Sort by cost descending and look for zero-conversion terms with significant spend.' : 'No search/shopping data to assess.'
    });
  }

  checks.push({ id: 'G17', name: 'Broad match + smart bidding pairing', severity: 'Critical', result: hasActiveSearch ? 'WARNING' : 'N/A',
    finding: hasActiveSearch ? 'Verify broad match keywords are paired with Smart Bidding (tROAS or tCPA). Broad match without Smart Bidding causes uncontrolled query expansion and wasted spend. Google\'s AI needs Smart Bidding to constrain broad match effectively.' : 'No active search campaigns.' });

  checks.push({ id: 'G18', name: 'Close variant pollution', severity: 'High', result: 'N/A', finding: 'Requires search term report analysis. Close variants can cause exact/phrase match keywords to match unintended queries — review Search Terms for unexpected matches.' });

  checks.push({ id: 'G19', name: 'Search term visibility', severity: 'Medium', result: hasActiveSearch ? 'WARNING' : 'N/A',
    finding: hasActiveSearch ? 'Google only shows ~30-40% of actual search terms. Review the visible terms regularly and use scripts or third-party tools to maximize visibility into what queries are triggering your ads.' : 'No active search campaigns.' });

  checks.push({ id: 'G-WS1', name: 'Zero-conversion keywords', severity: 'High', result: hasActiveSearch ? 'WARNING' : 'N/A',
    finding: hasActiveSearch ? 'Review keywords that have spent more than 2x your target CPA without converting. These should be paused or moved to exact match with lower bids. Zero-conversion keywords are the #1 source of wasted search spend.' : 'No active search campaigns.' });

  return { name: 'Wasted Spend / Negatives', weight: '20%', checks };
}

function checkAccountStructure(data) {
  const checks = [];
  const campaigns = safeArray(data.campaigns);
  const adGroups = safeArray(data.ad_groups);
  const acctMetrics = safeArray(data.account_metrics);
  const campaignBudgets = safeArray(data.campaign_budgets);
  const geoTargeting = safeArray(data.geo_targeting);

  const enabledCampaigns = campaigns.filter(r => (r.campaign?.status || '') === 'ENABLED');
  const allCampaignNames = campaigns.map(r => r.campaign?.name || '');

  // G01: Campaign naming convention
  const prefixes = allCampaignNames.map(n => n.split(/[-_|:]/)[0].trim()).filter(Boolean);
  const uniquePrefixes = [...new Set(prefixes)];
  checks.push({
    id: 'G01', name: 'Campaign naming convention', severity: 'Medium',
    result: uniquePrefixes.length <= 3 ? 'PASS' : (uniquePrefixes.length <= 5 ? 'WARNING' : 'FAIL'),
    finding: `${uniquePrefixes.length} naming prefix(es) across ${campaigns.length} campaigns. ${uniquePrefixes.length > 3 ? 'Inconsistent naming suggests multiple managers over time. Adopt a standard like "[Type] - [Goal] - [Targeting]" (e.g., "Search - Brand - US") for easier management and reporting.' : 'Consistent naming convention in place — makes filtering, reporting, and management significantly easier.'}`
  });

  checks.push({
    id: 'G02', name: 'Ad group naming convention', severity: 'Medium',
    result: adGroups.length < 50 ? 'PASS' : 'WARNING',
    finding: `${adGroups.length} total ad groups. ${adGroups.length > 100 ? 'High ad group count increases management overhead and may indicate over-segmentation. Consolidate where possible — Google\'s AI performs better with more data per ad group.' : 'Manageable ad group count.'}`
  });

  checks.push({
    id: 'G03', name: 'Single theme ad groups', severity: 'High',
    result: adGroups.length > 0 ? 'WARNING' : 'N/A',
    finding: adGroups.length > 0 ? 'Verify each ad group contains tightly themed keywords (STAGs). Mixed themes reduce Quality Score because ad copy cannot match all keywords equally, increasing CPC by 50-400%. Each ad group should target one core intent.' : 'No ad groups to assess.'
  });

  // G04: Campaign count per objective
  const typeCount = {};
  campaigns.forEach(r => { const type = r.campaign?.advertisingChannelType || 'UNKNOWN'; typeCount[type] = (typeCount[type] || 0) + 1; });
  const totalCampaigns = campaigns.length;
  checks.push({
    id: 'G04', name: 'Campaign count per objective', severity: 'High',
    result: totalCampaigns <= 10 ? 'PASS' : (totalCampaigns <= 20 ? 'WARNING' : 'FAIL'),
    finding: `${totalCampaigns} campaigns: ${Object.entries(typeCount).map(([k, v]) => `${v} ${k}`).join(', ')}. ${totalCampaigns > 20 ? 'Excessive campaign fragmentation dilutes budget and data across too many campaigns, preventing Smart Bidding from accumulating enough conversion signals. Consolidate to 5-10 focused campaigns for better algorithmic performance.' : totalCampaigns > 10 ? 'Consider consolidating to give Smart Bidding more data per campaign.' : 'Healthy campaign count — sufficient data per campaign for optimization.'}`
  });

  // G05: Brand vs Non-Brand separation
  const hasBrand = campaigns.some(r => {
    const name = (r.campaign?.name || '').toLowerCase();
    return name.includes('brand') && !name.includes('non-brand') && !name.includes('non brand');
  });
  checks.push({
    id: 'G05', name: 'Brand vs Non-Brand separation', severity: 'Critical',
    result: hasBrand ? 'PASS' : 'FAIL',
    finding: hasBrand
      ? 'Brand campaign exists — this protects branded search terms from competitors and typically achieves 30-50x ROAS. Ensure brand terms are excluded from non-brand campaigns to prevent cannibalization.'
      : 'CRITICAL: No brand campaign exists. Competitors can bid on your brand name and steal clicks at a low cost. Brand campaigns typically have 30-50x ROAS with $0.50-$1.50 CPCs. Create a dedicated brand Search campaign immediately with exact and phrase match brand keywords.'
  });

  // G06: PMax
  const hasPMax = campaigns.some(r => (r.campaign?.advertisingChannelType || '') === 'PERFORMANCE_MAX');
  const pmaxEnabled = campaigns.some(r => (r.campaign?.advertisingChannelType || '') === 'PERFORMANCE_MAX' && (r.campaign?.status || '') === 'ENABLED');
  checks.push({
    id: 'G06', name: 'PMax present for eligible accounts', severity: 'Medium',
    result: pmaxEnabled ? 'PASS' : (hasPMax ? 'WARNING' : 'FAIL'),
    finding: pmaxEnabled
      ? 'PMax campaign active — provides cross-channel reach (Search, Display, YouTube, Gmail, Maps, Discover) with automated asset optimization. Monitor search term insights to ensure it targets relevant queries.'
      : (hasPMax ? 'PMax campaigns exist but all paused. PMax uses Google\'s full ad inventory and AI-driven optimization. If paused due to poor performance, review asset groups and audience signals before relaunching.' : 'No PMax campaigns. For e-commerce and lead gen, PMax often outperforms standard campaigns by leveraging Google\'s full inventory. Consider launching with strong asset groups and audience signals.')
  });

  // G07
  const hasActiveSearch = enabledCampaigns.some(r => (r.campaign?.advertisingChannelType || '') === 'SEARCH');
  checks.push({
    id: 'G07', name: 'Search + PMax overlap', severity: 'High',
    result: (hasActiveSearch && pmaxEnabled) ? 'WARNING' : 'N/A',
    finding: (hasActiveSearch && pmaxEnabled) ? 'Both Search and PMax active — PMax takes priority for exact match queries, which can cannibalize Search campaigns. Monitor both carefully, use brand exclusions in PMax, and compare incremental performance.' : 'No concurrent Search + PMax running.'
  });

  // G08: Budget allocation
  let totalBudget = 0;
  campaignBudgets.forEach(r => { totalBudget += microsToDollars(r.campaignBudget?.amountMicros || 0); });
  let totalSpend = 0;
  acctMetrics.forEach(r => { totalSpend += microsToDollars(r.metrics?.costMicros || 0); });
  const avgDailySpend = totalSpend / 30;
  const sis = acctMetrics[0]?.metrics?.searchImpressionShare;
  const sisValue = sis ? Math.round(Number(sis) * 100) : null;

  checks.push({
    id: 'G08', name: 'Budget allocation matches priority', severity: 'High',
    result: (enabledCampaigns.length <= 1 && sisValue && sisValue < 50) ? 'FAIL' : (enabledCampaigns.length > 0 ? 'WARNING' : 'N/A'),
    finding: `${enabledCampaigns.length} active campaign(s), $${Math.round(totalBudget)}/day budget${sisValue ? `, Search Impression Share ${sisValue}%` : ''}. ${sisValue && sisValue < 50 ? `Capturing only ${sisValue}% of available impressions means ${100-sisValue}% of potential customers never see your ads. Consider increasing budget on proven campaigns or consolidating to focus spend.` : 'Review budget allocation to ensure top-performing campaigns receive the most budget.'}`
  });

  checks.push({
    id: 'G09', name: 'Campaign daily budget vs spend', severity: 'Medium',
    result: totalBudget > 0 && avgDailySpend > 0 ? (avgDailySpend / totalBudget > 0.85 ? 'PASS' : 'WARNING') : 'N/A',
    finding: totalBudget > 0 ? `$${Math.round(totalBudget)} daily budget, ~$${avgDailySpend.toFixed(0)} actual daily spend. ${avgDailySpend / totalBudget < 0.85 ? 'Under-delivery indicates targeting is too narrow, bids too low, or Quality Score issues are limiting ad eligibility. Check keyword status, ad approval, and bid competitiveness.' : 'Budget utilization is healthy.'}` : 'No budget data available.'
  });

  checks.push({ id: 'G10', name: 'Ad schedule configured', severity: 'Low', result: 'N/A', finding: 'Ad schedule review requires campaign-level schedule data. Consider dayparting if conversion rates vary significantly by hour — analyze hourly performance in the Time report.' });

  // G11: Geo targeting
  const geoTypes = geoTargeting.map(r => r.campaign?.geoTargetTypeSetting?.positiveGeoTargetType || '');
  const hasPresenceOnly = geoTypes.some(t => t === 'PRESENCE');
  const hasPresenceOrInterest = geoTypes.some(t => t === 'PRESENCE_OR_INTEREST' || t === 'SEARCH_INTEREST');
  checks.push({
    id: 'G11', name: 'Geographic targeting accuracy', severity: 'High',
    result: hasPresenceOrInterest ? 'FAIL' : (hasPresenceOnly ? 'PASS' : 'WARNING'),
    finding: hasPresenceOrInterest
      ? 'CRITICAL: Using "Presence or Interest" geo targeting, which shows ads to people merely interested in your location — not physically there. For local businesses, this wastes 10-30% of budget on users who will never convert. Switch to "Presence: People in or regularly in your targeted locations" in campaign Settings > Locations > Location options.'
      : (hasPresenceOnly ? 'Correctly using "Presence" targeting — ads only shown to people physically in your target locations, minimizing wasted spend on out-of-area users.' : 'Geo targeting type could not be detected. Verify in campaign Settings > Locations that "Presence" is selected.')
  });

  // G12: Network settings
  const displayOn = enabledCampaigns.filter(r => (r.campaign?.advertisingChannelType || '') === 'SEARCH' && r.campaign?.networkSettings?.targetContentNetwork === true);
  checks.push({
    id: 'G12', name: 'Network settings', severity: 'High',
    result: displayOn.length > 0 ? 'FAIL' : (enabledCampaigns.length > 0 ? 'PASS' : 'N/A'),
    finding: displayOn.length > 0
      ? `${displayOn.length} Search campaign(s) have Display Network enabled. Display Network traffic from Search campaigns is typically low-quality with <0.5% CTR and poor conversion rates. Turn this off in campaign Settings > Networks — use dedicated Display campaigns if you want Display reach.`
      : 'Network settings properly configured — Search campaigns are not leaking budget to Display Network.'
  });

  return { name: 'Account Structure', weight: '15%', checks };
}

function checkKeywordsQS(data) {
  const checks = [];
  const keywords = safeArray(data.keywords);
  const campaigns = safeArray(data.campaigns);

  const hasActiveSearch = campaigns.some(r => (r.campaign?.advertisingChannelType || '') === 'SEARCH' && (r.campaign?.status || '') === 'ENABLED');

  if (!hasActiveSearch || keywords.length === 0) {
    checks.push({ id: 'G20-G25', name: 'Quality Score checks', severity: 'High', result: 'N/A',
      finding: keywords.length > 0 ? `${keywords.length} keywords exist but search campaigns are paused — Quality Score is not actively tracked. QS directly impacts CPC: a QS of 10 gets a 50% CPC discount, while QS of 1 pays 400% more. When campaigns are reactivated, monitor QS closely.` : 'No active search campaigns — Quality Score is not tracked. QS only applies to Search campaigns and measures expected CTR, ad relevance, and landing page experience.' });
    checks.push({ id: 'G-KW1', name: 'Zero-impression keywords', severity: 'Medium', result: 'N/A', finding: 'No active search campaigns to assess keyword performance.' });
    checks.push({ id: 'G-KW2', name: 'Keyword-to-ad relevance', severity: 'High', result: 'N/A', finding: 'Cannot assess without active search campaigns.' });
    return { name: 'Keywords & Quality Score', weight: '15%', checks };
  }

  const qsScores = keywords.map(r => Number(r.adGroupCriterion?.qualityInfo?.qualityScore || 0)).filter(q => q > 0);
  const avgQS = qsScores.length > 0 ? qsScores.reduce((a, b) => a + b, 0) / qsScores.length : 0;
  const lowQS = qsScores.filter(q => q < 5).length;
  const highQS = qsScores.filter(q => q >= 7).length;

  checks.push({
    id: 'G20-G25', name: 'Quality Score checks', severity: 'High',
    result: avgQS >= 7 ? 'PASS' : (avgQS >= 5 ? 'WARNING' : 'FAIL'),
    finding: qsScores.length > 0
      ? `Average QS: ${avgQS.toFixed(1)}/10 across ${qsScores.length} scored keywords (${highQS} scoring 7+, ${lowQS} below 5). ${avgQS < 5 ? 'Low QS means you pay significantly more per click — improve ad relevance by tightening keyword-to-ad alignment, improving landing page experience, and using more specific match types.' : avgQS < 7 ? 'Room for improvement — focus on keywords below 5 to reduce CPC. Each QS point improvement typically reduces CPC by 16%.' : 'Strong QS — your keywords, ads, and landing pages are well-aligned, resulting in lower CPCs and better ad positions.'}`
      : 'No Quality Score data available. QS requires sufficient impression history — new keywords need time to accumulate data.'
  });

  const matchTypes = {};
  keywords.forEach(r => { const mt = r.adGroupCriterion?.keyword?.matchType || 'UNKNOWN'; matchTypes[mt] = (matchTypes[mt] || 0) + 1; });

  checks.push({
    id: 'G-KW1', name: 'Zero-impression keywords', severity: 'Medium', result: 'WARNING',
    finding: `${keywords.length} keywords configured: ${Object.entries(matchTypes).map(([k, v]) => `${v} ${k}`).join(', ')}. Review keywords with zero impressions in the last 30 days — they may be too restrictive, have low search volume, or be outranked by other keywords in the same ad group. Pause or restructure these to reduce clutter.`
  });

  checks.push({
    id: 'G-KW2', name: 'Keyword-to-ad relevance', severity: 'High',
    result: avgQS >= 6 ? 'PASS' : 'WARNING',
    finding: avgQS > 0 ? `Average QS of ${avgQS.toFixed(1)} indicates ${avgQS >= 6 ? 'good' : 'poor'} keyword-to-ad relevance. ${avgQS < 6 ? 'Low relevance means your ads don\'t closely match user intent — restructure ad groups around single themes, include keywords in headlines, and ensure landing pages address the specific search intent.' : 'Keywords and ads are well-matched — this contributes to higher CTR, lower CPC, and better ad positions.'}` : 'Cannot assess relevance without QS data.'
  });

  return { name: 'Keywords & Quality Score', weight: '15%', checks };
}

function checkAdsAssets(data) {
  const checks = [];
  const ads = safeArray(data.ads);
  const campaigns = safeArray(data.campaigns);

  const hasActiveSearch = campaigns.some(r => (r.campaign?.advertisingChannelType || '') === 'SEARCH' && (r.campaign?.status || '') === 'ENABLED');
  const hasPMaxEnabled = campaigns.some(r => (r.campaign?.advertisingChannelType || '') === 'PERFORMANCE_MAX' && (r.campaign?.status || '') === 'ENABLED');
  const hasPMaxAny = campaigns.some(r => (r.campaign?.advertisingChannelType || '') === 'PERFORMANCE_MAX');

  // RSA checks
  const rsaAds = ads.filter(r => (r.adGroupAd?.ad?.type || '') === 'RESPONSIVE_SEARCH_AD');
  if (hasActiveSearch) {
    const rsaWithStrength = rsaAds.filter(r => { const s = r.adGroupAd?.adStrength || ''; return s === 'GOOD' || s === 'EXCELLENT'; });
    checks.push({
      id: 'G26-G30', name: 'RSA checks', severity: 'High',
      result: rsaAds.length > 0 ? (rsaWithStrength.length / rsaAds.length >= 0.5 ? 'PASS' : 'WARNING') : 'FAIL',
      finding: `${rsaAds.length} Responsive Search Ads found, ${rsaWithStrength.length} with Good/Excellent Ad Strength. ${rsaAds.length === 0 ? 'Every active ad group needs at least 1 RSA with 15 headlines and 4 descriptions. RSAs allow Google to test 32,760+ combinations to find the best-performing message for each search.' : rsaWithStrength.length / rsaAds.length < 0.5 ? 'Over half of RSAs have Poor/Average Ad Strength. Add more unique headlines (use different angles: features, benefits, urgency, social proof) and ensure each headline brings a different message. Pin sparingly — excessive pinning reduces Google\'s ability to optimize.' : 'Good Ad Strength across RSAs — Google has enough headline/description variations to optimize effectively.'}`
    });
  } else {
    checks.push({ id: 'G26-G30', name: 'RSA checks', severity: 'High', result: 'N/A', finding: 'No active Search campaigns — RSA checks not applicable. RSAs are the only accepted Search ad format since June 2022.' });
  }

  checks.push({
    id: 'G31-G34', name: 'PMax asset checks', severity: 'Critical',
    result: hasPMaxEnabled ? 'WARNING' : 'N/A',
    finding: hasPMaxEnabled
      ? 'PMax active — verify each asset group has: 20 images (various aspect ratios), 5 videos (landscape + vertical + square), 5 headlines, 5 long headlines, 5 descriptions, business name, and logo. Incomplete asset groups limit PMax\'s ability to serve across all Google surfaces and typically reduce performance by 20-40%.'
      : (hasPMaxAny ? 'PMax campaigns exist but all paused. Before relaunching, ensure asset groups are complete — PMax needs diverse, high-quality assets to perform well across Search, Display, YouTube, Gmail, Maps, and Discover.' : 'No PMax campaigns configured.')
  });

  checks.push({
    id: 'G35', name: 'Ad copy relevance to keywords', severity: 'High',
    result: hasActiveSearch && rsaAds.length > 0 ? 'WARNING' : 'N/A',
    finding: hasActiveSearch ? 'Verify ad headlines include primary keywords. Keyword insertion in headlines improves CTR by 10-15% on average because ads appear more relevant to the searcher\'s query. Use dynamic keyword insertion (DKI) or manually include top keywords in at least 3 headlines.' : 'No search ads to assess.'
  });

  const totalAds = ads.length;
  checks.push({
    id: 'G-AD1', name: 'Ad freshness', severity: 'Medium',
    result: totalAds > 3 ? 'WARNING' : 'FAIL',
    finding: totalAds > 0
      ? `${totalAds} total ads across all campaigns. Creative fatigue reduces CTR by 20-40% over time. Test new ad variations every 4-6 weeks — try different value propositions, CTAs, and emotional angles. Always keep a control ad running alongside tests.`
      : 'No ads found — campaigns cannot run without ad creative. Create Responsive Search Ads with 15 unique headlines and 4 descriptions per ad group.'
  });

  // G-AD2: CTR vs benchmark
  const acctMetrics = safeArray(data.account_metrics);
  let totalClicks = 0, totalImpressions = 0;
  acctMetrics.forEach(r => { totalClicks += Number(r.metrics?.clicks || 0); totalImpressions += Number(r.metrics?.impressions || 0); });
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  checks.push({
    id: 'G-AD2', name: 'CTR vs industry benchmark', severity: 'High',
    result: ctr > 0 ? (ctr >= 2.0 ? 'PASS' : 'WARNING') : 'N/A',
    finding: ctr > 0
      ? `Account CTR is ${ctr.toFixed(2)}%. ${ctr >= 6.0 ? 'Excellent — well above the industry average of 6.66% for Search. Strong ad relevance and targeting.' : ctr >= 2.0 ? 'Acceptable but room for improvement. The all-industry Search average is 6.66% CTR. Improve by: (1) adding more relevant headlines, (2) including keywords in ad copy, (3) using ad extensions to increase ad real estate, (4) tightening keyword targeting.' : 'Below the 2% minimum threshold. Low CTR increases CPC and reduces Quality Score. Review ad copy for relevance, check keyword match types, and ensure ads align with search intent.'}`
      : 'No impression data available to calculate CTR.'
  });

  // PMax-specific checks
  const pmaxDetails = {
    'G-PM1': { name: 'PMax audience signals', finding: hasPMaxEnabled ? 'PMax active — audience signals guide Google\'s AI but don\'t restrict targeting. Add: (1) Customer Match lists from CRM, (2) Website visitors from GA4, (3) In-market segments relevant to your business. Without signals, PMax spends heavily on broad, untargeted traffic.' : 'No active PMax.' },
    'G-PM2': { name: 'PMax Ad Strength', finding: hasPMaxEnabled ? 'Check asset group Ad Strength in the PMax campaign. Aim for "Excellent" — add diverse text, image, and video assets. Each additional unique asset gives PMax more combinations to test, improving performance across Google\'s entire ad network.' : 'No active PMax.' },
    'G-PM3': { name: 'PMax brand cannibalization', finding: hasPMaxEnabled ? 'PMax often captures branded search queries, inflating its reported ROAS while cannibalizing your brand Search campaign. Add brand terms as account-level negative keywords for PMax, and compare PMax performance with vs without brand traffic.' : 'No active PMax.' },
    'G-PM4': { name: 'PMax search themes', finding: hasPMaxEnabled ? 'Add search themes to guide PMax toward relevant queries. Without themes, PMax may target overly broad or irrelevant searches. Review Insights > Search categories to see what queries PMax is matching and add themes for your highest-value categories.' : 'No active PMax.' },
    'G-PM5': { name: 'PMax negative keywords', finding: hasPMaxEnabled ? 'Request account-level negative keywords for PMax through your Google rep or the PMax Negative Keywords feature. Without negatives, PMax can waste spend on irrelevant queries that standard Search campaigns would normally filter out.' : 'No active PMax.' }
  };
  for (const [id, detail] of Object.entries(pmaxDetails)) {
    checks.push({ id, name: detail.name, severity: 'High', result: hasPMaxEnabled ? 'WARNING' : 'N/A', finding: detail.finding });
  }

  return { name: 'Ads & Assets', weight: '15%', checks };
}

function checkSettingsTargeting(data) {
  const checks = [];
  const campaigns = safeArray(data.campaigns);
  const assets = safeArray(data.assets);
  const userLists = safeArray(data.user_lists);
  const acctMetrics = safeArray(data.account_metrics);

  const enabledCampaigns = campaigns.filter(r => (r.campaign?.status || '') === 'ENABLED');
  const biddingTypes = enabledCampaigns.map(r => r.campaign?.biddingStrategyType || '');
  const hasManualCpc = biddingTypes.some(b => b === 'MANUAL_CPC' || b === 'MANUAL_CPM');
  const hasSmartBidding = biddingTypes.some(b => ['TARGET_CPA', 'TARGET_ROAS', 'MAXIMIZE_CONVERSIONS', 'MAXIMIZE_CONVERSION_VALUE'].includes(b));

  let totalConv = 0;
  acctMetrics.forEach(r => { totalConv += Number(r.metrics?.conversions || 0); });

  checks.push({
    id: 'G36', name: 'Smart bidding strategy active', severity: 'High',
    result: hasSmartBidding ? 'PASS' : (hasManualCpc && totalConv < 15 ? 'WARNING' : 'FAIL'),
    finding: hasSmartBidding
      ? `Smart bidding active (${biddingTypes.filter(b => b && b !== 'MANUAL_CPC').join(', ')}). Google\'s AI adjusts bids in real-time based on 70+ signals including device, location, time, audience, and query intent — something impossible to replicate manually.`
      : (hasManualCpc
        ? `Using Manual CPC with ${Math.round(totalConv)} conversions/month. ${totalConv < 15 ? 'Smart Bidding needs 15+ conversions/month to optimize effectively — Manual CPC is partially justified but limits performance. Consider Maximize Clicks as a stepping stone to build conversion volume, then switch to Target ROAS or Target CPA.' : 'With ' + Math.round(totalConv) + ' conversions/month, you have enough data for Smart Bidding. Switch to Target ROAS (for revenue optimization) or Target CPA (for volume optimization). Smart Bidding typically improves ROAS by 20-30% compared to Manual CPC.'}`
        : 'No bidding strategy detected on active campaigns.')
  });

  const sis = acctMetrics[0]?.metrics?.searchImpressionShare;
  const sisValue = sis ? Math.round(Number(sis) * 100) : null;
  checks.push({
    id: 'G39', name: 'Budget constrained campaigns', severity: 'High',
    result: sisValue ? (sisValue >= 70 ? 'PASS' : (sisValue >= 40 ? 'WARNING' : 'FAIL')) : 'N/A',
    finding: sisValue
      ? `Search Impression Share is ${sisValue}%. ${sisValue < 50 ? 'You\'re only showing for ' + sisValue + '% of eligible searches — missing ' + (100-sisValue) + '% of potential customers. This is the single biggest growth opportunity: increasing budget or improving Quality Score would put your ads in front of significantly more qualified searchers.' : sisValue < 70 ? 'Moderate coverage — there\'s room to capture more impressions by increasing budget on top-performing campaigns or improving Quality Score.' : 'Strong impression share — your ads appear for most eligible searches.'}`
      : 'Search Impression Share data not available. This metric shows what percentage of eligible searches your ads appear for and is critical for understanding growth potential.'
  });

  checks.push({
    id: 'G40', name: 'Manual CPC justification', severity: 'Medium',
    result: hasManualCpc ? (totalConv < 15 ? 'WARNING' : 'FAIL') : 'PASS',
    finding: hasManualCpc
      ? `${Math.round(totalConv)} conversions/month with Manual CPC. ${totalConv < 15 ? 'Below the 15-conversion threshold for reliable Smart Bidding — focus on building conversion volume first. Use Maximize Clicks to increase traffic, improve conversion tracking accuracy, then transition to Smart Bidding once you reach 15+ conversions/month.' : 'Sufficient conversion volume for Smart Bidding. Manual CPC leaves significant optimization on the table — Google processes billions of auction signals that humans cannot replicate. Test Target ROAS or Target CPA in an experiment before committing.'}`
      : 'Using automated bidding — this leverages Google\'s real-time auction signals for optimal bid management.'
  });

  // Extension checks with enhanced findings
  const assetTypes = {};
  assets.forEach(r => { const type = r.asset?.type || ''; assetTypes[type] = (assetTypes[type] || 0) + 1; });

  const extDetails = [
    { id: 'G50', name: 'Sitelink extensions', type: 'SITELINK', severity: 'High', min: 4,
      why: 'Sitelinks increase CTR by 10-20% by providing additional links to key pages (pricing, reviews, specific products). They also increase ad real estate, pushing competitors further down the page.' },
    { id: 'G51', name: 'Callout extensions', type: 'CALLOUT', severity: 'Medium', min: 4,
      why: 'Callouts highlight key benefits (Free Shipping, 24/7 Support, Price Match) and increase CTR by 5-10%. They require no additional landing pages.' },
    { id: 'G52', name: 'Structured snippets', type: 'STRUCTURED_SNIPPET', severity: 'Medium', min: 1,
      why: 'Structured snippets showcase product categories, services, or features under standardized headers. They pre-qualify clicks by setting expectations before the user clicks.' },
    { id: 'G53', name: 'Image extensions', type: 'IMAGE', severity: 'Medium', min: 1,
      why: 'Image extensions make ads 2-3x more visually prominent on mobile, increasing CTR significantly. Critical for product-based businesses where visual appeal drives clicks.' },
    { id: 'G54', name: 'Call extensions', type: 'CALL', severity: 'Medium', min: 1,
      why: 'Call extensions add a clickable phone number to ads, essential for businesses where phone calls are a primary conversion action. Phone leads typically convert 30-50% higher than form fills.' }
  ];

  for (const ext of extDetails) {
    const count = assetTypes[ext.type] || 0;
    checks.push({
      id: ext.id, name: ext.name, severity: ext.severity,
      result: count >= ext.min ? 'PASS' : (count > 0 ? 'WARNING' : 'FAIL'),
      finding: count >= ext.min
        ? `${count} ${ext.type.toLowerCase()} asset(s) configured. ${ext.why}`
        : (count > 0 ? `Only ${count} ${ext.type.toLowerCase()} asset(s) — need at least ${ext.min}. ${ext.why}` : `No ${ext.name.toLowerCase()} configured. ${ext.why}`)
    });
  }

  // G56: Audience segments
  const remarketingLists = userLists.filter(r => ['REMARKETING', 'RULE_BASED', 'SIMILAR'].includes(r.userList?.type || ''));
  checks.push({
    id: 'G56', name: 'Audience segments applied', severity: 'High',
    result: remarketingLists.length > 0 ? 'PASS' : 'FAIL',
    finding: remarketingLists.length > 0
      ? `${remarketingLists.length} remarketing/audience list(s) configured. Remarketing audiences convert 3-5x higher than cold traffic because they\'ve already shown interest in your business. Ensure these lists are applied to campaigns as observation layers (for bid adjustments) or targeting layers (for RLSA campaigns).`
      : 'No remarketing or in-market audiences applied. You\'re missing the highest-converting audience segment — past website visitors convert 3-5x higher than new users. Create audiences in GA4 or Google Ads: (1) All visitors (last 30d), (2) Cart abandoners, (3) Past converters, (4) High-value pages visitors.'
  });

  // G57: Customer Match
  const customerMatch = userLists.filter(r => (r.userList?.type || '') === 'CRM_BASED');
  checks.push({
    id: 'G57', name: 'Customer Match lists', severity: 'High',
    result: customerMatch.length > 0 ? 'PASS' : 'FAIL',
    finding: customerMatch.length > 0
      ? `${customerMatch.length} Customer Match list(s) uploaded. These first-party data lists enable: (1) Exclusion of existing customers from acquisition campaigns, (2) Cross-sell/upsell targeting to past purchasers, (3) Similar audience expansion to find new high-value prospects.`
      : 'No Customer Match lists uploaded. Upload your CRM customer email/phone list to: (1) Exclude existing customers from acquisition campaigns (saving 10-15% of budget), (2) Create lookalike audiences for prospecting, (3) Target past buyers with cross-sell offers. Upload via Tools > Shared Library > Audience Manager.'
  });

  return { name: 'Settings & Targeting + Bidding', weight: '10%', checks };
}

// ===== SCORING =====
function scoreCategory(category) {
  const validChecks = category.checks.filter(c => c.result !== 'N/A');
  if (validChecks.length === 0) return { score: null, grade: 'N/A' };

  let earned = 0, possible = 0;
  for (const check of validChecks) {
    const sevWeight = SEVERITY[check.severity] || 1.0;
    possible += sevWeight;
    earned += (RESULT_SCORE[check.result] || 0) * sevWeight;
  }

  const score = possible > 0 ? Math.round((earned / possible) * 1000) / 10 : 0;
  return { score, grade: scoreToGrade(score) };
}

function scoreToGrade(score) {
  if (score === null) return 'N/A';
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function gradeVerdict(grade) {
  const verdicts = {
    'A': 'Well-optimized account',
    'B': 'Good with improvement opportunities',
    'C': 'Needs attention — notable issues',
    'D': 'Poor — significant problems present',
    'F': 'Urgent intervention required'
  };
  return verdicts[grade] || 'Assessment pending';
}

function calculateOverallScore(categories) {
  let totalWeight = 0, weightedScore = 0;
  for (const cat of categories) {
    if (cat.score === null) continue;
    const catWeight = CATEGORY_WEIGHTS[cat.name] || 0;
    weightedScore += cat.score * catWeight;
    totalWeight += catWeight;
  }
  if (totalWeight === 0) return { healthScore: 0, grade: 'F' };

  // Normalize to 100 if some categories are N/A
  const healthScore = Math.round(weightedScore / totalWeight);
  return { healthScore, grade: scoreToGrade(healthScore) };
}

// ===== QUICK WINS =====
function identifyQuickWins(categories) {
  const wins = [];
  for (const cat of categories) {
    for (const check of cat.checks) {
      if (check.result === 'FAIL' && (check.severity === 'Critical' || check.severity === 'High')) {
        wins.push({
          action: getQuickWinAction(check),
          impact: check.severity,
          time: getEstimatedTime(check.id),
          check: check.id
        });
      }
    }
  }
  return wins.slice(0, 7); // Top 7 quick wins
}

function getQuickWinAction(check) {
  const actions = {
    'G42': 'Set up conversion tracking immediately: Go to Goals > Conversions > New conversion action. Track purchases (e-commerce), form submissions (lead gen), and phone calls. Without this, every dollar spent is unguided.',
    'G43': 'Enable Enhanced Conversions: Go to Goals > Conversions > Settings > Enhanced conversions. This recovers 5-15% of conversions lost to cookie restrictions by using hashed first-party data (email/phone) for attribution.',
    'G44': 'Implement server-side tracking via server-side GTM or Google Ads API offline conversion import to close the 10-25% data gap caused by ad blockers and browser restrictions.',
    'G47': 'Fix conversion action priority: Go to Goals > Conversions. Set only Purchase + Phone Call as Primary (included in bidding). Set everything else (page views, add to cart, engagements) to Secondary. This prevents Smart Bidding from optimizing for micro-actions.',
    'G-CT1': 'Remove duplicate conversion actions: Go to Goals > Conversions and identify actions tracking the same event (e.g., GA4 Purchase + Shopify Purchase). Keep one source per conversion type and set duplicates to Secondary.',
    'G05': 'Create a brand Search campaign: Add exact and phrase match keywords for your brand name. Set budget to capture 95%+ impression share. Brand campaigns typically achieve 30-50x ROAS with $0.50-$1.50 CPCs.',
    'G36': 'Switch to Smart Bidding: Create a campaign experiment (Settings > Experiments) testing Target ROAS or Max Conversions against your current Manual CPC. Run for 2 weeks to compare performance before full commitment.',
    'G04': 'Consolidate fragmented campaigns to give Smart Bidding more conversion data per campaign. Merge campaigns with similar objectives and targeting into 5-10 focused campaigns.',
    'G14': 'Build 3+ themed negative keyword lists: (1) Competitor names, (2) Job/career terms, (3) "Free/DIY/cheap" terms. Apply to all campaigns via Tools > Shared Library > Negative Keyword Lists. This typically saves 15-20% of wasted spend.',
    'G11': 'Fix geo targeting: In each campaign, go to Settings > Locations > Location options. Change from "Presence or Interest" to "Presence: People in or regularly in your targeted locations." This stops ads from showing to out-of-area users.',
    'G12': 'Turn off Display Network on Search campaigns: Go to Settings > Networks and uncheck "Include Google Display Network." Search campaigns on Display get <0.5% CTR with poor conversion rates.',
    'G56': 'Add remarketing audiences: Create audiences in GA4 (all visitors 30d, cart abandoners, past purchasers) and apply to campaigns as observation layers. Remarketing audiences convert 3-5x higher than cold traffic.',
    'G57': 'Upload Customer Match list: Export customer emails/phones from your CRM and upload via Tools > Audience Manager > Customer Match. This enables lookalike targeting and existing customer exclusion.',
    'G50': 'Add 4+ sitelink extensions: Link to your top pages (pricing, reviews, categories, contact). Sitelinks increase CTR by 10-20% and push competitors down the page.',
    'G53': 'Add image extensions to make ads 2-3x more visually prominent, especially on mobile. Upload high-quality product or service images in 1:1 and 1.91:1 aspect ratios.',
    'G16': 'Pause or add negative product groups for zero-converting products with >$100 spend. Redirect that budget to proven high-ROAS products instead.',
    'G-AD1': 'Create new ad variations to combat creative fatigue. Test different value propositions, CTAs, and emotional angles. Keep a control ad running alongside each test.',
    'G06': 'Launch a PMax campaign with proper asset groups: add 20 images, 5 videos, 5 headlines, 5 descriptions, and audience signals (customer lists, website visitors, in-market segments).',
    'G08': 'Reallocate budget: Increase budget on campaigns with ROAS above target and decrease on underperformers. Focus spend where it generates the most profitable returns.'
  };
  return actions[check.id] || check.finding;
}

function getEstimatedTime(checkId) {
  const times = {
    'G42': '30 min', 'G43': '5 min', 'G44': '2 hrs', 'G47': '15 min',
    'G-CT1': '10 min', 'G05': '30 min', 'G36': '10 min', 'G04': '1 hr',
    'G14': '15 min', 'G11': '2 min', 'G12': '2 min', 'G56': '15 min',
    'G57': '10 min', 'G50': '15 min', 'G53': '10 min', 'G16': '10 min',
    'G-AD1': '30 min', 'G06': '1 hr', 'G08': '15 min'
  };
  return times[checkId] || '15 min';
}

// ===== RECOMMENDATIONS =====
function generateRecommendations(categories, industry, snapshot) {
  const failedChecks = [];
  for (const cat of categories) {
    for (const check of cat.checks) {
      if (check.result === 'FAIL' || check.result === 'WARNING') {
        failedChecks.push(check);
      }
    }
  }

  const phase1 = [];
  const phase2 = [];
  const phase3 = [];

  // Phase 1: Foundation (Critical fails)
  const criticalFails = failedChecks.filter(c => c.severity === 'Critical' && c.result === 'FAIL');
  if (criticalFails.some(c => c.id.startsWith('G4') || c.id.startsWith('G-CT'))) {
    phase1.push('Clean up conversion tracking — audit all conversion actions, set only true business outcomes (Purchase, Lead Form, Phone Call) as Primary, and set all micro-actions (page views, add-to-cart, engagements) to Secondary. This is the single most impactful change because it fixes the data that drives all optimization decisions.');
  }
  if (criticalFails.some(c => c.id === 'G43')) {
    phase1.push('Enable Enhanced Conversions for the primary conversion action. Navigate to Goals > Conversions > Settings and turn on Enhanced Conversions. This uses hashed first-party data to recover 5-15% of conversions lost to cookie restrictions — directly improving Smart Bidding accuracy.');
  }
  if (criticalFails.some(c => c.id === 'G05')) {
    phase1.push('Launch a brand Search campaign immediately to protect your branded search terms. Competitors can bid on your brand name at low cost. Create exact + phrase match keywords for your brand name, set a sufficient budget to capture 95%+ impression share. Brand campaigns typically deliver 30-50x ROAS.');
  }
  if (criticalFails.some(c => c.id === 'G14')) {
    phase1.push('Build 3+ themed negative keyword lists and apply to all campaigns: (1) Competitor brand names, (2) Job/career/hiring terms, (3) "Free/cheap/DIY" qualifiers. This typically eliminates 15-20% of wasted spend immediately.');
  }
  if (criticalFails.some(c => c.id === 'G11')) {
    phase1.push('Fix geographic targeting in all campaigns — switch from "Presence or Interest" to "Presence only" in Settings > Locations > Location options. This stops your ads from showing to users merely interested in your location but who are physically elsewhere and unlikely to convert.');
  }
  if (phase1.length === 0) phase1.push('No critical failures found — review and address remaining Warning-level items to move toward an A-grade account.');

  // Phase 2: Optimize
  const highFails = failedChecks.filter(c => c.severity === 'High');
  if (highFails.some(c => c.id === 'G36')) {
    phase2.push('Test Smart Bidding via campaign experiments: Create an experiment in Settings > Experiments, testing Target ROAS (set 20% below your current ROAS as starting target) or Maximize Conversions against Manual CPC. Run for 2-3 weeks to compare. Smart Bidding typically improves ROAS by 20-30%.');
  }
  if (highFails.some(c => c.id === 'G56' || c.id === 'G57')) {
    phase2.push('Build your audience infrastructure: (1) Create remarketing audiences in GA4 — all visitors (30d), cart abandoners, past converters, high-value page visitors. (2) Upload Customer Match lists from your CRM for lookalike expansion and existing customer exclusion. Remarketing audiences convert 3-5x higher than cold traffic.');
  }
  if (failedChecks.some(c => c.id === 'G06')) {
    phase2.push('Launch a PMax campaign with proper setup: Create asset groups by product category or service type, each with 20 images (various aspect ratios), 5 videos, 5 headlines, 5 descriptions, and audience signals (customer lists + website visitors + in-market segments). Start with a daily budget of 3x your target CPA.');
  }
  phase2.push('Refresh ad creative: Test new headline angles (features vs benefits vs urgency vs social proof), update ad descriptions with current offers, and add all available extensions (sitelinks, callouts, structured snippets, images). Creative testing every 4-6 weeks prevents fatigue-driven CTR decline.');

  // Phase 3: Scale
  if (snapshot.searchImpressionShare && snapshot.searchImpressionShare < 50) {
    phase3.push(`Increase Search Impression Share from ${snapshot.searchImpressionShare}% toward 50%+ on converting campaigns. This is done by increasing budget, improving Quality Score, and consolidating campaigns to focus spend where it performs best.`);
  } else {
    phase3.push('Increase impression share on your highest-ROAS campaigns by raising budgets incrementally (10-15% per week) and monitoring for CPA/ROAS stability.');
  }
  if (snapshot.conversions30d > 15) {
    phase3.push(`With ${Math.round(snapshot.conversions30d)} conversions/month, you have enough data to scale. Increase budget by 10-15% weekly on campaigns meeting your ROAS/CPA targets. Monitor for 1 week between each increase to ensure stability.`);
  }
  phase3.push('Test Demand Gen campaigns for upper-funnel awareness — these reach users across YouTube, Gmail, and Discover with visually engaging ads, driving new-to-brand traffic at lower CPMs than Search.');
  phase3.push('Implement server-side tracking via server-side GTM or direct API conversion imports to improve data quality by 10-25%. This ensures Smart Bidding has the most accurate conversion signals possible.');

  return [
    { phase: 'Phase 1: Fix the Foundation (Week 1)', items: phase1 },
    { phase: 'Phase 2: Optimize & Expand (Weeks 2-3)', items: phase2 },
    { phase: 'Phase 3: Scale (Month 2+)', items: phase3 }
  ];
}

// ===== PRODUCT ANALYSIS =====
function analyzeProducts(data) {
  const products = safeArray(data.shopping_performance);
  if (products.length === 0) return { topWasted: [], topPerforming: [] };

  const topWasted = products
    .filter(r => (Number(r.metrics?.conversions) || 0) === 0 && microsToDollars(r.metrics?.costMicros || r.metrics?.cost_micros) > 10)
    .sort((a, b) => microsToDollars(b.metrics?.costMicros || b.metrics?.cost_micros) - microsToDollars(a.metrics?.costMicros || a.metrics?.cost_micros))
    .slice(0, 8)
    .map(r => ({
      product: r.segments?.productTitle || r.segments?.product_title || r.segments?.productItemId || 'Unknown',
      spend: Math.round(microsToDollars(r.metrics?.costMicros || r.metrics?.cost_micros) * 100) / 100,
      conversions: 0, value: 0
    }));

  const topPerforming = products
    .filter(r => (Number(r.metrics?.conversions) || 0) > 0)
    .sort((a, b) => {
      const roasA = microsToDollars(a.metrics?.conversionsValue || a.metrics?.conversions_value) /
        Math.max(microsToDollars(a.metrics?.costMicros || a.metrics?.cost_micros), 0.01);
      const roasB = microsToDollars(b.metrics?.conversionsValue || b.metrics?.conversions_value) /
        Math.max(microsToDollars(b.metrics?.costMicros || b.metrics?.cost_micros), 0.01);
      return roasB - roasA;
    })
    .slice(0, 5)
    .map(r => {
      const spend = microsToDollars(r.metrics?.costMicros || r.metrics?.cost_micros);
      const value = microsToDollars(r.metrics?.conversionsValue || r.metrics?.conversions_value);
      return {
        product: r.segments?.productTitle || r.segments?.product_title || 'Unknown',
        spend: Math.round(spend * 100) / 100,
        conversions: Number(r.metrics?.conversions || 0),
        value: Math.round(value),
        roas: spend > 0 ? Math.round((value / spend) * 10) / 10 : 0
      };
    });

  return { topWasted, topPerforming };
}

// ===== BUILD SNAPSHOT =====
function buildSnapshot(data) {
  const campaigns = safeArray(data.campaigns);
  const campaignMetrics = safeArray(data.campaign_metrics);
  const campaignBudgets = safeArray(data.campaign_budgets);
  const acctMetrics = safeArray(data.account_metrics);
  const adGroups = safeArray(data.ad_groups);
  const keywords = safeArray(data.keywords);

  const enabledCampaigns = campaigns.filter(r => (r.campaign?.status || '') === 'ENABLED');

  // Campaign metrics with spend
  const activeCampaignsWithSpend = campaignMetrics.filter(r =>
    microsToDollars(r.metrics?.costMicros || r.metrics?.cost_micros) > 0).length;

  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConv = 0, totalConvValue = 0;
  acctMetrics.forEach(r => {
    totalSpend += microsToDollars(r.metrics?.costMicros || r.metrics?.cost_micros || 0);
    totalImpressions += Number(r.metrics?.impressions || 0);
    totalClicks += Number(r.metrics?.clicks || 0);
    totalConv += Number(r.metrics?.conversions || 0);
    totalConvValue += Number(r.metrics?.conversionsValue || r.metrics?.conversions_value || 0);
  });

  const ctr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0;
  const avgCpc = totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0;
  const roas = totalSpend > 0 ? Math.round((totalConvValue / totalSpend) * 100) / 100 : 0;
  const cpa = totalConv > 0 ? Math.round((totalSpend / totalConv) * 100) / 100 : 0;

  const sis = acctMetrics[0]?.metrics?.searchImpressionShare || acctMetrics[0]?.metrics?.search_impression_share;
  const sisValue = sis ? Math.round(Number(sis) * 10000) / 100 : null;

  let totalBudget = 0;
  campaignBudgets.forEach(r => {
    totalBudget += microsToDollars(r.campaignBudget?.amountMicros || r.campaign_budget?.amount_micros || 0);
  });

  return {
    totalCampaigns: campaigns.length,
    enabledCampaigns: enabledCampaigns.length,
    activeCampaignsWithSpend,
    totalAdGroups: adGroups.length,
    totalKeywords: keywords.length,
    spend30d: Math.round(totalSpend * 100) / 100,
    impressions30d: totalImpressions,
    clicks30d: totalClicks,
    ctr,
    avgCpc,
    conversions30d: Math.round(totalConv * 10) / 10,
    conversionValue30d: Math.round(totalConvValue),
    roas,
    cpa,
    searchImpressionShare: sisValue,
    dailyBudget: Math.round(totalBudget),
    avgDailySpend: Math.round((totalSpend / 30) * 100) / 100
  };
}

// ===== RUN AUDIT =====
function runAudit(account, rawData, date) {
  const industry = detectIndustry(account.name, rawData);
  const snapshot = buildSnapshot(rawData);

  // Run all check categories
  const catResults = [
    checkConversionTracking(rawData),
    checkWastedSpend(rawData),
    checkAccountStructure(rawData),
    checkKeywordsQS(rawData),
    checkAdsAssets(rawData),
    checkSettingsTargeting(rawData)
  ];

  // Score each category
  const categories = catResults.map(cat => {
    const { score, grade } = scoreCategory(cat);
    return { ...cat, score, grade };
  });

  // Overall score
  const { healthScore, grade } = calculateOverallScore(categories);

  // Quick wins and recommendations
  const quickWins = identifyQuickWins(categories);
  const recommendations = generateRecommendations(categories, industry, snapshot);

  // Product analysis
  const { topWasted, topPerforming } = analyzeProducts(rawData);

  return {
    account: account.name,
    customerId: account.customerId,
    date,
    industry,
    healthScore,
    grade,
    verdict: gradeVerdict(grade),
    snapshot,
    categories,
    ...(topWasted.length > 0 ? { topWastedProducts: topWasted } : {}),
    ...(topPerforming.length > 0 ? { topPerformingProducts: topPerforming } : {}),
    quickWins,
    recommendations
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

// ===== GIT PUSH =====
function gitPush(date) {
  try {
    execSync('git add data/', { cwd: PROJECT_DIR });
    execSync(`git commit -m "Daily audit ${date}"`, { cwd: PROJECT_DIR });
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
  log(`Starting daily audit for ${today}`);
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

  // Get all accounts
  let allAccounts;
  try {
    allAccounts = await getActiveAccounts(mcpClient);
  } catch (err) {
    log(`FATAL: Cannot fetch accounts: ${err.message}`);
    process.exit(1);
  }

  // Filter to accounts with spend in last 30 days
  const activeAccounts = [];
  for (const acct of allAccounts) {
    const customerId = String(acct.customerId || '').replace(/-/g, '');
    const loginId = acct.loginCustomerId;
    if (!customerId) continue;

    log(`Checking activity for: ${acct.name} (${customerId}, login: ${loginId})`);
    try {
      const rows = await executeQuery(mcpClient, customerId,
        'SELECT metrics.cost_micros FROM customer WHERE segments.date DURING LAST_30_DAYS', loginId);
      const spend = rows.reduce((sum, r) => sum + microsToDollars(r.metrics?.costMicros || 0), 0);
      if (spend > 0) {
        log(`  Active: $${spend.toFixed(2)} spend`);
        activeAccounts.push(acct);
      } else {
        log(`  Inactive: $0 spend — skipping`);
      }
    } catch {
      log(`  Error checking activity — skipping`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  log(`\n${activeAccounts.length} active accounts to audit\n`);

  // Audit each active account
  const auditedAccounts = [];
  for (const acct of activeAccounts) {
    const customerId = String(acct.customerId || '').replace(/-/g, '');
    const loginId = acct.loginCustomerId;
    const name = acct.name;
    log(`\n--- Auditing: ${name} (${customerId}) ---`);

    try {
      const rawData = await collectAccountData(mcpClient, customerId, loginId);
      const audit = runAudit(acct, rawData, today);
      writeAuditFile(acct, today, audit);
      auditedAccounts.push(acct);
      log(`  Score: ${audit.healthScore}/100 (${audit.grade}) — ${audit.verdict}`);
    } catch (err) {
      log(`  ERROR: ${err.message}`);
    }

    // Delay between accounts
    await new Promise(r => setTimeout(r, 1000));
  }

  // Update manifest and push
  if (auditedAccounts.length > 0) {
    updateManifest(auditedAccounts, today);
    gitPush(today);
  } else {
    log('No accounts audited — nothing to push');
  }

  // Close MCP connection
  try {
    await mcpClient.close();
  } catch { /* ignore */ }

  log(`\nDaily audit complete. ${auditedAccounts.length} accounts processed.`);
  log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
