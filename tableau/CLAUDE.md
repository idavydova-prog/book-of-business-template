# Book of Business — Tableau Dashboard

## Purpose

Generate an HTML-based "Book of Business" dashboard for the Tableau CSM team using live data from Salesforce Org62 (read-only MCP access). The dashboard provides a single-pane view of all accounts assigned to a CSM manager, with compliance validation, utilization tracking, and risk indicators.

## How to Run

**Single manager:**
Ask Claude: **"Build the Tableau Book of Business dashboard for {Manager Name}"**

**Refresh one manager:**
Ask Claude: **"Refresh the Tableau Book of Business dashboard for {Manager Name}"**

**Refresh all managers at once:**
Ask Claude: **"Refresh all Tableau Book of Business dashboards"**
Claude will query all managers listed on the home page in parallel and rebuild each data.js.

Claude will:
1. Query Org62 for all accounts where `CSM_Manager__c` matches the specified manager name
2. Pull Tableau renewal opportunities (where `Targeted_Clouds__c` contains "Tableau")
3. Identify active Red Accounts and validate ECOMM Headline hashtags
4. Pull Analytical Impressions entitlement data for utilization tracking
5. Validate CSG Notes (SEM_Notes__c) against the PACE hashtag taxonomy
6. Generate `data.js` in the manager's folder and create `index.html` if it doesn't exist
7. Update the home page manager card (account/CSM counts)

## Data Sources (Org62 SOQL)

### Accounts
```sql
SELECT Id, Name, CSM_lookup__r.Name, Success_Segment__c, Region__c
FROM Account
WHERE CSM_Manager__c = '{Manager Name}'
AND Region__c = 'AMER'
```
- **Region filter:** Always include `Region__c = 'AMER'` to scope to AMER PACE OU.
- **Manager names:** 'Jack Marshall', 'Jamie Kovarna', 'Devna Webster', 'Kandace Ballard'

### Tableau Renewal Opportunities
```sql
SELECT Id, Name, CloseDate, Amount, Forecasted_Attrition__c, SEM_Notes__c, Targeted_Clouds__c, StageName, AccountId, Account.Name
FROM Opportunity
WHERE AccountId IN ({account_ids})
AND Targeted_Clouds__c INCLUDES ('Tableau')
AND StageName IN ('01 Initiate','02 Assess Risk','03 Renewal Proposal','02 Negotiate')
```
- **Prior ACV:** The `Amount` field on the active Tableau renewal opportunity = Prior Annual Contract Value.
- **Targeted_Clouds__c** is a multipicklist — must use `INCLUDES` not `LIKE`

### Red Accounts
```sql
SELECT Id, Name, ECOMM_Headline__c, Account_Status__c, Action_Plan_Status__c, Stage__c, LastModifiedDate
FROM Red_Account__c
WHERE Name LIKE '{Account Name}%'
AND Account_Status__c = '5 - Active Opportunity'
AND Stage__c IN ('Open','Precautionary','Triage')
AND Action_Plan_Status__c != 'Resolved'
```
- **Stage filter:** Only include RAs where `Stage__c` is Open, Precautionary, or Triage. Exclude Invalid.
- **Resolved filter:** Red Accounts where `Action_Plan_Status__c = 'Resolved'` must NOT be displayed.
- **Freshness:** Store `LastModifiedDate` as `lastModified` (ISO date string) in the RA object in data.js.
- **Status mapping:** `Action_Plan_Status__c` of "Resolution in Progress", "New", "Plan Under Development" = `status: "active"` (red dot). `Action_Plan_Status__c` of "Precautionary" = `status: "precautionary"` (orange dot).

### Tableau Utilization — Analytical Impressions (Primary Metric)

Tableau uses **Analytical Impressions** as the primary utilization metric. This measures how actively customers are consuming their Tableau Cloud dashboards and visualizations.

**What is an Analytical Impression?**
An Analytical Impression is counted each time a Tableau dashboard view is rendered for a user. It encompasses:
- Dashboard loads (initial and refresh)
- Scheduled subscription deliveries
- Embedded analytics views
- Mobile app dashboard views

**Why it matters for CSMs:**
- **Low utilization (<30%)** signals adoption risk — customers not leveraging their Tableau investment
- **High utilization (>80%)** signals engagement success or potential capacity planning needs
- **Zero usage** accounts are immediate attrition risks at renewal

```sql
SELECT sfbase__Entitlement__r.sfbase__Account__r.Name,
       sfbase__Entitlement__r.sfbase__EntitlementName__c,
       sfbase__Allowance__c, Usage__c,
       sfbase__StartDate__c, sfbase__EndDate__c
FROM sfbase__EntitlementSchedule__c
WHERE sfbase__Entitlement__r.sfbase__Account__r.CSM_Manager__c = '{Manager Name}'
AND sfbase__Entitlement__r.sfbase__EntitlementName__c = 'Analytical Impressions'
AND sfbase__Entitlement__r.Status__c = 'Active'
```

**Calculation rules:**
- **Usage__c** is stored as a NEGATIVE number — convert to positive: `Math.abs(Usage__c)`
- **Percentage**: `Math.round(used / allowance * 100)`
- **Projection formula:** `current_pct * (total_contract_days / elapsed_days)`
- Accounts without an Analytical Impressions entitlement get `sends: null` (display "—" in the Tableau Util column)

### Products (from Targeted_Clouds__c on renewal opportunities)
Parse semicolon-separated values. Common values: "Tableau", "Core", "Sales Cloud", "Service Cloud", "Slack", "MuleSoft", "Data Cloud", "Einstein".

## Dashboard Structure

### Summary Cards (computed dynamically)
- Total Accounts
- Total CSMs
- Accounts with Active Red Accounts
- Declining Health count
- Renewals This Quarter
- Low Util (accounts under 30% Analytical Impressions utilization)

### Tabs
1. **By CSM** — Grouped by CSM name with account count per group; dropdown filter
2. **By Renewal Date** — Sorted by Close Date (earliest first)
3. **By Risk** — Sections: Red Accounts, Declining Health, CSG Compliance Issues, RA Hashtag Issues
4. **All Accounts** — Alphabetical
5. **Analysis** — Auto-injected KPI panels, compliance bars, coaching insights

### Columns per Account
| Column | Source | Notes |
|--------|--------|-------|
| Account Name | Hyperlinked to renewal opportunity in Org62 | |
| Prior ACV | `Opportunity.Amount` on the active Tableau renewal | Display as $XM/$XK |
| Health | `Account.Success_Segment__c` | |
| Red Account | Colored dots (red = active, orange = precautionary) | |
| RA Hashtag Compliance | Validates ECOMM_Headline__c against valid play hashtags | |
| Products | Official Salesforce SVG icons (22px inline) | Tableau sorted first |
| Tableau Util | Dual-layer bar: actual % + projected % | Based on Analytical Impressions |
| Tableau Renewal Date | `Opportunity.CloseDate` | Red if within 60 days |
| Forecasted Attrition | `Opportunity.Forecasted_Attrition__c` | |
| CSG Compliance | Validates `SEM_Notes__c` against PACE hashtag taxonomy | |

## Tableau Util Column

The "Tableau Util" column displays Analytical Impressions utilization as a visual progress bar.

**Bar layers:**
- Solid fill = actual consumption to date
- Translucent overlay = projected end-of-contract utilization

**Color thresholds:**
- Green: <50% projected
- Orange: 50-80% projected
- Red: >80% projected

**Null state:** Accounts without an active Analytical Impressions entitlement show "—"

## Compliance Rules

### CSG Notes (Renewal Opportunity — SEM_Notes__c field)

Same PACE compliance rules as all other clouds:

**Required hashtags on all license renewals:**
- `#LicNoAttrit` / `#LicPartialAttrit` / `#LicFullAttrit`

**Required hashtags on Signature renewals:**
- `#SigRisk` / `#NoSigRisk` / `#SigAttrit` / `#NoSigAttrit`

**If a Red Account exists:**
- `#RA` must be present in CSG Notes

### Red Account ECOMM Headline (Red_Account__c.ECOMM_Headline__c)

**Valid play hashtags:**
- `#SIGTRIAL` `#ARI` `#SWAP` `#IMPLEMENT` `#ADOPT` `#RFP` `#REVIVE`

## Context Signals (Analysis Tab — Coaching Insights)

The Analysis tab surfaces contextual mismatches between Red Account play hashtags and CSG Notes content. These are not compliance failures — they are coaching conversation starters for 1:1s.

### Rules

| RA Play Hashtag | CSG Notes Hashtag | Signal |
|-----------------|-------------------|--------|
| `#RFP` | `#LicNoAttrit` | RFP active (competitive situation) but no attrition forecasted — verify with CSM |
| `#SIGTRIAL` | `#NoSigRisk` | Signature Trial active but no Signature risk noted — verify risk assessment |

### Behavior
- Displayed in the Analysis tab under "Context Signals" as orange coaching-style insights
- NOT shown as inline compliance failures (no red flags in the table)
- Only triggered when both conditions are true simultaneously (active RA with the play hashtag AND the corresponding CSG Notes hashtag present)
- Intent: prompt managers to confirm the CSM's assessment is intentional, not accidental

## Freshness Validation

Both CSG Notes and Red Account records must be actively maintained.

### CSG Notes Freshness
- **Source:** Parse the most recent date from the SEM_Notes__c text
- **Store as:** `csgNotesDate` field in data.js (ISO date string)
- **Thresholds:** Green ≤14d, Orange 15–21d, Red >21d

### Red Account Freshness
- **Source:** `LastModifiedDate` on the Red_Account__c record
- **Store as:** `lastModified` field in each RA object in data.js
- **Thresholds:** Same as CSG Notes

## Visual Design

- **Framework:** Salesforce Lightning Design System (SLDS) via CDN
- **Header:** `#032d60` background, white text
- **Home page icon:** Purple (#7c3aed) Tableau crosses SVG
- **Products:** Tableau sorted first in product dots
- **Utilization bar:** Same dual-layer design as other clouds
- **Column headers:** "Tableau Util", "Tableau Renewal"

## Architecture

```
book-of-business/tableau/
├── index.html                  # Home page — manager cards + resource cards
├── CLAUDE.md                   # This file (Tableau-specific)
├── shared/
│   ├── styles.css              # All dashboard styles
│   ├── dashboard.js            # Tableau-adapted rendering
│   ├── icons.js                # Product SVG icons and fallback definitions
│   └── shell.html              # Reference HTML template for new managers
├── resources/
│   ├── hashtag-guide.html      # PACE hashtag reference
│   ├── csg-notes-format.html   # CSG Notes formatting guide
│   └── url-shortener.html      # sfdc.co URL shortener instructions
└── {Manager Name}/
    ├── index.html              # Thin HTML shell
    ├── data.js                 # Account data array + dashboardConfig + slackDMs + csmOrder
    ├── history.js              # Utilization history (appended on each refresh)
    └── nudges.js              # Nudge log placeholder
```

## Utilization History (Trend Tracking)

Each manager folder contains a `history.js` file that accumulates Analytical Impressions utilization snapshots over time:

```javascript
const utilizationHistory = [
  { date: "2026-06-01", snapshots: [{ name: "Account Name", pct: 12 }, ...] },
  { date: "2026-06-15", snapshots: [{ name: "Account Name", pct: 18 }, ...] }
];
```

**On each refresh:** Append a new entry to `utilizationHistory` with the current date and each account's `sends.pct`. Do NOT overwrite previous entries.

**Data accumulates over time.** Trend visualization is planned but not yet implemented — the history data is collected for future use.

## CSM Workload Distribution (Analysis Tab)

Shows accounts per CSM as horizontal bars with imbalance flags ("▲ heavy" / "▽ light"). Clickable — navigates to By CSM tab.

## Last Refreshed Timestamp

Header displays "Last refreshed: {date}" from `dashboardConfig.asOf`.

## data.js Format

```javascript
const dashboardConfig = {
    asOf: '2026-06-22',
    fqStart: '2026-05-01',
    fqEnd: '2026-07-31'
};

const csmOrder = ["First Last", ...];

const accounts = [
    {
        name: "Account Name",
        csm: "CSM Full Name",
        priorAcv: 1234567,
        health: "Moderate",
        ra: [
            {
                id: "a4Ved...",
                headline: "ECOMM Headline text",
                status: "active",
                raCompliance: "pass",
                raReason: "#RFP",
                lastModified: "2026-06-15"
            }
        ],
        products: ["Tableau", "Core", "Slack"],
        link: "https://org62.lightning.force.com/...",
        renewalDate: "2027-01-30",
        renewalAmount: -500000,
        renewalAmountDisplay: "-$500,000",
        compliance: "pass",
        complianceReason: "#LicNoAttrit #NoSigRisk",
        csgNotes: "full SEM_Notes__c text",
        csgNotesDate: "2026-06-18",
        sends: {
            allowance: 250000,
            contractStart: "2025-07-01",
            used: 25178,
            pct: 10,
            entitlement: "Analytical Impressions",
            contractEnd: "2026-06-30"
        },
        group: null,
        groupRole: null
    }
];
```

## Key Differences from Other Cloud Dashboards

| Aspect | Commerce Cloud | Marketing Cloud | Core | Tableau |
|--------|---------------|-----------------|------|---------|
| Cloud filter | `Commerce Cloud` | `MC ExactTarget` | `Core` | `Tableau` |
| Utilization metric | GMV / PPO | Super Messages | Varied (Data Credits, etc.) | Analytical Impressions |
| Entitlement name | Various GMV | Super Messages - excluding SMS/MMS | Varies by account | Analytical Impressions |
| Product sort priority | Commerce Cloud first | MC ExactTarget first | Core first | Tableau first |
| Column header | "GMV Util" | "MC Util" | "Core Util" | "Tableau Util" |
| Home icon color | Blue (#0176d3) | Orange (#f59e0b) | Teal (#04e1cb) | Purple (#7c3aed) |
| Manager names | Ilona Davydova, etc. | Justin Warren, etc. | Molly Ross, etc. | Jack Marshall, Jamie Kovarna, Devna Webster, Kandace Ballard |

## Compliance Nudge System

Each manager dashboard has a built-in nudge system for notifying CSMs about compliance failures via Slack DM.

### How It Works

1. **Clickable failures:** Any ✗ in the CSG Compliance or RA Hashtag column has a dotted red underline and is clickable
2. **Modal popup:** Clicking opens a modal showing a pre-written message for that CSM about that specific account, with Org62 links and the Hashtag Guide
3. **"Copy & Open Slack":** Copies the message to clipboard and opens the CSM's Slack DM conversation
4. **"Sent" badge:** After sending, a green "Sent MM/DD" badge appears next to the ✗ (stored in localStorage, tied to current `asOf` date)
5. **Auto-reset:** When `dashboardConfig.asOf` changes on next refresh, badges clear — if the issue persists, you can nudge again

### Per-Manager Files

- **`nudges.js`** — placeholder file (nudge tracking uses localStorage, not this file)
- **`slackDMs` in `data.js`** — maps CSM names to Slack DM channel IDs (format: `D06JAAW22U9`)

### Discovering Slack DM Channel IDs

DM channel IDs are NOT the same as Slack user IDs. To discover them, use the Slack MCP to create a draft message to a user ID — the API response includes the actual DM channel ID. Store these in the `slackDMs` map.

### Triggering Bulk Nudges via Claude Code

Ask: **"Send compliance nudges for {Manager Name}'s team"**

Claude will:
1. Scan the manager's `data.js` for compliance failures
2. Group failures by CSM
3. Look up each CSM's Slack user ID
4. Create Slack drafts in each CSM's DM (via MCP)
5. You review drafts in Slack and send with one click

## Adding a New Manager

1. Create folder: `{Manager Name}/`
2. Copy `shared/shell.html` to `{Manager Name}/index.html`
3. Update header text
4. Query Org62 and create `data.js`
5. Add a card to the home page `index.html` managers array

## Refreshing Data

**Single manager:** "Refresh the Tableau Book of Business dashboard for {Manager Name}"

**All dashboards at once:** "Refresh all dashboards" — runs the `refresh-all-dashboards` workflow at `~/.claude/workflows/refresh-all-dashboards.js` (fans out one agent per manager across all clouds in parallel, then pushes to GitHub Pages).

**Scheduled:** Daily at 8:00 AM via Claude Code cron (auto-expires after 7 days; to be replaced with GitHub Action).

## Output

Open any `index.html` by dragging to a browser window (Dock icon).
