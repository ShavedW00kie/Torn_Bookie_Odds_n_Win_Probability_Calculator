// ==UserScript==
// @name         Torn Bookie Odds & Win Probability Calculator
// @namespace    https://github.com/ShavedW00kie/
// @version      1.00.00
// @description  Calculates and displays the predicted winner, odds, and win probability percentage inline on all Torn Bookie match headers (collapsed or expanded). Includes settings and diagnostic log.
// @author       ShavedW00kie (Torn: ThaWookie [2954173] )
// @license      BSD-3-Clause
// @homepageURL  https://github.com/ShavedW00kie
// @match        https://www.torn.com/page.php?sid=bookie*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @run-at       document-end
// ==/UserScript==

(function (GM_info) {
    'use strict';

    // Initialize modular debugger
    const MyDebug = initializeModularDebugger(GM_info ? GM_info.script.name : "Torn Bookie Calculator");
    const KEY_SETTINGS = "tb_calculator_settings";

    // Storage abstraction for PC Browser & TornPDA compatibility
    const store = {
        get(k, d) {
            try { return typeof GM_getValue === 'function' ? GM_getValue(k, d) : (JSON.parse(localStorage.getItem(k)) ?? d); }
            catch (e) { return d; }
        },
        set(k, v) {
            try { typeof GM_setValue === 'function' ? GM_setValue(k, v) : localStorage.setItem(k, JSON.stringify(v)); }
            catch (e) {}
        }
    };

    // Inject styles for inline badges, settings UI, and support buttons
    const style = document.createElement('style');
    style.textContent = `
        .tb-pred-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #1b2838;
            color: #8fe3a8;
            border: 1px solid #2a475e;
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 10px;
            vertical-align: middle;
            box-shadow: 0 1px 3px rgba(0,0,0,0.4);
            white-space: nowrap;
            z-index: 5;
        }
        .tb-pred-badge .tb-team { color: #ffffff; }
        .tb-pred-badge .tb-odds { color: #ffda6a; }
        .tb-pred-badge .tb-pct { color: #62d490; }

        /* Settings Panel & UI */
        #tb-settings-btn {
            position: fixed;
            right: 14px;
            bottom: 14px;
            z-index: 99998;
            width: 42px;
            height: 42px;
            border-radius: 21px;
            background: #14181c;
            color: #8fe3a8;
            border: 1px solid #2c343b;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 3px 10px rgba(0,0,0,0.5);
            cursor: pointer;
            touch-action: manipulation;
        }
        #tb-settings-btn:active { transform: scale(0.94); }
        #tb-settings-panel {
            position: fixed;
            top: 70px;
            right: 12px;
            width: 340px;
            max-width: calc(100vw - 24px);
            max-height: calc(100vh - 90px);
            overflow: auto;
            padding: 16px;
            background: #14181c;
            color: #dfe4e8;
            border: 1px solid #2c343b;
            border-radius: 10px;
            z-index: 99999;
            font: 13px/1.4 system-ui, sans-serif;
            box-shadow: 0 6px 24px rgba(0,0,0,0.8);
            box-sizing: border-box;
        }
        #tb-settings-panel[hidden] { display: none !important; }
        #tb-settings-panel h3 { margin: 0 0 12px; color: #8fe3a8; border-bottom: 1px solid #2c343b; padding-bottom: 8px; }
        #tb-settings-panel .tb-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        #tb-settings-panel button {
            background: #1f3d2b; color: #8fe3a8; border: 1px solid #8fe3a8;
            border-radius: 4px; padding: 6px 12px; cursor: pointer; font-weight: bold;
        }
        #tb-settings-panel button:hover { background: #2a523a; }
        .tb-credit-line { margin-top: 12px; font-size: 11px; color: #8b969f; text-align: center; font-style: italic; }

        /* Donation UI Components */
        .tw-support-btn {
            display: inline-flex; align-items: center; justify-content: center;
            padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: bold;
            color: #fff !important; text-decoration: none !important; border: 1px solid #555;
            transition: transform 0.2s ease; cursor: pointer; width: 100%; box-sizing: border-box;
        }
        .tw-support-btn:active { transform: scale(0.95); }
        .tw-bmc { background-color: #FFDD00; color: #000 !important; border-color: #FFDD00; }
        .tw-torn-tip { background-color: #8ab63d; border-color: #6a8c2f; }
    `;
    (document.head || document.body).appendChild(style);

    // Parse decimal or fractional odds (e.g. "x1.30", "1.30", "23/5", "3/10") into a decimal multiplier
    function parseOdds(text) {
        if (!text) return null;
        let str = text.trim().replace(/^x/i, '');
        if (str.includes('/')) {
            const parts = str.split('/');
            const num = parseFloat(parts[0]);
            const den = parseFloat(parts[1]);
            if (!isNaN(num) && !isNaN(den) && den !== 0) {
                return (num / den) + 1.0;
            }
        }
        const dec = parseFloat(str);
        return (!isNaN(dec) && dec > 1.0) ? dec : null;
    }

    // Process a single match element block
    function processMatch(matchEl) {
        if (matchEl.dataset.tbProcessed === 'true') return;

        // Locate outcomes within the match block
        const outcomeEls = matchEl.querySelectorAll('li[class*="outcome"], div[class*="outcome"], .outcome-item, [class*="betGroup"] > div, .outcomes > div');
        let outcomes = [];

        outcomeEls.forEach(el => {
            const text = el.innerText || '';
            const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
            
            let name = '';
            let decimalOdds = null;

            // Extract odds and team names from outcome container text or child elements
            const oddsEl = el.querySelector('[class*="odds"], .multiplier, .val');
            const nameEl = el.querySelector('[class*="name"], .team, .title');

            if (nameEl) name = nameEl.innerText.trim();
            if (oddsEl) decimalOdds = parseOdds(oddsEl.innerText);

            // Fallback text parsing if elements aren't distinctly classed
            if (!decimalOdds || !name) {
                for (const line of lines) {
                    const parsed = parseOdds(line);
                    if (parsed && !decimalOdds) {
                        decimalOdds = parsed;
                    } else if (!name && !/^\d+\/\d+$/.test(line) && !/^x?\d+(\.\d+)?$/i.test(line)) {
                        name = line;
                    }
                }
            }

            if (name && decimalOdds) {
                outcomes.push({ name, odds: decimalOdds });
            }
        });

        if (!outcomes.length) return;

        // Determine outcome with lowest decimal odds (highest win probability)
        outcomes.sort((a, b) => a.odds - b.odds);
        const favorite = outcomes[0];
        const winProbPct = ((1 / favorite.odds) * 100).toFixed(1);

        // Target header row to insert inline badge (works collapsed or expanded)
        const headerEl = matchEl.querySelector('.title, .header, [class*="matchHeader"], [class*="title"], h4, .desc') || matchEl.firstElementChild;
        if (headerEl && !headerEl.querySelector('.tb-pred-badge')) {
            const badge = document.createElement('span');
            badge.className = 'tb-pred-badge';
            badge.innerHTML = `<span class="tb-team">${favorite.name}</span> <span class="tb-odds">x${favorite.odds.toFixed(2)}</span> <span class="tb-pct">(${winProbPct}%)</span>`;
            headerEl.appendChild(badge);
            matchEl.dataset.tbProcessed = 'true';
            MyDebug.log({ event: "match-processed", team: favorite.name, odds: favorite.odds, pct: winProbPct });
        }
    }

    // Scan page for matches
    function scanMatches() {
        const matchNodes = document.querySelectorAll('.match, [class*="matchRow"], [class*="accordionItem"], div[id*="match-"], div[class*="bookieRow"]');
        if (matchNodes.length) {
            matchNodes.forEach(processMatch);
        } else {
            // Fallback scan on standard list containers
            document.querySelectorAll('ul > li, div[class*="group"]').forEach(el => {
                if (el.querySelector('[class*="outcome"], .multiplier')) {
                    processMatch(el);
                }
            });
        }
    }

    // Build Settings & UI Panel
    function buildUI() {
        const settingsBtn = document.createElement('div');
        settingsBtn.id = 'tb-settings-btn';
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.title = 'Bookie Calculator Settings';
        document.body.appendChild(settingsBtn);

        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'tb-settings-panel';
        settingsPanel.hidden = true;
        settingsPanel.innerHTML = `
            <h3>Bookie Calculator Settings</h3>
            <p style="margin: 4px 0 12px; color: #8b969f;">Calculates and displays implicit win probabilities inline for every match on Torn Bookie.</p>
            <div class="tb-actions">
                <button id="tb-rescan-btn">Rescan Page</button>
                <button id="tb-close-settings">Close</button>
            </div>
            <hr style="border: 0; border-top: 1px solid #2c343b; margin: 12px 0;">
            <div class="tb-actions">
                <button id="tb-debug-btn" aria-label="Toggle debug log">🪲 Debugger</button>
                <button id="tb-copy-debug">📋 Copy Logs</button>
                <a href="https://www.buymeacoffee.com/bittick1c" target="_blank" rel="noopener noreferrer" class="tw-support-btn tw-bmc">☕ Buy Me a Coffee</a>
                <a href="https://www.torn.com/item.php" target="_blank" rel="noopener noreferrer" class="tw-support-btn tw-torn-tip" title="Opens Items — search 'Xanax', tap Send, enter ThaWookie [2954173]">💊 Send a Xanax Tip</a>
            </div>
            <div class="tb-credit-line">Created by ShavedW00kie (Torn: ThaWookie [2954173])</div>
        `;
        document.body.appendChild(settingsPanel);

        settingsBtn.onclick = () => settingsPanel.hidden = !settingsPanel.hidden;
        settingsPanel.querySelector('#tb-close-settings').onclick = () => settingsPanel.hidden = true;
        settingsPanel.querySelector('#tb-rescan-btn').onclick = () => { scanMatches(); MyDebug.log("Manual rescan triggered."); };
        settingsPanel.querySelector('#tb-debug-btn').onclick = () => MyDebug.toggleView();
        settingsPanel.querySelector('#tb-copy-debug').onclick = function () { MyDebug.copy(this); };
    }

    // Initialization and MutationObserver setup
    function init() {
        buildUI();
        scanMatches();

        const observer = new MutationObserver(records => {
            let shouldScan = false;
            for (const record of records) {
                if (record.addedNodes.length || record.type === 'childList') {
                    shouldScan = true;
                    break;
                }
            }
            if (shouldScan) scanMatches();
        });

        observer.observe(document.body, { childList: true, subtree: true });
        MyDebug.log({ event: "initialized", version: "1.00.00" });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

/**
 * File: userscript-debugger-module.js
 * Version 1.0.4
 * Advanced Modular Userscript Debugger Engine
 * Author: Github.com/ShavedW00kie/
 * License: BSD-3-Clause
 */
function initializeModularDebugger(scriptNamespace = 'App') {
    const randomSuffix = Math.random().toString(36).substring(2, 11);
    const prefix = `us-debug-${randomSuffix}`;
    const CLIPBOARD_MAX_CHARS = 10 * 1024 * 1024;
    const BUFFER_REDUCTION_SHY = 900 * 1024;
    const MAX_LOG_STRING_LENGTH = CLIPBOARD_MAX_CHARS - BUFFER_REDUCTION_SHY;
    const state = { logs: [], currentBufferLength: 0, domElements: { container: null, logArea: null } };

    function log(message) {
        const time = new Date().toLocaleTimeString();
        let cleanMessage = '';
        try { cleanMessage = typeof message === 'object' ? JSON.stringify(message) : String(message); } 
        catch (e) { cleanMessage = `[Serialization Error] ${message}`; }
        
        const entry = `[${time}] ${cleanMessage}`;
        const entryLength = entry.length + 1;

        while (state.logs.length > 0 && (state.currentBufferLength + entryLength) > MAX_LOG_STRING_LENGTH) {
            const removed = state.logs.shift();
            if (removed) state.currentBufferLength -= (removed.length + 1);
        }

        if (entryLength <= MAX_LOG_STRING_LENGTH) {
            state.logs.push(entry);
            state.currentBufferLength += entryLength;
        }

        if (state.domElements.logArea) {
            state.domElements.logArea.innerText = state.logs.join('\n');
            if (state.domElements.container) state.domElements.container.scrollTop = state.domElements.container.scrollHeight;
        }
    }

    function warn(message) { log(`[WARN] ${message}`); }
    function error(message) { log(`[ERROR] ${message}`); }

    function copyLogs(buttonElement = null) {
        const payload = state.logs.join('\n');
        if (!payload) {
            if (buttonElement) buttonElement.innerText = "Empty!";
            setTimeout(() => { if (buttonElement) buttonElement.innerText = "Copy Logs"; }, 1500);
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(payload)
                .then(() => handleCopySuccess(buttonElement))
                .catch(() => handleCopyFallback(payload, buttonElement));
        } else {
            handleCopyFallback(payload, buttonElement);
        }
    }

    function handleCopySuccess(btn) {
        if (!btn) return;
        const baselineText = btn.innerText;
        btn.innerText = "Copied!";
        setTimeout(() => { btn.innerText = baselineText; }, 1500);
    }

    function handleCopyFallback(textData, btn) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = textData;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (success) handleCopySuccess(btn);
            else if (btn) btn.innerText = "Failed!";
        } catch (e) {
            if (btn) btn.innerText = "Error!";
            log(`Fallback copy system error: ${e.message}`);
        }
    }

    function toggleConsoleView() {
        let existingContainer = document.getElementById(`${prefix}-box`);
        if (existingContainer) {
            if (existingContainer.style.display === 'none') {
                existingContainer.style.display = 'block';
                state.domElements.logArea.innerText = state.logs.join('\n');
                existingContainer.scrollTop = existingContainer.scrollHeight;
            } else { existingContainer.style.display = 'none'; }
            return;
        }

        const container = document.createElement('div');
        container.id = `${prefix}-box`;
        container.style.cssText = `position:fixed;bottom:12px;right:12px;width:calc(100% - 24px);max-width:380px;height:250px;background:#181818;color:#00ff66;font-family:monospace;font-size:11px;padding:12px;z-index:2147483647;border:1px solid #00ff66;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.7);border-radius:4px;box-sizing:border-box;`;

        const header = document.createElement('div');
        header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #333;padding-bottom:5px;user-select:none;`;

        const title = document.createElement('span');
        title.innerText = `DEBUG LOG [${scriptNamespace}]`;
        title.style.cssText = `font-weight:bold;letter-spacing:0.5px;`;

        const buttonGroup = document.createElement('div');
        buttonGroup.style.cssText = `display:flex;gap:6px;`;

        const copyBtn = document.createElement('button');
        copyBtn.innerText = 'Copy';
        copyBtn.style.cssText = `background:#2a2a2a;color:#fff;border:1px solid #444;cursor:pointer;padding:3px 8px;font-size:10px;border-radius:3px;transition:all 0.2s;`;
        copyBtn.onclick = () => copyLogs(copyBtn);

        const closeBtn = document.createElement('button');
        closeBtn.innerText = 'Hide';
        closeBtn.style.cssText = `background:#a82020;color:#fff;border:none;cursor:pointer;padding:3px 8px;font-size:10px;border-radius:3px;`;
        closeBtn.onclick = () => { container.style.display = 'none'; };

        const logArea = document.createElement('div');
        logArea.id = `${prefix}-logs`;
        logArea.style.cssText = `white-space:pre-wrap;word-break:break-all;font-family:monospace;line-height:1.4;`;

        buttonGroup.appendChild(copyBtn);
        buttonGroup.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(buttonGroup);
        container.appendChild(header);
        container.appendChild(logArea);
        document.body.appendChild(container);

        state.domElements.container = container;
        state.domElements.logArea = logArea;
        logArea.innerText = state.logs.join('\n');
        container.scrollTop = container.scrollHeight;
    }

    return { log, warn, error, copy: copyLogs, toggleView: toggleConsoleView };
}

})(typeof GM_info !== "undefined" ? GM_info : null);
