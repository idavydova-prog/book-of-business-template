# Book of Business — Core Dashboard

## Purpose

Generate an HTML-based "Book of Business" dashboard for the Core CSM team using live data from Salesforce Org62 (read-only MCP access). The dashboard provides a single-pane view of all accounts assigned to a CSM manager, with compliance validation, utilization tracking, and risk indicators.

## How to Run

**Single manager:**
Ask Claude: **"Build the Core Book of Business dashboard for {Manager Name}"**

**Refresh one manager:**
Ask Claude: **"Refresh the Core Book of Business dashboard for {Manager Name}"**

**Refresh all managers at once:**
Ask Claude: **"Refresh all Core Book of Business dashboards"**
Claude will query all managers listed on the home page in parallel and rebuild each data.js.

Claude will:
1. Query Org62 for all accounts where `CSM_Manager__c` matches the specified manager name
2. Pull Core renewal opportunities (where `Targeted_Clouds__c` contains "Core")
3. Identify active Red Accounts and validate ECOMM Headline hashtags
4. Pull entitlement data for utilization tracking (varied entitlement types)
5. Validate CSG Notes (SEM_Notes__c) against the PACE hashtag taxonomy
6. Generate `data.js` in the manager's folder and create `index.html` if it doesn't exist
7. Update the home page manager card (account/CSM counts)

## CSM/Account Assignments (OrgCS — AUTHORITATIVE SOURCE)

**See `../CLAUDE.md` for the canonical 5-step methodology.** It applies to all clouds (CC, MC, Core).

Summary: Leader Resource → `cssf_Manager_IDs__c` for direct reports → Engagements (`csc__Playbook__c`) for accounts → deduplicate shared assignments → use final list for Org62 queries.

## Data Sources (Org62 SOQL)

### Accounts
The account list comes from OrgCS (above). Use Org62 only for account metadata:
```sql
SELECT Id, Name, CSM_lookup__r.Name, Success_Segment__c, Region__c
FROM Account
WHERE Name = '{Account Name from OrgCS}'
AND Region__c = 'AMER'
```
- **Region filter:** Always include `Region__c = 'AMER'` to scope to AMER PACE OU.
- **Manager names:** 'Molly Ross (SM)', 'Tyrone Green', 'Avani Damboise', 'Rick Gyan'

### Core Renewal Opportunities
```sql
SELECT Id, Name, CloseDate, Amount, Forecasted_Attrition__c, SEM_Notes__c, Targeted_Clouds__c, StageName, AccountId, Account.Name
FROM Opportunity
WHERE AccountId IN ({account_ids})
AND Targeted_Clouds__c INCLUDES ('Core')
AND StageName IN ('01 Initiate','02 Assess Risk','03 Renewal Proposal','02 Negotiate')
```
- **Prior ACV:** The `Prior_Annual_Contract_Value__c` field on the active Core renewal opportunity = Prior Annual Contract Value. NOTE: Do NOT use `Amount` — that field is often $0 on renewals.
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
- **Resolved filter:** Red Accounts where `Action_Plan_Status__c = 'Resolved'` must NOT be displayed. These are closed/resolved and no longer actionable.
- **Freshness:** Store `LastModifiedDate` as `lastModified` (ISO date string) in the RA object in data.js.
- **Status mapping:** `Action_Plan_Status__c` of "Resolution in Progress", "New", "Plan Under Development" = `status: "active"` (red dot). `Action_Plan_Status__c` of "Precautionary" = `status: "precautionary"` (orange dot).

### Core Utilization — Entitlements (Varied Types)

Core does not have a single unified metric like Super Messages (MC) or GMV (Commerce Cloud). Instead, Core accounts may have one or more of the following entitlement types:

| Entitlement | Unit | Notes |
|-------------|------|-------|
| Data Services Credits | credits | Data integration/processing credits |
| Einstein Requests | requests | AI/Einstein feature consumption |
| Data Storage | GB | Storage consumption |
| API Manager Calls | calls | API gateway usage |
| Mule Flows | flows | MuleSoft integration flows |
| Platform Events | events | Event bus consumption |
| Sandbox Licenses | licenses | Dev/test sandbox entitlements |
| Custom Objects | objects | Schema limits |
| Login Credits | logins | Portal/community login entitlements |

**Query:**
```sql
SELECT sfbase__Entitlement__r.sfbase__Account__r.Name,
       sfbase__Entitlement__r.sfbase__EntitlementName__c,
       sfbase__Allowance__c, Usage__c,
       sfbase__StartDate__c, sfbase__EndDate__c
FROM sfbase__EntitlementSchedule__c
WHERE sfbase__Entitlement__r.sfbase__Account__r.CSM_Manager__c = '{Manager Name}'
AND sfbase__Entitlement__r.Status__c = 'Active'
```

**Selection logic when multiple entitlements exist for one account:**
Pick the entitlement with the highest dollar relevance (largest allowance multiplied by complexity). In practice, priority order: Data Services Credits > Einstein Requests > API Manager Calls > Mule Flows > Data Storage > Platform Events > others.

**Calculation rules:**
- **Usage__c** is stored as a NEGATIVE number — convert to positive: `Math.abs(Usage__c)`
- **Percentage**: `Math.round(used / allowance * 100)`
- **Projection formula:** `current_pct * (total_contract_days / elapsed_days)`
- Accounts without any active entitlement get `sends: null` (display "—" in the Core Util column)

### Products (from Targeted_Clouds__c on renewal opportunities)
Parse semicolon-separated values. Common values: "Core", "Sales Cloud", "Service Cloud", "Integration Cloud", "Tableau", "Slack", "MuleSoft", "Data Cloud", "Einstein", "Shield".

## Dashboard Structure

### Summary Cards (computed dynamically)
- Total Accounts
- Total CSMs
- Accounts with Active Red Accounts
- Declining Health count
- Renewals This Quarter
- Low Util (accounts under 30% entitlement utilization)

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
| Prior ACV | `Opportunity.Prior_Annual_Contract_Value__c` on the active Core renewal | Display as $XM/$XK |
| Health | `Account.Success_Segment__c` | |
| Red Account | Colored dots (red = active, orange = precautionary) | |
| RA Hashtag Compliance | Validates ECOMM_Headline__c against valid play hashtags | |
| Products | Official Salesforce SVG icons (22px inline) | Core sorted first |
| Core Util | Dual-layer bar: actual % + projected % | Based on primary entitlement; tooltip shows which |
| Core Renewal Date | `Opportunity.CloseDate` | Red if within 60 days |
| Forecasted Attrition | `Opportunity.Forecasted_Attrition__c` | |
| CSG Compliance | Validates `SEM_Notes__c` against PACE hashtag taxonomy | |

## Core Util Column

The "Core Util" column displays the primary entitlement utilization as a visual progress bar.

**Tooltip:** Shows the specific entitlement name (e.g., "Data Services Credits"), allowance, usage, projected %, and contract end date.

**Bar layers:**
- Solid fill = actual consumption to date
- Translucent overlay = projected end-of-contract utilization

**Color thresholds:**
- Green: <50% projected
- Orange: 50-80% projected
- Red: >80% projected

**Null state:** Accounts without an active entitlement show "—"

## Compliance Rules

### CSG Notes (Renewal Opportunity — SEM_Notes__c field)

Same PACE compliance rules as MC/CC:

**Required hashtags on all license renewals:**
- `#LicNoAttrit` / `#LicPartialAttrit` / `#LicFullAttrit`

**Required hashtags on Signature renewals:**
- `#SigRisk` / `#NoSigRisk` / `#SigAttrit` / `#NoSigAttrit`

**If a Red Account exists:**
- `#RA` must be present in CSG Notes

### Red Account ECOMM Headline (Red_Account__c.ECOMM_Headline__c)

**Valid play hashtags:**
- `#SIGTRIAL` `#ARI` `#SWAP` `#IMPLEMENT` `#ADOPT` `#RFP` `#REVIVE`

## Freshness Validation

Both CSG Notes and Red Account records must be actively maintained. The dashboard displays freshness indicators based on how recently each was updated.

### CSG Notes Freshness
- **Source:** Parse the most recent date from the SEM_Notes__c text (CSMs prefix updates with dates like "06/18/26", "6/1/2026", "06.18.2026")
- **Store as:** `csgNotesDate` field in data.js (ISO date string, e.g., "2026-06-18")
- **Thresholds:**
  - Green (fresh): updated within 14 days of `dashboardConfig.asOf`
  - Orange (aging): 15–21 days since last update
  - Red (stale): >21 days since last update — needs immediate attention

### Red Account Freshness
- **Source:** `LastModifiedDate` on the Red_Account__c record
- **Store as:** `lastModified` field in each RA object in data.js (ISO date string)
- **Thresholds:** Same as CSG Notes (green ≤14d, orange 15–21d, red >21d)

### Visual Indicators
- Small colored dot next to CSG Compliance column: green/orange/red based on `csgNotesDate`
- Small colored dot next to RA column: green/orange/red based on most recent `lastModified` across all RAs for that account
- Tooltip shows the actual date and "X days ago"
- Analysis tab coaching insight: "X accounts have stale CSG Notes (>3 weeks)" and "X Red Accounts not updated in >3 weeks"

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

## Visual Design

- **Framework:** Salesforce Lightning Design System (SLDS) via CDN
- **Header:** `#032d60` background, white text
- **Home page icon:** Teal/blue Core icon (Sales Cloud chart SVG)
- **Products:** Core sorted first in product dots
- **Utilization bar:** Same dual-layer design as MC (solid actual + translucent projected)
- **Column headers:** "Core Util", "Core Renewal"

## Architecture

```
book-of-business/core/
├── index.html                  # Home page — manager cards + resource cards
├── CLAUDE.md                   # This file (Core-specific)
├── shared/
│   ├── styles.css              # All dashboard styles
│   ├── dashboard.js            # Core-adapted rendering
│   ├── icons.js                # Product SVG icons and fallback definitions
│   └── shell.html              # Reference HTML template for new managers
├── resources/
│   ├── hashtag-guide.html      # PACE hashtag reference
│   ├── csg-notes-format.html   # CSG Notes formatting guide
│   └── url-shortener.html      # sfdc.co URL shortener instructions
└── {Manager Name}/
    ├── index.html              # Thin HTML shell (header, tabs, script refs)
    ├── data.js                 # Account data array + dashboardConfig + slackDMs + csmOrder
    ├── history.js              # Utilization history (appended on each refresh)
    └── nudges.js              # Nudge log placeholder
```

## Utilization History (Trend Tracking)

Each manager folder contains a `history.js` file that accumulates utilization snapshots over time:

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
                raReason: "#ARI"
            }
        ],
        products: ["Core", "Service Cloud", "Slack"],
        link: "https://org62.lightning.force.com/...",
        renewalDate: "2027-01-30",
        renewalAmount: -500000,
        renewalAmountDisplay: "-$500,000",
        compliance: "pass",
        complianceReason: "#LicNoAttrit #NoSigRisk",
        csgNotes: "full SEM_Notes__c text",

        // Primary utilization metric (whichever entitlement is most relevant)
        sends: {
            allowance: 5000000,
            contractStart: "2024-03-01",
            used: 2100000,
            pct: 42,
            entitlement: "Data Services Credits",
            contractEnd: "2027-02-28"
        },

        group: null,
        groupRole: null
    }
];
```

## Key Differences from MC Dashboard

| Aspect | Marketing Cloud | Core |
|--------|----------------|------|
| Cloud filter | `INCLUDES ('MC ExactTarget')` | `INCLUDES ('Core')` |
| Utilization metric | Super Messages (single unified) | Varied (Data Credits, Einstein, API, etc.) |
| Entitlement selection | Always Super Messages | Pick highest-relevance from available |
| Product sort priority | MC ExactTarget first | Core first |
| Column header | "MC Util" / "MC Renewal" | "Core Util" / "Core Renewal" |
| Summary card | "Sends <30% Util" | "Low Util" |
| Home icon color | Orange (#f59e0b) | Teal (#04e1cb) |
| Subtitle | "Marketing Cloud CSM Team" | "Core CSM Team" |
| Manager names | Justin Warren, Rian Tydeman, Ross McGeehin, Tina Warchol | Molly Ross (SM), Tyrone Green, Avani Damboise |

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
3. Update the header text (manager name, account/CSM count)
4. Query Org62 and create `data.js`
5. Add a card to the home page `index.html` managers array

## Refreshing Data

**Single manager:** "Refresh the Core Book of Business dashboard for {Manager Name}"

**All dashboards at once:** "Refresh all dashboards" — runs the `refresh-all-dashboards` workflow at `~/.claude/workflows/refresh-all-dashboards.js` (fans out one agent per manager across all clouds in parallel, then pushes to GitHub Pages).

**Scheduled:** Daily at 8:00 AM via Claude Code cron (auto-expires after 7 days; to be replaced with GitHub Action).

## Output

Open any `index.html` by dragging to a browser window (Dock icon).

## Do NOT Rules (Lessons Learned)

### Health Column — REMOVED
The Health column (`Success_Segment__c`) has been permanently removed from the dashboard. Do NOT:
- Add a `<th>` for Health in any `index.html` file
- Render a Health `<td>` in `renderRow()`
- Include Health Distribution in the Analysis tab summary cards
- Include "Declining Health" counts in summary cards or By Risk sections
- Reference `acct.health` in any rendering logic

The `health` field still exists in `data.js` for potential future use, but it must NOT be displayed anywhere in the UI.

### RA Hashtag Column — Must Show Labels
The RA Hashtag compliance column must display **"✓ Pass" / "✗ Fail"** labels (not just bare ✓/✗ icons). This matches the CSG Compliance column style. The `renderRACompliance()` function must use the same label pattern as `renderCompliance()`.

### Clipboard API — Requires Fallback for file:// Protocol
`navigator.clipboard.writeText()` silently fails on the `file://` protocol (no error thrown, the `.then()` simply never fires). The nudge system's "Copy & Open Slack" button must use this pattern:
```javascript
if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).then(afterCopy).catch(() => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = msg;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        afterCopy();
    });
} else {
    // same textarea fallback for browsers without clipboard API
}
```

### Prior ACV Field — Use Prior_Annual_Contract_Value__c, NOT Amount
The correct field for Prior ACV is `Prior_Annual_Contract_Value__c` on the Opportunity. Do NOT use `Amount` — it is often $0 on renewal opportunities even when Prior ACV is populated. This caused widespread empty Prior ACV columns across all dashboards.

### Nav Back Buttons — Use position: absolute
When adding a "← Home" back button to a sticky nav bar, do NOT use `margin-right: auto` (this pushes the tab buttons off-center). Instead use:
```css
.nav-back {
    position: absolute;
    left: 1.5rem;
    top: 50%;
    transform: translateY(-50%);
}
```
Note: `position: sticky` already acts as a containing block for absolutely-positioned children — do NOT add a redundant `position: relative` after it (last declaration wins and breaks the sticky).
