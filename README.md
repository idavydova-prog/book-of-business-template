# Book of Business — CSM Dashboard Template

A single-pane HTML dashboard for CSM managers to monitor their team's accounts, compliance, utilization, and risk — powered by Salesforce Org62 data and refreshed by Claude Code.

## What it does

- Pulls live data from Org62 (renewals, Red Accounts, entitlements, CSG Notes)
- Validates PACE compliance (CSG Notes hashtags + Red Account headline hashtags)
- Shows GMV/utilization with projected end-of-contract burn rate
- Surfaces coaching insights and risk signals in an Analysis tab
- Supports one-click Slack nudges for compliance failures

## How it works

```
You: "Refresh the Book of Business dashboard for [Manager Name]"

Claude Code:
  1. Queries OrgCS for CSM/account assignments
  2. Queries Org62 for renewals, Red Accounts, entitlements
  3. Validates compliance against PACE hashtag rules
  4. Generates data.js with the account array
  5. Dashboard renders instantly in browser (static HTML, no server needed)
```

## What you need

- **Claude Code** with MCP access to Org62 (read-only) and OrgCS
- **Slack MCP** (optional) — for the nudge system to open DMs
- **A browser** — dashboards are static HTML, opened by dragging to the Dock icon

## Setup

### 1. Clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/book-of-business-template.git
cd book-of-business-template
```

### 2. Choose your clouds

The template includes CLAUDE.md files for 4 clouds: Commerce Cloud, Marketing Cloud, Core, and Tableau. Delete the ones you don't manage:

```bash
# Example: keep only Commerce Cloud and Marketing Cloud
rm -rf core/ tableau/
```

### 3. Configure your team

Edit `config.example.md` and fill in the placeholders, then rename it:

```bash
mv config.example.md config.md
```

### 4. Create your first manager folder

```bash
mkdir -p cc/Your\ Name
cp shared/shell.html cc/Your\ Name/index.html
```

Edit the header in `index.html` to show your name and cloud.

### 5. Refresh the dashboard

Open Claude Code and run:

```
Refresh the Book of Business dashboard for [Your Name]
```

Claude will query Org62, generate `data.js`, and your dashboard is live.

## Folder structure

```
book-of-business-template/
├── README.md                     ← You are here
├── CLAUDE.md                     ← Root instructions (CSM assignment methodology)
├── config.example.md             ← Placeholders to customize
├── index.html                    ← Cloud selector landing page
├── validation-rules.html         ← Compliance rule reference
├── benefits.html                 ← Dashboard value overview
├── shared/
│   ├── dashboard.js              ← All rendering logic + Analysis tab
│   ├── styles.css                ← SLDS-based styles
│   ├── icons.js                  ← Salesforce product SVG icons
│   └── shell.html                ← HTML template for new manager folders
├── resources/
│   ├── hashtag-guide.html        ← PACE hashtag reference
│   ├── csg-notes-format.html     ← CSG Notes formatting guide
│   └── url-shortener.html        ← sfdc.co shortener instructions
├── cc/
│   └── CLAUDE.md                 ← Commerce Cloud–specific queries
├── mc/
│   └── CLAUDE.md                 ← Marketing Cloud–specific queries
├── core/
│   └── CLAUDE.md                 ← Core/Sales Cloud–specific queries
├── tableau/
│   └── CLAUDE.md                 ← Tableau-specific queries
└── example-cloud/
    ├── index.html                ← Example cloud home page
    └── Example Manager/
        ├── index.html            ← Working example dashboard
        ├── data.js               ← Sample data (fake accounts)
        └── history.js            ← Utilization history example
```

## Adding a new cloud

1. Create a folder: `mkdir my-cloud`
2. Copy a CLAUDE.md from an existing cloud and adapt the queries
3. Add a card to `index.html` pointing to `my-cloud/index.html`
4. Create `my-cloud/index.html` (copy from `example-cloud/index.html`)

## Adding a new manager

1. Create the folder: `mkdir cc/Manager\ Name`
2. Copy the shell: `cp shared/shell.html cc/Manager\ Name/index.html`
3. Edit the header (manager name, cloud name)
4. Ask Claude to refresh — it generates `data.js` and `history.js`
5. Add a card to the cloud's `index.html`

## Daily refresh

Ask Claude Code: **"Refresh all dashboards"**

Or set up a scheduled task / cron to run daily at 8 AM.

## Resources (current as of Q2 FY27)

The `resources/` folder contains PACE-standard reference pages. Check with your PACE leadership for any updates to hashtag taxonomy or compliance rules.

## License

MIT — see [LICENSE](LICENSE).
