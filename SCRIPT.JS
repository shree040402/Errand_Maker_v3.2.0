/**
 * Errand Maker v3.2.0 - Professional Edition
 * Architecture: Unified Anchored Panel System, State Machine, ES6 Class
 */

const CONFIG = {
    MAX_NOTES: 4, MIN_NOTES: 1, 
    DEFAULT_PASS: 'zxcvbnm',
    SELECTORS: {
        grid: 'notes-grid', password: 'password-overlay',
        workspace: 'app-workspace', panel: 'unified-panel',
        iconSettings: 'icon-settings', lever: 'mode-lever',
        btnSettings: 'btn-settings', btnEdit: 'btn-calc-edit',
        brandIcon: 'brand-icon'
    },
    TOTAL_POOL: 36000
};

const DEFAULT_KPIS = [
    { name: 'Agent Resolution', min: 80, target: 85, exceed: 90, weight: 10, unit: '%' },
    { name: 'AHT Voice', min: 400, target: 350, exceed: 300, weight: 15, unit: 'sec' },
    { name: 'AHT Chat/Message', min: 600, target: 500, exceed: 450, weight: 15, unit: 'sec' },
    { name: 'Transfer (Voice/Chat)', min: 15, target: 10, exceed: 5, weight: 15, unit: 'count' },
    { name: 'CSAT - ETG', min: 3.5, target: 4.0, exceed: 4.5, weight: 15, unit: '%' },
    { name: 'CSAT - B.COM', min: 3.5, target: 4.0, exceed: 4.5, weight: 15, unit: '%' },
    { name: 'SUPPORT', min: 5, target: 3, exceed: 0, weight: 15, unit: '%' }
];

const DEFAULT_DEDUCTIONS_ADM = [
    { threshold: 1, ded: 10 }, { threshold: 2, ded: 25 }, { threshold: 3, ded: 60 }, { threshold: 4, ded: 100 }
];
const DEFAULT_DEDUCTIONS_LEAVE = [
    { threshold: 1, ded: 10 }, { threshold: 2, ded: 25 }, { threshold: 3, ded: 50 }, { threshold: 4, ded: 75 }, { threshold: 5, ded: 100 }
];

const DEFAULT_TEMPLATE_RAW = `Interaction Id → 
Order ID → 
Contact person → 
Query → 

Type of SC → 

OTRS → 

Solution → 

Options Offered →`;

// === APP STATE ===
const State = {
    notes: [], activeNoteId: null, 
    // undoStack removed in v3.2.0 (Tweak 1)
    ui: { settingsOpen: false, currentView: 'main', mode: 'errand', editingCalc: false },
    settings: {
        theme: localStorage.getItem('em_theme') || 'vintage-brew',
        autoHeight: localStorage.getItem('em_autoHeight') !== 'false',
        defaultTemplate: localStorage.getItem('em_defaultTemplate') || DEFAULT_TEMPLATE_RAW,
        alignment: localStorage.getItem('em_alignment') || 'auto',
        security: JSON.parse(localStorage.getItem('em_security')) || { active: false, password: CONFIG.DEFAULT_PASS }
    },
    calcConfig: JSON.parse(localStorage.getItem('em_calc_config')) || { kpis: DEFAULT_KPIS, adm: DEFAULT_DEDUCTIONS_ADM, leave: DEFAULT_DEDUCTIONS_LEAVE },
    calcState: JSON.parse(localStorage.getItem('em_calc_state')) || { scores: {}, adm: 0, leave: 0 }
};

const Utils = {
    generateId: () => Date.now().toString(36) + Math.random().toString(36).substr(2),
    isFuzzyMatch: (q, t) => {
        q = q.toLowerCase().trim(); t = t.toLowerCase().trim();
        if (q.length < 3) return false;
        if (q === t || t.includes(q)) return true;
        const m = []; for(let i=0; i<=t.length; i++) m[i] = [i]; for(let j=0; j<=q.length; j++) m[0][j] = j;
        for(let i=1; i<=t.length; i++) for(let j=1; j<=q.length; j++) 
            m[i][j] = t[i-1]===q[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
        return m[t.length][q.length] <= 1;
    },
    getCursor: (el) => {
        const s = window.getSelection(); if(!s.rangeCount) return 0;
        const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setEnd(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset);
        return r.toString().length;
    },
    setCursor: (el, idx) => {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        let c = 0, n; while(n = w.nextNode()){
            let next = c + n.length;
            if(idx >= c && idx <= next) {
                const r = document.createRange(); r.setStart(n, idx-c); r.collapse(true);
                const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); return;
            } c = next;
        }
    }
};

class ErrandMaker {
    constructor() { this.init(); }

    init() {
        this.applyTheme(); this.setupListeners(); this.renderYear();
        
        // Security Check
        const passOverlay = document.getElementById(CONFIG.SELECTORS.password);
        if (State.settings.security.active) {
            passOverlay.style.display = 'flex';
        } else {
            passOverlay.style.display = 'none';
            document.getElementById(CONFIG.SELECTORS.workspace).style.display = 'block';
        }

        this.createNote(State.settings.defaultTemplate); this.createNote(State.settings.defaultTemplate);
        if(State.notes.length > 0) State.activeNoteId = State.notes[0];
        
        this.initCalculator();
        this.applyAlignment();
        
        if(window.location.hash === '#money') this.toggleMode('money');
        else this.toggleMode('errand');
        
        this.updateGlobalButtons();
    }

    // === LEVER & ROUTING ===
    toggleMode(targetMode) {
        if(!targetMode) targetMode = State.ui.mode === 'errand' ? 'money' : 'errand';
        State.ui.mode = targetMode;

        const lever = document.getElementById(CONFIG.SELECTORS.lever);
        const pErrand = document.getElementById('page-errand');
        const pCalc = document.getElementById('page-calculator');
        const title = document.getElementById('app-title');
        const badge = document.getElementById('app-badge');
        const btnSettings = document.getElementById(CONFIG.SELECTORS.btnSettings);
        const btnEdit = document.getElementById(CONFIG.SELECTORS.btnEdit);
        const brandIcon = document.getElementById(CONFIG.SELECTORS.brandIcon);
        const iconContainer = document.querySelector('.icon-container');

        iconContainer.classList.add('flip-active');

        setTimeout(() => {
             if(targetMode === 'money') {
                brandIcon.className = "fa-solid fa-indian-rupee-sign";
            } else {
                brandIcon.className = "fa-solid fa-plane-departure";
            }
        }, 250);

        setTimeout(() => {
            iconContainer.classList.remove('flip-active');
        }, 650);

        if(targetMode === 'money') {
            lever.setAttribute('aria-checked', 'true');
            pErrand.classList.add('hidden-view'); pErrand.classList.remove('active-view');
            pCalc.classList.remove('hidden-view'); pCalc.classList.add('active-view');
            title.textContent = "Money Maker"; 
            badge.textContent = "Version 1.0.0"; 
            window.location.hash = 'money';
            
            document.getElementById('btn-add-note').style.visibility = 'hidden';
            document.getElementById('btn-remove-note').style.visibility = 'hidden';
            btnSettings.style.display = 'none'; 
            btnEdit.classList.remove('hidden');
            btnEdit.style.display = 'inline-flex';
            
            if(State.ui.settingsOpen) this.closeSettings();

        } else {
            lever.setAttribute('aria-checked', 'false');
            pCalc.classList.add('hidden-view'); pCalc.classList.remove('active-view');
            pErrand.classList.remove('hidden-view'); pErrand.classList.add('active-view');
            title.textContent = "Errand Maker"; 
            badge.textContent = "Version 3.2.0"; 
            window.location.hash = 'home';
            
            document.getElementById('btn-add-note').style.visibility = 'visible';
            document.getElementById('btn-remove-note').style.visibility = 'visible';
            btnSettings.style.display = 'inline-flex';
            btnEdit.style.display = 'none';
        }
    }

    // === SETTINGS LOGIC ===
    toggleSettings() {
        if (State.ui.settingsOpen) {
            if (State.ui.currentView === 'main') { this.closeSettings(); } else { this.renderSettingsMain(); }
        } else { this.openSettings(); }
    }
    openSettings() {
        State.ui.settingsOpen = true;
        const panel = document.getElementById(CONFIG.SELECTORS.panel);
        panel.classList.remove('hidden'); panel.classList.add('panel-open');
        this.renderSettingsMain();
    }
    closeSettings() {
        State.ui.settingsOpen = false; State.ui.currentView = 'main';
        const panel = document.getElementById(CONFIG.SELECTORS.panel);
        panel.classList.add('hidden'); panel.classList.remove('panel-open');
        this.updateSettingsIcon();
    }
    updateSettingsIcon() {
        const icon = document.getElementById(CONFIG.SELECTORS.iconSettings);
        icon.className = ''; 
        if (!State.ui.settingsOpen) { icon.className = 'fa-solid fa-gear'; } 
        else { if (State.ui.currentView === 'main') { icon.className = 'fa-solid fa-xmark'; } else { icon.className = 'fa-solid fa-arrow-left'; } }
    }

    renderSettingsMain() {
        State.ui.currentView = 'main'; this.updateSettingsIcon();
        const isSingleNote = State.notes.length === 1;
        
        const alignItem = isSingleNote 
            ? `<div class="menu-item disabled" title="Disabled (Requires 2+ notes)"><div><i class="fa-solid fa-table-columns"></i> Alignment</div><i class="fa-solid fa-ban" style="opacity:0.5; font-size:0.8em;"></i></div>`
            : `<div class="menu-item" onclick="app.renderAlignment()"><div><i class="fa-solid fa-table-columns"></i> Alignment</div><i class="fa-solid fa-chevron-right"></i></div>`;

        document.querySelector('#unified-panel .panel-content').innerHTML = `
            <div class="panel-header">System Settings</div>
            <div class="panel-body">
                <div class="menu-item" onclick="app.renderSecurity()"><div><i class="fa-solid fa-lock"></i> Security</div><i class="fa-solid fa-chevron-right"></i></div>
                <div class="menu-item" onclick="app.toggleAutoHeight()"><div><i class="fa-solid fa-arrows-up-down"></i> Auto-Expand</div><span class="status-badge">${State.settings.autoHeight ? 'ON' : 'OFF'}</span></div>
                
                ${alignItem}

                <div class="menu-item" onclick="app.renderMoods()"><div><i class="fa-solid fa-palette"></i> Theme</div><i class="fa-solid fa-chevron-right"></i></div>
                <div class="menu-item" onclick="app.renderTemplates()"><div><i class="fa-solid fa-list-check"></i> Template Manager</div><i class="fa-solid fa-chevron-right"></i></div>
                <div class="menu-item" onclick="app.renderDefaults()"><div><i class="fa-solid fa-file-pen"></i> Default Form</div><i class="fa-solid fa-chevron-right"></i></div>
                <div class="menu-item" onclick="app.renderHistory()"><div><i class="fa-solid fa-clock-rotate-left"></i> Note History</div><i class="fa-solid fa-chevron-right"></i></div>
            </div>
        `;
    }

    renderSecurity() {
        State.ui.currentView = 'security'; this.updateSettingsIcon();
        const sec = State.settings.security;
        document.querySelector('#unified-panel .panel-content').innerHTML = `
            <div class="panel-header">Security</div>
            <div class="panel-body">
                <div class="security-setting-group">
                    <div class="security-toggle">
                        <span>Protection</span>
                        <button class="small-switch ${sec.active ? 'active' : ''}" onclick="app.toggleSecurity()">
                            ${sec.active ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div class="security-pass-container">
                        <label style="font-size:0.85rem; display:block; margin-bottom:5px;">Access Key</label>
                        <input type="text" id="sec-pass-input" value="${sec.password}" ${sec.active ? '' : 'disabled'} oninput="app.saveSecurityPass(this.value)">
                    </div>
                </div>
            </div>
        `;
    }
    toggleSecurity() {
        State.settings.security.active = !State.settings.security.active;
        localStorage.setItem('em_security', JSON.stringify(State.settings.security));
        this.renderSecurity();
    }
    saveSecurityPass(val) {
        State.settings.security.password = val;
        localStorage.setItem('em_security', JSON.stringify(State.settings.security));
    }

    // REFINED ALIGNMENT PANEL
    renderAlignment() {
        State.ui.currentView = 'alignment'; this.updateSettingsIcon();
        const modes = [
            { id: 'vertical', name: 'Vertical', icon: 'fa-solid fa-arrows-up-down' },
            { id: 'horizontal', name: 'Horizontal', icon: 'fa-solid fa-arrows-left-right' },
            { id: 'auto', name: 'Auto', icon: 'fa-solid fa-wand-magic-sparkles' }
        ];
        
        // Horizontal Pill Layout
        const html = `
            <div class="alignment-wrapper">
                ${modes.map(m => `
                    <button class="align-pill-btn ${State.settings.alignment === m.id ? 'active' : ''}" onclick="app.setAlignment('${m.id}')">
                        <i class="${m.icon}"></i>
                        <span>${m.name}</span>
                    </button>
                `).join('')}
            </div>
        `;

        document.querySelector('#unified-panel .panel-content').innerHTML = `
            <div class="panel-header">Alignment</div>
            <div class="panel-body">
                ${html}
            </div>
        `;
    }

    setAlignment(mode) {
        State.settings.alignment = mode;
        localStorage.setItem('em_alignment', mode);
        this.applyAlignment();
        this.renderAlignment(); 
    }

    applyAlignment() {
        const grid = document.getElementById(CONFIG.SELECTORS.grid);
        grid.className = 'grid-container';
        grid.classList.add(`count-${State.notes.length}`);
        grid.classList.add(`grid-mode-${State.settings.alignment}`);
    }

    renderMoods() {
        State.ui.currentView = 'mood'; this.updateSettingsIcon();
        const themes = [{ id: 'vintage-brew', name: 'Vintage Brew' }, { id: 'aurora-flow', name: 'Aurora Flow' }, { id: 'slate-whisper', name: 'Slate Whisper' }, { id: 'neon-drift', name: 'Neon Drift' }];
        document.querySelector('#unified-panel .panel-content').innerHTML = `<div class="panel-header">Theme</div><div class="panel-body">${themes.map(t => `<button class="theme-select-btn" onclick="app.setTheme('${t.id}')">${t.name} ${State.settings.theme === t.id ? '(Active)' : ''}</button>`).join('')}</div>`;
    }
    renderDefaults() {
        State.ui.currentView = 'defaults'; this.updateSettingsIcon();
        document.querySelector('#unified-panel .panel-content').innerHTML = `<div class="panel-header">Default Form</div><div class="panel-body"><textarea id="temp-default-input">${State.settings.defaultTemplate}</textarea><div class="panel-actions"><button class="circle-btn primary-btn" onclick="app.saveDefault()"><i class="fa-solid fa-check"></i></button></div></div>`;
    }
    renderTemplates() {
        State.ui.currentView = 'templates'; this.updateSettingsIcon();
        const list = JSON.parse(localStorage.getItem('em_templates') || '[]');
        const listHtml = list.map((t, i) => `<div class="list-item"><div class="item-header"><strong>${t.title}</strong><button class="item-delete-btn circle-btn sm-btn" onclick="app.deleteTemplate(${i})"><i class="fa-solid fa-trash"></i></button></div><div class="item-preview">${t.content}</div></div>`).join('') || '<p style="text-align:center; opacity:0.6;">No templates.</p>';
        document.querySelector('#unified-panel .panel-content').innerHTML = `<div class="panel-header">Template Manager</div><div class="panel-body"><div style="max-height:200px; overflow-y:auto; margin-bottom:15px;">${listHtml}</div><input type="text" id="new-t-title" placeholder="Title"><textarea id="new-t-body" placeholder="Body..." style="min-height:80px;"></textarea><div class="panel-actions"><button class="circle-btn primary-btn" onclick="app.createTemplate()"><i class="fa-solid fa-plus"></i></button></div></div>`;
    }
    renderHistory() {
        State.ui.currentView = 'history'; this.updateSettingsIcon();
        const list = JSON.parse(localStorage.getItem('em_history') || '[]');
        const listHtml = list.map((h, i) => {
            let displayName = "Untitled Contact";
            const lines = h.content.split('\n');
            const contactLine = lines.find(l => l.includes('Contact person →'));
            if (contactLine) { const parts = contactLine.split('→'); if (parts.length > 1) { const extracted = parts[1].trim().replace(/^[,.]+|[,.]+$/g, '').trim(); if (extracted) displayName = extracted; } }
            return `<div class="list-item"><div class="item-header"><span style="font-size:0.75rem; opacity:0.7;">History Entry</span><button class="item-delete-btn circle-btn sm-btn" onclick="app.deleteHistory(${i})"><i class="fa-solid fa-trash"></i></button></div><div class="item-preview" onclick="app.loadHistory(${i})" title="${displayName}"><i class="fa-regular fa-user" style="margin-right:5px; font-size:0.8em;"></i> ${displayName}</div></div>`;
        }).join('') || '<p style="text-align:center; opacity:0.6;">No history.</p>';
        document.querySelector('#unified-panel .panel-content').innerHTML = `<div class="panel-header">Note History <button class="circle-btn sm-btn" onclick="app.clearHistory()"><i class="fa-solid fa-trash-can"></i></button></div><div class="panel-body"><div style="max-height:300px; overflow-y:auto;">${listHtml}</div></div>`;
    }

    toggleAutoHeight() { State.settings.autoHeight = !State.settings.autoHeight; localStorage.setItem('em_autoHeight', State.settings.autoHeight); this.applyTheme(); this.renderSettingsMain(); }
    setTheme(id) { State.settings.theme = id; localStorage.setItem('em_theme', id); this.applyTheme(); this.renderMoods(); }
    saveDefault() { State.settings.defaultTemplate = document.getElementById('temp-default-input').value; localStorage.setItem('em_defaultTemplate', State.settings.defaultTemplate); this.renderSettingsMain(); }
    createTemplate() { const t = document.getElementById('new-t-title').value; const c = document.getElementById('new-t-body').value; if(t && c) { const l = JSON.parse(localStorage.getItem('em_templates') || '[]'); l.push({ title: t, content: c }); localStorage.setItem('em_templates', JSON.stringify(l)); this.renderTemplates(); } }
    deleteTemplate(i) { const l = JSON.parse(localStorage.getItem('em_templates') || '[]'); l.splice(i, 1); localStorage.setItem('em_templates', JSON.stringify(l)); this.renderTemplates(); }
    loadHistory(i) { const l = JSON.parse(localStorage.getItem('em_history') || '[]'); const e = l[i]; if(e && State.activeNoteId) { const n = document.getElementById(State.activeNoteId) || document.querySelector('.note-card'); if(n) { n.querySelector('.note-body').innerText = e.content; this.updateHeader(n); this.closeSettings(); } } }
    deleteHistory(i) { const l = JSON.parse(localStorage.getItem('em_history') || '[]'); l.splice(i, 1); localStorage.setItem('em_history', JSON.stringify(l)); this.renderHistory(); }
    clearHistory() { localStorage.removeItem('em_history'); this.renderHistory(); }

    // === CALCULATOR LOGIC ===
    initCalculator() {
        this.renderMegaChart(); this.renderDeductions(); this.renderScoreCard(); this.calculatePayout();
        document.getElementById('btn-calc-edit').onclick = () => this.toggleEditMode();
        document.getElementById('input-adm-count').value = State.calcState.adm;
        document.getElementById('input-leave-count').value = State.calcState.leave;
        document.getElementById('input-adm-count').oninput = (e) => { State.calcState.adm = e.target.value; this.calculatePayout(); this.autosave(); };
        document.getElementById('input-leave-count').oninput = (e) => { State.calcState.leave = e.target.value; this.calculatePayout(); this.autosave(); };
    }
    renderMegaChart() {
        const tbody = document.getElementById('mega-chart-body');
        tbody.innerHTML = State.calcConfig.kpis.map((k, i) => `
            <tr>
                <td class="read-only" style="text-align:left; padding-left:20px;">${k.name} <small style="opacity:0.6; font-size:0.8em;">(${k.unit})</small></td>
                <td><input type="number" class="calc-cfg" data-idx="${i}" data-key="min" value="${k.min}" disabled></td>
                <td><input type="number" class="calc-cfg" data-idx="${i}" data-key="target" value="${k.target}" disabled></td>
                <td><input type="number" class="calc-cfg" data-idx="${i}" data-key="exceed" value="${k.exceed}" disabled></td>
                <td><input type="number" class="calc-cfg" data-idx="${i}" data-key="weight" value="${k.weight}" disabled style="display:inline-block; width:70%; text-align:right;">%</td>
            </tr>
        `).join('');
    }
    renderDeductions() {
        const renderList = (id, list, type) => {
            document.getElementById(id).innerHTML = list.map((d, i) => `
                <div class="deduction-row">
                    <span>Count: <input type="number" class="ded-cfg" data-type="${type}" data-idx="${i}" data-key="threshold" value="${d.threshold}" disabled></span>
                    <span>Ded: <input type="number" class="ded-cfg" data-type="${type}" data-idx="${i}" data-key="ded" value="${d.ded}" disabled>%</span>
                </div>
            `).join('');
        };
        renderList('deduction-adm-list', State.calcConfig.adm, 'adm');
        renderList('deduction-leave-list', State.calcConfig.leave, 'leave');
    }
    renderScoreCard() {
        const grid = document.getElementById('score-card-grid');
        grid.innerHTML = State.calcConfig.kpis.map((k, i) => `
            <div class="score-item">
                <label>${k.name}</label>
                <input type="number" class="score-input" data-idx="${i}" value="${State.calcState.scores[i] || ''}" placeholder="Actual (${k.unit})">
                <div class="payout-preview" id="payout-preview-${i}">₹0</div>
            </div>
        `).join('');
        document.querySelectorAll('.score-input').forEach(inp => { inp.oninput = (e) => { State.calcState.scores[e.target.dataset.idx] = e.target.value; this.calculatePayout(); this.autosave(); }; });
    }
    calculatePayout() {
        let totalSub = 0; const totalPool = CONFIG.TOTAL_POOL;
        State.calcConfig.kpis.forEach((k, i) => {
            const actual = parseFloat(State.calcState.scores[i]);
            const maxPayout = (k.weight / 100) * totalPool;
            let percent = 0;
            if (!isNaN(actual)) {
                const higherBetter = k.min < k.exceed;
                let score = 0;
                if (higherBetter) {
                    if (actual >= k.exceed) score = 1; else if (actual <= k.min) score = 0;
                    else if (actual >= k.target) score = 0.5 + ((actual - k.target) / (k.exceed - k.target) * 0.5);
                    else score = ((actual - k.min) / (k.target - k.min) * 0.5);
                } else {
                    if (actual <= k.exceed) score = 1; else if (actual >= k.min) score = 0;
                    else if (actual <= k.target) score = 0.5 + ((k.target - actual) / (k.target - k.exceed) * 0.5);
                    else score = ((k.min - actual) / (k.min - k.target) * 0.5);
                }
                percent = score;
            }
            const payout = Math.round(percent * maxPayout);
            totalSub += payout;
            document.getElementById(`payout-preview-${i}`).textContent = `₹${payout.toLocaleString()}`;
        });
        const admCount = parseInt(State.calcState.adm) || 0;
        const leaveCount = parseInt(State.calcState.leave) || 0;
        const getDed = (list, count) => { let match = list.find(d => d.threshold === count); if(!match) { const max = Math.max(...list.map(d => d.threshold)); if(count > max) match = list.find(d => d.threshold === max); } return match ? match.ded : 0; };
        const admDed = getDed(State.calcConfig.adm, admCount);
        const leaveDed = getDed(State.calcConfig.leave, leaveCount);
        const appliedDed = Math.min(100, admDed + leaveDed);
        const final = Math.round(totalSub * (1 - (appliedDed / 100)));
        
        document.getElementById('calc-status-display').innerHTML = `
            <div class="stat-segment">Subtotal: <span>₹${totalSub.toLocaleString()}</span></div>
            <div class="stat-arrow"><i class="fa-solid fa-arrow-right"></i></div>
            <div class="stat-segment">Deduction: <span>${appliedDed}%</span></div>
            <div class="stat-arrow"><i class="fa-solid fa-arrow-right"></i></div>
            <div class="stat-segment final">Final: <span>₹${final.toLocaleString()}</span></div>
        `;
    }
    autosave() { localStorage.setItem('em_calc_state', JSON.stringify(State.calcState)); }
    toggleEditMode() {
        const btn = document.getElementById(CONFIG.SELECTORS.btnEdit);
        const indicator = document.getElementById('edit-mode-indicator');
        const inputs = document.querySelectorAll('.calc-cfg, .ded-cfg');
        if(!State.ui.editingCalc) {
            State.ui.editingCalc = true; document.body.classList.add('is-editing');
            btn.innerHTML = '<i class="fa-solid fa-check"></i>'; btn.title = "Save Changes";
            indicator.classList.remove('hidden'); inputs.forEach(i => i.disabled = false);
        } else {
            this.saveConfigFromInputs(); State.ui.editingCalc = false; document.body.classList.remove('is-editing');
            btn.innerHTML = '<i class="fa-solid fa-pencil"></i>'; btn.title = "Edit Configuration";
            indicator.classList.add('hidden'); inputs.forEach(i => i.disabled = true);
        }
    }
    saveConfigFromInputs() {
        document.querySelectorAll('.calc-cfg').forEach(inp => { State.calcConfig.kpis[inp.dataset.idx][inp.dataset.key] = parseFloat(inp.value); });
        const readDed = (type, list) => { document.querySelectorAll(`.ded-cfg[data-type="${type}"]`).forEach(inp => { list[inp.dataset.idx][inp.dataset.key] = parseInt(inp.value); }); };
        readDed('adm', State.calcConfig.adm); readDed('leave', State.calcConfig.leave);
        localStorage.setItem('em_calc_config', JSON.stringify(State.calcConfig)); this.calculatePayout();
    }

    // === NOTE LOGIC ===
    applyTheme() { document.body.className = State.settings.theme; if(State.settings.autoHeight) document.body.classList.add('auto-height-enabled'); else document.body.classList.remove('auto-height-enabled'); }
    
    createNote(c) {
        if(State.notes.length>=CONFIG.MAX_NOTES)return; const id=Utils.generateId(); const d=document.createElement('div'); d.className='note-card'; d.id=id;
        
        // Tweak 1: Add Birth Animation
        d.classList.add('anim-enter');
        
        d.innerHTML=`<div class="note-header"><span class="contact-name">Untitled</span><div class="note-actions"><button class="circle-btn sm-btn act-ins">M</button><button class="circle-btn sm-btn act-cpy"><i class="fa-regular fa-copy"></i></button><button class="circle-btn sm-btn act-rst"><i class="fa-solid fa-rotate-right"></i></button></div></div><div class="note-body" contenteditable="true" spellcheck="false"></div>`;
        const b=d.querySelector('.note-body'); b.innerText=c;
        d.querySelector('.act-ins').onclick=()=>{b.focus();document.execCommand('insertText',false,' → ');}; d.querySelector('.act-ins').innerHTML='→';
        
        d.querySelector('.act-cpy').onclick=(e)=>{
            const btn = e.currentTarget;
            navigator.clipboard.writeText(b.innerText);
            this.saveHistory(b.innerText);
            btn.innerHTML='<i class="fa-solid fa-check"></i>';
            setTimeout(() => { btn.innerHTML='<i class="fa-regular fa-copy"></i>'; }, 1500);
        };

        // TWEAK 2: Button-based Undo Refresh (Isolated Per-Card)
        // Variables strictly scoped to this note instance
        let refreshBackup = '';
        let refreshTimeout = null;
        let isUndoState = false;
        const btnRefresh = d.querySelector('.act-rst');

        btnRefresh.onclick=()=>{
            if (isUndoState) {
                // User clicked UNDO
                clearTimeout(refreshTimeout);
                b.innerHTML = refreshBackup; // Restore content
                this.updateHeader(d);
                
                // Revert to Refresh State
                btnRefresh.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
                isUndoState = false;
                refreshBackup = '';
            } else {
                // User clicked REFRESH
                refreshBackup = b.innerHTML; // Save backup
                
                // Clear the note
                b.innerText = State.settings.defaultTemplate;
                this.updateHeader(d);

                // Switch to Undo State
                btnRefresh.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
                isUndoState = true;

                // Start 3 second timer
                refreshTimeout = setTimeout(() => {
                    // Time expired: Undo no longer available
                    btnRefresh.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
                    isUndoState = false;
                    refreshBackup = '';
                }, 3000);
            }
        };
        
        b.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            document.execCommand('insertText', false, text);
        });
        
        // TWEAK 1: Remove custom Ctrl+Z logic (Kept ArrowRight behavior)
        b.addEventListener('keydown', (e) => {
             if(e.ctrlKey&&e.key==='ArrowRight'){e.preventDefault();document.execCommand('insertText',false,' → ');}
        });

        b.addEventListener('focus',()=>State.activeNoteId=id); b.addEventListener('input',()=>{this.updateHeader(d);this.handleAutoFill(b);});
        document.getElementById(CONFIG.SELECTORS.grid).appendChild(d); State.notes.push(id); 
        this.updateGlobalButtons(); 
        this.applyAlignment();
        this.updateHeader(d);

        setTimeout(() => d.classList.remove('anim-enter'), 600);
    }

    handleAutoFill(e){const t=e.innerText;const l=t.split('\n');const ql=l.find(x=>x.startsWith('Query →'));if(!ql)return;const q=ql.replace('Query →','').trim();if(!q)return;const lst=JSON.parse(localStorage.getItem('em_templates')||'[]');const m=lst.find(x=>Utils.isFuzzyMatch(q,x.title));if(m){const r=e.innerHTML;if(r.includes(m.content.substring(0,10)))return;const p=r.split('Solution →');if(p.length>1){const c=Utils.getCursor(e);e.innerHTML=p[0]+'Solution → '+m.content+' '+p[1];Utils.setCursor(e,c);}}}
    updateHeader(d){const t=d.querySelector('.note-body').innerText;const l=t.split('\n').find(x=>x.includes('Contact person →'));const n=l?l.split('→')[1].trim():'Untitled';d.querySelector('.contact-name').textContent=n||'Untitled';}
    saveHistory(t){const l=JSON.parse(localStorage.getItem('em_history')||'[]');l.unshift({timestamp:new Date().toLocaleString(),content:t});if(l.length>50)l.pop();localStorage.setItem('em_history',JSON.stringify(l));}
    
    removeNote(){
        if(State.notes.length<=CONFIG.MIN_NOTES)return;
        
        const id=State.notes.pop(); 
        const el = document.getElementById(id);
        
        // Tweak 1: Trigger Exit Animation
        el.classList.add('anim-exit');
        
        setTimeout(() => {
            el.remove();
            if(State.activeNoteId===id&&State.notes.length>0)State.activeNoteId=State.notes[0];
            this.updateGlobalButtons();
            this.applyAlignment();
        }, 350);
    }

    updateGlobalButtons(){
        document.getElementById('btn-add-note').disabled=State.notes.length>=CONFIG.MAX_NOTES;
        document.getElementById('btn-remove-note').disabled=State.notes.length<=CONFIG.MIN_NOTES;
        
        if(State.ui.settingsOpen && State.ui.currentView === 'main') {
            this.renderSettingsMain();
        }
    }
    renderYear(){document.getElementById('year-display').textContent=new Date().getFullYear();}
    setupListeners(){
        document.getElementById('auth-btn').onclick=()=>{if(document.getElementById('password-input').value===State.settings.security.password){document.getElementById(CONFIG.SELECTORS.password).style.display='none';document.getElementById(CONFIG.SELECTORS.workspace).style.display='block';}else alert('Denied');};
        document.getElementById('btn-add-note').onclick=()=>this.createNote(State.settings.defaultTemplate);
        document.getElementById('btn-remove-note').onclick=()=>this.removeNote();
        document.getElementById('btn-settings').onclick=()=>this.toggleSettings();
        const lever = document.getElementById(CONFIG.SELECTORS.lever);
        lever.onclick = () => this.toggleMode();
        lever.onkeydown = (e) => { if(e.key==='Enter'||e.key===' ') { e.preventDefault(); this.toggleMode(); } };
    }
}

window.app = new ErrandMaker();