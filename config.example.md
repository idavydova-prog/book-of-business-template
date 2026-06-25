# Configuration

Replace the placeholders below with your values before running Claude Code.

## Required

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{MANAGER_NAME}}` | Your full name as it appears in Org62 `CSM_Manager__c` | `Ilona Davydova` |
| `{{CLOUD_NAME}}` | The cloud you manage | `Commerce Cloud` |
| `{{CSG_REGION}}` | Your CSG region filter | `AMER PACE` |

## Slack (optional — for nudge system)

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{SLACK_DM_IDS}}` | Map of CSM name → Slack DM channel ID | `"Sara Fuhs": "D06HW7Y8A22"` |

### Finding Slack DM Channel IDs

DM channel IDs are NOT the same as user IDs. To discover them:
1. Use the Slack MCP to create a draft message to a user
2. The API response includes the DM channel ID (starts with `D`)
3. Add each CSM's DM ID to the `slackDMs` map in `data.js`

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
