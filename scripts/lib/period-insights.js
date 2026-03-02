/**
 * Period Insights Generator — "Google Ads Doctor"
 * For each campaign in each period, produces a structured health diagnosis:
 *   - Health status (healthy / warning / critical / not_spending)
 *   - Goal assessment: is the campaign meeting its conversion objective?
 *   - Specific fix recommendations
 *   - Trend comparisons against 30d baseline
 *
 * Also produces account-level insights comparing period to 30d.
 */

function round2(n) { return Math.round((n || 0) * 100) / 100; }

const BIDDING_MAP = {
  TARGET_SPEND: 'Maximize Clicks', MAXIMIZE_CONVERSIONS: 'Maximize Conversions',
  TARGET_CPA: 'Target CPA', MAXIMIZE_CONVERSION_VALUE: 'Maximize Conversion Value',
  TARGET_ROAS: 'Target ROAS', MANUAL_CPC: 'Manual CPC', MANUAL_CPM: 'Manual CPM',
};

function humanBidding(type) { return BIDDING_MAP[type] || type || 'Unknown'; }

function inferObjective(bidding) {
  if (['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(bidding)) return 'Conversions';
  if (['TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE'].includes(bidding)) return 'Revenue';
  if (bidding === 'TARGET_SPEND') return 'Traffic';
  if (bidding === 'MANUAL_CPM') return 'Awareness';
  if (bidding === 'MANUAL_CPC') return 'Clicks';
  return 'General';
}

const PERIOD_DAYS = { yesterday: 1, last3d: 3, last7d: 7, last14d: 14, last30d: 30 };

/**
 * Diagnose a single campaign for a period.
 * Returns a structured health object.
 */
function diagnoseCampaignPeriod(camp, periodKey, baselineCamp, acctMetrics, baseAcct) {
  const days = PERIOD_DAYS[periodKey] || 1;
  const objective = inferObjective(camp.bidding);
  const bidLabel = humanBidding(camp.bidding);
  const dailySpend = camp.spend / days;
  const expectedDailySpend = camp.budget || 0;

  const diagnosis = {
    name: camp.name,
    type: camp.type,
    objective,
    bidding: bidLabel,
    budget: camp.budget,
    metrics: {
      spend: camp.spend, impressions: camp.impressions, clicks: camp.clicks,
      conversions: camp.conversions, convValue: camp.convValue,
      cpa: camp.cpa, roas: camp.roas, ctr: camp.ctr,
      avgCpc: camp.avgCpc, searchIS: camp.searchIS
    },
    health: 'healthy',       // healthy | warning | critical | not_spending
    meetingGoal: null,        // true | false | null (can't determine)
    goalAssessment: '',       // human-readable goal verdict
    issues: [],               // { severity, title, action }
    positives: [],            // { title, detail }
    trends: []                // { direction: 'up'|'down'|'flat', metric, message }
  };

  // --- Not spending ---
  if (camp.spend === 0 && expectedDailySpend > 0) {
    diagnosis.health = 'not_spending';
    diagnosis.meetingGoal = false;
    diagnosis.goalAssessment = 'Campaign is not spending despite having a budget.';
    diagnosis.issues.push({
      severity: 'Critical',
      title: 'Zero spend',
      action: 'Check campaign serving status, ad approval, billing, and targeting settings. Ads may be disapproved or keywords may have zero search volume.'
    });
    return diagnosis;
  }

  if (camp.spend === 0) {
    diagnosis.health = 'not_spending';
    diagnosis.meetingGoal = null;
    diagnosis.goalAssessment = 'No spend or budget data available.';
    return diagnosis;
  }

  // --- Goal assessment ---
  if (objective === 'Conversions') {
    if (camp.conversions > 0 && camp.cpa != null) {
      if (camp.cpa < 100) {
        diagnosis.meetingGoal = true;
        diagnosis.goalAssessment = `Generating conversions at $${round2(camp.cpa)} CPA.`;
      } else if (camp.cpa < 200) {
        diagnosis.meetingGoal = false;
        diagnosis.goalAssessment = `CPA is high at $${round2(camp.cpa)} — needs optimization.`;
      } else {
        diagnosis.meetingGoal = false;
        diagnosis.goalAssessment = `CPA is very high at $${round2(camp.cpa)} — review targeting and keywords.`;
      }
    } else if (camp.conversions === 0) {
      diagnosis.meetingGoal = false;
      diagnosis.goalAssessment = `Zero conversions from $${round2(camp.spend)} spend — not meeting conversion goal.`;
    }
  } else if (objective === 'Revenue') {
    if (camp.roas != null) {
      if (camp.roas >= 3) {
        diagnosis.meetingGoal = true;
        diagnosis.goalAssessment = `Strong ${round2(camp.roas)}x ROAS — profitable.`;
      } else if (camp.roas >= 1) {
        diagnosis.meetingGoal = false;
        diagnosis.goalAssessment = `ROAS is ${round2(camp.roas)}x — breaking even but below target.`;
      } else {
        diagnosis.meetingGoal = false;
        diagnosis.goalAssessment = `ROAS is ${round2(camp.roas)}x — losing money on this campaign.`;
      }
    } else if (camp.conversions === 0) {
      diagnosis.meetingGoal = false;
      diagnosis.goalAssessment = `Zero conversions from $${round2(camp.spend)} spend — no revenue generated.`;
    }
  } else if (objective === 'Traffic') {
    if (camp.clicks > 0 && camp.ctr >= 2) {
      diagnosis.meetingGoal = true;
      diagnosis.goalAssessment = `${camp.clicks} clicks at ${round2(camp.ctr)}% CTR — good traffic flow.`;
    } else if (camp.clicks > 0) {
      diagnosis.meetingGoal = false;
      diagnosis.goalAssessment = `${camp.clicks} clicks but CTR is low at ${round2(camp.ctr)}% — ads need improvement.`;
    } else {
      diagnosis.meetingGoal = false;
      diagnosis.goalAssessment = `Zero clicks — campaign not driving traffic.`;
    }
  } else {
    // General / unknown
    if (camp.conversions > 0) {
      diagnosis.meetingGoal = true;
      diagnosis.goalAssessment = `${round2(camp.conversions)} conversions from $${round2(camp.spend)} spend.`;
    } else if (camp.clicks > 0) {
      diagnosis.meetingGoal = null;
      diagnosis.goalAssessment = `${camp.clicks} clicks but no conversions yet.`;
    } else {
      diagnosis.meetingGoal = false;
      diagnosis.goalAssessment = `No measurable results from $${round2(camp.spend)} spend.`;
    }
  }

  // --- Issues ---

  // Zero conversions with significant spend
  if (camp.conversions === 0 && camp.spend > 20) {
    diagnosis.issues.push({
      severity: camp.spend > 100 ? 'Critical' : 'High',
      title: `$${round2(camp.spend)} spent with zero conversions`,
      action: 'Check conversion tracking is working. Review landing page. Add negative keywords for irrelevant traffic. Consider pausing if no results after fixes.'
    });
  }

  // Very high CPA
  if (camp.cpa != null && camp.cpa > 200 && objective === 'Conversions') {
    diagnosis.issues.push({
      severity: 'High',
      title: `CPA is very high: $${round2(camp.cpa)}`,
      action: 'Add negatives for non-converting search terms. Lower bids. Tighten audience targeting. Consider switching to Target CPA bidding.'
    });
  }

  // ROAS below breakeven
  if (camp.roas != null && camp.roas < 1 && objective === 'Revenue') {
    diagnosis.issues.push({
      severity: 'Critical',
      title: `ROAS below breakeven: ${round2(camp.roas)}x`,
      action: 'Pause unprofitable keywords/products. Reduce bids. Review product feed and landing pages. Tighten audience targeting.'
    });
  }

  // Low CTR
  if (camp.ctr < 2 && camp.impressions > 200 && camp.type === 'SEARCH') {
    diagnosis.issues.push({
      severity: 'Medium',
      title: `Low CTR: ${round2(camp.ctr)}%`,
      action: 'Improve ad copy — make headlines more specific and include keywords. Add responsive search ad variations. Ensure 2+ ads per ad group.'
    });
  }

  // Low impression share
  if (camp.searchIS != null && camp.searchIS < 30 && camp.impressions > 0) {
    diagnosis.issues.push({
      severity: 'Medium',
      title: `Low impression share: ${round2(camp.searchIS)}%`,
      action: 'Increase budget if budget-constrained. Improve Quality Score through better ad relevance and landing pages. Raise bids on top keywords.'
    });
  }

  // Underspending vs budget
  if (expectedDailySpend > 0 && dailySpend < expectedDailySpend * 0.3 && camp.spend > 0) {
    diagnosis.issues.push({
      severity: 'Medium',
      title: `Only spending ${Math.round((dailySpend / expectedDailySpend) * 100)}% of daily budget`,
      action: 'Bids may be too low or keywords too narrow. Broaden match types, add keywords, or increase bids to use the full budget.'
    });
  }

  // --- Positives ---
  if (camp.ctr >= 5 && camp.impressions > 100) {
    diagnosis.positives.push({ title: 'Excellent CTR', detail: `${round2(camp.ctr)}% — well above benchmark` });
  }
  if (camp.roas != null && camp.roas >= 5) {
    diagnosis.positives.push({ title: 'Outstanding ROAS', detail: `${round2(camp.roas)}x return on ad spend` });
  } else if (camp.roas != null && camp.roas >= 3) {
    diagnosis.positives.push({ title: 'Strong ROAS', detail: `${round2(camp.roas)}x return` });
  }
  if (camp.cpa != null && camp.cpa < 30 && camp.conversions > 0) {
    diagnosis.positives.push({ title: 'Efficient CPA', detail: `$${round2(camp.cpa)} per conversion` });
  }
  if (camp.searchIS != null && camp.searchIS >= 70) {
    diagnosis.positives.push({ title: 'Good impression share', detail: `${round2(camp.searchIS)}% search IS` });
  }

  // --- Trends vs 30d baseline ---
  if (baselineCamp && periodKey !== 'last30d') {
    const baseDays = 30;

    // CPA trend
    if (baselineCamp.cpa > 0 && camp.cpa > 0) {
      const pct = ((camp.cpa - baselineCamp.cpa) / baselineCamp.cpa) * 100;
      if (Math.abs(pct) > 15) {
        diagnosis.trends.push({
          direction: pct > 0 ? 'up' : 'down',
          metric: 'CPA',
          message: `CPA ${pct > 0 ? 'worsened' : 'improved'} to $${round2(camp.cpa)} vs $${round2(baselineCamp.cpa)} 30d avg (${pct > 0 ? '+' : ''}${Math.round(pct)}%)`
        });
      }
    }

    // ROAS trend
    if (baselineCamp.roas > 0 && camp.roas > 0) {
      const pct = ((camp.roas - baselineCamp.roas) / baselineCamp.roas) * 100;
      if (Math.abs(pct) > 15) {
        diagnosis.trends.push({
          direction: pct > 0 ? 'up' : 'down',
          metric: 'ROAS',
          message: `ROAS ${pct > 0 ? 'improved' : 'declined'} to ${round2(camp.roas)}x vs ${round2(baselineCamp.roas)}x 30d avg (${pct > 0 ? '+' : ''}${Math.round(pct)}%)`
        });
      }
    }

    // Spend pace
    if (baselineCamp.spend > 0) {
      const baseDailySpend = baselineCamp.spend / baseDays;
      const pctSpend = ((dailySpend - baseDailySpend) / baseDailySpend) * 100;
      if (Math.abs(pctSpend) > 30) {
        diagnosis.trends.push({
          direction: pctSpend > 0 ? 'up' : 'down',
          metric: 'Spend',
          message: `Daily spend ${pctSpend > 0 ? 'increased' : 'decreased'} to $${round2(dailySpend)} vs $${round2(baseDailySpend)} 30d avg (${pctSpend > 0 ? '+' : ''}${Math.round(pctSpend)}%)`
        });
      }
    }

    // IS trend
    if (baselineCamp.searchIS != null && camp.searchIS != null) {
      const drop = baselineCamp.searchIS - camp.searchIS;
      if (drop > 10) {
        diagnosis.trends.push({
          direction: 'down', metric: 'IS',
          message: `Impression share dropped ${round2(drop)}pp to ${round2(camp.searchIS)}% from ${round2(baselineCamp.searchIS)}% 30d avg`
        });
      } else if (drop < -10) {
        diagnosis.trends.push({
          direction: 'up', metric: 'IS',
          message: `Impression share improved ${round2(-drop)}pp to ${round2(camp.searchIS)}% from ${round2(baselineCamp.searchIS)}% 30d avg`
        });
      }
    }
  }

  // --- Set overall health ---
  const hasCritical = diagnosis.issues.some(i => i.severity === 'Critical');
  const hasHigh = diagnosis.issues.some(i => i.severity === 'High');
  if (hasCritical) diagnosis.health = 'critical';
  else if (hasHigh || diagnosis.meetingGoal === false) diagnosis.health = 'warning';
  else diagnosis.health = 'healthy';

  return diagnosis;
}


/**
 * Generate account-level insights for a period.
 */
function generateAccountInsights(periodData, allPeriods, periodKey) {
  const insights = [];
  if (!periodData || !periodData.account) return insights;

  const acct = periodData.account;
  const baseline = allPeriods.last30d;
  const baseAcct = baseline ? baseline.account : null;
  const days = PERIOD_DAYS[periodKey] || 1;

  // Zero spend
  if (acct.spend === 0) {
    insights.push({ type: 'alert', message: `Account had $0 spend ${fmtPeriod(periodKey)} — check billing and campaign status.` });
    return insights;
  }

  // Spend anomaly vs 30d
  if (baseAcct && baseAcct.spend > 0 && periodKey !== 'last30d') {
    const dailyAvg30d = baseAcct.spend / 30;
    const dailyAvgPeriod = acct.spend / days;
    const pctChange = ((dailyAvgPeriod - dailyAvg30d) / dailyAvg30d) * 100;
    if (Math.abs(pctChange) > 30) {
      const dir = pctChange > 0 ? 'higher' : 'lower';
      insights.push({
        type: pctChange < -30 ? 'alert' : 'trend',
        message: `Daily spend is ${Math.abs(Math.round(pctChange))}% ${dir} ${fmtPeriod(periodKey)} ($${round2(dailyAvgPeriod)}/day) vs 30-day average ($${round2(dailyAvg30d)}/day).`
      });
    }
  }

  // CPA trend
  if (baseAcct && baseAcct.cpa > 0 && acct.cpa > 0 && periodKey !== 'last30d') {
    const pct = ((acct.cpa - baseAcct.cpa) / baseAcct.cpa) * 100;
    if (Math.abs(pct) > 15) {
      insights.push({
        type: pct > 0 ? 'alert' : 'positive',
        message: `Account CPA ${pct > 0 ? 'worsened' : 'improved'} to $${round2(acct.cpa)} vs $${round2(baseAcct.cpa)} 30d avg (${pct > 0 ? '+' : ''}${Math.round(pct)}%).`
      });
    }
  }

  // ROAS trend
  if (baseAcct && baseAcct.roas > 0 && acct.roas > 0 && periodKey !== 'last30d') {
    const pct = ((acct.roas - baseAcct.roas) / baseAcct.roas) * 100;
    if (Math.abs(pct) > 15) {
      insights.push({
        type: pct > 0 ? 'positive' : 'alert',
        message: `Account ROAS ${pct > 0 ? 'improved' : 'declined'} to ${round2(acct.roas)}x vs ${round2(baseAcct.roas)}x 30d avg (${pct > 0 ? '+' : ''}${Math.round(pct)}%).`
      });
    }
  }

  // Summary: how many campaigns meeting goals
  const campaigns = periodData.campaignDiagnoses || [];
  const total = campaigns.length;
  const meeting = campaigns.filter(c => c.meetingGoal === true).length;
  const failing = campaigns.filter(c => c.meetingGoal === false).length;
  const critical = campaigns.filter(c => c.health === 'critical').length;

  if (total > 0) {
    if (critical > 0) {
      insights.push({ type: 'alert', message: `${critical} of ${total} campaigns have critical issues requiring immediate attention.` });
    }
    if (failing > 0 && failing !== critical) {
      insights.push({ type: 'trend', message: `${failing} of ${total} campaigns are not meeting their conversion goals ${fmtPeriod(periodKey)}.` });
    }
    if (meeting > 0) {
      insights.push({ type: 'positive', message: `${meeting} of ${total} campaigns are meeting their goals ${fmtPeriod(periodKey)}.` });
    }
  }

  const priority = { alert: 0, trend: 1, positive: 2 };
  insights.sort((a, b) => (priority[a.type] || 2) - (priority[b.type] || 2));
  return insights.slice(0, 8);
}


/**
 * Main entry: generate full doctor diagnosis for a period.
 * Called from daily-audit.mjs after all period data is collected.
 */
export function generatePeriodInsights(periodData, allPeriods, periodKey) {
  if (!periodData || !periodData.campaigns) {
    return { insights: [], campaignDiagnoses: [] };
  }

  const baseline = allPeriods.last30d;
  const baselineCamps = baseline ? baseline.campaigns || [] : [];
  const acct = periodData.account || {};

  // Diagnose each campaign
  const campaignDiagnoses = [];
  for (const camp of periodData.campaigns) {
    const baseCamp = baselineCamps.find(c => c.name === camp.name) || null;
    const diag = diagnoseCampaignPeriod(camp, periodKey, baseCamp, acct, baseline ? baseline.account : null);
    campaignDiagnoses.push(diag);
  }

  // Sort: critical first, then warning, then healthy, then not_spending
  const healthOrder = { critical: 0, warning: 1, healthy: 2, not_spending: 3 };
  campaignDiagnoses.sort((a, b) => (healthOrder[a.health] || 3) - (healthOrder[b.health] || 3));

  // Attach diagnoses to period data for account insight generation
  periodData.campaignDiagnoses = campaignDiagnoses;

  // Generate account-level insights
  const insights = generateAccountInsights(periodData, allPeriods, periodKey);

  return { insights, campaignDiagnoses };
}


function fmtPeriod(key) {
  const labels = {
    yesterday: 'yesterday', last3d: 'in the last 3 days',
    last7d: 'in the last 7 days', last14d: 'in the last 14 days',
    last30d: 'over the last 30 days'
  };
  return labels[key] || key;
}
