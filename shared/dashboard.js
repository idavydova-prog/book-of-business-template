const TODAY = new Date(dashboardConfig.asOf);
const FQ_START = new Date(dashboardConfig.fqStart);
const FQ_END = new Date(dashboardConfig.fqEnd);
const IS_SINGLE_CSM = (typeof csmOrder !== 'undefined') && csmOrder.length === 1;

// Dynamically render header-right from data
(function() {
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        const d = new Date(dashboardConfig.asOf + 'T00:00:00');
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const dateStr = months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
        const acctCount = accounts.length;
        const csmCount = (typeof csmOrder !== 'undefined') ? csmOrder.length : [...new Set(accounts.map(a => a.csm))].length;
        headerRight.innerHTML = IS_SINGLE_CSM
            ? 'As of ' + dateStr + '<br>' + acctCount + ' Accounts'
            : 'As of ' + dateStr + '<br>' + acctCount + ' Accounts | ' + csmCount + ' CSMs';
        const refreshed = document.createElement('div');
        refreshed.style.cssText = 'margin-top:4px;font-size:0.65rem;opacity:0.7;';
        refreshed.textContent = 'Last refreshed: ' + dashboardConfig.asOf;
        headerRight.appendChild(refreshed);
    }
})();

// Add cross-cloud asterisk legend if applicable
(function() {
    const crossCloudCount = accounts.filter(a => a.hasCC === false && a.link).length;
    if (crossCloudCount > 0) {
        const legend = document.querySelector('.legend');
        if (legend) {
            const item = document.createElement('span');
            item.className = 'legend-item';
            item.style.marginLeft = '1.5rem';
            item.innerHTML = '<span class="cross-cloud-mark">*</span> Renewal is for a different cloud';
            legend.appendChild(item);
        }
    }
})();

const raCount = accounts.filter(a => a.ra.length > 0).length;
const renewalsThisQtr = accounts.filter(a => {
    if (!a.renewalDate) return false;
    const d = new Date(a.renewalDate + 'T00:00:00');
    return d >= FQ_START && d <= FQ_END;
}).length;
const lowGmvCount = accounts.filter(a => (a.gmv || a.sends) && (a.gmv || a.sends).pct < 30).length;
const ariTotalCount = accounts.filter(a => a.ari && a.ari.length > 0).length;

document.getElementById('summary-cards').innerHTML = `
    <div class="summary-card"><div class="number">${accounts.length}</div><div class="label">Total Accounts</div></div>
    ${IS_SINGLE_CSM ? '' : `<div class="summary-card"><div class="number">${csmOrder.length}</div><div class="label">CSMs</div></div>`}
    <div class="summary-card alert"><div class="number">${raCount}</div><div class="label">Accts w/ Active RA</div></div>
    <div class="summary-card ${ariTotalCount > 0 ? 'ari-card' : ''}"><div class="number">${ariTotalCount}</div><div class="label">Active ARIs</div></div>
    <div class="summary-card ${renewalsThisQtr > 0 ? 'warn' : ''}"><div class="number">${renewalsThisQtr}</div><div class="label">Renewals This Qtr</div></div>
    <div class="summary-card"><div class="number">${lowGmvCount}</div><div class="label">Util &lt;30%</div></div>
`;

function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function getDateClass(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const diffDays = (d - TODAY) / (1000 * 60 * 60 * 24);
    if (diffDays <= 60) return 'date-urgent';
    if (d <= FQ_END) return 'date-soon';
    return '';
}

function renderProducts(acct) {
    const prods = acct.products;
    if (prods.length === 0) return '<span style="color:#b0adab">--</span>';
    const sorted = [...prods].sort((a, b) => {
        if (a === 'Commerce Cloud') return -1;
        if (b === 'Commerce Cloud') return 1;
        return 0;
    });
    return '<span class="product-dots">' + sorted.map(p => {
        if (productIcons[p]) {
            return `<span class="product-icon" data-tooltip="${p}">${productIcons[p]}</span>`;
        }
        const info = productFallback[p] || { abbr: p.substring(0, 2).toUpperCase(), cls: 'oms' };
        return `<span class="product-dot ${info.cls}" data-tooltip="${p}">${info.abbr}</span>`;
    }).join('') + '</span>';
}

function calcProjected(g) {
    const start = new Date(g.contractStart || g.contractEnd);
    const end = new Date(g.contractEnd + 'T00:00:00');
    const totalDays = (end - start) / (1000*60*60*24);
    const elapsed = (TODAY - start) / (1000*60*60*24);
    if (elapsed <= 0 || totalDays <= 0) return g.pct;
    const ratio = totalDays / elapsed;
    return Math.round(g.pct * ratio);
}

function renderGMV(acct) {
    const g = acct.gmv || acct.sends;
    if (!g) return '<span style="color:#b0adab">—</span>';
    const pct = g.pct;
    const projected = calcProjected(g);
    let barColor = 'green';
    let pctClass = 'normal';
    if (projected >= 100) { barColor = 'red'; pctClass = 'high'; }
    else if (projected >= 70) { barColor = 'orange'; pctClass = 'mid'; }
    else if (pct >= 30) { barColor = 'blue'; }
    const isPPO = g.entitlement.includes('PPO');
    const isGMV = g.entitlement.includes('GMV');
    let tooltip;
    if (isPPO) {
        tooltip = `${g.entitlement}\nAllowance: ${Number(g.allowance).toLocaleString()} orders\nUsed: ${Number(g.used).toLocaleString()} orders (${pct}%)\nProjected by end of contract: ${projected}%\nContract ends: ${g.contractEnd}`;
    } else if (isGMV) {
        const allowFmt = (g.allowance / 1e6).toFixed(0);
        const usedFmt = (g.used / 1e6).toFixed(0);
        tooltip = `${g.entitlement}\nAllowance: $${Number(allowFmt).toLocaleString()}M\nUsed: $${Number(usedFmt).toLocaleString()}M (${pct}%)\nProjected by end of contract: ${projected}%\nContract ends: ${g.contractEnd}`;
    } else {
        tooltip = `${g.entitlement}\nAllowance: ${Number(g.allowance).toLocaleString()}\nUsed: ${Number(g.used).toLocaleString()} (${pct}%)\nProjected by end of contract: ${projected}%\nContract ends: ${g.contractEnd}`;
    }
    const projBar = Math.min(projected, 100);
    const actBar = Math.min(pct, 100);
    const projLabel = projected > 100 ? `${projected}%P` : `→${projected}%`;
    const ppoLabel = isPPO ? ' <span style="font-size:0.6rem;color:#706e6b;font-weight:400">PPO</span>' : '';
    return `<div class="gmv-cell" data-tooltip="${esc(tooltip)}"><span class="gmv-pct ${pctClass}"><span class="actual">${pct}%${ppoLabel}</span><span class="projected">${projLabel}</span></span><div class="gmv-bar-container"><div class="gmv-bar-projected ${barColor}" style="width:${projBar}%"></div><div class="gmv-bar-actual ${barColor}" style="width:${actBar}%"></div></div></div>`;
}

function renderRA(acct) {
    if (acct.ra.length === 0) return '<span style="color:#b0adab">—</span>';
    return '<span class="ra-dots">' + acct.ra.map(r => {
        const dotClass = r.status === 'precautionary' ? 'ra-dot precautionary' : 'ra-dot';
        return `<a class="ra-dot-link" href="https://org62.lightning.force.com/lightning/r/Red_Account__c/${r.id}/view" target="_blank"><span class="${dotClass}" data-tooltip="${esc(r.headline)}"></span></a>`;
    }).join('') + '</span>';
}

function renderARI(acct) {
    if (!acct.ari || acct.ari.length === 0) return '';
    return acct.ari.map(a => {
        const cls = a.status === 'Approved' ? 'ari-badge approved' : 'ari-badge in-progress';
        const label = a.status === 'Approved' ? 'ARI ✓' : 'ARI';
        const tooltip = `ARI ${a.status}\nCloud: ${a.cloud}\nAttrition: $${a.forecastedAttrition.toLocaleString()}\nInvestment: $${a.requestedInvestment.toLocaleString()}\nSubmitted: ${a.submittedDate}`;
        return `<span class="${cls}" data-tooltip="${esc(tooltip)}">${label}</span>`;
    }).join(' ');
}

function fmtRaReason(reason) {
    if (reason === 'No valid play hashtag' || reason === 'No valid play hashtag in headline') {
        return 'Missing play hashtag in headline';
    }
    return reason;
}

function wasNudged(acctName, type) {
    const key = 'nudge_' + acctName + '_' + type + '_' + dashboardConfig.asOf;
    return !!localStorage.getItem(key);
}

function nudgeBadge(acctName, type) {
    const key = 'nudge_' + acctName + '_' + type + '_' + dashboardConfig.asOf;
    const date = localStorage.getItem(key);
    if (!date) return '';
    return `<span class="nudge-sent-badge" title="Nudge sent ${date}">Sent ${date.substring(5)}</span>`;
}

function markNudgeSent(acctName, type) {
    const key = 'nudge_' + acctName + '_' + type + '_' + dashboardConfig.asOf;
    const today = new Date().toISOString().substring(0, 10);
    localStorage.setItem(key, today);
}

function renderRACompliance(acct) {
    if (acct.ra.length === 0) return '<span style="color:#b0adab">—</span>';
    const mostRecent = acct.ra.reduce((latest, r) => {
        if (!r.lastModified) return latest;
        return (!latest || r.lastModified > latest) ? r.lastModified : latest;
    }, null);
    const freshDot = mostRecent ? renderFreshnessDot(mostRecent, 'RA last updated') : '';
    const hasFailure = acct.ra.some(r => r.raCompliance !== 'pass');
    const alreadySent = hasFailure && wasNudged(acct.name, 'ra');
    const nudgeAttr = (hasFailure && !alreadySent && !IS_SINGLE_CSM) ? ` class="nudge-trigger" data-acct="${esc(acct.name)}" data-type="ra"` : '';
    if (acct.ra.length <= 2) {
        let inner = acct.ra.map(r => {
            const icon = r.raCompliance === 'pass' ? '<span class="compliance-pass">✓ Pass</span>' : '<span class="compliance-fail">✗ Fail</span>';
            return `<div class="ra-comp-item">${icon} <span class="compliance-reason">${fmtRaReason(r.raReason)}</span></div>`;
        }).join('');
        if (alreadySent) return `${freshDot}${inner}${nudgeBadge(acct.name, 'ra')}`;
        return hasFailure ? `${freshDot}<span${nudgeAttr}>${inner}</span>` : freshDot + inner;
    }
    const passRAs = acct.ra.filter(r => r.raCompliance === 'pass');
    const failRAs = acct.ra.filter(r => r.raCompliance !== 'pass');
    const tooltip = acct.ra.map(r => `${r.raCompliance === 'pass' ? '✓ Pass' : '✗ Fail'} ${fmtRaReason(r.raReason)}`).join('\n');
    let html = freshDot;
    if (passRAs.length > 0) {
        const tags = [...new Set(passRAs.map(r => r.raReason))].join(', ');
        html += `<div class="ra-comp-item"><span class="compliance-pass">✓ Pass</span> <span class="compliance-reason">${passRAs.length} pass (${tags})</span></div>`;
    }
    if (failRAs.length > 0) {
        html += `<div class="ra-comp-item"><span class="compliance-fail">✗ Fail</span> <span class="compliance-reason">${failRAs.length} missing play hashtag</span></div>`;
    }
    if (alreadySent) return `<span data-tooltip="${esc(tooltip)}">${html}</span>${nudgeBadge(acct.name, 'ra')}`;
    return `<span data-tooltip="${esc(tooltip)}"${nudgeAttr}>${html}</span>`;
}

function renderCompliance(acct) {
    const freshDot = acct.csgNotesDate ? renderFreshnessDot(acct.csgNotesDate, 'CSG Notes updated') : '';
    if (acct.compliance === 'pass') {
        return `${freshDot}<span class="compliance-pass" data-tooltip="${esc(acct.csgNotes)}">✓ Pass</span><span class="compliance-reason">${acct.complianceReason}</span>`;
    }
    if (IS_SINGLE_CSM) {
        return `${freshDot}<span class="compliance-fail" data-tooltip="${esc(acct.csgNotes)}">✗ Fail</span><span class="compliance-reason">${acct.complianceReason}</span>`;
    }
    if (wasNudged(acct.name, 'csg')) {
        return `${freshDot}<span class="compliance-fail" data-tooltip="${esc(acct.csgNotes)}">✗ Fail</span><span class="compliance-reason">${acct.complianceReason}</span>${nudgeBadge(acct.name, 'csg')}`;
    }
    return `${freshDot}<span class="compliance-fail nudge-trigger" data-acct="${esc(acct.name)}" data-type="csg" data-tooltip="${esc(acct.csgNotes)}">✗ Fail</span><span class="compliance-reason">${acct.complianceReason}</span>`;
}

function esc(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getFreshnessClass(dateStr) {
    if (!dateStr) return 'stale';
    const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
    const days = Math.floor((TODAY - d) / (1000 * 60 * 60 * 24));
    if (days <= 14) return 'fresh';
    if (days <= 21) return 'aging';
    return 'stale';
}

function getFreshnessDays(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
    return Math.floor((TODAY - d) / (1000 * 60 * 60 * 24));
}

function renderFreshnessDot(dateStr, label) {
    if (!dateStr) return '';
    const cls = getFreshnessClass(dateStr);
    const days = getFreshnessDays(dateStr);
    const tooltip = `${label}: ${days} day${days !== 1 ? 's' : ''} ago (${dateStr.substring(0,10)})`;
    return `<span class="freshness-dot ${cls}" data-tooltip="${tooltip}"></span>`;
}

function renderAccountName(acct) {
    const indent = acct.groupRole === 'child' ? ' class="child-account"' : '';
    const crossCloudMark = (acct.hasCC === false && acct.link) ? '<span class="cross-cloud-mark" data-tooltip="Renewal is for a different cloud (not Commerce Cloud)">*</span>' : '';
    if (!acct.link) return `<span${indent}>${acct.name}${crossCloudMark}</span>`;
    return `<span${indent}><a class="account-link" href="${acct.link}" target="_blank">${acct.name}</a>${crossCloudMark}</span>`;
}

function renderPriorAcv(acct) {
    if (!acct.priorAcv || acct.priorAcv <= 0) return '<span style="color:#b0adab">—</span>';
    if (acct.priorAcv >= 1000000) return '$' + (acct.priorAcv / 1000000).toFixed(1) + 'M';
    if (acct.priorAcv >= 1000) return '$' + Math.round(acct.priorAcv / 1000) + 'K';
    return '$' + Math.round(acct.priorAcv).toLocaleString();
}

function renderRow(acct, includeCSM) {
    const dateClass = getDateClass(acct.renewalDate);
    let cols = `<td>${renderAccountName(acct)} ${renderARI(acct)}</td>`;
    if (includeCSM) cols += `<td>${acct.csm}</td>`;
    cols += `<td>${renderPriorAcv(acct)}</td>`;
    cols += `<td>${renderRA(acct)}</td>`;
    cols += `<td>${renderRACompliance(acct)}</td>`;
    cols += `<td>${renderProducts(acct)}</td>`;
    cols += `<td>${renderGMV(acct)}</td>`;
    cols += `<td class="date-col ${dateClass}">${formatDate(acct.renewalDate)}</td>`;
    const amtClass = acct.renewalAmount < 0 ? 'amount-col amount-negative' : 'amount-col';
    cols += `<td class="${amtClass}">${acct.renewalAmountDisplay}</td>`;
    cols += `<td>${renderCompliance(acct)}</td>`;
    return `<tr>${cols}</tr>`;
}

function renderByCSM(filterCSM) {
    const tbody = document.getElementById('tbody-bycsm');
    let html = '';
    const csmsToShow = filterCSM && filterCSM !== 'all' ? [filterCSM] : csmOrder;
    csmsToShow.forEach(csm => {
        const ca = accounts.filter(a => a.csm === csm);
        if (ca.length === 0) return;
        html += `<tr><td colspan="9" class="csm-group-header">${csm} (${ca.length})</td></tr>`;
        ca.forEach(a => { html += renderRow(a, false); });
    });
    tbody.innerHTML = html;
}

function sortKeepingGroups(arr, compareFn) {
    const parents = arr.filter(a => a.groupRole !== 'child');
    const sorted = [...parents].sort(compareFn);
    const result = [];
    sorted.forEach(p => {
        result.push(p);
        if (p.group) {
            const children = arr.filter(a => a.group === p.group && a.groupRole === 'child');
            result.push(...children);
        }
    });
    return result;
}

function renderByRenewal() {
    const tbody = document.getElementById('tbody-byrenewal');
    const sorted = sortKeepingGroups(accounts, (a, b) => {
        if (!a.renewalDate) return 1;
        if (!b.renewalDate) return -1;
        return a.renewalDate.localeCompare(b.renewalDate);
    });
    tbody.innerHTML = sorted.map(a => renderRow(a, true)).join('');
}

function filterWithChildren(filterFn) {
    const matched = accounts.filter(filterFn);
    const result = [];
    matched.forEach(a => {
        if (a.groupRole === 'child') {
            const parent = accounts.find(p => p.group === a.group && p.groupRole === 'parent');
            if (parent && !result.includes(parent)) result.push(parent);
            if (!result.includes(a)) result.push(a);
        } else {
            if (!result.includes(a)) result.push(a);
            if (a.group) {
                accounts.filter(c => c.group === a.group && c.groupRole === 'child').forEach(c => {
                    if (!result.includes(c)) result.push(c);
                });
            }
        }
    });
    return result;
}

function renderByRisk() {
    const tbody = document.getElementById('tbody-byrisk');
    let html = '';

    // ARI section
    const ariAccts = filterWithChildren(a => a.ari && a.ari.length > 0);
    const ariCount = accounts.filter(a => a.ari && a.ari.length > 0).length;
    if (ariCount > 0) {
        html += `<tr><td colspan="10" class="risk-section-header ari-section">Accounts with Active ARIs (${ariCount})</td></tr>`;
        ariAccts.forEach(a => { html += renderRow(a, true); });
    }

    const raAccts = filterWithChildren(a => a.ra.length > 0);
    const raActCount = accounts.filter(a => a.ra.length > 0).length;
    if (raActCount > 0) {
        html += `<tr><td colspan="10" class="risk-section-header">Active Red Accounts (${raActCount} accounts)</td></tr>`;
        raAccts.forEach(a => { html += renderRow(a, true); });
    }

    const csgFail = filterWithChildren(a => a.compliance === 'fail');
    const csgCount = accounts.filter(a => a.compliance === 'fail').length;
    if (csgCount > 0) {
        html += `<tr><td colspan="10" class="risk-section-header compliance-section">CSG Compliance Issues (${csgCount})</td></tr>`;
        csgFail.forEach(a => { html += renderRow(a, true); });
    }

    const raFail = filterWithChildren(a => a.ra.some(r => r.raCompliance === 'fail'));
    const raFailCount = accounts.filter(a => a.ra.some(r => r.raCompliance === 'fail')).length;
    if (raFailCount > 0) {
        html += `<tr><td colspan="10" class="risk-section-header compliance-section">RA Hashtag Issues (${raFailCount})</td></tr>`;
        raFail.forEach(a => { html += renderRow(a, true); });
    }

    tbody.innerHTML = html;
}

function renderAll() {
    const tbody = document.getElementById('tbody-all');
    const sorted = sortKeepingGroups(accounts, (a, b) => a.name.localeCompare(b.name));
    tbody.innerHTML = sorted.map(a => renderRow(a, true)).join('');
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

document.querySelectorAll('thead th[data-sort]').forEach(th => {
    th.addEventListener('click', function() {
        const table = this.closest('table');
        const tbody = table.querySelector('tbody');
        const colIdx = Array.from(this.parentElement.children).indexOf(this);
        const allRows = Array.from(tbody.querySelectorAll('tr'));
        const headers = allRows.filter(r => r.querySelector('.csm-group-header') || r.querySelector('.risk-section-header'));
        const dataRows = allRows.filter(r => !r.querySelector('.csm-group-header') && !r.querySelector('.risk-section-header'));
        if (headers.length > 0) return;
        const isAsc = this.classList.contains('sort-asc');
        table.querySelectorAll('th').forEach(h => { h.classList.remove('sort-asc', 'sort-desc'); });
        this.classList.add(isAsc ? 'sort-desc' : 'sort-asc');
        const dir = isAsc ? -1 : 1;
        dataRows.sort((a, b) => {
            const aT = a.children[colIdx]?.textContent.trim() || '';
            const bT = b.children[colIdx]?.textContent.trim() || '';
            const aN = parseFloat(aT.replace(/[$,]/g, ''));
            const bN = parseFloat(bT.replace(/[$,]/g, ''));
            if (!isNaN(aN) && !isNaN(bN)) return (aN - bN) * dir;
            const aD = Date.parse(aT);
            const bD = Date.parse(bT);
            if (!isNaN(aD) && !isNaN(bD)) return (aD - bD) * dir;
            return aT.localeCompare(bT) * dir;
        });
        dataRows.forEach(r => tbody.appendChild(r));
    });
});

if (IS_SINGLE_CSM) {
    const byCsmBtn = document.querySelector('[data-tab="bycsm"]');
    const byCsmPanel = document.getElementById('tab-bycsm');
    if (byCsmBtn) byCsmBtn.style.display = 'none';
    if (byCsmPanel) byCsmPanel.classList.remove('active');
    const allBtn = document.querySelector('[data-tab="all"]');
    const allPanel = document.getElementById('tab-all');
    if (allBtn) allBtn.classList.add('active');
    if (allPanel) allPanel.classList.add('active');
} else {
    renderByCSM();
    const csmFilterEl = document.getElementById('csm-filter');
    csmOrder.forEach(csm => {
        const opt = document.createElement('option');
        opt.value = csm;
        opt.textContent = csm;
        csmFilterEl.appendChild(opt);
    });
    csmFilterEl.addEventListener('change', () => renderByCSM(csmFilterEl.value));
}

renderByRenewal();
renderByRisk();
renderAll();

// === Analysis Tab (injected dynamically) ===
(function buildAnalysisTab() {
    const tabNav = document.querySelector('.tab-nav');
    const tabsContainer = document.querySelector('.tabs-container');
    if (!tabNav || !tabsContainer) return;

    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset.tab = 'analysis';
    btn.textContent = 'Analysis';
    tabNav.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'tab-content';
    panel.id = 'tab-analysis';
    panel.setAttribute('data-tab-title', 'Analysis');
    tabsContainer.appendChild(panel);

    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        panel.classList.add('active');
    });

    const total = accounts.length;
    const csgPassCount = accounts.filter(a => a.compliance === 'pass').length;
    const csgFailCount = total - csgPassCount;
    const csgRate = total > 0 ? Math.round((csgPassCount / total) * 100) : 0;

    const raAccounts = accounts.filter(a => a.ra.length > 0);
    const allRAs = accounts.flatMap(a => a.ra);
    const raPassCount = allRAs.filter(r => r.raCompliance === 'pass').length;
    const raFailCount = allRAs.length - raPassCount;
    const hasRAs = allRAs.length > 0;
    const raRate = hasRAs ? Math.round((raPassCount / allRAs.length) * 100) : null;

    const totalAcv = accounts.reduce((s, a) => s + (a.priorAcv || 0), 0);
    const totalAttrition = accounts.reduce((s, a) => s + (a.renewalAmount < 0 ? a.renewalAmount : 0), 0);

    const gmvAccounts = accounts.filter(a => a.gmv || a.sends);
    const lowGmv = gmvAccounts.filter(a => (a.gmv || a.sends).pct < 30);
    const midGmv = gmvAccounts.filter(a => (a.gmv || a.sends).pct >= 30 && (a.gmv || a.sends).pct < 60);
    const highGmv = gmvAccounts.filter(a => (a.gmv || a.sends).pct >= 60);

    // CSM-level compliance
    const csmStats = csmOrder.map(csm => {
        const ca = accounts.filter(a => a.csm === csm);
        const pass = ca.filter(a => a.compliance === 'pass').length;
        const rate = ca.length > 0 ? Math.round((pass / ca.length) * 100) : 0;
        const acv = ca.reduce((s, a) => s + (a.priorAcv || 0), 0);
        const hasRA = ca.filter(a => a.ra.length > 0).length;
        const blankNotes = ca.filter(a => !a.csgNotes || a.csgNotes.includes('(blank)') || a.csgNotes.includes('(No CSG Notes)') || a.csgNotes.includes('(No active CC renewal)')).length;
        return { csm, total: ca.length, pass, rate, acv, hasRA, blankNotes };
    });

    // Common compliance failures
    const failReasons = {};
    accounts.filter(a => a.compliance === 'fail').forEach(a => {
        const reasons = a.complianceReason.split(';').map(r => r.trim());
        reasons.forEach(r => { failReasons[r] = (failReasons[r] || 0) + 1; });
    });
    const topFailures = Object.entries(failReasons).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Coaching insights
    const insights = [];

    const noNotesCSMs = csmStats.filter(c => c.blankNotes > 0);
    if (noNotesCSMs.length > 0) {
        insights.push({ type: 'coaching', text: `<strong>Missing CSG Notes:</strong> ${noNotesCSMs.map(c => `${c.csm} (${c.blankNotes})`).join(', ')} — accounts without notes indicate engagement gaps.` });
    }

    const lowCompCSMs = csmStats.filter(c => c.rate < 70 && c.total > 0);
    if (lowCompCSMs.length > 0) {
        insights.push({ type: 'coaching', text: `<strong>Low compliance rate:</strong> ${lowCompCSMs.map(c => `${c.csm} (${c.rate}%)`).join(', ')} — targeted hashtag training recommended.` });
    }

    const raNoHashtag = accounts.filter(a => a.ra.length > 0 && !a.complianceReason.includes('#RA') && a.compliance === 'fail' && (!a.csgNotes || a.csgNotes.indexOf('#RA') === -1));
    if (raNoHashtag.length > 0) {
        insights.push({ type: 'risk', text: `<strong>Red Account without #RA in CSG Notes:</strong> ${raNoHashtag.map(a => a.name).join(', ')} — CSMs must reference active RAs in their renewal notes.` });
    }

    const lowGmvHighAcv = lowGmv.filter(a => a.priorAcv >= 1000000);
    if (lowGmvHighAcv.length > 0) {
        insights.push({ type: 'risk', text: `<strong>High-ACV accounts with low utilization (&lt;30%):</strong> ${lowGmvHighAcv.map(a => a.name + ' (' + (a.gmv || a.sends).pct + '%)').join(', ')} — attrition risk if utilization doesn't improve.` });
    }

    if (totalAttrition < 0) {
        const attrAccts = accounts.filter(a => a.renewalAmount < 0).sort((a, b) => a.renewalAmount - b.renewalAmount);
        insights.push({ type: 'risk', text: `<strong>Forecasted attrition exposure: $${Math.abs(totalAttrition).toLocaleString()}</strong> across ${attrAccts.length} account(s): ${attrAccts.map(a => a.name + ' (' + a.renewalAmountDisplay + ')').join(', ')}` });
    }

    const highCompCSMs = csmStats.filter(c => c.rate === 100 && c.total >= 2);
    if (highCompCSMs.length > 0) {
        insights.push({ type: 'opportunity', text: `<strong>100% compliance:</strong> ${highCompCSMs.map(c => c.csm + ' (' + c.total + ' accts)').join(', ')} — recognize and share best practices with the team.` });
    }

    // Context Signals: RA play vs CSG Notes mismatch
    const contextSignals = [];
    accounts.forEach(a => {
        if (!a.ra || a.ra.length === 0 || !a.csgNotes) return;
        const hasRFP = a.ra.some(r => r.headline && r.headline.toUpperCase().includes('#RFP'));
        const hasSigTrial = a.ra.some(r => r.headline && r.headline.toUpperCase().includes('#SIGTRIAL'));
        if (hasRFP && a.csgNotes.includes('#LicNoAttrit')) {
            contextSignals.push({ acct: a.name, signal: '#RFP Red Account active but CSG Notes say #LicNoAttrit — verify no attrition risk from competitive situation' });
        }
        if (hasSigTrial && a.csgNotes.includes('#NoSigRisk')) {
            contextSignals.push({ acct: a.name, signal: '#SIGTRIAL Red Account active but CSG Notes say #NoSigRisk — verify Signature risk assessment' });
        }
    });
    if (contextSignals.length > 0) {
        insights.push({ type: 'coaching', text: `<strong>Context Signals:</strong> ${contextSignals.map(s => `${s.acct} — ${s.signal}`).join('<br>')}` });
    }

    // Build HTML
    const fmtAcv = v => v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : '$' + Math.round(v / 1000) + 'K';

    let html = '';

    // Summary strip
    html += '<div class="analysis-summary-strip">';
    html += `<div class="analysis-summary-item"><div class="val ${csgRate >= 80 ? 'good' : csgRate >= 50 ? '' : 'bad'}">${csgRate}%</div><div class="lbl">CSG Compliance</div></div>`;
    if (hasRAs) {
        html += `<div class="analysis-summary-item"><div class="val ${raRate >= 80 ? 'good' : raRate >= 50 ? '' : 'bad'}">${raRate}%</div><div class="lbl">RA Hashtag Compliance<br><span style="font-size:0.55rem;text-transform:none;letter-spacing:0">${raPassCount}/${allRAs.length} RAs compliant</span></div></div>`;
    } else {
        html += `<div class="analysis-summary-item"><div class="val" style="color:#706e6b">N/A</div><div class="lbl">RA Hashtag Compliance<br><span style="font-size:0.55rem;text-transform:none;letter-spacing:0">No active Red Accounts</span></div></div>`;
    }
    html += `<div class="analysis-summary-item"><div class="val">${fmtAcv(totalAcv)}</div><div class="lbl">Total Prior ACV</div></div>`;
    html += `<div class="analysis-summary-item"><div class="val ${totalAttrition < 0 ? 'bad' : 'good'}">${totalAttrition < 0 ? '-$' + Math.abs(totalAttrition).toLocaleString() : '$0'}</div><div class="lbl">Fcst Attrition</div></div>`;
    html += `<div class="analysis-summary-item"><div class="val">${raAccounts.length}</div><div class="lbl">Accts w/ Red Account</div></div>`;
    html += '</div>';

    html += '<div class="analysis-grid">';

    // Panel 1: CSG Compliance by CSM
    html += '<div class="analysis-panel"><div class="analysis-panel-header">CSG Compliance by CSM</div><div class="analysis-panel-body">';
    csmStats.forEach(c => {
        const color = c.rate === 100 ? 'green' : c.rate >= 70 ? 'blue' : c.rate >= 50 ? 'orange' : 'red';
        html += `<div class="analysis-bar-row csm-clickable" data-csm="${esc(c.csm)}" title="View ${c.csm}'s accounts"><span class="analysis-bar-label">${c.csm.split(' ')[0]}</span><div class="analysis-bar-track"><div class="analysis-bar-fill ${color}" style="width:${c.rate}%"></div></div><span class="analysis-bar-pct">${c.rate}%</span></div>`;
    });
    html += '</div></div>';

    // Panel 2: Utilization Bands
    html += '<div class="analysis-panel"><div class="analysis-panel-header">Utilization Bands</div><div class="analysis-panel-body">';
    const gmvBands = [
        { label: '<30% (Low)', count: lowGmv.length, color: 'orange' },
        { label: '30–60% (On Track)', count: midGmv.length, color: 'green' },
        { label: '60%+ (High)', count: highGmv.length, color: 'red' }
    ];
    gmvBands.forEach(b => {
        const pct = gmvAccounts.length > 0 ? Math.round((b.count / gmvAccounts.length) * 100) : 0;
        html += `<div class="analysis-bar-row"><span class="analysis-bar-label">${b.label} (${b.count})</span><div class="analysis-bar-track"><div class="analysis-bar-fill ${b.color}" style="width:${pct}%"></div></div><span class="analysis-bar-pct">${pct}%</span></div>`;
    });
    html += '</div></div>';

    // Panel 4: Top Compliance Issues
    html += '<div class="analysis-panel"><div class="analysis-panel-header">Top Compliance Failures</div><div class="analysis-panel-body">';
    if (topFailures.length === 0) {
        html += '<div style="color:#2e844a;font-size:0.75rem;text-align:center;padding:1rem;">All accounts are compliant</div>';
    } else {
        topFailures.forEach(([reason, count]) => {
            html += `<div class="analysis-kpi-row"><span class="analysis-kpi-label">${reason}</span><span class="analysis-kpi-value bad">${count}</span></div>`;
        });
    }
    html += '</div></div>';

    // Panel 5: ACV by CSM
    html += '<div class="analysis-panel"><div class="analysis-panel-header">Prior ACV by CSM</div><div class="analysis-panel-body">';
    const maxAcv = Math.max(...csmStats.map(c => c.acv), 1);
    [...csmStats].sort((a, b) => b.acv - a.acv).forEach(c => {
        const pct = Math.round((c.acv / maxAcv) * 100);
        html += `<div class="analysis-bar-row csm-clickable" data-csm="${esc(c.csm)}" title="View ${c.csm}'s accounts"><span class="analysis-bar-label">${c.csm.split(' ')[0]}</span><div class="analysis-bar-track"><div class="analysis-bar-fill blue" style="width:${pct}%"></div></div><span class="analysis-bar-pct">${fmtAcv(c.acv)}</span></div>`;
    });
    html += '</div></div>';

    // Panel: CSM Workload Distribution
    html += '<div class="analysis-panel"><div class="analysis-panel-header">CSM Workload Distribution</div><div class="analysis-panel-body">';
    const maxAccts = Math.max(...csmStats.map(c => c.total), 1);
    const avgAccts = Math.round(csmStats.reduce((s, c) => s + c.total, 0) / csmStats.length);
    const avgAcv = csmStats.length > 0 ? Math.round(csmStats.reduce((s, c) => s + c.acv, 0) / csmStats.length) : 0;
    html += `<div style="font-size:0.68rem;color:#706e6b;margin-bottom:0.5rem;">Avg: ${avgAccts} accounts, ${fmtAcv(avgAcv)} ACV per CSM</div>`;
    [...csmStats].sort((a, b) => b.total - a.total).forEach(c => {
        const pct = Math.round((c.total / maxAccts) * 100);
        const imbalance = c.total > avgAccts * 1.5 ? ' <span style="color:#c23934;font-size:0.6rem;">▲ heavy</span>' : c.total < avgAccts * 0.5 ? ' <span style="color:#706e6b;font-size:0.6rem;">▽ light</span>' : '';
        html += `<div class="analysis-bar-row csm-clickable" data-csm="${esc(c.csm)}" title="${c.csm}: ${c.total} accounts, ${fmtAcv(c.acv)} ACV"><span class="analysis-bar-label">${c.csm.split(' ')[0]}</span><div class="analysis-bar-track"><div class="analysis-bar-fill blue" style="width:${pct}%"></div></div><span class="analysis-bar-pct">${c.total} accts${imbalance}</span></div>`;
    });
    html += '</div></div>';

    // Panel 6: Renewal Timeline
    html += '<div class="analysis-panel"><div class="analysis-panel-header">Renewal Timeline</div><div class="analysis-panel-body">';
    const now = TODAY;
    const bands = [
        { label: 'This Quarter', filter: a => a.renewalDate && new Date(a.renewalDate+'T00:00:00') >= FQ_START && new Date(a.renewalDate+'T00:00:00') <= FQ_END },
        { label: 'Next 6 months', filter: a => { if (!a.renewalDate) return false; const d = new Date(a.renewalDate+'T00:00:00'); const sixMo = new Date(now); sixMo.setMonth(sixMo.getMonth()+6); return d > FQ_END && d <= sixMo; }},
        { label: '6–12 months', filter: a => { if (!a.renewalDate) return false; const d = new Date(a.renewalDate+'T00:00:00'); const sixMo = new Date(now); sixMo.setMonth(sixMo.getMonth()+6); const twelveMo = new Date(now); twelveMo.setMonth(twelveMo.getMonth()+12); return d > sixMo && d <= twelveMo; }},
        { label: '12+ months', filter: a => { if (!a.renewalDate) return false; const d = new Date(a.renewalDate+'T00:00:00'); const twelveMo = new Date(now); twelveMo.setMonth(twelveMo.getMonth()+12); return d > twelveMo; }}
    ];
    bands.forEach(b => {
        const accts = accounts.filter(b.filter);
        const acv = accts.reduce((s, a) => s + (a.priorAcv || 0), 0);
        html += `<div class="analysis-kpi-row"><span class="analysis-kpi-label">${b.label} (${accts.length} accts)</span><span class="analysis-kpi-value">${fmtAcv(acv)}</span></div>`;
    });
    html += '</div></div>';

    html += '</div>'; // end grid

    // Insights section
    if (insights.length > 0) {
        html += '<div style="padding:0 1.5rem 1.5rem"><div class="analysis-panel"><div class="analysis-panel-header">Coaching & Risk Insights</div><div class="analysis-panel-body">';
        insights.forEach(i => {
            html += `<div class="analysis-insight ${i.type}">${i.text}</div>`;
        });
        html += '</div></div></div>';
    }

    panel.innerHTML = html;

    // Make CSM bars clickable — navigate to By CSM tab with that CSM selected
    panel.querySelectorAll('.csm-clickable').forEach(row => {
        row.addEventListener('click', () => {
            const csmName = row.dataset.csm;
            const csmTab = document.querySelector('[data-tab="bycsm"]');
            const filterEl = document.getElementById('csm-filter');
            if (csmTab && filterEl) {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                csmTab.classList.add('active');
                document.getElementById('tab-bycsm').classList.add('active');
                filterEl.value = csmName;
                renderByCSM(csmName);
            }
        });
    });
});

// Compliance Nudge Modal
(function() {
    const style = document.createElement('style');
    style.textContent = `
        .nudge-trigger { cursor: pointer; text-decoration: underline dotted #c23934; text-underline-offset: 2px; }
        .nudge-trigger:hover { background: #fef0f0; border-radius: 3px; }
        .nudge-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:9999; align-items:center; justify-content:center; }
        .nudge-overlay.active { display:flex; }
        .nudge-modal { background:#fff; border-radius:0.75rem; width:560px; max-width:90vw; max-height:80vh; overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,0.2); }
        .nudge-modal-header { padding:1rem 1.5rem; border-bottom:1px solid #e5e5e5; display:flex; align-items:center; justify-content:space-between; }
        .nudge-modal-header h3 { margin:0; font-size:0.9rem; color:#032d60; }
        .nudge-modal-close { background:none; border:none; font-size:1.2rem; cursor:pointer; color:#706e6b; padding:4px 8px; }
        .nudge-modal-body { padding:1.5rem; }
        .nudge-modal-body .nudge-to { font-size:0.75rem; color:#706e6b; margin-bottom:0.5rem; }
        .nudge-modal-body .nudge-message { background:#f8f9fa; border:1px solid #e5e5e5; border-radius:0.5rem; padding:1rem; font-size:0.78rem; line-height:1.6; white-space:pre-wrap; color:#181818; }
        .nudge-modal-footer { padding:1rem 1.5rem; border-top:1px solid #e5e5e5; display:flex; gap:0.75rem; justify-content:flex-end; align-items:center; }
        .nudge-btn { padding:0.5rem 1rem; border-radius:0.25rem; font-size:0.78rem; font-weight:600; cursor:pointer; border:none; }
        .nudge-btn-primary { background:#0176d3; color:#fff; }
        .nudge-btn-primary:hover { background:#014486; }
        .nudge-btn-secondary { background:#f3f3f3; color:#3e3e3c; border:1px solid #d8d8d8; }
        .nudge-btn-secondary:hover { background:#e5e5e5; }
        .nudge-copied { font-size:0.7rem; color:#2e844a; font-weight:600; display:none; }
        .nudge-sent-badge { display:inline-block; font-size:0.55rem; background:#ebf7eb; color:#2e844a; padding:1px 5px; border-radius:3px; margin-left:4px; font-weight:600; vertical-align:middle; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'nudge-overlay';
    overlay.innerHTML = `
        <div class="nudge-modal">
            <div class="nudge-modal-header">
                <h3>Compliance Nudge</h3>
                <button class="nudge-modal-close">&times;</button>
            </div>
            <div class="nudge-modal-body">
                <div class="nudge-to"></div>
                <div class="nudge-message"></div>
            </div>
            <div class="nudge-modal-footer">
                <span class="nudge-copied">✓ Copied!</span>
                <button class="nudge-btn nudge-btn-secondary" data-action="dismiss">Dismiss</button>
                <button class="nudge-btn nudge-btn-primary" data-action="copy">Copy & Open Slack</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    function buildNudgeMessage(acct, type) {
        let msg = `Hi ${acct.csm.split(' ')[0]}! As part of our ongoing PACE compliance review, I'm doing a quick audit of CSG Notes and Red Account hashtags across the team. Could you take a look at this account when you get a chance?\n\n`;
        msg += `*${acct.name}*\n`;
        if (type === 'csg' || acct.compliance === 'fail') {
            msg += `• CSG Notes: ${acct.complianceReason}\n`;
            msg += `  → Renewal: ${acct.link}\n`;
        }
        if (type === 'ra' || acct.ra.some(r => r.raCompliance !== 'pass')) {
            const failRAs = acct.ra.filter(r => r.raCompliance !== 'pass');
            for (const r of failRAs) {
                msg += `• RA Headline: ${fmtRaReason(r.raReason)}\n`;
                msg += `  → Red Account: https://org62.lightning.force.com/lightning/r/Red_Account__c/${r.id}/view\n`;
            }
        }
        msg += `\nValid play hashtags: #SIGTRIAL  #ARI  #SWAP  #IMPLEMENT  #ADOPT  #RFP  #REVIVE`;
        msg += `\n📎 Hashtag Guide: https://idavydova-prog.github.io/book-of-business/cc/resources/hashtag-guide.html`;
        msg += `\n\nLet me know if you have any questions!`;
        return msg;
    }

    function openNudge(acctName, type) {
        const acct = accounts.find(a => a.name === acctName);
        if (!acct) return;
        const slackId = ((typeof slackDMs !== 'undefined') && slackDMs[acct.csm]) ? slackDMs[acct.csm] : ((typeof SLACK_IDS !== 'undefined') ? SLACK_IDS[acct.csm] : null);
        const msgEl = overlay.querySelector('.nudge-message');
        const toEl = overlay.querySelector('.nudge-to');
        const copiedEl = overlay.querySelector('.nudge-copied');
        copiedEl.style.display = 'none';
        toEl.textContent = `To: ${acct.csm}` + (slackId ? '' : ' (Slack ID not configured)');
        msgEl.textContent = buildNudgeMessage(acct, type);
        overlay.dataset.acct = acctName;
        overlay.dataset.csm = acct.csm;
        overlay.dataset.type = type;
        overlay.dataset.slackId = slackId || '';
        overlay.classList.add('active');
    }

    overlay.querySelector('.nudge-modal-close').addEventListener('click', () => overlay.classList.remove('active'));
    overlay.querySelector('[data-action="dismiss"]').addEventListener('click', () => overlay.classList.remove('active'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });

    overlay.querySelector('[data-action="copy"]').addEventListener('click', () => {
        const msg = overlay.querySelector('.nudge-message').textContent;
        const slackId = overlay.dataset.slackId;
        const acctName = overlay.dataset.acct;
        const type = overlay.dataset.type;

        function afterCopy() {
            markNudgeSent(acctName, type);
            const copiedEl = overlay.querySelector('.nudge-copied');
            copiedEl.style.display = 'inline';
            setTimeout(() => {
                copiedEl.style.display = 'none';
                overlay.classList.remove('active');
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab) activeTab.click();
            }, 1000);
            if (slackId) {
                window.open('https://salesforce.enterprise.slack.com/app_redirect?channel=' + slackId, '_blank');
            }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(msg).then(afterCopy).catch(() => {
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
            const ta = document.createElement('textarea');
            ta.value = msg;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            afterCopy();
        }
    });

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.nudge-trigger');
        if (!trigger) return;
        const acctName = trigger.dataset.acct;
        const type = trigger.dataset.type;
        if (acctName) openNudge(acctName, type);
    });
})();
