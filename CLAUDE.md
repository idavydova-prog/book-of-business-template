# Book of Business — Shared Methodology

## CSM/Account Assignments (OrgCS — AUTHORITATIVE SOURCE)

The authoritative source for which CSMs and accounts belong to a leader is **OrgCS** (not Org62 `Account.CSM_Manager__c`). This method works for all clouds (CC, MC, Core).

### Step 1: Find the leader's Resource record

```sql
SELECT Id, Name, csc__Salesforce_User__c, cssf_Cloud__c
FROM csc__Resource__c
WHERE Name = '{Leader Name}'
AND csc__Is_Active__c = true
```

Save the `csc__Salesforce_User__c` value — this is the leader's User ID.

### Step 2: Get all direct-report CSMs via management chain

```sql
SELECT Id, Name, csc__Salesforce_User__c, cssf_Manager_IDs__c
FROM csc__Resource__c
WHERE cssf_Manager_IDs__c LIKE '%{leader_user_id}%'
AND csc__Is_Active__c = true
```

**Filter to direct reports only:** `cssf_Manager_IDs__c` is a comma-separated list of the full management chain. The **first ID** in the list = the direct manager. Only keep records where the leader's User ID is the first entry.

### Step 3: Get accounts per CSM via Engagements

```sql
SELECT csc__Playbook_Owner__r.Name, cssf_Account_Name__c
FROM csc__Playbook__c
WHERE csc__Playbook_Owner__c IN ({resource_ids_from_step_2})
AND csc__Stage__c NOT IN ('Closed','Canceled')
AND cssf_Account_Name__c != null
```

Deduplicate: each CSM will have many engagements per account — collapse to unique account names per CSM.

### Step 4: Remove shared assignments

If an account appears under multiple CSMs on the same team, assign it to the CSM with fewer total accounts (keeps workload balanced). If tied, assign to the one with more engagements on that account.

### Step 5: Use the final account list for Org62 queries

The deduplicated account list from Step 4 becomes the input for all subsequent Org62 queries (renewals, Red Accounts, entitlements, compliance).

```sql
SELECT Id, Name, CSM_lookup__r.Name, Success_Segment__c, Region__c
FROM Account
WHERE Name IN ({account_names_from_step_4})
AND Region__c = 'AMER'
```

### Why this replaces the old method

The previous approach used SO Ownership (`cssf_Owners_Manager__c`) + Team Memberships. This failed for CSMs who don't own any Success Overviews — they were invisible. Engagements (`csc__Playbook__c`) are universal: every active CSM runs engagements on their accounts regardless of SO ownership.

### Key objects

| Object | Purpose |
|--------|---------|
| `csc__Resource__c` | CSM/leader profiles; `cssf_Manager_IDs__c` holds management chain |
| `csc__Playbook__c` | Engagements (all types); `csc__Playbook_Owner__c` → Resource, `cssf_Account_Name__c` → account |
| `cssf_Success_Overview__c` | Legacy — still useful for validation but NOT the primary assignment source |
| `csc__Team_Membership__c` | Legacy — secondary cross-check only |

## Do NOT Rules — Lessons Learned (CSM/Account Assignment)

1. **NEVER use `cssf_Owners_Manager__c` (SO Ownership) as the primary method.** It misses CSMs who don't own any Success Overviews. This caused Tina Warchol's dashboard to show 5 accounts instead of 27.

2. **NEVER use `Account.CSM_Manager__c` from Org62.** It is stale, incomplete, and not the system of record.

3. **NEVER use `csc__Line_Manager__c` on Resource.** It is null for all records.

4. **NEVER use `cssf_Engagement_Template_Type__c = 'Success Path'` as a filter.** Most engagements have this field as null. Query ALL engagements regardless of template type.

5. **NEVER assume SO Team Membership alone gives the full picture.** It includes cross-cloud and enterprise-wide assignments that don't represent the CSM's primary MC/CC/Core book.

6. **ALWAYS start with `cssf_Manager_IDs__c`** to find direct reports. The first ID in the comma-separated list is the direct manager.

7. **ALWAYS use Engagements (`csc__Playbook__c`)** to determine which accounts a CSM owns. It is the tightest, most cloud-relevant source.

8. **ALWAYS deduplicate shared accounts** — assign to the CSM with fewer total accounts.

## Refreshing All Dashboards

**All clouds at once:** "Refresh all Book of Business dashboards"

This runs the shared methodology above for each leader listed on each cloud's home page, then queries Org62 for account details per the cloud-specific CLAUDE.md.

**Per cloud:** "Refresh all CC/MC/Core Book of Business dashboards"

## Output

Open any `index.html` by dragging to a browser window (Dock icon). Do NOT use "Open With" from Finder.
