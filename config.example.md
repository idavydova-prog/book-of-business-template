# Configuration

Replace the placeholders below with your values before running Claude Code.

## Required

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{MANAGER_NAME}}` | Your full name as it appears in Org62 `CSM_Manager__c` | `Ilona Davydova` |
| `{{CLOUD_NAME}}` | The cloud you manage | `Commerce Cloud` |
| `{{CSG_REGION}}` | Your CSG region filter | `AMER PACE` |

## Slack (required — powers the compliance nudge system)

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{SLACK_DM_IDS}}` | Map of CSM name → Slack DM channel ID | `"Sara Fuhs": "D06HW7Y8A22"` |

### How Slack DM Channel IDs are discovered

DM channel IDs are NOT the same as user IDs. Claude discovers them automatically on the first refresh:
1. Searches Slack for each CSM by name
2. Sends a draft message to each user — the API response returns the DM channel ID (starts with `D`)
3. Populates the `slackDMs` map in `data.js`

You do NOT need to find these manually. Claude handles it as part of the standard refresh flow.

## Fiscal Calendar

Salesforce fiscal quarters:
- Q1: Feb 1 – Apr 30
- Q2: May 1 – Jul 31
- Q3: Aug 1 – Oct 31
- Q4: Nov 1 – Jan 31

The `dashboardConfig.fqStart` and `fqEnd` in `data.js` should match the current fiscal quarter.

## Utilization Entitlements (by cloud)

| Cloud | Entitlement Name Pattern | Unit |
|-------|--------------------------|------|
| Commerce Cloud | `%GMV%` or `Commerce Cloud - Digital - PPO` | Dollars (GMV) or Orders (PPO) |
| Marketing Cloud | `%Super Message%` | Messages |
| Tableau | `%Analytical Impression%` | Impressions |
| Core | N/A (license-based) | Licenses |
