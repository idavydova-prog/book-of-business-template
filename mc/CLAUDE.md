# Book of Business — Marketing Cloud Dashboard

## Purpose

Generate an HTML-based "Book of Business" dashboard for a Marketing Cloud CSM team using live data from Salesforce Org62 (read-only MCP access). The dashboard provides a single-pane view of all accounts assigned to a CSM manager, with compliance validation, utilization tracking, and risk indicators.

## How to Run

**Single manager:**
Ask Claude: **"Build the MC Book of Business dashboard for {Manager Name}"**

**Refresh one manager:**
Ask Claude: **"Refresh the MC Book of Business dashboard for {Manager Name}"**

**Refresh all managers at once:**
Ask Claude: **"Refresh all MC Book of Business dashboards"**
Claude will query all managers listed on the home page in parallel and rebuild each data.js.

Claude will:
1. Query Org62 for all accounts where `CSM_Manager__c` matches the specified manager name
2. Pull Marketing Cloud renewal opportunities (where `Targeted_Clouds__c` contains "MC ExactTarget")
3. Identify active Red Accounts and validate ECOMM Headline hashtags
4. Pull Super Messages entitlements for utilization tracking
5. Pull Contacts entitlements for secondary metric
6. Validate CSG Notes (SEM_Notes__c) against the PACE hashtag taxonomy
7. Generate `data.js` in the manager's folder and create `index.html` if it doesn't exist
8. Update the home page manager card (account/CSM counts)

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
- **Region filter:** Always include `Region__c = 'AMER'` to scope to AMER PACE OU. This excludes any accounts accidentally tagged to the manager from other regions.

### Marketing Cloud Renewal Opportunities
```sql
SELECT Id, Name, CloseDate, Amount, Forecasted_Attrition__c, SEM_Notes__c, Targeted_Clouds__c, StageName, AccountId, Account.Name
FROM Opportunity
WHERE AccountId IN ({account_ids})
AND Targeted_Clouds__c INCLUDES ('MC ExactTarget')
AND StageName IN ('01 Initiate','02 Assess Risk','03 Renewal Proposal','02 Negotiate')
```
- **Prior ACV:** The `Prior_Annual_Contract_Value__c` field on the active MC renewal opportunity = Prior Annual Contract Value. For accounts with multiple active MC renewals, sum all `Prior_Annual_Contract_Value__c` values. Store as `priorAcv` (integer) in data.js. Display formatted: $14.9M, $1.4M, $140K, etc. Accounts without an active MC renewal show "—". NOTE: Do NOT use `Amount` — that field is often $0 on renewals.
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
- **Stage filter:** Red Accounts where `Stage__c = 'Invalid'` must NOT be displayed on the dashboard. Only include RAs where `Stage__c` is Open, Precautionary, or Triage (active stages).
- **Resolved filter:** Red Accounts where `Action_Plan_Status__c = 'Resolved'` must NOT be displayed. These are closed/resolved and no longer actionable.
- **Freshness:** Store `LastModifiedDate` as `lastModified` (ISO date string) in the RA object in data.js.
- **Status mapping:** `Action_Plan_Status__c` of "Resolution in Progress", "New", "Plan Under Development" = `status: "active"` (red dot). `Action_Plan_Status__c` of "Precautionary" = `status: "precautionary"` (orange dot).

### MC Utilization — Super Messages (Primary Metric)

Marketing Cloud uses **Super Messages** as the primary utilization metric. This is fundamentally different from Commerce Cloud's GMV.

**What is a Super Message?**
A Super Message is the unit of measurement for Marketing Cloud message sends. It encompasses all outbound messages including:
- Email sends
- Push notifications
- In-app messages
- Journey-triggered messages

It explicitly **excludes** SMS/MMS (those are tracked on a separate entitlement).

**Why it matters for CSMs:**
- **Low utilization (<30%)** signals adoption risk — the customer is not getting value from what they purchased, which makes attrition more likely at renewal
- **High utilization (>80%)** signals overage risk — customer may hit limits before contract end, creating billing friction or requiring an early renewal discussion
- **Projected end-of-contract %** helps identify accounts that will run out of messages before their contract ends

```sql
SELECT sfbase__Entitlement__r.sfbase__Account__r.Name,
       sfbase__Entitlement__r.sfbase__EntitlementName__c,
       sfbase__Allowance__c, Usage__c,
       sfbase__StartDate__c, sfbase__EndDate__c
FROM sfbase__EntitlementSchedule__c
WHERE sfbase__Entitlement__r.sfbase__Account__r.CSM_Manager__c = '{Manager Name}'
AND sfbase__Entitlement__r.sfbase__EntitlementName__c = 'Super Messages - excluding SMS/MMS'
AND sfbase__Entitlement__r.Status__c = 'Active'
```

**MC entitlement types (observed in data):**
| Entitlement | Unit | Priority | Dashboard Role |
|-------------|------|----------|----------------|
| Super Messages - excluding SMS/MMS | messages (billions) | **Primary** | Utilization bar in MC Util column |
| Enterprise Plus Edition Contacts | contacts | Secondary | Tooltip + over-100% risk signal |
| Enterprise Edition Contacts | contacts | Secondary | Tooltip + over-100% risk signal |
| Corporate Edition Contacts | contacts | Secondary | Tooltip + over-100% risk signal |
| SMS/MMS Mobile Messages | messages | Tertiary | "SMS" label if present |
| Unique Visitors | visitors | Informational | Not displayed |
| Named Profiles - Premium | profiles | Informational | Not displayed |
| Personalization Credits | credits | Informational | Not displayed |

**Calculation rules:**
- **Usage__c** is stored as a NEGATIVE number — convert to positive: `Math.abs(Usage__c)`
- **Percentage**: `Math.round(used / allowance * 100)`
- **Projection formula:** `current_pct * (total_contract_days / elapsed_days)` — extrapolates current pace to end of contract
- Multiple entitlement schedules for the same account: sum `sfbase__Allowance__c` and sum `Math.abs(Usage__c)` across all active schedules for that account
- Accounts without a Super Messages entitlement get `sends: null` (display "—" in the MC Util column)

### Contacts Entitlement (Secondary Metric)

```sql
SELECT sfbase__Entitlement__r.sfbase__Account__r.Name,
       sfbase__Entitlement__r.sfbase__EntitlementName__c,
       sfbase__Allowance__c, Usage__c,
       sfbase__StartDate__c, sfbase__EndDate__c
FROM sfbase__EntitlementSchedule__c
WHERE sfbase__Entitlement__r.sfbase__Account__r.CSM_Manager__c = '{Manager Name}'
AND sfbase__Entitlement__r.sfbase__EntitlementName__c LIKE '%Contacts%'
AND sfbase__Entitlement__r.Status__c = 'Active'
```
- Store contacts data in the `contacts` field of each account (for tooltip display)
- Over-100% contacts utilization is a compliance/pricing risk signal
- Multiple contacts entitlements for the same account: sum allowances and usages

### Products (from Targeted_Clouds__c on renewal opportunities)
The `Targeted_Clouds__c` multi-select picklist on the renewal opportunity contains the product list. Parse semicolon-separated values. Common values: "MC ExactTarget", "Datorama", "Core", "Commerce Cloud", "B2B Commerce", "Tableau", "Integration Cloud", "Order Management", "Slack", "Pardot", "Own".

## Dashboard Structure

### Summary Cards (computed dynamically)
- Total Accounts
- Total CSMs
- Accounts with Active Red Accounts
- Declining Health count
- Renewals This Quarter (Salesforce fiscal calendar: Q starts Feb/May/Aug/Nov)
- Sends <30% Util (accounts under 30% Super Messages utilization)

### Tabs
1. **By CSM** — Grouped by CSM name with account count per group; dropdown filter to isolate one CSM
2. **By Renewal Date** — Sorted by Close Date (earliest first)
3. **By Risk** — Sections: Red Accounts, Declining Health, CSG Compliance Issues, RA Hashtag Issues
4. **All Accounts** — Alphabetical
5. **Analysis** — Auto-injected KPI panels, compliance bars, coaching insights

### Columns per Account
| Column | Source | Notes |
|--------|--------|-------|
| Account Name | Hyperlinked to renewal opportunity in Org62 | |
| Prior ACV | `Opportunity.Amount` on the active MC renewal opportunity | Display as $XM/$XK |
| Health | `Account.Success_Segment__c` (system-generated) | |
| Red Account | Colored dots (red = active, orange = precautionary) | Each links to RA record in Org62 |
| RA Hashtag Compliance | Validates ECOMM_Headline__c against valid play hashtags | |
| Products | Official Salesforce SVG icons (22px inline) | MC ExactTarget sorted first |
| MC Util | Dual-layer bar: actual % (solid) + projected % (translucent) | Based on Super Messages; see "MC Utilization" section above |
| MC Renewal Date | `Opportunity.CloseDate` | Red if within 60 days, orange if within current FQ |
| Forecasted Attrition | `Opportunity.Forecasted_Attrition__c` | Negative = at risk (displayed in red + bold) |
| CSG Compliance | Validates `SEM_Notes__c` against PACE hashtag taxonomy | |

## MC Util Column — Detailed Explanation

The "MC Util" column displays Super Messages utilization as a visual progress bar:

**Bar layers:**
- Solid fill = actual consumption to date (messages sent / total contracted allowance)
- Translucent overlay = projected end-of-contract utilization based on current daily send rate

**Color thresholds:**
- Green: <50% projected utilization (healthy — on track)
- Orange: 50-80% projected (watch — may over-consume)
- Red: >80% projected (action needed — likely to exceed before contract end)

**Text display:** Shows "X% → Y%" where X = actual, Y = projected

**Null state:** Accounts without an active Super Messages entitlement show "—"

**Why this matters to leadership:**
- Low utilization clusters suggest adoption coaching opportunities
- High utilization clusters suggest upsell/early renewal conversations
- Utilization trends correlate with renewal outcomes: accounts under 30% attrit at higher rates

## Compliance Rules

### CSG Notes (Renewal Opportunity — SEM_Notes__c field)

**Required hashtags on all license renewals:**
- `#LicNoAttrit` / `#LicPartialAttrit` / `#LicFullAttrit`

**Required hashtags on Signature renewals:**
- `#SigRisk` / `#NoSigRisk` / `#SigAttrit` / `#NoSigAttrit`

**If a Red Account exists for the account:**
- `#RA` must be present in CSG Notes (with shortened URL to the RA)

**Invalid hashtags (common mistakes):**
- `#NoAttrit` — not valid; must use `#LicNoAttrit`
- `#NoSigAttrit` — must use `#NoSigRisk` or `#SigAttrit`
- `#FullAttritRisk` — not valid; must use `#LicFullAttrit`
- `#FullAttrit` — not valid; must use `#LicFullAttrit`
- `#Signature` — not valid risk hashtag; use `#SigRisk` or `#NoSigRisk`
- `#Attrit` — not valid; must use `#LicPartialAttrit` or `#LicFullAttrit`
- `#PartialAttrition` — not valid; must use `#LicPartialAttrit`
- `#PartialAttrit` — not valid; must use `#LicPartialAttrit`
- `#RedAcct` — not valid; must use `#RA`
- `#SigTrial` — not valid as a risk hashtag in CSG Notes (valid only as RA play hashtag `#SIGTRIAL`)
- `@LicNoAttrit` — not valid (must use # not @)

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
- `#PRECAUTIONARY`, `#AgFStage4`, `#LOST`, `#DCCAP`, `#nonactionable`, `#KMOD`, `#MAP`, `#january`

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
- **Health colors:** Strong = green, Moderate = blue, Declining = red, Adopt = teal, Unassigned = gray italic
- **Renewal dates:** Red if within 60 days, orange if within current fiscal quarter
- **Attrition amounts:** Red + bold if negative
- **Red Account dots:** Red = active/resolution in progress, Orange = precautionary
- **Products:** Official Salesforce SVG icons (22px inline) for recognized products. MC ExactTarget sorted first.
- **MC Utilization bar:** Dual-layer progress bar — solid bar for actual %, translucent bar for projected end-of-contract %. Colors: green (<50%), orange (50-80%), red (>80%). Shows "X% → Y%" text. Based on Super Messages entitlement.
- **CSM Filter:** Dropdown in "By CSM" tab to filter by individual CSM
- **Print-friendly:** All tabs visible, tooltips hidden

## Key Org62 Fields

| Field | Object | Notes |
|-------|--------|-------|
| `CSM_Manager__c` | Account | TEXT field (not lookup) — stores manager's full name |
| `CSM_lookup__c` / `CSM_lookup__r.Name` | Account | Lookup to User — the Lead CSM |
| `Success_Segment__c` | Account | Health indicator (Strong/Moderate/Declining/Adopt/Unassigned) |
| `Prior_Annual_Contract_Value__c` | Opportunity | Prior ACV — the dollar value on the active MC renewal opportunity (NOT `Amount`, which is often $0) |
| `SEM_Notes__c` | Opportunity | CSG Notes field (contains hashtags) |
| `Targeted_Clouds__c` | Opportunity | Multi-select picklist of clouds on the renewal |
| `Forecasted_Attrition__c` | Opportunity | Predicted attrition $ (negative = loss) |
| `ECOMM_Headline__c` | Red_Account__c | Short headline with play hashtag |
| `Account_Status__c` | Red_Account__c | "5 - Active Opportunity" = currently open |
| `Action_Plan_Status__c` | Red_Account__c | Precautionary, New, Resolution in Progress, etc. |
| `Stage__c` | Red_Account__c | Must be in Open/Precautionary/Triage — exclude Invalid |
| `sfbase__Allowance__c` | EntitlementSchedule | Contracted allowance (Super Messages or Contacts) |
| `Usage__c` | EntitlementSchedule | Usage (stored as negative — convert with Math.abs) |
| `sfbase__StartDate__c` | EntitlementSchedule | Contract period start |
| `sfbase__EndDate__c` | EntitlementSchedule | Contract period end |

## Analysis Tab (5th Tab — Auto-Injected)

The Analysis tab is rendered dynamically by `shared/dashboard.js` — no HTML edits needed per manager. It provides:

### KPI Panels
1. **CSG Compliance by CSM** — horizontal bar per CSM (first name displayed), color-coded by rate. Clickable: navigates to "By CSM" tab with that CSM pre-selected.
2. **Health Distribution** — Strong/Invest/Moderate/Declining/Unassigned breakdown.
3. **Sends Utilization Bands** — <30% (Low), 30-60% (On Track), 60%+ (High).
4. **Top Compliance Failures** — most common CSG Notes compliance issues ranked by frequency.
5. **Prior ACV by CSM** — bars showing ACV concentration per CSM. Clickable.
6. **Renewal Timeline** — accounts grouped by renewal proximity with aggregated ACV.

### Summary Strip
- CSG Compliance %
- RA Hashtag Compliance % — "N/A" when no RAs exist; shows fraction when RAs are present
- Total Prior ACV
- Forecasted Attrition
- Accounts with Red Accounts count

### Design Rules
- CSM names display as **first name only** in bar labels
- CSM bar rows are **clickable** — navigates to By CSM tab with that CSM selected
- All analysis computed from `data.js` — no additional data sources needed

## Resources Section (Home Page)

Same three reference documents as Commerce Cloud (shared PACE rules):
| Resource | File | Description |
|----------|------|-------------|
| Hashtag Guide | `resources/hashtag-guide.html` | Valid/invalid hashtags for CSG Notes and RA ECOMM Headlines |
| CSG Notes Format | `resources/csg-notes-format.html` | Step-by-step template and examples for SEM_Notes__c |
| URL Shortener | `resources/url-shortener.html` | How to use sfdc.co for Red Account links in notes |

## Architecture

```
book-of-business/mc/
├── index.html                  # Home page — manager cards + resource cards
├── CLAUDE.md                   # This file (MC-specific)
├── shared/
│   ├── styles.css              # All dashboard styles
│   ├── dashboard.js            # MC-adapted rendering (sends instead of GMV)
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

## data.js Format (MC-specific fields)

```javascript
const dashboardConfig = {
    asOf: '2026-06-21',        // date data was pulled (update on refresh)
    fqStart: '2026-05-01',    // current fiscal quarter start
    fqEnd: '2026-07-31'       // current fiscal quarter end
};

const csmOrder = ["First Last", ...];  // alphabetical CSM list

const accounts = [
    {
        name: "Account Name",
        csm: "CSM Full Name",
        priorAcv: 1234567,              // integer (sum of MC renewal Amounts)
        health: "Moderate",             // or "Strong","Declining","Adopt",null
        ra: [                           // array of Red Account objects
            {
                id: "a4Ved...",
                headline: "ECOMM Headline text",
                status: "active",       // or "precautionary"
                raCompliance: "pass",   // or "fail"
                raReason: "#ARI"        // why pass/fail
            }
        ],
        products: ["MC ExactTarget", "Datorama"],
        hasCC: false,
        link: "https://org62.lightning.force.com/...",  // renewal opty link
        renewalDate: "2027-01-30",      // or null if no renewal
        renewalAmount: -1779214,        // Forecasted_Attrition__c
        renewalAmountDisplay: "-$1,779,214",
        compliance: "pass",             // or "fail"
        complianceReason: "#LicFullAttrit #SigRisk #RA",
        csgNotes: "full SEM_Notes__c text",

        // Primary utilization metric: Super Messages
        sends: {
            allowance: 2076705000,      // total Super Messages allowance
            contractStart: "2024-01-31",
            used: 1510399456,           // already converted to positive
            pct: 73,                    // Math.round(used / allowance * 100)
            entitlement: "Super Messages - excluding SMS/MMS",
            contractEnd: "2027-01-30"
        },

        // Secondary metric (for tooltip display)
        contacts: {
            allowance: 66935000,
            used: 62792366,
            pct: 94,
            entitlement: "Corporate Edition Contacts",
            contractEnd: "2027-01-30"
        },

        group: null,                    // for grouped accounts (parent/child)
        groupRole: null
    }
];
```

## Multi-Manager Support

Each CSM manager gets their own subfolder. The root `index.html` is the home page with cards for each manager. All dashboards share the same structure — only the `CSM_Manager__c` filter value changes.

## Adding a New Manager

1. Create folder: `{Manager Name}/`
2. Copy `shared/shell.html` to `{Manager Name}/index.html`
3. Update the header text (manager name, account/CSM count)
4. Change column header from "GMV Util" to "MC Util" in the shell
5. Query Org62 and create `data.js` with the queried data
6. Add a card to the home page `index.html` managers array

## Removing a Manager

1. Delete the manager's folder
2. Remove their entry from the `managers` array in `index.html`

## Output

Open any `index.html` by dragging to a browser window (Dock icon).

## Validation Checks (Run After Build)

After building or refreshing a dashboard, verify:
1. **Account count matches** — number of accounts in data.js equals what Org62 returns
2. **CSM count matches** — unique CSMs in data matches csmOrder length
3. **No duplicate accounts** — same account shouldn't appear twice
4. **Renewal dates present** — every account with an active renewal has a renewalDate
5. **Sends data integrity** — pct = Math.round(used/allowance*100) for each account
6. **RA compliance** — every RA with no valid play hashtag is marked raCompliance: "fail"
7. **CSG compliance** — every renewal without required hashtags is marked compliance: "fail"
8. **Prior ACV summed correctly** — accounts with multiple MC renewals have summed Amount

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

**Single manager:** "Refresh the MC Book of Business dashboard for {Manager Name}"

**All managers:** "Refresh all MC Book of Business dashboards"

**All dashboards at once:** "Refresh all dashboards" — runs the `refresh-all-dashboards` workflow at `~/.claude/workflows/refresh-all-dashboards.js` (fans out one agent per manager across all clouds in parallel, then pushes to GitHub Pages).

**Scheduled:** Daily at 8:00 AM via Claude Code cron (auto-expires after 7 days; to be replaced with GitHub Action).

Claude will re-query all MC data sources and rebuild each data.js file. The `dashboardConfig.asOf` date updates automatically.

## Key Differences from Commerce Cloud Dashboard

| Aspect | Commerce Cloud | Marketing Cloud |
|--------|---------------|-----------------|
| Cloud filter | `INCLUDES ('Commerce Cloud')` | `INCLUDES ('MC ExactTarget')` |
| Utilization metric | GMV ($ spent) or PPO (orders) | Super Messages (emails/push/in-app sent) |
| Entitlement names | "Commerce Cloud - Digital - GMV", "Commerce Cloud B2C - GMV" | "Super Messages - excluding SMS/MMS" |
| Secondary metrics | PPO | Contacts (Enterprise/Corporate Edition) |
| data.js field | `gmv: {...}` | `sends: {...}` |
| What utilization means | Gross Merchandise Value processed through storefront | Messages sent through Marketing Cloud platform |
| Low util concern | Customer not driving commerce revenue through SF | Customer not sending campaigns — adoption risk |
| High util concern | May exceed GMV cap → overage fees | May run out of messages → send throttling |
| Product sort priority | Commerce Cloud first | MC ExactTarget first |
| Column header | "GMV Util" | "MC Util" |
| Typical contract volumes | Millions of dollars | Billions of messages |
| Display format | $X.XB / $XM | X.XB / XM (messages) |

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
