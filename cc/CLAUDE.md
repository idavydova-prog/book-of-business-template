# Book of Business Dashboard

## Purpose

Generate an HTML-based "Book of Business" dashboard for a Commerce Cloud CSM team using live data from Salesforce Org62 (read-only MCP access). The dashboard provides a single-pane view of all accounts assigned to a CSM manager, with compliance validation and risk indicators.

## How to Run

Ask Claude: **"Build the Book of Business dashboard for {Manager Name}"**

Claude will:
1. Query Org62 for all accounts where `CSM_Manager__c` matches the specified manager name
2. Pull Commerce Cloud renewal opportunities (where `Targeted_Clouds__c` contains "Commerce Cloud")
3. Identify active Red Accounts and validate ECOMM Headline hashtags
4. Validate CSG Notes (SEM_Notes__c) against the PACE hashtag taxonomy
5. Generate `data.js` in the manager's folder and create `index.html` if it doesn't exist

To refresh an existing dashboard: **"Refresh the Book of Business dashboard for {Manager Name}"**

## Data Sources (OrgCS + Org62 SOQL)

### CSM/Account Assignments (OrgCS — AUTHORITATIVE SOURCE)

**See `../CLAUDE.md` for the canonical 5-step methodology.** It applies to all clouds (CC, MC, Core).

Summary: Leader Resource → `cssf_Manager_IDs__c` for direct reports → Engagements (`csc__Playbook__c`) for accounts → deduplicate shared assignments → use final list for Org62 queries.

### Accounts (Org62 — for account details after assignment is determined)
```sql
SELECT Id, Name, CSM_lookup__c, CSM_Manager__c, Success_Segment__c, Region__c
FROM Account
WHERE Name IN ({account names from OrgCS})
AND Region__c = 'AMER'
```
- **Region filter:** Always include `Region__c = 'AMER'` to scope to AMER PACE OU. This excludes any accounts accidentally tagged to the manager from other regions.

### Commerce Cloud Renewal Opportunities
```sql
SELECT Id, Name, CloseDate, Amount, Forecasted_Attrition__c, SEM_Notes__c, Targeted_Clouds__c, StageName
FROM Opportunity
WHERE AccountId IN ({account_ids})
AND Targeted_Clouds__c INCLUDES ('Commerce Cloud')
AND StageName IN ('01 Initiate','02 Assess Risk','03 Renewal Proposal','02 Negotiate')
```
- **Prior ACV:** The `Prior_Annual_Contract_Value__c` field on the active CC renewal opportunity = Prior Annual Contract Value. For accounts with multiple active CC renewals, sum all `Prior_Annual_Contract_Value__c` values. Store as `priorAcv` (integer) in data.js. Display formatted: $14.9M, $1.4M, $140K, etc. NOTE: Do NOT use `Amount` — that field is often $0 on renewals.
- **Targeted_Clouds__c** is a multipicklist — must use `INCLUDES` not `LIKE`

### Fallback Renewal (Cross-Cloud Accounts)

If an account has NO Commerce Cloud renewal but DOES have an active renewal for another cloud, use that renewal instead. This ensures cross-cloud accounts still show renewal dates, ACV, CSG compliance, and attrition data.

```sql
SELECT Id, Name, CloseDate, Forecasted_Attrition__c, SEM_Notes__c, Targeted_Clouds__c, StageName, Prior_Annual_Contract_Value__c
FROM Opportunity
WHERE AccountId IN ({account_ids_without_cc_renewal})
AND StageName IN ('01 Initiate','02 Assess Risk','03 Renewal Proposal','02 Negotiate')
ORDER BY Prior_Annual_Contract_Value__c DESC
LIMIT 50
```

For each account, pick the renewal with the highest `Prior_Annual_Contract_Value__c`. Store normally in data.js but add `hasCC: false` to flag it as a non-native-cloud renewal. The dashboard will display an asterisk (*) next to the account name so the manager knows this account's renewal is for a different cloud.

### Red Accounts
```sql
SELECT Id, Name, ECOMM_Headline__c, Account_Status__c, Action_Plan_Status__c, Stage__c, LastModifiedDate
FROM Red_Account__c
WHERE Name LIKE '{Account Name}%'
AND Account_Status__c = '5 - Active Opportunity'
AND Stage__c != 'Invalid'
AND Action_Plan_Status__c != 'Resolved'
```
- **Stage filter:** Red Accounts where `Stage__c = 'Invalid'` must NOT be displayed on the dashboard. Exclude them from the `ra` array in data.js.
- **Resolved filter:** Red Accounts where `Action_Plan_Status__c = 'Resolved'` must NOT be displayed. These are closed/resolved and no longer actionable.
- **Freshness:** Store `LastModifiedDate` as `lastModified` (ISO date string) in the RA object in data.js.

### GMV/PPO Utilization (Entitlement Schedules)
```sql
SELECT sfbase__Entitlement__r.sfbase__Account__r.Name,
       sfbase__Entitlement__r.sfbase__EntitlementName__c,
       sfbase__Allowance__c, Usage__c,
       sfbase__StartDate__c, sfbase__EndDate__c
FROM sfbase__EntitlementSchedule__c
WHERE sfbase__Entitlement__r.sfbase__Account__r.CSM_Manager__c = '{Manager Name}'
AND sfbase__Entitlement__r.sfbase__EntitlementName__c LIKE '%GMV%'
AND sfbase__Entitlement__r.Status__c = 'Active'
```
- **GMV entitlement names:** "Commerce Cloud - Digital - GMV", "Commerce Cloud B2C - GMV", "B2C Commerce - Growth - GMV", "B2C Commerce - Starter - GMV"
- **PPO entitlement:** "Commerce Cloud - Digital - PPO" (order-based pricing, not dollar GMV)
- **PPO query:** Same as above but with `= 'Commerce Cloud - Digital - PPO'` instead of `LIKE '%GMV%'`
- **Usage__c** is stored as a NEGATIVE number — convert to positive for display
- **Projection formula:** `current_pct * (total_contract_days / elapsed_days)`
- Accounts without a CC entitlement get `gmv: null` (show "—")
- **GMV vs PPO visual distinction:** PPO accounts display a small gray "PPO" label inline next to the percentage (e.g., "7% →24% PPO"). GMV accounts show no label. Tooltip also uses "orders" as unit for PPO vs "$M" for GMV.

### Products (from Targeted_Clouds__c on renewal opportunities)
The `Targeted_Clouds__c` multi-select picklist on the renewal opportunity contains the product list. Parse semicolon-separated values. Common values: "Commerce Cloud", "Core", "MC ExactTarget", "B2B Commerce", "Tableau", "Order Management", "Datorama", "Integration Cloud", "Salesforce Maps", "Own", "Slack", "Pardot", "PredictSpring".

### Account Team Members (for Cloud CSM identification)
```sql
SELECT UserId, User.Name, TeamMemberRole
FROM AccountTeamMember
WHERE AccountId = '{account_id}'
```

## Dashboard Structure

### Summary Cards (computed dynamically)
- Total Accounts
- Total CSMs
- Accounts with Active Red Accounts
- Declining Health count
- Renewals This Quarter (Salesforce fiscal calendar: Q starts Feb/May/Aug/Nov)
- GMV <30% Util (accounts under 30% utilization)

### Tabs
1. **By CSM** — Grouped by CSM name with account count per group; dropdown filter to isolate one CSM
2. **By Renewal Date** — Sorted by Close Date (earliest first)
3. **By Risk** — Sections: Red Accounts, Declining Health, CSG Compliance Issues, RA Hashtag Issues
4. **All Accounts** — Alphabetical
5. **Analysis** — Auto-injected KPI panels, compliance bars, coaching insights (see Analysis Tab section below)

### Columns per Account
| Column | Source |
|--------|--------|
| Account Name | Hyperlinked to renewal opportunity in Org62 |
| Prior ACV | `Opportunity.Prior_Annual_Contract_Value__c` on the active CC renewal opportunity. Display as $XM/$XK. For accounts with multiple CC renewals, sum all values. Accounts without an active CC renewal show "—". |
| Health | `Account.Success_Segment__c` (system-generated) |
| Red Account | Colored dots (red = active, orange = precautionary), each linking to RA record |
| RA Hashtag Compliance | Validates ECOMM_Headline__c against valid play hashtags |
| Products | Official Salesforce product SVG icons (inline); fallback abbreviation dots for products without icons |
| GMV Utilization | Dual-layer bar: actual % (solid) + projected end-of-contract % (translucent). Color: green <50%, orange 50-80%, red >80% |
| CC Renewal Date | `Opportunity.CloseDate` |
| Forecasted Attrition | `Opportunity.Forecasted_Attrition__c` (negative = at risk) |
| CSG Compliance | Validates `SEM_Notes__c` against PACE hashtag taxonomy |

## Compliance Rules

### CSG Notes (Renewal Opportunity — SEM_Notes__c field)

**Required hashtags on all license renewals:**
- `#LicNoAttrit` / `#LicPartialAttrit` / `#LicFullAttrit`

**Required hashtags on Signature renewals:**
- `#SigRisk` / `#NoSigRisk` / `#SigAttrit` / `#NoSigAttrit`

**If a Red Account exists for the account:**
- `#RA` must be present in CSG Notes (with shortened URL to the RA)

**Invalid hashtags (common mistakes):**
- `#NoAttrit` — not a valid hashtag; must use `#LicNoAttrit`
- `#NoSigAttrit` — must use `#NoSigRisk` or `#SigAttrit`

**Format:** `(Date) (CSM Name) (#hashtags) (short comment)`

### Red Account ECOMM Headline (Red_Account__c.ECOMM_Headline__c)

**Valid play hashtags (offensive plays):**
- `#SIGTRIAL` — Signature Trial
- `#ARI` — ARI play
- `#SWAP` — Swap program
- `#IMPLEMENT` — Active implementation in progress
- `#ADOPT` — Adoption of shelfware
- `#RFP` — Open RFP / competitive situation
- `#REVIVE` — Top 100 Tableau attrition

**Invalid/non-standard (commonly seen but NOT valid):**
- `#PRECAUTIONARY`, `#AgFStage4`, `#LOST`, `#DCCAP`, `#nonactionable`

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
- **Health colors:** Strong = green, Moderate = blue, Declining = red, Unassigned = gray italic
- **Renewal dates:** Red if within 60 days, orange if within current fiscal quarter
- **Attrition amounts:** Red + bold if negative
- **Red Account dots:** Red = active/resolution in progress, Orange = precautionary
- **Products:** Official Salesforce SVG icons (22px inline) for: Commerce Cloud, Marketing Cloud, Sales Cloud (Core), Tableau, Slack, Integration Cloud (MuleSoft), Service Cloud. Colored abbreviation dots (20px) as fallback for: B2B Commerce, Order Management, Datorama, Maps, Own, Pardot, PredictSpring
- **GMV Utilization:** Dual-layer progress bar — solid bar for actual %, translucent bar for projected end-of-contract %. Colors: green (<50%), orange (50–80%), red (>80%). Shows "X% → Y%" text. PPO (order-based) accounts included alongside GMV accounts. Null for non-CC accounts.
- **CSM Filter:** Dropdown in "By CSM" tab to filter by individual CSM
- **Print-friendly:** All tabs visible, tooltips hidden

## Account Groupings

Some customers have multiple Org62 accounts (parent/child). These must stay visually grouped:
- Parent account renders normally
- Child accounts are indented with a `└` character
- When sorting/filtering, children always follow their parent
- Only include child accounts that have `CSM_Manager__c` matching the same manager — child accounts with null or different CSM_Manager are NOT part of the portfolio
- Verify parent/child relationships via: `SELECT Id, Name FROM Account WHERE ParentId IN ({portfolio_account_ids}) AND CSM_Manager__c = '{Manager Name}'`

## Key Org62 Fields

| Field | Object | Notes |
|-------|--------|-------|
| `CSM_Manager__c` | Account | TEXT field (not lookup) — stores manager's full name |
| `CSM_lookup__c` | Account | Lookup to User — the Lead CSM |
| `Success_Segment__c` | Account | Health indicator (Strong/Moderate/Declining/Unassigned) |
| `Prior_Annual_Contract_Value__c` | Opportunity | Prior ACV — the dollar value on the active CC renewal opportunity (NOT `Amount`, which is often $0) |
| `SEM_Notes__c` | Opportunity | CSG Notes field (contains hashtags) |
| `Targeted_Clouds__c` | Opportunity | Multi-select picklist of clouds on the renewal |
| `Forecasted_Attrition__c` | Opportunity | Predicted attrition $ (negative = loss) |
| `ECOMM_Headline__c` | Red_Account__c | Short headline with play hashtag |
| `Account_Status__c` | Red_Account__c | "5 - Active Opportunity" = currently open |
| `Action_Plan_Status__c` | Red_Account__c | Precautionary, New, Resolution in Progress, etc. |
| `Stage__c` | Red_Account__c | Must NOT be "Invalid" — exclude Invalid-stage RAs from dashboard |

## Product Icons

Official Salesforce SVG icons are embedded inline (22px) for recognized products. Source: `https://wp.sfdcdigital.com/en-us/wp-content/uploads/sites/4/2024/06/icon-{product}.svg`

| Product | Icon Available | Fallback |
|---------|---------------|----------|
| Commerce Cloud | Yes (green cart) | — |
| MC ExactTarget | Yes (orange person/search) | — |
| Core / Sales Cloud | Yes (teal chart) | — |
| Tableau | Yes (multicolor crosses) | — |
| Slack | Yes (4-color hashtag) | — |
| Integration Cloud / MuleSoft | Yes (blue circle M) | — |
| Service Cloud | Yes (pink heart/pin) | — |
| B2B Commerce | No | Dot "B2B" #0d9488 |
| Order Management | No | Dot "OM" #1b3a5c |
| Datorama | No | Dot "DT" #d97706 |
| Salesforce Maps | No | Dot "MP" #059669 |
| Own | No | Dot "OW" #374151 |
| Pardot | No | Dot "PA" #0891b2 |
| PredictSpring | No | Dot "PS" #db2777 |

Products are sorted with Commerce Cloud first; all others follow in original order.

## Analysis Tab (5th Tab — Auto-Injected)

The Analysis tab is rendered dynamically by `shared/dashboard.js` — no HTML edits needed per manager. It provides:

### KPI Panels
1. **CSG Compliance by CSM** — horizontal bar per CSM (first name displayed), color-coded by rate. Clickable: navigates to "By CSM" tab with that CSM pre-selected.
2. **Health Distribution** — Strong/Invest/Moderate/Declining/Unassigned breakdown.
3. **GMV Utilization Bands** — <30% (Low), 30–60% (On Track), 60%+ (High).
4. **Top Compliance Failures** — most common CSG Notes compliance issues ranked by frequency.
5. **Prior ACV by CSM** — bars showing ACV concentration per CSM. Clickable (same behavior as #1).
6. **Renewal Timeline** — accounts grouped by renewal proximity (This Quarter, Next 6mo, 6–12mo, 12+mo) with aggregated ACV.

### Summary Strip (top of Analysis tab)
- CSG Compliance % (of all accounts)
- RA Hashtag Compliance % — shows "N/A — No active Red Accounts" when no RAs exist; shows fraction (e.g., "3/5 RAs compliant") when RAs are present. Never shows a misleading 100% for zero RAs.
- Total Prior ACV
- Forecasted Attrition (red if negative)
- Accounts with Red Accounts count

### Coaching & Risk Insights (auto-generated)
Dynamically computed insight cards:
- Missing CSG Notes (blank entries by CSM)
- Low compliance rate CSMs (<70%)
- Red Account without #RA in CSG Notes
- High-ACV accounts with low GMV (<30%)
- Unassigned health accounts
- Forecasted attrition exposure
- 100% compliance recognition

### Design Rules
- CSM names display as **first name only** in bar labels
- CSM bar rows are **clickable** — clicking navigates to the "By CSM" tab with that CSM selected in the dropdown filter
- All analysis is computed from the `accounts` array in `data.js` — no additional data sources needed

## Resources Section (Home Page)

The home page (`index.html`) has a "Quick References" section below the manager cards with three utility cards:

| Resource | File | Description |
|----------|------|-------------|
| Hashtag Guide | `resources/hashtag-guide.html` | Valid/invalid hashtags for CSG Notes and RA ECOMM Headlines |
| CSG Notes Format | `resources/csg-notes-format.html` | Step-by-step template and examples for SEM_Notes__c |
| URL Shortener | `resources/url-shortener.html` | How to use sfdc.co for Red Account links in notes |

Resources are self-contained HTML pages in the `resources/` folder, styled with SLDS. Each has a back arrow to the home page.

## Multi-Manager Support

Each CSM manager gets their own subfolder (e.g., `Stephanie Hansen/index.html`). The root `index.html` is the primary manager's dashboard. All dashboards share the same structure, features, and SOQL queries — only the `CSM_Manager__c` filter value changes.

## Architecture

```
book-of-business/cc/
├── index.html                  # Home page — manager cards + resource cards
├── CLAUDE.md                   # This file
├── shared/
│   ├── styles.css              # All dashboard styles (including Analysis tab)
│   ├── dashboard.js            # Rendering logic, tab navigation, Analysis tab injection
│   ├── icons.js                # Product SVG icons and fallback definitions
│   └── shell.html              # Reference HTML template for new managers
├── resources/
│   ├── hashtag-guide.html      # PACE hashtag reference
│   ├── csg-notes-format.html   # CSG Notes formatting guide
│   └── url-shortener.html      # sfdc.co URL shortener instructions
├── Ilona Davydova/
│   ├── index.html              # Thin HTML shell (header + table structure)
│   ├── data.js                 # Account data array + dashboardConfig + slackDMs + csmOrder
│   ├── history.js              # Utilization history (appended on each refresh)
│   └── nudges.js              # Nudge log placeholder
├── Stephanie Hansen/
│   ├── index.html
│   ├── data.js
│   ├── history.js
│   └── nudges.js
├── Joreal Whitfield/
│   ├── index.html
│   ├── data.js
│   ├── history.js
│   └── nudges.js
└── Victor Hugo Bustamante/
    ├── index.html
    ├── data.js
    ├── history.js
    └── nudges.js
```

- **Shared CSS/JS:** All visual and behavioral logic lives in `shared/`. Adding features (like the Analysis tab) only requires editing `shared/dashboard.js` and `shared/styles.css` — changes propagate to all dashboards automatically.
- **Per-manager files:** Each manager folder has a thin `index.html` shell (copy from `shared/shell.html`) and a `data.js` with the account array. The shell references `../shared/` resources.
- **Adding a new manager:** Copy `shared/shell.html` to `NewManager/index.html`, update the header text, create `data.js` with queried data, and add a card to the home page `index.html`.

## Output

Open any `index.html` by dragging to a browser window (Dock icon).

## Utilization History (Trend Tracking)

Each manager folder contains a `history.js` file that accumulates utilization snapshots over time:

```javascript
const utilizationHistory = [
  { date: "2026-06-01", snapshots: [{ name: "Account Name", pct: 12 }, ...] },
  { date: "2026-06-15", snapshots: [{ name: "Account Name", pct: 18 }, ...] },
  { date: "2026-06-22", snapshots: [{ name: "Account Name", pct: 24 }, ...] }
];
```

**On each refresh:** Append a new entry to `utilizationHistory` with the current date and each account's utilization percentage. Do NOT overwrite previous entries — the array grows over time to enable trend visualization.

**Data accumulates over time.** Trend visualization is planned but not yet implemented — the history data is collected for future use.

## CSM Workload Distribution (Analysis Tab)

A new panel in the Analysis tab shows accounts per CSM as horizontal bars:
- Sorted by account count (highest first)
- Shows average accounts and ACV per CSM
- Flags imbalance: "▲ heavy" when CSM has >1.5x the average, "▽ light" when <0.5x
- Clickable — navigates to By CSM tab with that CSM selected

## Last Refreshed Timestamp

The header displays a "Last refreshed: {date}" line derived from `dashboardConfig.asOf`. This tells anyone opening the dashboard whether they're looking at today's data or last week's.

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

## Refreshing Data

**Single cloud/manager:**
Ask Claude: **"Refresh the Book of Business dashboard for {Manager Name}"**

**All dashboards at once (recommended):**
Ask Claude: **"Refresh all dashboards"** — this runs the `refresh-all-dashboards` workflow at `~/.claude/workflows/refresh-all-dashboards.js` which fans out one agent per manager (16 total across CC/MC/Tableau/Core) in parallel, then pushes to GitHub Pages.

**Scheduled refresh:**
A daily cron job runs at 8:00 AM local time to refresh all dashboards automatically. This is configured as a durable scheduled task in Claude Code. The cron auto-expires after 7 days and must be renewed, or replaced with a GitHub Action for permanent scheduling.

**Efficiency tips for agents:**
- Batch Red Account queries using OR conditions on Name (not one query per account)
- Use SOQL `IN` clauses for Account IDs when pulling opportunities
- Do not query accounts one at a time — always batch

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
