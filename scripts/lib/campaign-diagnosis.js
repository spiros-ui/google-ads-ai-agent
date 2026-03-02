/**
 * Campaign Diagnosis Engine
 * Analyzes raw GAQL data per campaign through the conversion funnel:
 * Budget -> Impressions -> Clicks -> Conversions
 * Produces structured JSON with issues, strengths, and action items.
 */

// ===== HELPERS =====
function microsToDollars(micros) { return (Number(micros) || 0) / 1_000_000; }
function pct(n, d) { return d ? Math.round((n / d) * 10000) / 100 : 0; }
function round2(n) { return Math.round((n || 0) * 100) / 100; }
function slugify(name) {
  return name.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const BIDDING_MAP = {
  TARGET_SPEND: 'Maximize Clicks', MAXIMIZE_CONVERSIONS: 'Maximize Conversions',
  TARGET_CPA: 'Target CPA', MAXIMIZE_CONVERSION_VALUE: 'Maximize Conversion Value',
  TARGET_ROAS: 'Target ROAS', MANUAL_CPC: 'Manual CPC', MANUAL_CPM: 'Manual CPM',
};
function humanBidding(type) { return BIDDING_MAP[type] || type || 'Unknown'; }
function inferObjective(bidding, channelType) {
  if (['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(bidding)) return 'Leads';
  if (['TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE'].includes(bidding)) return 'Sales';
  if (bidding === 'TARGET_SPEND') return 'Traffic';
  if (bidding === 'MANUAL_CPM') return 'Awareness';
  if (channelType === 'PERFORMANCE_MAX') return 'Leads';
  if (bidding === 'MANUAL_CPC') return 'Manual Bidding';
  return 'General';
}

/** Detect negative-vs-positive keyword conflicts by match type semantics. */
function checkNegativeConflicts(positives, negatives) {
  const conflicts = [];
  for (const pos of positives) {
    const pt = (pos.keyword || '').toLowerCase().trim(); if (!pt) continue;
    const pw = new Set(pt.split(/\s+/));
    for (const neg of negatives) {
      const nt = (neg.text || '').toLowerCase().trim(); if (!nt) continue;
      const nm = (neg.matchType || '').toUpperCase();
      const blocked = nm === 'EXACT' ? pt === nt
        : nm === 'PHRASE' ? pt.includes(nt)
        : nt.split(/\s+/).every(w => pw.has(w)); // BROAD
      if (blocked) conflicts.push({ positive: pt, negative: nt, negativeMatchType: nm || 'BROAD' });
    }
  }
  return conflicts;
}

// ===== INDEX BUILDERS =====
function buildIndex(rows, keyFn, valueFn, filterFn) {
  const map = {};
  for (const r of rows || []) {
    const name = r.campaign?.name; if (!name) continue;
    if (filterFn && !filterFn(r)) continue;
    (map[name] ||= []).push(valueFn(r));
  }
  return map;
}
function buildCampaignKeywords(rows) {
  return buildIndex(rows, null, r => ({
    text: r.adGroupCriterion?.keyword?.text || '', matchType: r.adGroupCriterion?.keyword?.matchType || '',
    qualityScore: Number(r.adGroupCriterion?.qualityInfo?.qualityScore) || null,
    impressions: Number(r.metrics?.impressions || 0), clicks: Number(r.metrics?.clicks || 0),
    conversions: Number(r.metrics?.conversions || 0), spend: microsToDollars(r.metrics?.costMicros),
    adGroup: r.adGroup?.name || '',
  }));
}
function buildCampaignSearchTerms(rows) {
  return buildIndex(rows, null, r => ({
    term: r.searchTermView?.searchTerm || '', impressions: Number(r.metrics?.impressions || 0),
    clicks: Number(r.metrics?.clicks || 0), conversions: Number(r.metrics?.conversions || 0),
    conversionValue: Number(r.metrics?.conversionsValue || 0), spend: microsToDollars(r.metrics?.costMicros),
  }));
}
function buildCampaignNegatives(rows) {
  return buildIndex(rows, null, r => ({
    text: r.campaignCriterion?.keyword?.text || '', matchType: r.campaignCriterion?.keyword?.matchType || '',
  }), r => r.campaignCriterion?.negative);
}
function buildCampaignAds(rows) {
  return buildIndex(rows, null, r => ({
    approvalStatus: r.adGroupAd?.policySummary?.approvalStatus || '',
    adStrength: r.adGroupAd?.adStrength || '', adGroup: r.adGroup?.name || '',
  }));
}

// ===== DIAGNOSIS STAGES =====
function diagnoseSpend(c, keywords, negatives, ads) {
  const issues = [];
  const expected = c.budget * 30;
  if (expected <= 0 || c.metrics.spend / expected >= 0.2) return issues;

  if (keywords.length > 0 && keywords.every(k => k.impressions === 0)) {
    issues.push({ severity: 'Critical', type: 'fix_targeting', title: 'All keywords have zero impressions',
      reasoning: `All ${keywords.length} keywords have 0 impressions over 30 days despite a $${round2(c.budget)}/day budget. Keywords are either not eligible, have near-zero search volume, or are blocked by policy.`,
      action: 'Review keyword eligibility. Replace low-volume keywords with broader alternatives. Check geo-targeting.',
      estimatedImpact: `Could unlock up to $${Math.round(expected)}/month in delivery` });
  }
  if (keywords.length > 0 && negatives.length > 0) {
    const conflicts = checkNegativeConflicts(keywords.map(k => ({ keyword: k.text })), negatives);
    for (const cf of conflicts.slice(0, 3)) {
      issues.push({ severity: 'Critical', type: 'fix_negatives',
        title: 'Negative keyword blocking positive keyword',
        reasoning: `Negative '${cf.negative}' (${cf.negativeMatchType.toLowerCase()} match) blocks positive '${cf.positive}', preventing ads from showing for a keyword you want to target.`,
        action: `Remove or narrow '${cf.negative}', or change to exact match to stop blocking '${cf.positive}'.`,
        estimatedImpact: 'Restoring delivery for blocked keywords' });
    }
  }
  const disapproved = ads.filter(a => a.approvalStatus === 'DISAPPROVED');
  if (disapproved.length > 0 && disapproved.length === ads.length) {
    issues.push({ severity: 'Critical', type: 'fix_ads', title: 'All ads are disapproved',
      reasoning: `All ${disapproved.length} ads are disapproved. The campaign cannot serve until at least one is approved.`,
      action: 'Review disapproval reasons in Google Ads, fix policy violations, resubmit.',
      estimatedImpact: `Re-enable $${round2(c.budget)}/day in potential spend` });
  }
  if (c.metrics.spend === 0) {
    issues.push({ severity: 'Critical', type: 'fix_delivery', title: 'Campaign has zero spend',
      reasoning: `Campaign has $${round2(c.budget)}/day budget but $0 spend in 30 days — something is fundamentally blocking delivery.`,
      action: 'Check serving status, ad approval, billing, and targeting settings.',
      estimatedImpact: `Unlock up to $${Math.round(expected)}/month in potential delivery` });
  }
  return issues;
}

function diagnoseImpressionShare(c, keywords) {
  const issues = [], { metrics } = c;
  if (metrics.searchIS === null || metrics.searchIS >= 50) return issues;
  const bLost = metrics.budgetLostIS || 0, rLost = metrics.rankLostIS || 0;
  if (bLost > rLost && bLost > 10) {
    issues.push({ severity: bLost > 40 ? 'High' : 'Medium', type: 'adjust_budget',
      title: `Losing ${round2(bLost)}% impression share to budget`,
      reasoning: `You're losing ${round2(bLost)}% of impressions due to budget. $${round2(c.budget)}/day isn't enough — ads stop showing partway through the day.`,
      action: bLost > 40 ? `Increase budget from $${round2(c.budget)} to $${round2(c.budget * 1.5)}, or narrow keywords.`
        : 'Consider a modest budget increase or pause underperforming keywords.',
      estimatedImpact: `Recovering ${round2(bLost)}% lost impressions could proportionally increase conversions` });
  }
  if (rLost > bLost && rLost > 10) {
    const qsArr = keywords.filter(k => k.qualityScore).map(k => k.qualityScore);
    const avgQS = qsArr.length ? round2(qsArr.reduce((a, b) => a + b, 0) / qsArr.length) : null;
    const qsNote = avgQS && avgQS < 5 ? ` Average Quality Score is ${avgQS}/10, dragging down rank.` : '';
    issues.push({ severity: rLost > 40 ? 'High' : 'Medium', type: 'improve_rank',
      title: `Losing ${round2(rLost)}% impression share to ad rank`,
      reasoning: `Losing ${round2(rLost)}% of impressions to ad rank — bids too low or Quality Score needs work.${qsNote}`,
      action: 'Improve ad relevance and landing page experience. Consider increasing bids on top keywords.',
      estimatedImpact: `Recovering ${round2(rLost)}% lost impressions from rank improvements` });
  }
  return issues;
}

function diagnoseCTR(c, ads) {
  const issues = [], { metrics, type } = c;
  if (type !== 'SEARCH' || metrics.impressions < 100 || metrics.ctr >= 3) return issues;
  const strengths = ads.map(a => a.adStrength).filter(Boolean);
  const poorAds = strengths.filter(s => s === 'POOR' || s === 'AVERAGE');
  const adGroups = new Set(ads.map(a => a.adGroup));
  const singleAg = [...adGroups].filter(ag => ads.filter(a => a.adGroup === ag).length < 2);
  let detail = `CTR is ${round2(metrics.ctr)}%, below 3% benchmark (${metrics.clicks} clicks / ${metrics.impressions.toLocaleString()} impressions).`;
  if (poorAds.length) detail += ` ${poorAds.length}/${strengths.length} ads have Poor/Average strength.`;
  if (singleAg.length) detail += ` ${singleAg.length} ad group(s) have only 1 ad — no A/B testing.`;
  issues.push({ severity: metrics.ctr < 1.5 ? 'High' : 'Medium', type: 'improve_ads',
    title: `Low CTR: ${round2(metrics.ctr)}%`, reasoning: detail,
    action: 'Add responsive search ad variations, improve headlines, ensure 2+ ads per ad group.',
    estimatedImpact: `Raising CTR to 3% could increase clicks by ${Math.round(((3 / metrics.ctr) - 1) * 100)}%` });
  return issues;
}

function diagnoseConversions(c, keywords, searchTerms, convActions) {
  const issues = [], { metrics } = c;
  if (metrics.conversions === 0 && metrics.clicks > 20) {
    const hasTracking = convActions.some(a => a.conversionAction?.status === 'ENABLED' && a.conversionAction?.includeInConversionsMetric !== false);
    if (!hasTracking) {
      issues.push({ severity: 'Critical', type: 'fix_tracking', title: 'No conversion tracking set up',
        reasoning: `${metrics.clicks} clicks ($${round2(metrics.spend)}) with 0 conversions and no active conversion actions. You're flying blind.`,
        action: 'Set up conversion tracking. Add a Google Tag for purchases, forms, or calls.',
        estimatedImpact: 'Enables Smart Bidding optimization and ROI measurement' });
    }
    const wasteTerms = searchTerms.filter(t => t.conversions === 0 && t.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 5);
    if (wasteTerms.length) {
      const total = round2(wasteTerms.reduce((s, t) => s + t.spend, 0));
      issues.push({ severity: 'High', type: 'add_negative',
        title: `$${total} wasted on non-converting search terms`,
        reasoning: `Top wasters: ${wasteTerms.map(t => `'${t.term}' ($${round2(t.spend)}, ${t.clicks} clicks)`).join(', ')}.`,
        action: `Add as negatives: ${wasteTerms.map(t => `'${t.term}'`).join(', ')}.`,
        estimatedImpact: `Save ~$${total}/month` });
    }
    const wasteKws = keywords.filter(k => k.conversions === 0 && k.spend > 5).sort((a, b) => b.spend - a.spend).slice(0, 5);
    if (wasteKws.length) {
      const total = round2(wasteKws.reduce((s, k) => s + k.spend, 0));
      issues.push({ severity: 'High', type: 'pause_keyword',
        title: `$${total} spent on zero-conversion keywords`,
        reasoning: `Keywords with spend but 0 conversions: ${wasteKws.map(k => `'${k.text}' ($${round2(k.spend)}, ${k.clicks} clicks)`).join(', ')}.`,
        action: `Pause: ${wasteKws.map(k => `'${k.text}'`).join(', ')}.`,
        estimatedImpact: `Save ~$${total}/month` });
    }
  }
  if (metrics.conversions > 0 && metrics.cpa !== null) {
    const wasteKws = keywords.filter(k => k.conversions === 0 && k.spend > metrics.cpa * 1.5).sort((a, b) => b.spend - a.spend).slice(0, 5);
    if (wasteKws.length) {
      const total = round2(wasteKws.reduce((s, k) => s + k.spend, 0));
      issues.push({ severity: 'High', type: 'pause_keyword',
        title: `$${total} on keywords exceeding CPA threshold`,
        reasoning: `${wasteKws.length} keywords spent >1.5x CPA ($${round2(metrics.cpa)}) with 0 conversions: ${wasteKws.map(k => `'${k.text}' — $${round2(k.spend)}`).join('; ')}.`,
        action: `Pause: ${wasteKws.map(k => `'${k.text}'`).join(', ')}.`,
        estimatedImpact: `Save ~$${total}/month and reduce CPA` });
    }
  }
  return issues;
}

function diagnoseEfficiency(c) {
  const issues = [], { metrics, objective, bidding } = c;
  if (metrics.conversions === 0 && metrics.clicks < 20) return issues;
  if ((objective === 'Leads' || bidding.includes('CPA')) && metrics.cpa > 200) {
    issues.push({ severity: 'High', type: 'fix_bidding', title: `Very high CPA: $${round2(metrics.cpa)}`,
      reasoning: `$${round2(metrics.cpa)} CPA from ${metrics.conversions} conversions / $${round2(metrics.spend)} spend.`,
      action: 'Add negatives for non-converting terms, lower bids, tighten audience targeting.',
      estimatedImpact: 'Reducing CPA frees budget for more conversions' });
  }
  if ((objective === 'Sales' || bidding.includes('ROAS')) && metrics.roas !== null && metrics.roas < 1) {
    issues.push({ severity: 'Critical', type: 'fix_bidding', title: `ROAS below breakeven: ${round2(metrics.roas)}x`,
      reasoning: `${round2(metrics.roas)}x ROAS — $${round2(metrics.spend)} spend generated only $${round2(metrics.conversionValue)} value.`,
      action: 'Pause unprofitable keywords/products, tighten targeting, reduce bids.',
      estimatedImpact: 'Stop losing money on unprofitable traffic' });
  }
  return issues;
}

function detectStrengths(c, keywords, searchTerms) {
  const s = [], { metrics } = c;
  if (metrics.ctr >= 5) s.push({ title: 'Strong CTR', detail: `${round2(metrics.ctr)}% — well above 3% benchmark` });
  if (metrics.searchIS !== null && metrics.searchIS >= 70) s.push({ title: 'Good impression share', detail: `${round2(metrics.searchIS)}% search IS` });
  if (metrics.roas !== null && metrics.roas >= 3) s.push({ title: 'Strong ROAS', detail: `${round2(metrics.roas)}x return` });
  if (metrics.conversions > 0 && metrics.cpa !== null && metrics.cpa < 50) s.push({ title: 'Efficient CPA', detail: `$${round2(metrics.cpa)}/conversion` });
  const goodKws = keywords.filter(k => k.conversions > 0).sort((a, b) => (b.conversions / b.spend) - (a.conversions / a.spend)).slice(0, 3);
  if (goodKws.length) s.push({ title: 'Top converting keywords', detail: goodKws.map(k => `'${k.text}' (${k.conversions} conv, $${round2(k.spend)})`).join(', ') });
  const goodTerms = searchTerms.filter(t => t.conversions > 0).sort((a, b) => (a.spend / a.conversions) - (b.spend / b.conversions)).slice(0, 3);
  if (goodTerms.length) s.push({ title: 'Top search terms', detail: goodTerms.map(t => `'${t.term}' (${t.conversions} conv, CPA $${round2(t.spend / t.conversions)})`).join(', ') });
  return s;
}

// ===== SUMMARY BUILDERS =====
function buildKeywordSummary(kws) {
  const qsArr = kws.filter(k => k.qualityScore).map(k => k.qualityScore);
  const wasters = kws.filter(k => k.conversions === 0 && k.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 5);
  return {
    total: kws.length, withImpressions: kws.filter(k => k.impressions > 0).length,
    zeroImpressions: kws.filter(k => k.impressions === 0).length,
    avgQualityScore: qsArr.length ? round2(qsArr.reduce((a, b) => a + b, 0) / qsArr.length) : null,
    topWasters: wasters.map(k => ({ keyword: k.text, matchType: k.matchType, spend: round2(k.spend), conversions: 0 })),
  };
}
function buildSearchTermSummary(sts) {
  return {
    topWaste: sts.filter(t => t.conversions === 0 && t.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 5)
      .map(t => ({ term: t.term, spend: round2(t.spend), clicks: t.clicks, conversions: 0 })),
    topPerformers: sts.filter(t => t.conversions > 0).sort((a, b) => (a.spend / a.conversions) - (b.spend / b.conversions)).slice(0, 5)
      .map(t => ({ term: t.term, spend: round2(t.spend), conversions: t.conversions, cpa: round2(t.spend / t.conversions) })),
  };
}

// ===== MAIN EXPORT =====
export function diagnoseCampaigns(data) {
  const { campaign_diagnosis = [], campaign_keywords = [], campaign_search_terms = [],
    campaign_negatives = [], campaign_ads = [], conversion_actions = [] } = data;
  const kwIdx = buildCampaignKeywords(campaign_keywords);
  const stIdx = buildCampaignSearchTerms(campaign_search_terms);
  const negIdx = buildCampaignNegatives(campaign_negatives);
  const adIdx = buildCampaignAds(campaign_ads);
  const dateSlug = new Date().toISOString().slice(0, 10);
  let actionCounter = 0, totalSpend = 0, totalConversions = 0, criticalCount = 0;
  const allActions = [], results = [];
  const enabled = campaign_diagnosis.filter(r => (r.campaign?.status || '').toUpperCase() === 'ENABLED');

  for (const row of enabled) {
    const name = row.campaign?.name || 'Unknown';
    const channelType = row.campaign?.advertisingChannelType || 'UNKNOWN';
    const biddingType = row.campaign?.biddingStrategyType || '';
    const budget = microsToDollars(row.campaignBudget?.amountMicros);
    const impressions = Number(row.metrics?.impressions || 0);
    const clicks = Number(row.metrics?.clicks || 0);
    const conversions = Number(row.metrics?.conversions || 0);
    const convValue = Number(row.metrics?.conversionsValue || 0);
    const spend = microsToDollars(row.metrics?.costMicros);
    const avgCpc = microsToDollars(row.metrics?.averageCpc);
    const toIS = v => v != null ? round2(Number(v) * 100) : null;
    const searchIS = toIS(row.metrics?.searchImpressionShare);
    const budgetLostIS = toIS(row.metrics?.searchBudgetLostImpressionShare);
    const rankLostIS = toIS(row.metrics?.searchRankLostImpressionShare);
    const cpa = conversions > 0 ? round2(spend / conversions) : null;
    const roas = spend > 0 ? round2(convValue / spend) : null;
    const ctr = pct(clicks, impressions);
    totalSpend += spend; totalConversions += conversions;

    const camp = {
      name, type: channelType, budget, objective: inferObjective(biddingType, channelType),
      bidding: humanBidding(biddingType),
      metrics: { spend: round2(spend), impressions, clicks, conversions: round2(conversions),
        conversionValue: round2(convValue), cpa, roas, ctr: round2(ctr), avgCpc: round2(avgCpc),
        searchIS, budgetLostIS, rankLostIS },
    };
    const kws = kwIdx[name] || [], sts = stIdx[name] || [];
    const negs = negIdx[name] || [], ads = adIdx[name] || [];
    const issues = [
      ...diagnoseSpend(camp, kws, negs, ads), ...diagnoseImpressionShare(camp, kws),
      ...diagnoseCTR(camp, ads), ...diagnoseConversions(camp, kws, sts, conversion_actions),
      ...diagnoseEfficiency(camp),
    ];
    const strengths = detectStrengths(camp, kws, sts);
    const hasCritical = issues.some(i => i.severity === 'Critical');
    const hasHigh = issues.some(i => i.severity === 'High');
    const status = spend === 0 && budget > 0 ? 'not_spending' : hasCritical ? 'critical' : hasHigh ? 'warning' : 'healthy';
    if (hasCritical) criticalCount++;
    let meetingObjective = status === 'healthy' && issues.length === 0;
    if (camp.objective === 'Leads' && conversions > 0 && (cpa === null || cpa < 150)) meetingObjective = true;
    if (camp.objective === 'Sales' && roas !== null && roas >= 2) meetingObjective = true;
    if (camp.objective === 'Traffic' && clicks > 0 && ctr > 2) meetingObjective = true;

    const campSlug = slugify(name);
    for (const issue of issues) {
      actionCounter++;
      allActions.push({
        id: `${campSlug}-${dateSlug}-${actionCounter}`, account: name, date: dateSlug,
        type: issue.type, severity: issue.severity, title: issue.title,
        description: issue.reasoning,
        estimatedSaving: parseFloat((issue.estimatedImpact.match(/\$([0-9,.]+)/) || [])[1]?.replace(/,/g, '') || '0'),
        campaign: name, status: 'pending',
      });
    }
    results.push({
      name, type: channelType, objective: camp.objective, bidding: camp.bidding, budget: round2(budget),
      metrics: camp.metrics, meetingObjective, status, issues, strengths,
      keywordSummary: buildKeywordSummary(kws), searchTermSummary: buildSearchTermSummary(sts),
    });
  }

  let overallVerdict = 'Healthy';
  if (totalSpend === 0) overallVerdict = 'Not Spending';
  else if (criticalCount > 0) overallVerdict = 'Critical Issues';
  else if (results.some(c => c.status === 'warning')) overallVerdict = 'Needs Attention';

  return {
    accountSummary: { totalSpend: round2(totalSpend), totalConversions: round2(totalConversions),
      totalCampaigns: enabled.length, criticalIssues: criticalCount, overallVerdict },
    campaigns: results, actionItems: allActions,
  };
}
