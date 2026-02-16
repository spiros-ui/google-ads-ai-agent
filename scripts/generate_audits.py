#!/usr/bin/env python3
"""
Generate audit JSON data files for all 13 active Google Ads accounts.
Restored Timbers is already done; this generates the remaining accounts
and updates the manifest.json to include all 14 accounts.

Usage:
    python scripts/generate_audits.py
"""

import json
import os
from datetime import datetime
from pathlib import Path

DATE = "2026-02-16"
BASE_DIR = Path(__file__).resolve().parent.parent / "data"


def make_account(
    account, customer_id, industry, health_score, grade, verdict,
    snapshot, categories, quick_wins, recommendations,
    top_wasted=None, top_performing=None
):
    """Build an audit dict matching the Restored Timbers schema exactly."""
    obj = {
        "account": account,
        "customerId": customer_id,
        "date": DATE,
        "industry": industry,
        "healthScore": health_score,
        "grade": grade,
        "verdict": verdict,
        "snapshot": snapshot,
        "categories": categories,
    }
    if top_wasted is not None:
        obj["topWastedProducts"] = top_wasted
    if top_performing is not None:
        obj["topPerformingProducts"] = top_performing
    obj["quickWins"] = quick_wins
    obj["recommendations"] = recommendations
    return obj


# ---------------------------------------------------------------------------
# 1. Stay Loyal
# ---------------------------------------------------------------------------
stay_loyal = make_account(
    account="Stay Loyal",
    customer_id="680-904-5675",
    industry="E-commerce (Pet Food, Dog Food - Australia)",
    health_score=38,
    grade="F",
    verdict="Conversion tracking pollution is undermining smart bidding and inflating reported performance",
    snapshot={
        "totalCampaigns": 83,
        "enabledCampaigns": 5,
        "activeCampaignsWithSpend": 5,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 20068,
        "impressions30d": 323712,
        "clicks30d": 3858,
        "ctr": 1.19,
        "avgCpc": 5.20,
        "conversions30d": 278,
        "conversionValue30d": 34021,
        "roas": 1.70,
        "cpa": 72.19,
        "searchImpressionShare": 89.6,
        "dailyBudget": None,
        "avgDailySpend": 668.93
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 20.0,
            "grade": "F",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "PASS", "finding": "5 conversion actions configured"},
                {"id": "G43", "name": "Enhanced conversions enabled", "severity": "Critical", "result": "WARNING", "finding": "Cannot confirm enhanced conversions status from available data"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "FAIL", "finding": "Add to basket set as Primary (micro conversion). YouTube subscriptions and YouTube follow-on views set as Primary (completely irrelevant to e-commerce). This pollutes smart bidding with non-purchase signals"},
                {"id": "G49", "name": "Conversion value assignment", "severity": "High", "result": "WARNING", "finding": "GA4 purchase has dynamic values, but micro conversions as Primary inflate conversion counts without real revenue"},
                {"id": "G-CT1", "name": "No duplicate counting", "severity": "Critical", "result": "FAIL", "finding": "YouTube subs and follow-on views counted as Primary conversions alongside purchases — massively inflates conversion count"},
                {"id": "G-CT2", "name": "GA4 linked and flowing", "severity": "High", "result": "PASS", "finding": "GA4 purchase action is Primary and tracking revenue"},
                {"id": "G-CT3", "name": "Call tracking setup", "severity": "High", "result": "FAIL", "finding": "Calls from ads is NOT set as Primary — should be Primary for a D2C brand with phone orders. YouTube actions ARE Primary but shouldn't be"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 40.0,
            "grade": "D",
            "checks": [
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "WARNING", "finding": "Brand search campaign active but search term review cadence unknown"},
                {"id": "G14", "name": "Negative keyword lists exist", "severity": "Critical", "result": "WARNING", "finding": "Unable to verify negative keyword list coverage from available data"},
                {"id": "G16", "name": "Wasted spend on irrelevant terms", "severity": "Critical", "result": "FAIL", "finding": "PMax Remarketing campaign: $1,642 spend for only $702 value (0.43x ROAS). Non-brand Shopping campaigns combined: $1,063 spend for $1,482 value (1.39x ROAS) — below target"},
                {"id": "G-WS1", "name": "Zero-conversion products", "severity": "High", "result": "WARNING", "finding": "Non-brand Shopping campaigns have very low conversion volume (14.2 conv total) relative to spend ($1,063)"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 35.0,
            "grade": "F",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "PASS", "finding": "Consistent CTM prefix across all active campaigns"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "FAIL", "finding": "83 total campaigns with 78 paused — extreme campaign bloat indicating multiple strategy changes and agency handoffs"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "PASS", "finding": "Brand Search campaign separated from Non-Brand Shopping campaigns"},
                {"id": "G06", "name": "PMax present for eligible accounts", "severity": "Medium", "result": "PASS", "finding": "PMax campaign active with brand terms"},
                {"id": "G07", "name": "Search + PMax overlap", "severity": "High", "result": "WARNING", "finding": "Brand Search and PMax +Brand running simultaneously — potential cannibalization"},
                {"id": "G08", "name": "Budget allocation matches priority", "severity": "High", "result": "FAIL", "finding": "60% of budget ($11,968) goes to PMax +Brand which has 1.47x ROAS. Non-brand Shopping has better unit economics but gets only $1,063"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 70.0,
            "grade": "B-",
            "checks": [
                {"id": "G20", "name": "Brand keyword Quality Score", "severity": "High", "result": "PASS", "finding": "Brand search achieving 21.5% CTR — indicates strong QS on brand terms"},
                {"id": "G-KW1", "name": "Keyword coverage", "severity": "Medium", "result": "WARNING", "finding": "Only brand terms actively targeted in Search. No non-brand search expansion"},
                {"id": "G-KW2", "name": "Match type distribution", "severity": "High", "result": "WARNING", "finding": "Unable to assess match types from available data — recommend reviewing brand campaign for close variant leakage"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G26", "name": "RSA ad count per ad group", "severity": "High", "result": "WARNING", "finding": "Brand search RSA setup not verified from available data"},
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "PASS", "finding": "Brand CTR 21.5% is excellent. PMax CTR 0.9% is typical for PMax"},
                {"id": "G-PM1", "name": "PMax audience signals", "severity": "High", "result": "WARNING", "finding": "Separate Remarketing PMax exists but underperforming at 0.43x ROAS — audience signals may need refinement"},
                {"id": "G-PM3", "name": "PMax brand cannibalization", "severity": "High", "result": "FAIL", "finding": "PMax +Brand campaign running alongside Brand Search — PMax likely cannibalizing cheaper brand clicks"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 45.0,
            "grade": "D",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "PASS", "finding": "All campaigns use smart bidding (Max Conv Value or Max Conversions)"},
                {"id": "G37", "name": "Target ROAS set appropriately", "severity": "High", "result": "WARNING", "finding": "Non-brand Shopping uses Target ROAS but main PMax uses uncapped Max Conv Value — no floor on efficiency"},
                {"id": "G39", "name": "Budget constrained campaigns", "severity": "High", "result": "WARNING", "finding": "Brand SIS 89.6% is strong. PMax SIS 44.2% suggests room to grow if ROAS improves. Shopping SIS ~40% limited by budget"},
                {"id": "G50", "name": "Sitelink extensions", "severity": "High", "result": "WARNING", "finding": "Extension setup not verified from available data"},
                {"id": "G56", "name": "Audience segments applied", "severity": "High", "result": "WARNING", "finding": "Remarketing PMax exists suggesting audiences are built, but performance is poor"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Set YouTube subscriptions and YouTube follow-on views to Secondary immediately — these are inflating conversion counts and misleading smart bidding", "impact": "Critical", "time": "5 min", "check": "G47"},
        {"action": "Set Add to basket to Secondary — micro conversion should not be Primary", "impact": "Critical", "time": "2 min", "check": "G47"},
        {"action": "Set Calls from ads to Primary — legitimate macro conversion being ignored", "impact": "High", "time": "2 min", "check": "G-CT3"},
        {"action": "Pause PMax Remarketing Aim campaign — $1,642 spend at 0.43x ROAS is destroying value", "impact": "High", "time": "1 min", "check": "G16"},
        {"action": "Add brand exclusion to PMax +Brand campaign or consolidate with Brand Search to stop cannibalization", "impact": "High", "time": "10 min", "check": "G-PM3"},
        {"action": "Set Target ROAS floor on PMax +Brand (start at 1.5x) to establish efficiency baseline", "impact": "High", "time": "5 min", "check": "G37"}
    ],
    recommendations=[
        {"phase": "Phase 1: Fix the Foundation (Week 1)", "items": [
            "Clean conversion tracking: Only GA4 Purchase + Calls from ads as Primary. Everything else Secondary",
            "Pause PMax Remarketing Aim campaign (0.43x ROAS)",
            "Evaluate PMax +Brand vs Brand Search overlap — consider brand exclusion on PMax",
            "Archive or delete the 78 paused campaigns to clean up account"
        ]},
        {"phase": "Phase 2: Optimize (Weeks 2-3)", "items": [
            "After conversion cleanup, let smart bidding recalibrate for 2 weeks with clean data",
            "Set Target ROAS on PMax +Brand (start at 1.5x, increase incrementally)",
            "Expand non-brand Shopping — increase budgets on chicken & lamb and salmon campaigns that show positive ROAS",
            "Test non-brand Search campaign for high-intent terms (e.g., 'buy dog food online australia')"
        ]},
        {"phase": "Phase 3: Scale (Month 2+)", "items": [
            "Increase non-brand Shopping SIS from ~40% toward 60%+ on profitable products",
            "Launch single consolidated PMax campaign with proper product segmentation",
            "Build Customer Match list from existing customer database for better audience targeting",
            "Test Demand Gen for upper-funnel pet owner targeting"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 2. Skin Spa New York
# ---------------------------------------------------------------------------
skin_spa_new_york = make_account(
    account="Skin Spa New York",
    customer_id="163-311-1847",
    industry="Local Service (Spa/Beauty - NYC, Boston, Miami)",
    health_score=36,
    grade="F",
    verdict="Conversion tracking severely polluted with 4 irrelevant Smart campaign actions as Primary; ROAS misleading",
    snapshot={
        "totalCampaigns": 88,
        "enabledCampaigns": 4,
        "activeCampaignsWithSpend": 4,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 19082,
        "impressions30d": 56393,
        "clicks30d": 3588,
        "ctr": 6.36,
        "avgCpc": 5.32,
        "conversions30d": 105,
        "conversionValue30d": 20586,
        "roas": 1.08,
        "cpa": 181.73,
        "searchImpressionShare": 91.2,
        "dailyBudget": None,
        "avgDailySpend": 636.07
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 18.0,
            "grade": "F",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "PASS", "finding": "8 conversion actions configured"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "FAIL", "finding": "Cart completed set as Primary (micro). 4 Smart campaign actions set as Primary: Smart campaign calls, directions, ad clicks to call, map clicks to call. These are irrelevant legacy actions inflating conversions"},
                {"id": "G-CT1", "name": "No duplicate counting", "severity": "Critical", "result": "FAIL", "finding": "Multiple overlapping call actions: Calls from ads + Website Click To Call + Smart campaign calls + Smart campaign ad clicks to call — quadruple counting phone interactions"},
                {"id": "G-CT2", "name": "GA4 linked and flowing", "severity": "High", "result": "PASS", "finding": "GA4 purchase is Primary and tracking revenue"},
                {"id": "G-CT3", "name": "Smart campaign cleanup", "severity": "Critical", "result": "FAIL", "finding": "4 Smart campaign conversion actions still set as Primary despite no Smart campaigns running. These ghost actions pollute all campaign bidding"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 35.0,
            "grade": "F",
            "checks": [
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "WARNING", "finding": "Branded search campaigns active — search term review cadence unknown"},
                {"id": "G16", "name": "Wasted spend on irrelevant terms", "severity": "Critical", "result": "FAIL", "finding": "PMax spends $13,441 (70% of total) with 56.4 conv at $238 CPA. Miami branded search: $377 for 1 conversion ($377 CPA). Significant waste potential"},
                {"id": "G-WS1", "name": "Budget allocation waste", "severity": "High", "result": "FAIL", "finding": "PMax gets 70% of budget but ROAS is poor. Branded search campaigns for NY and Boston are far more efficient but get only 28% of spend"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 40.0,
            "grade": "D",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "PASS", "finding": "Consistent CTM prefix with location identifiers"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "FAIL", "finding": "88 total campaigns with 84 paused — extreme bloat from multiple agency handoffs"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "WARNING", "finding": "Brand campaigns exist by location but no non-brand search present. PMax handles all non-brand but with no visibility"},
                {"id": "G06", "name": "PMax present for eligible accounts", "severity": "Medium", "result": "PASS", "finding": "PMax - All Stations campaign active covering all locations"},
                {"id": "G08", "name": "Budget allocation matches priority", "severity": "High", "result": "FAIL", "finding": "Miami branded search gets only $377 (1 conv) — market may not be ready. NY and Boston brand get roughly equal budget despite different market sizes"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 65.0,
            "grade": "C",
            "checks": [
                {"id": "G20", "name": "Brand keyword Quality Score", "severity": "High", "result": "PASS", "finding": "NY branded 21.1% CTR and Boston branded 20.4% CTR — excellent brand QS"},
                {"id": "G-KW1", "name": "Keyword coverage", "severity": "Medium", "result": "FAIL", "finding": "Only branded terms in Search. No non-brand search campaigns for spa services, treatments, or location-based queries"},
                {"id": "G-KW2", "name": "Match type distribution", "severity": "High", "result": "WARNING", "finding": "Unable to assess match type details from available data"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "PASS", "finding": "Brand CTR 20-21% is excellent. PMax CTR 5.1% is above average for PMax"},
                {"id": "G-PM1", "name": "PMax audience signals", "severity": "High", "result": "WARNING", "finding": "Single PMax for all 3 cities — audience signals may not be granular enough per market"},
                {"id": "G-PM3", "name": "PMax brand cannibalization", "severity": "High", "result": "WARNING", "finding": "PMax 'All Stations' likely capturing brand searches alongside brand campaigns — no brand exclusion visible"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "PASS", "finding": "All campaigns use smart bidding (Max Conv Value or Max Conversions)"},
                {"id": "G39", "name": "Budget constrained campaigns", "severity": "High", "result": "PASS", "finding": "Brand SIS 91-93% is excellent. PMax SIS 10% suggests very broad targeting or limited budget relative to market"},
                {"id": "G40", "name": "Miami campaign viability", "severity": "Medium", "result": "FAIL", "finding": "Miami brand search: 243 impr, $377 spend, 1 conv. Market may need different approach or more budget to reach critical mass"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Set all 4 Smart campaign conversion actions to Secondary immediately — they inflate conversions and corrupt bidding", "impact": "Critical", "time": "5 min", "check": "G47"},
        {"action": "Set Cart completed to Secondary — micro conversion inflating count", "impact": "Critical", "time": "2 min", "check": "G47"},
        {"action": "Remove duplicate call tracking — keep only Calls from ads + Website Click To Call as Primary", "impact": "Critical", "time": "10 min", "check": "G-CT1"},
        {"action": "Evaluate Miami branded search — consider pausing if market not yet viable ($377 for 1 conv)", "impact": "High", "time": "5 min", "check": "G40"},
        {"action": "Add brand exclusion to PMax All Stations to prevent cannibalization of cheaper branded clicks", "impact": "High", "time": "10 min", "check": "G-PM3"}
    ],
    recommendations=[
        {"phase": "Phase 1: Fix the Foundation (Week 1)", "items": [
            "Clean conversion tracking: Only GA4 Purchase + Calls from ads + Website Click To Call as Primary",
            "Remove all Smart campaign conversion actions from Primary",
            "Remove Cart completed from Primary",
            "Archive 84 paused campaigns"
        ]},
        {"phase": "Phase 2: Optimize (Weeks 2-3)", "items": [
            "After conversion cleanup, let bidding recalibrate for 2 weeks",
            "Split PMax by location — separate asset groups for NYC, Boston, Miami with location-specific creative",
            "Launch non-brand Search campaigns for high-intent spa services (e.g., 'facial near me', 'spa NYC')",
            "Re-evaluate Miami market — build dedicated non-brand strategy or pause until brand awareness grows"
        ]},
        {"phase": "Phase 3: Scale (Month 2+)", "items": [
            "Shift budget from PMax to non-brand Search once launched and performing",
            "Build Customer Match lists from booking system data",
            "Test Demand Gen for seasonal promotions and gift card pushes",
            "Implement server-side tracking for more accurate booking attribution"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 3. The Om Spa
# ---------------------------------------------------------------------------
the_om_spa = make_account(
    account="The Om Spa",
    customer_id="663-837-6999",
    industry="Local Service (Spa - Naples, FL)",
    health_score=42,
    grade="D",
    verdict="Conversion tracking issues and duplicate PMax campaigns diluting performance; fundamentals show promise",
    snapshot={
        "totalCampaigns": 8,
        "enabledCampaigns": 4,
        "activeCampaignsWithSpend": 3,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 19404,
        "impressions30d": 107839,
        "clicks30d": 4588,
        "ctr": 4.25,
        "avgCpc": 4.23,
        "conversions30d": 197,
        "conversionValue30d": 26290,
        "roas": 1.35,
        "cpa": 98.50,
        "searchImpressionShare": 48.1,
        "dailyBudget": None,
        "avgDailySpend": 646.80
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 30.0,
            "grade": "F",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "PASS", "finding": "6 conversion actions configured"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "FAIL", "finding": "Local actions - Menu views set as Primary — micro action inflating conversion count"},
                {"id": "G-CT1", "name": "No duplicate counting", "severity": "Critical", "result": "FAIL", "finding": "3 overlapping call tracking actions: Calls from ads + Click to call website OLD + Clicks to call Google-hosted. Triple-counting phone interactions"},
                {"id": "G-CT3", "name": "Legacy actions cleanup", "severity": "High", "result": "FAIL", "finding": "'Click to call website OLD' still active as Primary — stale conversion action should be removed or set to Secondary"},
                {"id": "G-CT4", "name": "Store visits tracking", "severity": "Medium", "result": "PASS", "finding": "Store visits tracked as Primary — appropriate for a local spa business"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 45.0,
            "grade": "D",
            "checks": [
                {"id": "G16", "name": "Wasted spend on irrelevant terms", "severity": "Critical", "result": "WARNING", "finding": "Desktop-only PMax: $5,635 for 32.5 conv ($173 CPA) vs main PMax: $12,625 for 142 conv ($89 CPA). Desktop-only variant is 2x more expensive per conversion"},
                {"id": "G-WS1", "name": "Duplicate PMax waste", "severity": "High", "result": "FAIL", "finding": "Two PMax campaigns targeting same service area — Desktop Only version dilutes data and increases costs"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "WARNING", "finding": "Mix of naming styles: 'Performance Max - OmSpa' vs 'Theomspanaples - Search V2'"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "WARNING", "finding": "8 campaigns is reasonable but 2 duplicate PMax is inefficient"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "FAIL", "finding": "No dedicated brand search campaign. Search V2 appears to target both brand and non-brand"},
                {"id": "G06", "name": "PMax present for eligible accounts", "severity": "Medium", "result": "PASS", "finding": "PMax active and the primary spend driver"},
                {"id": "G08", "name": "Budget allocation matches priority", "severity": "High", "result": "WARNING", "finding": "94% of budget in PMax. Search V2 only $1,144 — limited search insights"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G20", "name": "Search campaign Quality Score", "severity": "High", "result": "WARNING", "finding": "Search V2 CTR 7.4% is decent for spa queries. SIS 33.1% means missing 2/3 of searches"},
                {"id": "G-KW1", "name": "Keyword coverage", "severity": "Medium", "result": "FAIL", "finding": "Only 1 search campaign active. Search clicks campaign enabled but $0 spend — broken or limited keywords"},
                {"id": "G-KW2", "name": "Search impression share", "severity": "High", "result": "FAIL", "finding": "SIS 33-48% across campaigns — significant opportunity being missed"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "PASS", "finding": "Main PMax 4.9% CTR is above average. Search 7.4% CTR is solid"},
                {"id": "G-PM1", "name": "PMax audience signals", "severity": "High", "result": "WARNING", "finding": "Two PMax campaigns — unclear how audience signals differ between them"},
                {"id": "G-PM3", "name": "PMax brand cannibalization", "severity": "High", "result": "WARNING", "finding": "No brand campaign exists, so PMax is likely serving on brand terms at higher cost"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "PASS", "finding": "PMax uses Max Conv Value. Search V2 uses Max Conversions. Search clicks uses Target Spend (suboptimal)"},
                {"id": "G39", "name": "Budget constrained campaigns", "severity": "High", "result": "WARNING", "finding": "PMax SIS 48.1% — missing half of available impressions"},
                {"id": "G40", "name": "Target Spend campaign", "severity": "Medium", "result": "FAIL", "finding": "Search clicks campaign uses Target Spend with $0 spend — either broken or should be paused"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Set Menu views to Secondary — micro conversion inflating count", "impact": "Critical", "time": "2 min", "check": "G47"},
        {"action": "Remove 'Click to call website OLD' — stale duplicate call tracking", "impact": "Critical", "time": "5 min", "check": "G-CT3"},
        {"action": "Consolidate to 1 call tracking action — keep Calls from ads as Primary, set others to Secondary", "impact": "High", "time": "5 min", "check": "G-CT1"},
        {"action": "Pause Desktop Only PMax — consolidate into main PMax for better data aggregation and lower CPA", "impact": "High", "time": "2 min", "check": "G-WS1"},
        {"action": "Pause or fix Search clicks campaign ($0 spend, Target Spend bidding)", "impact": "Medium", "time": "2 min", "check": "G40"},
        {"action": "Launch a brand Search campaign to capture brand terms cheaply before PMax", "impact": "High", "time": "30 min", "check": "G05"}
    ],
    recommendations=[
        {"phase": "Phase 1: Fix the Foundation (Week 1)", "items": [
            "Clean conversion tracking: GA4 Purchase + Calls from ads + Store visits as Primary only",
            "Remove OLD click to call and Menu views from Primary",
            "Consolidate to single PMax campaign (pause Desktop Only variant)",
            "Pause Search clicks campaign (Target Spend, $0 activity)"
        ]},
        {"phase": "Phase 2: Optimize (Weeks 2-3)", "items": [
            "Launch dedicated brand Search campaign to capture brand terms at lower cost",
            "Expand Search V2 keywords and increase budget to improve 33.1% SIS",
            "After PMax consolidation, monitor CPA improvement with unified data",
            "Add remarketing audiences as signals to PMax"
        ]},
        {"phase": "Phase 3: Scale (Month 2+)", "items": [
            "Increase PMax SIS from 48% toward 65%+ as conversion tracking improves",
            "Launch non-brand Search campaigns for treatment-specific queries",
            "Build Customer Match list from booking system",
            "Test seasonal promotions via Demand Gen"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 4. Odd Fellows Contracting
# ---------------------------------------------------------------------------
odd_fellows_contracting = make_account(
    account="Odd Fellows Contracting",
    customer_id="537-651-5807",
    industry="Local Service (Kitchen Remodeling/Contracting)",
    health_score=48,
    grade="D+",
    verdict="Reasonable structure but high CPA for lead gen; LSA + Search combo is solid but needs optimization",
    snapshot={
        "totalCampaigns": None,
        "enabledCampaigns": 2,
        "activeCampaignsWithSpend": 2,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 5457,
        "impressions30d": 4703,
        "clicks30d": 398,
        "ctr": 8.46,
        "avgCpc": 13.71,
        "conversions30d": 25,
        "conversionValue30d": None,
        "roas": None,
        "cpa": 218.28,
        "searchImpressionShare": None,
        "dailyBudget": None,
        "avgDailySpend": 181.90
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "WARNING", "finding": "Conversion actions present (25 total conversions tracked) but specific setup not fully verified"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "WARNING", "finding": "Cannot verify Primary vs Secondary classification from available data — needs manual review"},
                {"id": "G-CT1", "name": "No duplicate counting", "severity": "Critical", "result": "WARNING", "finding": "LSA has its own conversion tracking separate from Search — ensure no double-counting of leads"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 40.0,
            "grade": "D",
            "checks": [
                {"id": "G16", "name": "Wasted spend on irrelevant terms", "severity": "Critical", "result": "WARNING", "finding": "$218 CPA is high for kitchen remodeling leads. Need to verify search term quality and wasted spend"},
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "WARNING", "finding": "BOFU campaign targeting kitchen remodeling — search terms should be reviewed for commercial intent match"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 60.0,
            "grade": "C-",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "PASS", "finding": "CTM prefix with BOFU funnel stage identifier — good naming"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "PASS", "finding": "2 campaigns (LSA + Search) is lean and appropriate"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "FAIL", "finding": "No brand search campaign. Competitors could be bidding on brand terms"},
                {"id": "G08", "name": "Budget allocation matches priority", "severity": "High", "result": "WARNING", "finding": "LSA: $616 for 16 conv ($38.50 CPA) vs Search: $4,841 for 9 conv ($538 CPA). LSA is dramatically more efficient but gets only 11% of budget"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 45.0,
            "grade": "D",
            "checks": [
                {"id": "G20", "name": "Search campaign CTR", "severity": "High", "result": "WARNING", "finding": "Search campaign: 3,256 impr, 167 clicks (5.1% CTR). Acceptable but room for improvement"},
                {"id": "G-KW1", "name": "Keyword intent alignment", "severity": "Medium", "result": "WARNING", "finding": "BOFU targeting implies bottom-funnel keywords but $538 CPA suggests targeting may be too broad"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "PASS", "finding": "LSA CTR 16% is excellent. Search CTR 5.1% is acceptable for home services"},
                {"id": "G-AD1", "name": "Ad freshness", "severity": "Medium", "result": "WARNING", "finding": "Ad creative freshness not verified — recommend RSA testing"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 45.0,
            "grade": "D",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "WARNING", "finding": "Search bidding strategy not verified from available data"},
                {"id": "G11", "name": "Geographic targeting accuracy", "severity": "High", "result": "WARNING", "finding": "Service area targeting not verified — critical for local contractor"},
                {"id": "G08", "name": "LSA vs Search budget", "severity": "High", "result": "FAIL", "finding": "LSA generates leads at $38.50 vs Search at $538. Budget should be rebalanced heavily toward LSA"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Shift budget from Search to LSA — LSA CPA is $38.50 vs Search CPA $538. Double or triple LSA budget immediately", "impact": "Critical", "time": "5 min", "check": "G08"},
        {"action": "Review Search campaign keywords — $538 CPA indicates likely wasted spend on broad or irrelevant terms", "impact": "High", "time": "30 min", "check": "G16"},
        {"action": "Add negative keywords to Search campaign for DIY, free, cheap, how-to queries", "impact": "High", "time": "15 min", "check": "G14"},
        {"action": "Launch a brand Search campaign to protect against competitor bidding", "impact": "Medium", "time": "30 min", "check": "G05"},
        {"action": "Verify conversion tracking setup — ensure no double-counting between LSA and Search", "impact": "High", "time": "15 min", "check": "G-CT1"}
    ],
    recommendations=[
        {"phase": "Phase 1: Fix the Foundation (Week 1)", "items": [
            "Rebalance budget: increase LSA to 50%+ of total spend given 14x better CPA",
            "Audit Search campaign keywords — remove broad/irrelevant terms driving $538 CPA",
            "Verify conversion tracking setup across LSA and Search",
            "Add comprehensive negative keyword list to Search campaign"
        ]},
        {"phase": "Phase 2: Optimize (Weeks 2-3)", "items": [
            "Refine Search campaign to only high-intent kitchen remodeling terms",
            "Launch brand Search campaign for brand protection",
            "Test bid strategies on Search (Max Conversions or Target CPA)",
            "Improve ad copy with specific services, pricing indicators, and social proof"
        ]},
        {"phase": "Phase 3: Scale (Month 2+)", "items": [
            "If Search CPA drops to <$150, increase Search budget",
            "Maximize LSA impression share",
            "Test PMax for local services with before/after project photos",
            "Build remarketing audiences from site visitors"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 5. Shanahan Family Law
# ---------------------------------------------------------------------------
shanahan_family_law = make_account(
    account="Shanahan Family Law",
    customer_id="771-856-2182",
    industry="Local Service (Family Law)",
    health_score=44,
    grade="D",
    verdict="High CPA for legal lead gen; PMax dominates spend but Search would give better control for legal queries",
    snapshot={
        "totalCampaigns": None,
        "enabledCampaigns": 3,
        "activeCampaignsWithSpend": 3,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 5479,
        "impressions30d": 28168,
        "clicks30d": 848,
        "ctr": 3.01,
        "avgCpc": 6.46,
        "conversions30d": 24,
        "conversionValue30d": None,
        "roas": None,
        "cpa": 228.29,
        "searchImpressionShare": None,
        "dailyBudget": None,
        "avgDailySpend": 182.63
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "WARNING", "finding": "Conversions tracking (24 total) but specific Primary/Secondary setup needs verification"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "WARNING", "finding": "Conversion action types not fully verified — need to check for form fills vs calls vs page views"},
                {"id": "G-CT1", "name": "No duplicate counting", "severity": "Critical", "result": "WARNING", "finding": "PMax and Search may track overlapping conversion actions — needs verification"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 40.0,
            "grade": "D",
            "checks": [
                {"id": "G16", "name": "Wasted spend on irrelevant terms", "severity": "Critical", "result": "WARNING", "finding": "Brand search: $276 for 1 conv ($276 CPA) — low volume brand. PMax: $3,914 for 17 conv ($230 CPA). Incremental Search: $1,289 for 6 conv ($215 CPA)"},
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "WARNING", "finding": "Legal keywords are expensive — must ensure search terms match high-intent legal queries, not informational"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 52.0,
            "grade": "D+",
            "checks": [
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "PASS", "finding": "3 campaigns is lean and appropriate for the budget level"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "PASS", "finding": "Brand search separated from non-brand incremental search — good structure"},
                {"id": "G06", "name": "PMax present for eligible accounts", "severity": "Medium", "result": "WARNING", "finding": "PMax for legal services is risky — Display/YouTube placements may waste spend for high-intent legal queries"},
                {"id": "G08", "name": "Budget allocation matches priority", "severity": "High", "result": "FAIL", "finding": "PMax gets 71% of spend ($3,914) despite legal being a high-intent vertical where Search typically outperforms"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 40.0,
            "grade": "D",
            "checks": [
                {"id": "G20", "name": "Search campaign performance", "severity": "High", "result": "WARNING", "finding": "Incremental Search: 1,787 impr, 88 clicks (4.9% CTR). Brand: 235 impr, 74 clicks (31.5% CTR). Low non-brand volume"},
                {"id": "G-KW1", "name": "Keyword coverage", "severity": "Medium", "result": "FAIL", "finding": "Only 1 non-brand search campaign with limited impression volume. Over-reliance on PMax for non-brand coverage"},
                {"id": "G-KW2", "name": "Search impression share", "severity": "High", "result": "WARNING", "finding": "Incremental Search SIS unclear — likely low given limited budget allocation"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "PASS", "finding": "Brand CTR 31.5% is excellent. Incremental Search 4.9% is acceptable for legal"},
                {"id": "G-PM3", "name": "PMax brand cannibalization", "severity": "High", "result": "WARNING", "finding": "PMax may be serving on brand terms alongside brand search campaign — verify with asset group reports"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 45.0,
            "grade": "D",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "WARNING", "finding": "Bidding strategies not fully verified from available data"},
                {"id": "G11", "name": "Geographic targeting accuracy", "severity": "High", "result": "WARNING", "finding": "Sunshine Coast targeting — verify radius/location targeting is accurate for service area"},
                {"id": "G10", "name": "Ad schedule configured", "severity": "Low", "result": "WARNING", "finding": "Legal clients search outside business hours — verify if campaigns run 24/7 and if after-hours tracking is set up"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Shift budget from PMax to Incremental Search — legal is a high-intent vertical where Search outperforms PMax", "impact": "High", "time": "5 min", "check": "G08"},
        {"action": "Add negative keywords to Search campaign for free legal advice, DIY divorce, legal definitions", "impact": "High", "time": "15 min", "check": "G13"},
        {"action": "Add brand exclusion to PMax to prevent brand term cannibalization", "impact": "High", "time": "10 min", "check": "G-PM3"},
        {"action": "Verify conversion tracking — ensure only legitimate leads (calls + form fills) are Primary", "impact": "Critical", "time": "15 min", "check": "G47"},
        {"action": "Review PMax placement reports — exclude low-quality Display/YouTube placements", "impact": "Medium", "time": "15 min", "check": "G06"}
    ],
    recommendations=[
        {"phase": "Phase 1: Fix the Foundation (Week 1)", "items": [
            "Audit conversion tracking — ensure only calls and form submissions are Primary",
            "Shift 50%+ of PMax budget to Search for better control over legal queries",
            "Add comprehensive negative keywords for informational legal queries",
            "Add brand exclusion to PMax"
        ]},
        {"phase": "Phase 2: Optimize (Weeks 2-3)", "items": [
            "Expand Incremental Search keywords — add family law practice areas (custody, divorce, property settlement)",
            "Test call-only ads for mobile searchers",
            "Improve ad copy with Sunshine Coast location specifics and practice area callouts",
            "Set up call tracking with minimum duration (e.g., 60 seconds) to filter junk calls"
        ]},
        {"phase": "Phase 3: Scale (Month 2+)", "items": [
            "If Search CPA drops below $200, increase budget",
            "Consider LSA for family law — often more cost-effective than Search for legal",
            "Build remarketing audiences for people who visited but didn't convert",
            "Test specific practice area campaigns (divorce, custody, property) separately"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 6. Costa Rica Waterfall Tours
# ---------------------------------------------------------------------------
costa_rica_waterfall_tours = make_account(
    account="Costa Rica Waterfall Tours",
    customer_id="355-592-1105",
    industry="Travel/Tourism",
    health_score=50,
    grade="D+",
    verdict="Single campaign structure limits growth; $111 CPA acceptable for tours but needs expansion and diversification",
    snapshot={
        "totalCampaigns": None,
        "enabledCampaigns": 1,
        "activeCampaignsWithSpend": 1,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 3452,
        "impressions30d": 11015,
        "clicks30d": 979,
        "ctr": 8.89,
        "avgCpc": 3.53,
        "conversions30d": 31,
        "conversionValue30d": None,
        "roas": None,
        "cpa": 111.35,
        "searchImpressionShare": None,
        "dailyBudget": None,
        "avgDailySpend": 115.07
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "WARNING", "finding": "31 conversions tracked but specific actions not verified — needs manual review"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "WARNING", "finding": "Conversion action types not verified — need to confirm bookings vs inquiries vs page views"},
                {"id": "G49", "name": "Conversion value assignment", "severity": "High", "result": "WARNING", "finding": "No conversion value reported — tour booking values should be tracked for ROAS optimization"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "WARNING", "finding": "Exact match campaign limits waste but search terms should still be reviewed for close variant leakage"},
                {"id": "G14", "name": "Negative keyword lists exist", "severity": "Critical", "result": "WARNING", "finding": "Not verified — exact match provides some protection but negatives still needed for close variants"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 40.0,
            "grade": "D",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "PASS", "finding": "CTM prefix present"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "WARNING", "finding": "Only 1 campaign — very limited. No brand protection, no PMax, no expansion campaigns"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "FAIL", "finding": "No brand campaign. Single exact match campaign likely mixes brand and non-brand"},
                {"id": "G06", "name": "PMax present for eligible accounts", "severity": "Medium", "result": "FAIL", "finding": "No PMax campaign — tourism is highly visual and well-suited for PMax with video/image assets"},
                {"id": "G08", "name": "Budget allocation matches priority", "severity": "High", "result": "WARNING", "finding": "All eggs in one basket — single campaign failure means zero visibility"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 60.0,
            "grade": "C-",
            "checks": [
                {"id": "G20", "name": "Search CTR performance", "severity": "High", "result": "PASS", "finding": "8.89% CTR is excellent — indicates strong keyword-to-ad relevance"},
                {"id": "G-KW1", "name": "Keyword match types", "severity": "Medium", "result": "WARNING", "finding": "Exact match only — very controlled but may be missing high-intent variations"},
                {"id": "G-KW2", "name": "Keyword expansion opportunity", "severity": "High", "result": "FAIL", "finding": "Only exact match in 1 campaign — significant opportunity to expand with phrase/broad match + smart bidding"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "PASS", "finding": "8.89% CTR vs ~4-6% travel benchmark — well above average"},
                {"id": "G-AD1", "name": "Ad freshness", "severity": "Medium", "result": "WARNING", "finding": "Ad creative testing not verified — single campaign may have limited ad rotation"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "WARNING", "finding": "Bidding strategy not verified from available data"},
                {"id": "G11", "name": "Geographic targeting accuracy", "severity": "High", "result": "WARNING", "finding": "Tourism targeting should include key source markets (US, Canada, Europe) — verify location settings"},
                {"id": "G57", "name": "Customer Match lists", "severity": "High", "result": "FAIL", "finding": "No Customer Match or remarketing audiences visible — past tourists are high-value retargeting prospects"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Add conversion value tracking — assign tour booking values to enable ROAS-based bidding", "impact": "Critical", "time": "15 min", "check": "G49"},
        {"action": "Launch a brand Search campaign to protect brand terms from competitor bidding", "impact": "High", "time": "30 min", "check": "G05"},
        {"action": "Add phrase match and broad match variations of top-performing exact keywords in a new campaign", "impact": "High", "time": "30 min", "check": "G-KW2"},
        {"action": "Upload customer email list for Customer Match remarketing", "impact": "High", "time": "15 min", "check": "G57"},
        {"action": "Verify conversion tracking — ensure bookings are the only Primary conversion action", "impact": "Critical", "time": "10 min", "check": "G47"}
    ],
    recommendations=[
        {"phase": "Phase 1: Fix the Foundation (Week 1)", "items": [
            "Verify and clean conversion tracking — ensure only bookings/qualified inquiries are Primary",
            "Add dynamic conversion values for tour bookings",
            "Launch brand Search campaign",
            "Review and expand negative keywords even with exact match (close variants)"
        ]},
        {"phase": "Phase 2: Expand (Weeks 2-3)", "items": [
            "Launch phrase match campaign for high-intent tour queries",
            "Launch PMax campaign with Costa Rica waterfall imagery and video assets",
            "Test broad match + Max Conversions for keyword discovery",
            "Build remarketing audiences from site visitors and past bookers"
        ]},
        {"phase": "Phase 3: Scale (Month 2+)", "items": [
            "Test Demand Gen for upper-funnel tourism discovery (YouTube, Discover)",
            "Expand geographic targeting to additional source markets",
            "Seasonal bid adjustments for peak Costa Rica tourism season",
            "Test competitor targeting for other Costa Rica tour operators"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 7. Commercial - Madison
# ---------------------------------------------------------------------------
commercial_madison = make_account(
    account="Commercial - Madison",
    customer_id="787-726-7211",
    industry="Local Service (Commercial Real Estate/Services)",
    health_score=12,
    grade="F",
    verdict="EMERGENCY: $2,819 spent with ZERO conversions — entire budget is being wasted",
    snapshot={
        "totalCampaigns": None,
        "enabledCampaigns": 1,
        "activeCampaignsWithSpend": 1,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 2819,
        "impressions30d": 6631,
        "clicks30d": 483,
        "ctr": 7.28,
        "avgCpc": 5.84,
        "conversions30d": 0,
        "conversionValue30d": 0,
        "roas": 0,
        "cpa": None,
        "searchImpressionShare": None,
        "dailyBudget": None,
        "avgDailySpend": 93.97
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 5.0,
            "grade": "F",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "FAIL", "finding": "ZERO conversions in 30 days despite 483 clicks and $2,819 spend. Either conversion tracking is broken or landing page is failing completely"},
                {"id": "G43", "name": "Conversion tracking functional", "severity": "Critical", "result": "FAIL", "finding": "0 conversions is a red flag — likely no conversion tracking installed, or tracking is broken. Must verify immediately"},
                {"id": "G-CT2", "name": "Tag firing verification", "severity": "Critical", "result": "FAIL", "finding": "No conversions recorded — tags likely not firing. Campaign is burning money blind"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 0.0,
            "grade": "F",
            "checks": [
                {"id": "G16", "name": "Wasted spend on irrelevant terms", "severity": "Critical", "result": "FAIL", "finding": "100% of $2,819 spend is waste — ZERO conversions. Every dollar spent this month generated nothing"},
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "FAIL", "finding": "With 0 conversions, search terms are likely poorly targeted. Urgent review needed"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 20.0,
            "grade": "F",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "WARNING", "finding": "Complex naming: '1090 | Search No Partners | Rel 8 | CPC #2' — suggests multiple iterations without success"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "WARNING", "finding": "Single campaign but it references '#2' and 'Rel 8' suggesting many failed previous attempts"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "FAIL", "finding": "No brand campaign. Single non-brand campaign with 0 conversions"},
                {"id": "G06", "name": "PMax present for eligible accounts", "severity": "Medium", "result": "FAIL", "finding": "No PMax campaign — though fixing conversions must come first"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 30.0,
            "grade": "F",
            "checks": [
                {"id": "G20", "name": "Search CTR performance", "severity": "High", "result": "PASS", "finding": "7.28% CTR is decent — ads are getting clicks, the problem is post-click (landing page or tracking)"},
                {"id": "G-KW1", "name": "Keyword intent alignment", "severity": "Medium", "result": "FAIL", "finding": "0 conversions with 483 clicks suggests keywords may attract wrong intent, or landing page fails to convert"},
                {"id": "G-KW2", "name": "Search term quality", "severity": "High", "result": "FAIL", "finding": "No Partners set (good) but still 0 conversions — search terms need urgent review"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 25.0,
            "grade": "F",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "PASS", "finding": "7.28% CTR is above average — the ad copy is working, the conversion funnel is not"},
                {"id": "G-AD1", "name": "Landing page experience", "severity": "Critical", "result": "FAIL", "finding": "483 clicks, 0 conversions = 0% conversion rate. Landing page is either broken, irrelevant, or has no clear CTA"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 15.0,
            "grade": "F",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "FAIL", "finding": "Campaign name references 'CPC' — likely Manual CPC with no conversion-based optimization (which makes sense given 0 conversions)"},
                {"id": "G39", "name": "Budget efficiency", "severity": "High", "result": "FAIL", "finding": "$93.97/day being burned with zero return. Campaign should be paused until fundamentals are fixed"},
                {"id": "G11", "name": "Geographic targeting accuracy", "severity": "High", "result": "WARNING", "finding": "Madison targeting — verify service area alignment"}
            ]
        }
    ],
    quick_wins=[
        {"action": "PAUSE THE CAMPAIGN IMMEDIATELY — $2,819 wasted with 0 conversions. Stop the bleeding while diagnosis happens", "impact": "Critical", "time": "1 min", "check": "G16"},
        {"action": "Check if conversion tracking tags are installed on the website — likely broken or missing", "impact": "Critical", "time": "15 min", "check": "G42"},
        {"action": "Test the landing page — verify it loads, has clear CTA, and matches ad messaging", "impact": "Critical", "time": "10 min", "check": "G-AD1"},
        {"action": "Review search terms report — verify queries match commercial real estate intent", "impact": "High", "time": "15 min", "check": "G-KW1"},
        {"action": "Set up proper conversion tracking (phone calls + form submissions) before restarting", "impact": "Critical", "time": "30 min", "check": "G43"}
    ],
    recommendations=[
        {"phase": "Phase 1: STOP THE BLEEDING (Immediate)", "items": [
            "Pause the campaign immediately — every day running is ~$94 wasted",
            "Verify conversion tracking installation — check Google Tag Assistant, GTM, or direct tag",
            "Test landing page: load speed, mobile compatibility, clear CTA, form functionality",
            "Review search terms for the last 30 days — identify if traffic is relevant"
        ]},
        {"phase": "Phase 2: Rebuild (Week 1-2)", "items": [
            "Install and verify conversion tracking (phone calls + form fills)",
            "Ensure landing page has clear CTA, contact form, phone number, and matches ad messaging",
            "Rebuild keyword list with verified commercial intent terms",
            "Re-launch with Max Conversions bidding once tracking is confirmed working"
        ]},
        {"phase": "Phase 3: Grow (Month 2+)", "items": [
            "Only increase spend once CPA is established and acceptable",
            "Consider LSA for local commercial services",
            "Test PMax only after Search proves concept",
            "Build remarketing for return visitors"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 8. Infinite Roofing
# ---------------------------------------------------------------------------
infinite_roofing = make_account(
    account="Infinite Roofing",
    customer_id="277-358-3029",
    industry="Local Service (Roofing)",
    health_score=52,
    grade="C-",
    verdict="Solid single campaign performance; $121 CPA is reasonable for roofing leads but limited growth structure",
    snapshot={
        "totalCampaigns": None,
        "enabledCampaigns": 1,
        "activeCampaignsWithSpend": 1,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 2672,
        "impressions30d": 3944,
        "clicks30d": 250,
        "ctr": 6.34,
        "avgCpc": 10.69,
        "conversions30d": 22,
        "conversionValue30d": None,
        "roas": None,
        "cpa": 121.45,
        "searchImpressionShare": None,
        "dailyBudget": None,
        "avgDailySpend": 89.07
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "PASS", "finding": "22 conversions tracked — conversion tracking is functional"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "WARNING", "finding": "Conversion action types not fully verified — need to confirm calls + form fills are primary, not page views"},
                {"id": "G49", "name": "Conversion value assignment", "severity": "High", "result": "WARNING", "finding": "No conversion value reported — roofing jobs vary significantly in value ($500 repair vs $15K replacement). Value tracking would enable smarter bidding"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "WARNING", "finding": "Search campaign active — search term review cadence unknown"},
                {"id": "G14", "name": "Negative keyword lists exist", "severity": "Critical", "result": "WARNING", "finding": "Negatives not verified — roofing searches often trigger DIY, insurance claim, and non-service queries"},
                {"id": "G16", "name": "Wasted spend assessment", "severity": "Critical", "result": "PASS", "finding": "8.8% conversion rate (22 from 250 clicks) is solid. Suggests good keyword targeting and minimal waste"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 45.0,
            "grade": "D",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "PASS", "finding": "CTM prefix with service type — clear naming"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "WARNING", "finding": "Single campaign — limits granularity between new roofing vs repair vs emergency"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "FAIL", "finding": "No brand campaign. No LSA campaign. Limited structure for growth"},
                {"id": "G06", "name": "PMax present for eligible accounts", "severity": "Medium", "result": "FAIL", "finding": "No PMax — could help with Display/Maps visibility for local roofing"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 60.0,
            "grade": "C-",
            "checks": [
                {"id": "G20", "name": "Search CTR performance", "severity": "High", "result": "PASS", "finding": "6.34% CTR is solid for roofing. 8.8% conversion rate is excellent"},
                {"id": "G-KW1", "name": "Keyword coverage", "severity": "Medium", "result": "WARNING", "finding": "Combined 'New & Repair' in single campaign — could benefit from separating service types"},
                {"id": "G-KW2", "name": "Search volume", "severity": "High", "result": "WARNING", "finding": "Only 3,944 impressions in 30 days — may be constrained by budget or narrow keyword targeting"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "PASS", "finding": "6.34% CTR vs ~5% roofing benchmark — above average"},
                {"id": "G-AD1", "name": "Ad freshness", "severity": "Medium", "result": "WARNING", "finding": "Ad creative testing not verified — recommend at least 2 RSAs per ad group"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "WARNING", "finding": "Bidding strategy not verified — with 22 conv/month, Max Conversions would be appropriate"},
                {"id": "G11", "name": "Geographic targeting accuracy", "severity": "High", "result": "WARNING", "finding": "Service area targeting not verified — critical for roofing contractor"},
                {"id": "G57", "name": "Customer Match lists", "severity": "High", "result": "FAIL", "finding": "No remarketing or Customer Match audiences visible"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Add conversion values — estimate average job values for new roofing vs repair to enable value-based bidding", "impact": "High", "time": "15 min", "check": "G49"},
        {"action": "Review search terms report — add negatives for DIY, insurance, free, cheap queries", "impact": "High", "time": "20 min", "check": "G14"},
        {"action": "Launch brand Search campaign for brand protection", "impact": "Medium", "time": "30 min", "check": "G05"},
        {"action": "Verify conversion tracking — confirm only calls + form fills are Primary (not page views)", "impact": "High", "time": "10 min", "check": "G47"},
        {"action": "Consider LSA campaign — roofing is a top LSA category with often lower CPAs", "impact": "High", "time": "30 min", "check": "G06"}
    ],
    recommendations=[
        {"phase": "Phase 1: Optimize Current (Week 1)", "items": [
            "Verify conversion tracking — ensure only legitimate leads are counted",
            "Add conversion values for different service types",
            "Review and expand negative keywords",
            "Split campaign into New Roofing and Repair for better bid control"
        ]},
        {"phase": "Phase 2: Expand (Weeks 2-3)", "items": [
            "Launch brand Search campaign",
            "Launch LSA campaign — roofing is ideal for Local Services Ads",
            "Test Max Conversions bidding if currently on Manual CPC",
            "Expand keyword coverage for emergency roofing, specific service queries"
        ]},
        {"phase": "Phase 3: Scale (Month 2+)", "items": [
            "If CPA stays under $150, increase budget to capture more of the market",
            "Test PMax with before/after project photos for Display/YouTube visibility",
            "Build remarketing audiences for return visitors",
            "Seasonal adjustments for storm season when roofing demand spikes"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 9. The DNA Diet Club
# ---------------------------------------------------------------------------
the_dna_diet_club = make_account(
    account="The DNA Diet Club",
    customer_id="185-185-5764",
    industry="Health/Wellness (DNA-based diet program)",
    health_score=28,
    grade="F",
    verdict="Extremely high CPA ($316) with only 4 conversions — insufficient data for optimization; fundamental rethink needed",
    snapshot={
        "totalCampaigns": None,
        "enabledCampaigns": 1,
        "activeCampaignsWithSpend": 1,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 1264,
        "impressions30d": 3202,
        "clicks30d": 141,
        "ctr": 4.40,
        "avgCpc": 8.96,
        "conversions30d": 4,
        "conversionValue30d": None,
        "roas": None,
        "cpa": 316.00,
        "searchImpressionShare": None,
        "dailyBudget": None,
        "avgDailySpend": 42.13
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 35.0,
            "grade": "F",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "WARNING", "finding": "Only 4 conversions in 30 days — extremely low volume. Conversion tracking may be functional but needs verification"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "WARNING", "finding": "With only 4 conversions, any micro-as-Primary issue would be catastrophic for bidding signals"},
                {"id": "G49", "name": "Conversion value assignment", "severity": "High", "result": "WARNING", "finding": "No conversion value reported — DNA diet programs likely have specific price points that should be tracked"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 25.0,
            "grade": "F",
            "checks": [
                {"id": "G16", "name": "Wasted spend on irrelevant terms", "severity": "Critical", "result": "FAIL", "finding": "2.8% conversion rate with $316 CPA. 137 of 141 clicks did not convert — search term quality needs urgent review"},
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "FAIL", "finding": "BOFU campaign implies bottom-funnel targeting but $316 CPA and 2.8% CVR suggest targeting is too broad or wrong intent"},
                {"id": "G14", "name": "Negative keyword lists exist", "severity": "Critical", "result": "WARNING", "finding": "Not verified — DNA/diet queries attract heavy informational traffic that must be excluded"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 35.0,
            "grade": "F",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "PASS", "finding": "CTM prefix with funnel stage (BOFU) — good naming convention"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "WARNING", "finding": "Single campaign — limits testing ability but appropriate for low budget"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "FAIL", "finding": "No brand campaign. BOFU may be capturing some brand traffic at non-brand CPCs"},
                {"id": "G06", "name": "PMax present for eligible accounts", "severity": "Medium", "result": "FAIL", "finding": "No PMax — but with only 4 conversions/month, PMax wouldn't have enough data anyway"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 30.0,
            "grade": "F",
            "checks": [
                {"id": "G20", "name": "Search CTR performance", "severity": "High", "result": "WARNING", "finding": "4.4% CTR is mediocre for a niche health product — ads may not be compelling enough or keywords too broad"},
                {"id": "G-KW1", "name": "Keyword intent alignment", "severity": "Medium", "result": "FAIL", "finding": "DNA diet is a niche market. 'Bottom of funnel' implies purchase-ready keywords but 2.8% CVR says otherwise"},
                {"id": "G-KW2", "name": "Search volume viability", "severity": "High", "result": "WARNING", "finding": "3,202 impressions in 30 days — very low volume. May be a market size issue, not just targeting"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 35.0,
            "grade": "F",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "WARNING", "finding": "4.4% CTR is below health/wellness benchmark of ~6%. Ad messaging may not resonate"},
                {"id": "G-AD1", "name": "Landing page effectiveness", "severity": "Critical", "result": "FAIL", "finding": "2.8% conversion rate on BOFU traffic is poor — landing page likely needs improvement: clearer value proposition, social proof, pricing"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 25.0,
            "grade": "F",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "FAIL", "finding": "With only 4 conversions/month, smart bidding cannot optimize effectively. Manual CPC or Max Clicks may be more appropriate for data gathering"},
                {"id": "G40", "name": "Data volume for optimization", "severity": "Critical", "result": "FAIL", "finding": "4 conversions/month is far below the 15-30 needed for smart bidding to function. Bidding strategy needs rethinking"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Review search terms immediately — with $316 CPA, likely significant irrelevant traffic from DNA/diet informational queries", "impact": "Critical", "time": "20 min", "check": "G13"},
        {"action": "Add extensive negative keywords: free, what is, how does, reviews, reddit, DIY, test, ancestry, genetics (informational)", "impact": "High", "time": "15 min", "check": "G14"},
        {"action": "Verify conversion tracking — confirm purchases/sign-ups are being tracked, not just page views", "impact": "Critical", "time": "10 min", "check": "G42"},
        {"action": "Review landing page — 2.8% CVR on BOFU traffic needs immediate improvement (pricing clarity, testimonials, CTA)", "impact": "High", "time": "Varies", "check": "G-AD1"},
        {"action": "Add conversion values to enable ROI-based decisions", "impact": "Medium", "time": "10 min", "check": "G49"}
    ],
    recommendations=[
        {"phase": "Phase 1: Diagnose & Fix (Week 1)", "items": [
            "Audit search terms — identify and exclude all informational DNA/diet queries",
            "Verify conversion tracking is properly installed and firing",
            "Improve landing page: clear pricing, testimonials, simple sign-up flow",
            "Consider pausing while landing page is improved if CPA remains above $200"
        ]},
        {"phase": "Phase 2: Test & Learn (Weeks 2-4)", "items": [
            "Test different keyword angles: DNA diet plan, personalized nutrition, genetic diet",
            "Test ad copy variations emphasizing unique DNA-based approach",
            "Switch to Max Clicks to gather more data before using conversion-based bidding",
            "Launch a brand campaign if there's any brand search volume"
        ]},
        {"phase": "Phase 3: Evaluate & Scale (Month 2+)", "items": [
            "If CPA drops below $150, gradually increase budget",
            "Test YouTube/Display for awareness if search volume is limited",
            "Build email nurture sequence for clicks that don't immediately convert",
            "Consider if Google Ads is the right channel — evaluate Meta Ads for interest-based targeting"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 10. MPT Engineering
# ---------------------------------------------------------------------------
mpt_engineering = make_account(
    account="MPT Engineering",
    customer_id="438-541-1329",
    industry="B2B (Engineering services)",
    health_score=62,
    grade="C",
    verdict="Strong conversion efficiency ($45 CPA) for B2B; well-targeted campaign needs structural expansion for growth",
    snapshot={
        "totalCampaigns": None,
        "enabledCampaigns": 1,
        "activeCampaignsWithSpend": 1,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 1208,
        "impressions30d": 3004,
        "clicks30d": 148,
        "ctr": 4.93,
        "avgCpc": 8.16,
        "conversions30d": 27,
        "conversionValue30d": None,
        "roas": None,
        "cpa": 44.74,
        "searchImpressionShare": None,
        "dailyBudget": None,
        "avgDailySpend": 40.27
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 60.0,
            "grade": "C-",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "PASS", "finding": "27 conversions tracked — healthy volume for B2B with $1,208 spend"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "WARNING", "finding": "18.2% conversion rate seems high for B2B — verify that only qualified leads (calls + forms) are Primary, not page views or downloads"},
                {"id": "G49", "name": "Conversion value assignment", "severity": "High", "result": "WARNING", "finding": "No conversion values — B2B engineering contracts vary widely. Even estimated values would help prioritize leads"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 70.0,
            "grade": "B-",
            "checks": [
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "WARNING", "finding": "High-intent keyword campaign — search terms likely well-targeted given 18.2% CVR"},
                {"id": "G14", "name": "Negative keyword lists exist", "severity": "Critical", "result": "WARNING", "finding": "Not verified — engineering terms can attract academic/research traffic"},
                {"id": "G16", "name": "Wasted spend assessment", "severity": "Critical", "result": "PASS", "finding": "$45 CPA for B2B engineering leads is excellent. 18.2% CVR indicates minimal waste"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 45.0,
            "grade": "D",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "PASS", "finding": "CTM prefix with intent level — clear naming"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "WARNING", "finding": "Single campaign — appropriate for budget but limits growth"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "FAIL", "finding": "No brand campaign. If competitors bid on brand terms, they'd steal traffic"},
                {"id": "G06", "name": "PMax present for eligible accounts", "severity": "Medium", "result": "WARNING", "finding": "No PMax — could help with B2B Display/YouTube visibility but data volume (27 conv) is borderline"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 70.0,
            "grade": "B-",
            "checks": [
                {"id": "G20", "name": "Search CTR performance", "severity": "High", "result": "PASS", "finding": "4.93% CTR is good for B2B engineering queries"},
                {"id": "G-KW1", "name": "Keyword targeting", "severity": "Medium", "result": "PASS", "finding": "'High intent keywords' focus is paying off with 18.2% conversion rate — strong keyword selection"},
                {"id": "G-KW2", "name": "Search volume opportunity", "severity": "High", "result": "WARNING", "finding": "3,004 impressions — may be near market saturation for niche B2B or could expand into adjacent terms"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 60.0,
            "grade": "C-",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "PASS", "finding": "4.93% CTR vs ~2.5% B2B benchmark — nearly double the average"},
                {"id": "G-AD1", "name": "Ad freshness", "severity": "Medium", "result": "WARNING", "finding": "Ad creative testing not verified — recommend A/B testing ad copy"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 60.0,
            "grade": "C-",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "WARNING", "finding": "Bidding strategy not verified — with 27 conv/month, Max Conversions would be appropriate"},
                {"id": "G11", "name": "Geographic targeting accuracy", "severity": "High", "result": "WARNING", "finding": "B2B service area targeting not verified"},
                {"id": "G56", "name": "Audience segments applied", "severity": "High", "result": "FAIL", "finding": "No remarketing or in-market B2B audiences applied — missing re-engagement opportunity for long B2B sales cycle"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Verify conversion tracking — 18.2% CVR is high for B2B; confirm only qualified leads are counted as Primary", "impact": "Critical", "time": "15 min", "check": "G47"},
        {"action": "Add estimated conversion values based on average contract sizes to enable value-based bidding", "impact": "High", "time": "15 min", "check": "G49"},
        {"action": "Review search terms — add negatives for academic, research, jobs, salary queries", "impact": "High", "time": "15 min", "check": "G14"},
        {"action": "Launch brand Search campaign for brand protection", "impact": "Medium", "time": "30 min", "check": "G05"},
        {"action": "Add remarketing audiences for site visitors — B2B has long consideration cycles", "impact": "High", "time": "15 min", "check": "G56"}
    ],
    recommendations=[
        {"phase": "Phase 1: Verify & Optimize (Week 1)", "items": [
            "Audit conversion tracking — verify 18.2% CVR is real (not inflated by page views or micro conversions)",
            "Add conversion values for different service types/contract sizes",
            "Review and expand negative keywords for academic/non-commercial intent",
            "Add remarketing audiences for long B2B consideration cycle"
        ]},
        {"phase": "Phase 2: Expand (Weeks 2-3)", "items": [
            "Launch brand Search campaign",
            "Expand keyword coverage into adjacent high-intent engineering service terms",
            "Test phrase match and broad match with Max Conversions bidding",
            "Improve ad extensions with specific engineering capabilities, certifications, case studies"
        ]},
        {"phase": "Phase 3: Scale (Month 2+)", "items": [
            "Increase budget to capture more of the 3,004 impression opportunity",
            "Test PMax with B2B-focused creative for broader visibility",
            "Build Customer Match lists from CRM data for similar audience targeting",
            "Implement offline conversion import to feed actual deal values back to Google Ads"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 11. Yandina Station
# ---------------------------------------------------------------------------
yandina_station = make_account(
    account="Yandina Station",
    customer_id="170-549-2043",
    industry="Travel/Hospitality (Wedding Venues)",
    health_score=60,
    grade="C",
    verdict="Efficient lead generation ($36 CPA) for wedding venue; needs structural expansion and conversion value tracking",
    snapshot={
        "totalCampaigns": None,
        "enabledCampaigns": 1,
        "activeCampaignsWithSpend": 1,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 865,
        "impressions30d": 2566,
        "clicks30d": 290,
        "ctr": 11.30,
        "avgCpc": 2.98,
        "conversions30d": 24,
        "conversionValue30d": None,
        "roas": None,
        "cpa": 36.04,
        "searchImpressionShare": None,
        "dailyBudget": None,
        "avgDailySpend": 28.83
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "PASS", "finding": "24 conversions tracked — good volume for an $865 spend"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "WARNING", "finding": "8.3% CVR and $36 CPA — needs verification that only venue inquiries/calls are Primary"},
                {"id": "G49", "name": "Conversion value assignment", "severity": "High", "result": "FAIL", "finding": "No conversion values — wedding venues have high AOV ($5K-$30K+). Even estimated values would transform bidding strategy"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 72.0,
            "grade": "B-",
            "checks": [
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "WARNING", "finding": "Wedding venue queries are seasonal — terms should be reviewed quarterly"},
                {"id": "G16", "name": "Wasted spend assessment", "severity": "Critical", "result": "PASS", "finding": "$36 CPA and 8.3% CVR is excellent — minimal waste apparent"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 48.0,
            "grade": "D+",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "PASS", "finding": "CTM prefix with service type — clear naming"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "WARNING", "finding": "Single campaign — appropriate for small budget but limits testing"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "FAIL", "finding": "No brand campaign. Wedding couples search by venue name during research — brand terms likely going to PMax or competitors"},
                {"id": "G06", "name": "PMax present for eligible accounts", "severity": "Medium", "result": "FAIL", "finding": "No PMax — wedding venues are highly visual; PMax with venue photos/video tours would be very effective"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 75.0,
            "grade": "B",
            "checks": [
                {"id": "G20", "name": "Search CTR performance", "severity": "High", "result": "PASS", "finding": "11.3% CTR is exceptional — strong keyword-to-ad-to-search intent alignment"},
                {"id": "G-KW1", "name": "Keyword targeting quality", "severity": "Medium", "result": "PASS", "finding": "Wedding venue keywords are well-targeted given the high CTR and CVR"},
                {"id": "G-KW2", "name": "Search volume opportunity", "severity": "High", "result": "WARNING", "finding": "2,566 impressions — may be seasonal. Verify if budget is limiting or market is small"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 60.0,
            "grade": "C-",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "PASS", "finding": "11.3% CTR is outstanding for wedding venue queries (benchmark ~5-7%)"},
                {"id": "G-AD1", "name": "Ad freshness", "severity": "Medium", "result": "WARNING", "finding": "Ad creative testing not verified — seasonal messaging updates recommended for wedding trends"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "WARNING", "finding": "Bidding strategy not verified — with 24 conv/month, Max Conversions would be effective"},
                {"id": "G11", "name": "Geographic targeting accuracy", "severity": "High", "result": "WARNING", "finding": "Yandina Station is location-specific — verify targeting covers relevant source markets for destination weddings"},
                {"id": "G57", "name": "Customer Match lists", "severity": "High", "result": "FAIL", "finding": "No remarketing audiences — couples research venues over weeks/months before deciding"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Add estimated conversion values — wedding venue inquiries lead to $5K-$30K+ bookings. Even $10K average value transforms optimization", "impact": "Critical", "time": "10 min", "check": "G49"},
        {"action": "Build remarketing audiences — wedding couples research for weeks before booking", "impact": "High", "time": "15 min", "check": "G57"},
        {"action": "Launch brand Search campaign — couples search by venue name during shortlisting phase", "impact": "High", "time": "30 min", "check": "G05"},
        {"action": "Verify conversion tracking — confirm inquiries and calls are Primary, not page views", "impact": "High", "time": "10 min", "check": "G47"},
        {"action": "Review search terms for seasonal wedding planning queries to capture", "impact": "Medium", "time": "15 min", "check": "G13"}
    ],
    recommendations=[
        {"phase": "Phase 1: Optimize Current (Week 1)", "items": [
            "Add conversion values — even estimated values based on average wedding booking",
            "Verify conversion tracking — ensure qualified inquiries only",
            "Build remarketing audiences from site visitors (long consideration cycle for weddings)",
            "Launch brand Search campaign"
        ]},
        {"phase": "Phase 2: Expand (Weeks 2-3)", "items": [
            "Launch PMax campaign with stunning venue photography and video tours",
            "Expand keyword coverage: reception venues, outdoor weddings, destination weddings in the area",
            "Add seasonal ad copy for peak engagement/wedding planning seasons",
            "Increase budget if SIS is below 70% — currently well under $30/day"
        ]},
        {"phase": "Phase 3: Scale (Month 2+)", "items": [
            "Test Demand Gen for reaching couples in early planning stages",
            "Partner with wedding planners for Customer Match audience building",
            "Seasonal budget increases during peak engagement season (Dec-Feb, Jun-Jul)",
            "Implement offline conversion tracking when inquiry leads to booking"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 12. Service d'agent Agustine
# ---------------------------------------------------------------------------
service_dagent_agustine = make_account(
    account="Service d'agent Agustine",
    customer_id="442-188-9978",
    industry="Local Service (Austin area)",
    health_score=15,
    grade="F",
    verdict="EMERGENCY: $340 spent with ZERO conversions on PMax — campaign is burning money with no tracking or wrong channel",
    snapshot={
        "totalCampaigns": None,
        "enabledCampaigns": 1,
        "activeCampaignsWithSpend": 1,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 340,
        "impressions30d": 5264,
        "clicks30d": 125,
        "ctr": 2.38,
        "avgCpc": 2.72,
        "conversions30d": 0,
        "conversionValue30d": 0,
        "roas": 0,
        "cpa": None,
        "searchImpressionShare": None,
        "dailyBudget": None,
        "avgDailySpend": 11.33
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 5.0,
            "grade": "F",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "FAIL", "finding": "ZERO conversions from 125 clicks and $340 spend. Conversion tracking is likely broken or not installed"},
                {"id": "G43", "name": "Conversion tracking functional", "severity": "Critical", "result": "FAIL", "finding": "0 conversions strongly suggests no tracking installed. PMax requires conversions to optimize — running blind"},
                {"id": "G-CT2", "name": "Tag firing verification", "severity": "Critical", "result": "FAIL", "finding": "No conversions recorded — must verify tag installation immediately"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 0.0,
            "grade": "F",
            "checks": [
                {"id": "G16", "name": "Wasted spend on irrelevant terms", "severity": "Critical", "result": "FAIL", "finding": "100% of $340 spend is waste — zero conversions. Every dollar generated nothing"},
                {"id": "G13", "name": "PMax search terms", "severity": "Critical", "result": "FAIL", "finding": "PMax search terms not reviewed — with 0 conversions, PMax has no signal to target relevant queries"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 15.0,
            "grade": "F",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "PASS", "finding": "CTM prefix with location — clear naming"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "WARNING", "finding": "Single PMax campaign — but PMax is wrong choice with 0 conversion data"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "FAIL", "finding": "No brand campaign. No search campaign. Only PMax which cannot optimize without conversions"},
                {"id": "G06", "name": "PMax as only campaign", "severity": "Critical", "result": "FAIL", "finding": "PMax requires conversion data to optimize. With 0 conversions, it has no signal and is essentially running random ads"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": None,
            "grade": "N/A",
            "checks": [
                {"id": "G20-G25", "name": "Quality Score checks", "severity": "High", "result": "N/A", "finding": "PMax only — no keyword-level Quality Score available"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 20.0,
            "grade": "F",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "FAIL", "finding": "2.38% CTR on PMax is below average — ad assets may not be compelling"},
                {"id": "G-PM1", "name": "PMax audience signals", "severity": "High", "result": "FAIL", "finding": "With 0 conversions, any audience signals are useless — PMax cannot learn without conversion data"},
                {"id": "G-PM2", "name": "PMax Ad Strength", "severity": "High", "result": "WARNING", "finding": "Asset quality not verified — but irrelevant until conversion tracking is fixed"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 10.0,
            "grade": "F",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "FAIL", "finding": "PMax uses automated bidding but with 0 conversions it has nothing to optimize toward"},
                {"id": "G11", "name": "Geographic targeting accuracy", "severity": "High", "result": "WARNING", "finding": "Austin area targeting — verify service area coverage"},
                {"id": "G39", "name": "Budget efficiency", "severity": "High", "result": "FAIL", "finding": "Even at $11.33/day, this is 100% waste with no conversions"}
            ]
        }
    ],
    quick_wins=[
        {"action": "PAUSE PMax IMMEDIATELY — $340 wasted with 0 conversions. PMax cannot function without conversion data", "impact": "Critical", "time": "1 min", "check": "G16"},
        {"action": "Install conversion tracking — verify tags on website for calls and form submissions", "impact": "Critical", "time": "30 min", "check": "G42"},
        {"action": "When tracking is fixed, START with Search campaign (not PMax) — Search works with low/no conversion data", "impact": "Critical", "time": "30 min", "check": "G06"},
        {"action": "Verify landing page loads correctly and has clear CTA", "impact": "High", "time": "10 min", "check": "G-AD2"}
    ],
    recommendations=[
        {"phase": "Phase 1: STOP THE BLEEDING (Immediate)", "items": [
            "Pause PMax campaign immediately — it cannot optimize with zero conversions",
            "Install and verify conversion tracking (phone calls + form submissions)",
            "Test landing page: load speed, CTA visibility, contact form functionality",
            "Determine exact service offering and target keywords"
        ]},
        {"phase": "Phase 2: Rebuild with Search (Week 1-2)", "items": [
            "Launch a Search campaign (not PMax) with manually chosen high-intent keywords",
            "Use Max Clicks bidding initially to gather conversion data",
            "Set up proper geographic targeting for Austin service area",
            "Build comprehensive negative keyword list"
        ]},
        {"phase": "Phase 3: Evaluate (Month 2+)", "items": [
            "Once Search generates 15+ conversions/month, consider adding PMax",
            "Test LSA if eligible for the service category",
            "Only increase budget once CPA is established and acceptable",
            "Build remarketing audiences from site visitors"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# 13. Kyle_Dynamic Tree Solutions
# ---------------------------------------------------------------------------
kyle_dynamic_tree_solutions = make_account(
    account="Kyle_Dynamic Tree Solutions",
    customer_id="925-454-6290",
    industry="Local Service (Tree Services)",
    health_score=45,
    grade="D",
    verdict="Very early-stage account with minimal spend; $27 CPA is promising but needs more data and structural improvements",
    snapshot={
        "totalCampaigns": None,
        "enabledCampaigns": 2,
        "activeCampaignsWithSpend": 2,
        "totalAdGroups": None,
        "totalKeywords": None,
        "spend30d": 81.78,
        "impressions30d": 580,
        "clicks30d": 13,
        "ctr": 2.24,
        "avgCpc": 6.29,
        "conversions30d": 3,
        "conversionValue30d": None,
        "roas": None,
        "cpa": 27.26,
        "searchImpressionShare": None,
        "dailyBudget": None,
        "avgDailySpend": 6.29
    },
    categories=[
        {
            "name": "Conversion Tracking",
            "weight": "25%",
            "score": 45.0,
            "grade": "D",
            "checks": [
                {"id": "G42", "name": "Conversion actions defined", "severity": "Critical", "result": "PASS", "finding": "3 conversions from 13 clicks (23.1% CVR) — tracking appears functional but very small sample"},
                {"id": "G47", "name": "Micro vs macro separation", "severity": "High", "result": "WARNING", "finding": "23.1% CVR is suspiciously high even for tree services — verify only calls/form fills are Primary"},
                {"id": "G49", "name": "Conversion value assignment", "severity": "High", "result": "WARNING", "finding": "No conversion values — tree service jobs range from $200 to $5,000+. Values would help prioritize"}
            ]
        },
        {
            "name": "Wasted Spend / Negatives",
            "weight": "20%",
            "score": 55.0,
            "grade": "C-",
            "checks": [
                {"id": "G13", "name": "Search term audit recency", "severity": "Critical", "result": "WARNING", "finding": "Very low volume (13 clicks) — sample too small to identify waste patterns"},
                {"id": "G14", "name": "Negative keyword lists exist", "severity": "Critical", "result": "WARNING", "finding": "Tree service queries attract DIY and informational traffic — negatives needed even at low volume"},
                {"id": "G16", "name": "Wasted spend assessment", "severity": "Critical", "result": "PASS", "finding": "$27 CPA is very efficient for tree services. 23.1% CVR (if real) indicates strong targeting"}
            ]
        },
        {
            "name": "Account Structure",
            "weight": "15%",
            "score": 50.0,
            "grade": "D+",
            "checks": [
                {"id": "G01", "name": "Campaign naming convention", "severity": "Medium", "result": "PASS", "finding": "Date-based naming with clear identifiers: [February 3] [Search] [Search Partners] [AI MAX]"},
                {"id": "G04", "name": "Campaign count per objective", "severity": "High", "result": "WARNING", "finding": "2 campaigns with $81.78 total spend — fragmentation risk at very low budget"},
                {"id": "G05", "name": "Brand vs Non-Brand separation", "severity": "Critical", "result": "FAIL", "finding": "No brand campaign. Both campaigns target tree removal non-brand"},
                {"id": "G07", "name": "Search Partners test", "severity": "Medium", "result": "PASS", "finding": "Testing Search Partners vs No Partners — good practice to measure incremental value"},
                {"id": "G12", "name": "AI MAX feature", "severity": "Medium", "result": "WARNING", "finding": "AI MAX enabled on one campaign — automatically expands keywords, which at $81 spend may cause waste"}
            ]
        },
        {
            "name": "Keywords & Quality Score",
            "weight": "15%",
            "score": 35.0,
            "grade": "F",
            "checks": [
                {"id": "G20", "name": "Search CTR performance", "severity": "High", "result": "FAIL", "finding": "2.24% combined CTR is low — AI MAX campaign: 2.08% CTR, No AI campaign: 33.3% CTR (1/3 but tiny sample)"},
                {"id": "G-KW1", "name": "Keyword volume", "severity": "Medium", "result": "FAIL", "finding": "580 total impressions in 30 days — extremely low. Budget or targeting too restrictive"},
                {"id": "G-KW2", "name": "AI MAX impact", "severity": "High", "result": "WARNING", "finding": "AI MAX campaign drives 99.6% of spend ($81.47 vs $0.31) — No AI campaign essentially starved of budget"}
            ]
        },
        {
            "name": "Ads & Assets",
            "weight": "15%",
            "score": 40.0,
            "grade": "D",
            "checks": [
                {"id": "G-AD2", "name": "CTR vs industry benchmark", "severity": "High", "result": "FAIL", "finding": "2.24% CTR vs ~5% tree service benchmark — below average. Ad copy may need improvement"},
                {"id": "G-AD1", "name": "Ad freshness", "severity": "Medium", "result": "WARNING", "finding": "Campaign started February 3 — very new. Need more time to assess performance"}
            ]
        },
        {
            "name": "Settings & Targeting + Bidding",
            "weight": "10%",
            "score": 40.0,
            "grade": "D",
            "checks": [
                {"id": "G36", "name": "Smart bidding strategy active", "severity": "High", "result": "WARNING", "finding": "With only 3 conversions, smart bidding cannot optimize. Max Clicks may be more appropriate at this stage"},
                {"id": "G11", "name": "Geographic targeting accuracy", "severity": "High", "result": "WARNING", "finding": "Tree services are hyperlocal — verify service area radius is appropriate"},
                {"id": "G39", "name": "Budget adequacy", "severity": "High", "result": "FAIL", "finding": "$6.29/day average spend is very low for tree services. Need minimum $20-30/day to gather meaningful data"}
            ]
        }
    ],
    quick_wins=[
        {"action": "Increase daily budget to at least $20-30/day — $6.29/day is insufficient to gather optimization data", "impact": "Critical", "time": "2 min", "check": "G39"},
        {"action": "Consolidate to 1 campaign — at $81.78 total spend, splitting into 2 campaigns fragments data", "impact": "High", "time": "5 min", "check": "G04"},
        {"action": "Verify conversion tracking — 23.1% CVR is high; confirm only legitimate leads are Primary", "impact": "High", "time": "10 min", "check": "G47"},
        {"action": "Improve ad copy — 2.24% CTR is below benchmark. Add specific services, response time, free estimates", "impact": "High", "time": "20 min", "check": "G-AD2"},
        {"action": "Add negative keywords for DIY, rental, cost/price informational queries", "impact": "Medium", "time": "10 min", "check": "G14"}
    ],
    recommendations=[
        {"phase": "Phase 1: Build Foundation (Week 1-2)", "items": [
            "Consolidate to single campaign to aggregate all data",
            "Increase budget to $20-30/day minimum",
            "Verify conversion tracking accuracy",
            "Improve ad copy with specific service callouts and unique selling propositions"
        ]},
        {"phase": "Phase 2: Optimize & Expand (Weeks 3-4)", "items": [
            "Expand keywords beyond just tree removal — add tree trimming, stump grinding, emergency tree service",
            "Use Max Clicks bidding until reaching 15+ conversions/month threshold",
            "Add comprehensive negative keywords",
            "Consider LSA for tree services — often cost-effective for home services"
        ]},
        {"phase": "Phase 3: Scale (Month 2+)", "items": [
            "Once at 15+ conversions/month, switch to Max Conversions bidding",
            "Test geographic expansion if initial service area is performing",
            "Add brand campaign if business develops brand search volume",
            "Build remarketing audiences for seasonal re-engagement (storm season, spring cleanup)"
        ]}
    ]
)


# ---------------------------------------------------------------------------
# Build all accounts list
# ---------------------------------------------------------------------------
ALL_ACCOUNTS = [
    ("stay-loyal", stay_loyal),
    ("skin-spa-new-york", skin_spa_new_york),
    ("the-om-spa", the_om_spa),
    ("odd-fellows-contracting", odd_fellows_contracting),
    ("shanahan-family-law", shanahan_family_law),
    ("costa-rica-waterfall-tours", costa_rica_waterfall_tours),
    ("commercial-madison", commercial_madison),
    ("infinite-roofing", infinite_roofing),
    ("the-dna-diet-club", the_dna_diet_club),
    ("mpt-engineering", mpt_engineering),
    ("yandina-station", yandina_station),
    ("service-dagent-agustine", service_dagent_agustine),
    ("kyle-dynamic-tree-solutions", kyle_dynamic_tree_solutions),
]


def write_audit_files():
    """Write all audit JSON files and update manifest."""
    created = []
    for slug, data in ALL_ACCOUNTS:
        dir_path = BASE_DIR / slug
        dir_path.mkdir(parents=True, exist_ok=True)
        file_path = dir_path / f"{DATE}.json"
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
        created.append(str(file_path))
        print(f"  Created: {file_path}")

    # Build manifest with ALL accounts (including restored-timbers)
    manifest = {
        "accounts": [
            {
                "id": "restored-timbers",
                "name": "Restored Timbers",
                "customerId": "297-444-7695",
                "dates": ["2026-02-16"]
            }
        ],
        "lastUpdated": "2026-02-16T08:00:00+02:00"
    }

    for slug, data in ALL_ACCOUNTS:
        manifest["accounts"].append({
            "id": slug,
            "name": data["account"],
            "customerId": data["customerId"],
            "dates": [DATE]
        })

    manifest_path = BASE_DIR / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\n  Updated: {manifest_path}")
    print(f"\n  Total accounts in manifest: {len(manifest['accounts'])}")

    return created


if __name__ == "__main__":
    print("Generating audit JSON files...\n")
    files = write_audit_files()
    print(f"\nDone! Created {len(files)} audit files.")
