// ==UserScript==
// @name         Torn Bookie Odds & Win Probability Calculator
// @namespace    https://github.com/ShavedW00kie/
// @version      1.01.00
// @description  Shows the predicted winner, its odds and win-probability % inline on every Torn Bookie match (collapsed or expanded). Desktop + TornPDA.
// @author       ShavedW00kie (Torn: ThaWookie [2954173] )
// @license      BSD-3-Clause
// @homepageURL  https://github.com/ShavedW00kie
// @match        https://www.torn.com/page.php?sid=bookie*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-start
// @noframes
// ==/UserScript==

/*
 * Torn Bookie Odds & Win Probability Calculator
 * Copyright (c) 2026 ShavedW00kie
 * License: BSD-3-Clause (full text is reproduced in the embedded debugger module below).
 *
 * No Torn API key is used or needed: the script only reads the odds Torn already
 * shows on the Bookie page. Nothing is sent anywhere.
 */

(function () {
    'use strict';

    /* ---------- Page guard: TornPDA ignores @match and injects on every Torn page ---------- */
    function isBookiePage() {
        try {
            const host = location.hostname;
            if (host !== 'www.torn.com' && host !== 'torn.com') return false;
            if (location.pathname !== '/page.php') return false;
            return new URLSearchParams(location.search).get('sid') === 'bookie';
        } catch (_) { return false; }
    }
    if (!isBookiePage()) return;

/**
 * File: userscript-debugger-module.js
 * Version: 1.0.4
 * Advanced Modular Userscript Debugger with optional DOM Inspector
 * Author: ShavedW00kie (Torn: ThaWookie [2954173] )
 * Namespace: https://github.com/ShavedW00kie/
 * Target: Embedded inside a Torn.com userscript IIFE (desktop and TornPDA).
 * License: BSD-3-Clause
 *
 * Copyright (c) 2026 ShavedW00kie
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * Integration inside the host userscript's IIFE, AFTER this function definition:
 *   const MyDebug = initializeModularDebugger(GM_info.script.name);
 *   MyDebug.log("Ready");
 *   bugButton.addEventListener("click", () => MyDebug.toggleView());
 *   copyButton.addEventListener("click", function () { void MyDebug.copy(this); });
 *   // Optional: MyDebug.inspect(), MyDebug.inspectElement(element),
 *   // MyDebug.watchElement(element), MyDebug.stopInspection(), MyDebug.destroy().
 *
 * This file is a source module, not an independently installable userscript.
 * The host userscript supplies its own ==UserScript== metadata and IIFE.
 */
function initializeModularDebugger(scriptNamespace) {
    "use strict";
    if (scriptNamespace === undefined) scriptNamespace = "App";

    const randomId = (() => {
        try {
            if (typeof crypto !== "undefined" && crypto.randomUUID) {
                return crypto.randomUUID().replace(/-/g, "");
            }
        } catch (_) { /* WebView fallback. */ }
        return Math.random().toString(36).slice(2) + Date.now().toString(36);
    })();
    const id = `tw-debug-${randomId}`;
    const LIMITS = Object.freeze({
        buffer: (10 * 1024 * 1024) - (900 * 1024),
        entry: 64 * 1024,
        renderEntries: 180,
        renderChars: 128 * 1024,
        report: 15000,
        html: 6000,
        parents: 6,
        children: 12,
        nodes: 65,
        mutations: 40
    });
    const state = {
        logs: [], head: 0, length: 0, destroyed: false, 
        frames: new Set(), statuses: new Map(), resizeObserver: null,
        root: null, logArea: null, inspector: null, inspectorText: null,
        style: null, statusBar: null, highlight: null,
        panelMode: "logs", selected: null, picking: false,
        watching: false, changeLog: [],
        observer: null, parentObserver: null, uiObserver: null,
        observedBody: null, renderPending: false,
        pendingMutations: 0, mutationLogPending: false,
        viewportListeners: false, highlightPending: false
    };
    const SENSITIVE = /(?:^key$|api[_-]?key|apikey|token|auth|authorization|cookie|secret|passwd|password|csrf|session|bearer|credential|client[_-]?secret|refresh[_-]?token|access[_-]?token)/i;
    const SAFE_ATTRIBUTES = new Set([
        "id", "class", "role", "type", "aria-expanded",
        "aria-hidden", "data-testid", "data-test", "data-role", "data-state"
    ]);

    /* ---------- Redacted, bounded logging ---------- */
    function redact(value) {
        return String(value)
            .replace(/\b(?:Authorization|Proxy-Authorization)\s*:\s*[^\r\n]+/gi, "Authorization: [REDACTED]")
            .replace(/\b[A-Za-z0-9]{16}\b/g, "[POSSIBLE KEY REDACTED]")
            // Bearer tokens and known secret-bearing URL parameters.
            .replace(/(\bBearer\s+)[A-Za-z0-9._~+/-]+/gi, "$1[REDACTED]")
            .replace(/([?&](?:key|api_key|token|access_token|refresh_token|secret|session|csrf)=)[^&#\s\"'<>}\]]+/gi, "$1[REDACTED]")
            // Quoted property values, including embedded spaces.
            .replace(/(["']?(?:api[_-]?key|apikey|token|authorization|cookie|password|passwd|secret|csrf|session|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*)(["'])([^"']*)\2/gi,
                (_, prefix, quote) => `${prefix}${quote}[REDACTED]${quote}`)
            // Unquoted key=value patterns.
            .replace(/(["']?(?:api[_-]?key|apikey|token|authorization|cookie|password|passwd|secret|csrf|session|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*)(?!["'])([^\s"',;}&\]]+)/gi,
                (_, prefix) => `${prefix}[REDACTED]`);
    }

    // Does not call getters or toJSON. Proxies can still execute traps; never
    // deliberately pass hostile proxies to an in-process diagnostic function.
    function safeSerialize(value) {
        let remaining = 240;
        const path = new WeakSet();
        function visit(item, depth) {
            if (--remaining < 0) return "[Traversal limit]";
            if (typeof item === "string") return redact(item.slice(0, 8192));
            if (item === null || typeof item === "boolean" || typeof item === "number") return item;
            if (typeof item === "undefined") return "[undefined]";
            if (typeof item === "bigint" || typeof item === "symbol") return String(item);
            if (typeof item === "function") return "[Function]";
            if (path.has(item)) return "[Circular]";
            if (depth >= 5) return "[Depth limit]";
            path.add(item);
            try {
                const result = Object.create(null);
                let count = 0;
                if (item instanceof Error) {
                    for (const key of ["name", "message", "stack"]) {
                        const descriptor = Object.getOwnPropertyDescriptor(item, key);
                        result[key] = descriptor && "value" in descriptor
                            ? visit(descriptor.value, depth + 1) : "[Unavailable/accessor]";
                    }
                }
                // for-in permits early exit without allocating Object.keys for
                // every property. Reflection itself is not a hard time limit.
                for (const key in item) {
                    if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
                    if (++count > 40 || remaining <= 0) { result["[Truncated]"] = true; break; }
                    const descriptor = Object.getOwnPropertyDescriptor(item, key);
                    result[redact(key.slice(0, 160))] = SENSITIVE.test(key) ? "[REDACTED]"
                        : descriptor && "value" in descriptor ? visit(descriptor.value, depth + 1) : "[Accessor omitted]";
                }
                return result;
            } catch (_) { return "[Unserializable]"; }
            finally { path.delete(item); }
        }
        try {
            if (typeof value === "string") return redact(value.slice(0, LIMITS.entry));
            return JSON.stringify(visit(value, 0));
        } catch (_) { return "[Unserializable]"; }
    }
    function scheduleFrame(callback) {
        if (state.destroyed) return;
        if (typeof requestAnimationFrame !== "function") { callback(); return; }
        const handle = requestAnimationFrame(() => {
            state.frames.delete(handle);
            if (!state.destroyed) callback();
        });
        state.frames.add(handle);
    }
    function trim(text, max) {
        text = String(text);
        return text.length > max ? `${text.slice(0, Math.max(0, max - 17))}[TRUNCATED]` : text;
    }
    function log(message, level = "INFO") {
        if (state.destroyed) return;
        const label = typeof level === "string" && /^(INFO|WARN|ERROR|DEBUG)$/i.test(level) ? level.toUpperCase() : "INFO";
        const timestamp = new Date().toISOString();
        const entry = trim(`[${timestamp}] [${label}] ${safeSerialize(message)}`, LIMITS.entry);
        const size = entry.length + 1;
        while (state.head < state.logs.length && state.length + size > LIMITS.buffer) {
            state.length -= state.logs[state.head].length + 1;
            state.logs[state.head++] = null; // Release pruned strings immediately.
        }
        if (state.head > 2048) { state.logs = state.logs.slice(state.head); state.head = 0; }
        state.logs.push(entry);
        state.length += size;
        queueRender();
    }
    const info = message => log(message, "INFO");
    const warn = message => log(message, "WARN");
    const error = message => log(message, "ERROR");
    function clear() {
        state.logs.length = 0;
        state.head = 0;
        state.length = 0;
        renderLogs();
    }
    function queueRender() {
        if (!state.logArea || !state.root || state.root.hidden || state.panelMode !== "logs") return;
        if (state.renderPending) return;
        state.renderPending = true;
        scheduleFrame(() => { state.renderPending = false; renderLogs(); });
    }
    function renderLogs() {
        if (state.destroyed || !state.root || state.root.hidden || !state.logArea || !state.logArea.isConnected || state.panelMode !== "logs") return;
        const subset = [];
        let chars = 0;
        for (let i = state.logs.length - 1; i >= state.head && subset.length < LIMITS.renderEntries; i--) {
            if (chars + state.logs[i].length + 1 > LIMITS.renderChars) break;
            subset.unshift(state.logs[i]); chars += state.logs[i].length + 1;
        }
        const skipped = state.logs.length - state.head - subset.length;
        state.logArea.textContent = (skipped ? `[${skipped} earlier entries retained for copying]\n` : "") + subset.join("\n");
        state.logArea.scrollTop = state.logArea.scrollHeight;
    }

    /* ---------- Clipboard (Tampermonkey, TornPDA, browser) ---------- */
    function copyFallback(text) {
        if (!document.body) return false;
        const input = document.createElement("textarea");
        const previousFocus = document.activeElement;
        const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
        const ranges = [];
        if (selection) for (let i = 0; i < selection.rangeCount; i++) ranges.push(selection.getRangeAt(i).cloneRange());
        let caret = null;
        try { if (previousFocus && typeof previousFocus.selectionStart === "number") caret = [previousFocus.selectionStart, previousFocus.selectionEnd, previousFocus.selectionDirection]; } catch (_) {}
        input.value = text;
        input.readOnly = true;
        input.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;z-index:-1";
        try {
            document.body.appendChild(input);
            input.focus();
            input.select();
            input.setSelectionRange(0, text.length);
            return Boolean(document.execCommand("copy"));
        } catch (_) { return false; }
        finally {
            input.remove();
            try { if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
                if (caret) previousFocus.setSelectionRange(...caret);
                if (selection) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); } } catch (_) { /* Non-focusable element. */ }
        }
    }
    async function writeClipboard(text) {
        try {
            if (typeof GM_setClipboard === "function") {
                await Promise.resolve(GM_setClipboard(text, "text"));
                return true;
            }
            if (typeof GM !== "undefined" && typeof GM.setClipboard === "function") {
                await GM.setClipboard(text, "text");
                return true;
            }
        } catch (_) { /* Try browser APIs. */ }
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
            try { await navigator.clipboard.writeText(text); return true; }
            catch (_) { /* Restricted WebView. */ }
        }
        return copyFallback(text);
    }
    function showCopyResult(button, result) {
        if (state.destroyed || !button || !button.isConnected) return;
        let saved = state.statuses.get(button);
        if (saved) clearTimeout(saved.timer);
        else saved = { nodes: Array.from(button.childNodes), timer: null };
        button.textContent = result;
        // This timer is only UI feedback, never element discovery or polling.
        saved.timer = setTimeout(() => {
            button.replaceChildren(...saved.nodes);
            state.statuses.delete(button);
        }, 1300);
        state.statuses.set(button, saved);
    }
    async function copy(button = null) {
        if (state.destroyed) return false;
        const text = state.logs.slice(state.head).join("\n");
        if (!text) { showCopyResult(button, "Empty"); return false; }
        const success = await writeClipboard(text);
        showCopyResult(button, success ? "Copied!" : "Failed");
        if (!success) warn("Clipboard unavailable. Open debugger to select and copy manually.");
        return success;
    }

    /* ---------- Safe DOM descriptions ---------- */
    function isElement(node) { return Boolean(node && node.nodeType === 1 && node.tagName); }
    function tag(node) { return isElement(node) ? node.tagName.toLowerCase() : "(none)"; }
    function describe(node) {
        if (!isElement(node)) return "(none)";
        let text = tag(node);
        const nodeId = node.getAttribute("id");
        if (nodeId && !SENSITIVE.test(nodeId)) text += `#${trim(redact(nodeId), 50)}`;
        const classes = Array.from(node.classList || []).filter(name => !SENSITIVE.test(name)).slice(0, 3);
        if (classes.length) text += "." + classes.map(name => trim(redact(name), 48)).join(".");
        return trim(text, 180);
    }
    function selectorSegment(node) {
        if (!isElement(node)) return "";
        const nodeId = node.getAttribute("id");
        if (nodeId && /^[A-Za-z_][\w-]{0,60}$/.test(nodeId) && !SENSITIVE.test(nodeId)) {
            return `#${nodeId}`;
        }
        let part = tag(node);
        const classNames = Array.from(node.classList || [])
            .filter(name => /^[A-Za-z_][\w-]{0,45}$/.test(name) && !SENSITIVE.test(name))
            .slice(0, 2);
        part += classNames.map(name => `.${name}`).join("");
        if (node.parentElement) {
            const same = Array.from(node.parentElement.children).filter(sibling => sibling.tagName === node.tagName);
            if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
        return part;
    }
    function makeSelector(element) {
        const segments = [];
        let current = element;
        for (let step = 0; step < LIMITS.parents && isElement(current); step++) {
            const segment = selectorSegment(current);
            segments.unshift(segment);
            if (segment.startsWith("#")) break;
            current = current.parentElement;
        }
        const selector = segments.join(" > ");
        if (selector.length > 500) return "(selector exceeds safe length)";
        if (redact(selector) !== selector) return "(selector omitted: possible credential)";
        return selector;
    }
    function safeAttributeText(element) {
        const result = [];
        if (!isElement(element)) return "";
        for (const attr of Array.from(element.attributes || [])) {
            if (!SAFE_ATTRIBUTES.has(attr.name) || SENSITIVE.test(attr.name)) continue;
            if (SENSITIVE.test(attr.value)) continue;
            result.push(`${attr.name}="${escapeHTML(trim(redact(attr.value), 90))}"`);
            if (result.length >= 8) break;
        }
        return result.length ? ` ${result.join(" ")}` : "";
    }
    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }
    function structuralHTML(element) {
        let budget = LIMITS.nodes;
        const skip = /^(script|style|noscript|template|iframe|object|embed)$/i;
        function recurse(node, depth) {
            if (!isElement(node) || budget-- <= 0) return "";
            const name = tag(node);
            const open = `<${name}${safeAttributeText(node)}>`;
            if (skip.test(name)) return `${open}[contents omitted]</${name}>`;
            if (depth >= 2) return `${open}[descendants omitted]</${name}>`;
            const kids = Array.from(node.children).slice(0, LIMITS.children);
            const nested = kids.map(child => recurse(child, depth + 1)).join("\n");
            const note = node.children.length > LIMITS.children ? "\n[additional children omitted]" : "";
            return `${open}${nested ? `\n${nested}${note}\n` : "[text omitted]"}</${name}>`;
        }
        return trim(recurse(element, 0), LIMITS.html);
    }
    function reactRootHint(element) {
        let node = element;
        for (let i = 0; i < LIMITS.parents && isElement(node); i++, node = node.parentElement) {
            const candidateId = node.getAttribute("id") || "";
            if (/^(?:react-root|root|__next)$/i.test(candidateId) || node.hasAttribute("data-reactroot")) {
                return `${describe(node)} (heuristic only)`;
            }
        }
        return "Not detected (does not rule out React)";
    }
    function getInspectionReport() {
        const element = state.selected;
        if (!isElement(element)) return "No element selected.";
        const ancestors = [];
        let ancestor = element.parentElement;
        for (let i = 0; i < LIMITS.parents && isElement(ancestor); i++, ancestor = ancestor.parentElement) {
            ancestors.push(`  ${i + 1}. ${describe(ancestor)}`);
        }
        const children = Array.from(element.children).slice(0, LIMITS.children)
            .map((child, index) => `  ${index + 1}. ${describe(child)}`);
        const page = typeof location !== "undefined"
            ? (location.origin === "null" ? "(local document)" : `${location.origin}${location.pathname}`)
            : "(unknown)";
        return trim(redact([
            `DOM INSPECTION | ${redact(String(scriptNamespace))}`,
            `Time: ${new Date().toISOString()}`,
            `Page (query omitted): ${redact(page)}`,
            `Selected: ${describe(element)}`,
            `Connected: ${element.isConnected}`,
            `Selector (best effort): ${makeSelector(element)}`,
            `React container hint: ${reactRootHint(element)}`,
            `Parent chain:\n${ancestors.join("\n") || "  (none)"}`,
            `Immediate children (${element.children.length}):\n${children.join("\n") || "  (none)"}`,
            `Sibling context: previous=${describe(element.previousElementSibling)}, next=${describe(element.nextElementSibling)}`,
            `Structural preview (text nodes, form values, URLs and scripts omitted; review attributes before sharing):\n${structuralHTML(element)}`,
            `Recent observed mutations (${state.changeLog.length}):\n${state.changeLog.join("\n") || "  (none)"}`
        ].join("\n\n")), LIMITS.report);
    }

    /* ---------- On-demand DOM selection and mutation watch ---------- */
    function isOurUI(node) {
        return Boolean(isElement(node) && (
            (state.root && state.root.contains(node)) ||
            (state.highlight && state.highlight.contains(node))
        ));
    }
    function ensureHighlight() {
        if (state.destroyed || !state.selected || !state.root || state.root.hidden || state.panelMode !== "inspect") return null;
        if (state.highlight && state.highlight.isConnected) return state.highlight;
        if (!document.body) return null;
        const node = document.createElement("div");
        node.setAttribute("aria-hidden", "true");
        node.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #00dbff;box-shadow:0 0 0 1px #001e28;box-sizing:border-box;display:none";
        document.body.appendChild(node);
        state.highlight = node;
        return node;
    }
    function updateHighlight() {
        const marker = ensureHighlight();
        if (!marker) return;
        const node = state.selected;
        if (!isElement(node) || !node.isConnected || !state.root || state.root.hidden || state.panelMode !== "inspect") {
            marker.style.display = "none";
            return;
        }
        const rect = node.getBoundingClientRect();
        marker.style.display = "block";
        marker.style.top = `${rect.top}px`;
        marker.style.left = `${rect.left}px`;
        marker.style.width = `${rect.width}px`;
        marker.style.height = `${rect.height}px`;
    }
    function onViewportChanged() {
        if (state.destroyed || !state.selected || state.highlightPending || state.panelMode !== "inspect") return;
        state.highlightPending = true;
        scheduleFrame(() => {
            state.highlightPending = false;
            updateHighlight();
        });
    }
    function setViewportListeners(enable) {
        if (typeof window === "undefined" || enable === state.viewportListeners) return;
        state.viewportListeners = enable;
        const method = enable ? "addEventListener" : "removeEventListener";
        window[method]("scroll", onViewportChanged, true);
        window[method]("resize", onViewportChanged);
    }
    function removeHighlight() {
        if (state.highlight) { state.highlight.remove(); state.highlight = null; }
    }
    function updateInspector() {
        if (!state.inspectorText) return;
        state.inspectorText.textContent = state.selected ? trim([
            `Selected: ${describe(state.selected)}`,
            `Parent: ${describe(state.selected.parentElement)}`,
            `Children: ${state.selected.children.length}`,
            `Selector: ${makeSelector(state.selected)}`,
            `Connected: ${state.selected.isConnected}`,
            `Watch: ${state.watching ? "ON" : "OFF"} | Changes: ${state.changeLog.length}`
        ].join("\n"), 1100) : "Tap Pick, then tap a Torn page element.\nNo page data is collected until inspection is used.";
        if (state.statusBar) state.statusBar.textContent = state.picking ? "PICK MODE: tap a page element or press Esc" : "Inspector idle";
        updateHighlight();
    }
    function suppressPickAction(event) {
        if (isOurUI(event.target)) return;
        event.stopImmediatePropagation();
        // Preserve the browser synthetic click needed for tap selection.
    }
    function onPickClick(event) {
        if (isOurUI(event.target)) return;
        // Capture before Torn/React click handlers so selecting a link does not navigate.
        event.preventDefault();
        event.stopImmediatePropagation();
        if (isElement(event.target)) inspectElement(event.target);
        stopPicker();
    }
    function onPickKey(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            stopPicker();
            updateInspector();
        }
    }
    function startPicker() {
        if (state.destroyed || !state.root || !state.root.isConnected || state.root.hidden || state.picking) return;
        state.picking = true;
        document.addEventListener("click", onPickClick, true);
        ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup"].forEach(type => document.addEventListener(type, suppressPickAction, { capture: true, passive: false }));
        document.addEventListener("keydown", onPickKey, true);
        updateInspector();
    }
    function stopPicker() {
        if (!state.picking) return;
        state.picking = false;
        document.removeEventListener("click", onPickClick, true);
        ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup"].forEach(type => document.removeEventListener(type, suppressPickAction, true));
        document.removeEventListener("keydown", onPickKey, true);
        updateInspector();
    }
    function stopWatch() {
        if (state.observer) state.observer.disconnect();
        if (state.parentObserver) state.parentObserver.disconnect();
        state.observer = null;
        state.parentObserver = null;
        state.watching = false;
        state.pendingMutations = 0;
        updateInspector();
    }
    function handleMutations(mutations) {
        if (!state.watching) return;
        const stamp = new Date().toISOString();
        let changed = 0;
        for (const mutation of mutations) {
            if (changed >= 8) break;
            const detail = mutation.type === "characterData" ? "text node changed (content omitted)" : mutation.type === "attributes"
                ? `attribute ${mutation.attributeName} on ${describe(mutation.target)}`
                : `childList (+${mutation.addedNodes.length}/-${mutation.removedNodes.length}) on ${describe(mutation.target)}`;
            state.changeLog.push(`[${stamp}] ${detail}`);
            changed++;
        }
        while (state.changeLog.length > LIMITS.mutations) state.changeLog.shift();
        if (changed) {
            state.pendingMutations += changed;
            if (!state.mutationLogPending) {
                state.mutationLogPending = true;
                scheduleFrame(() => {
                    state.mutationLogPending = false;
                    const count = state.pendingMutations;
                    state.pendingMutations = 0;
                    if (count && state.watching) log(`DOM watch: ${count} sampled change(s) near ${describe(state.selected)}`, "DEBUG");
                });
            }
        }
        if (state.selected && !state.selected.isConnected) {
            warn(`DOM watch: selected element detached: ${describe(state.selected)}`);
            stopWatch();
        }
        updateInspector();
    }
    function watchElement(element = state.selected) {
        if (state.destroyed || !isElement(element) || !element.isConnected || element === document.documentElement || element === document.body) {
            warn("DOM watch requires a specific element, not the document root/body.");
            return false;
        }
        if (typeof MutationObserver === "undefined") {
            warn("MutationObserver is unavailable in this WebView.");
            return false;
        }
        stopWatch();
        if (element !== state.selected && !inspectElement(element)) return false;
        state.changeLog.length = 0;
        // Observe the chosen subtree and direct child lists along its ancestor chain.
        state.observer = new MutationObserver(handleMutations);
        state.observer.observe(element, {
            attributes: true, childList: true, characterData: true, subtree: true,
            attributeFilter: ["class", "id", "role", "aria-expanded", "hidden", "disabled", "data-state"]
        });
        if (element.parentElement) {
            state.parentObserver = new MutationObserver(handleMutations);
            let ancestor = element.parentElement;
            while (ancestor) {
                state.parentObserver.observe(ancestor, { childList: true });
                ancestor = ancestor.parentNode;
            }
        }
        state.watching = true;
        info(`DOM watch enabled: ${describe(element)}`);
        updateInspector();
        return true;
    }
    function moveSelection(direction) {
        const selected = state.selected;
        if (!isElement(selected)) return;
        const next = direction === "parent" ? selected.parentElement : selected.firstElementChild;
        if (next && next !== document.body && next !== document.documentElement) inspectElement(next);
    }
    function inspectElement(element) {
        if (state.destroyed || !isElement(element) || isOurUI(element) || !ensureUI()) return false;
        if (state.watching && state.selected !== element) stopWatch();
        state.selected = element;
        if (state.resizeObserver) state.resizeObserver.disconnect();
        if (typeof ResizeObserver === "function") {
            state.resizeObserver = new ResizeObserver(onViewportChanged);
            state.resizeObserver.observe(element);
        }
        state.changeLog.length = 0;
        showPanel("inspect");
        updateInspector();
        info(`DOM selected: ${describe(element)} | ${makeSelector(element)}`);
        return true;
    }
    function inspect() {
        if (!showPanel("inspect")) return false;
        startPicker();
        return true;
    }
    function stopInspection() {
        stopPicker();
        stopWatch();
        state.selected = null;
        if (state.resizeObserver) state.resizeObserver.disconnect();
        state.resizeObserver = null;
        state.changeLog.length = 0;
        removeHighlight();
        setViewportListeners(false);
        if (state.root && !state.root.hidden) showPanel("logs");
    }
    async function copyInspection(button = null) {
        if (state.destroyed) return false;
        if (!state.selected) { showCopyResult(button, "No selection"); return false; }
        const result = await writeClipboard(getInspectionReport());
        showCopyResult(button, result ? "Copied!" : "Failed");
        return result;
    }

    /* ---------- Compact UI, created on first use ---------- */
    function createButton(text, label, handler) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.className = `${id}-btn`;
        button.addEventListener("click", handler);
        return button;
    }
    function ensureStyles() {
        if (state.destroyed) return;
        if (state.style && state.style.isConnected) return;
        if (!document.head && !document.body) return;
        const style = document.createElement("style");
        style.id = `${id}-styles`;
        style.textContent = `
          @keyframes ${id}-reset {from{opacity:.7}to{opacity:1}}
          .${id}-flash{animation:${id}-reset 1.3s ease 1}
          #${id}{position:fixed;right:12px;bottom:12px;width:min(430px,calc(100vw - 24px));
            height:320px;max-height:70vh;display:flex;flex-direction:column;gap:8px;padding:10px;
            background:#191919;color:#e2ffe7;border:1px solid #46db85;border-radius:8px;
            box-shadow:0 6px 25px #0009;box-sizing:border-box;font:12px/1.45 monospace;
            z-index:2147483647;touch-action:manipulation}
          #${id}[hidden],#${id} [hidden]{display:none!important}
          #${id} button{font:11px/1.2 sans-serif;min-height:30px;cursor:pointer}
          #${id} .${id}-btn{border:1px solid #616161;border-radius:4px;background:#292929;
            color:#fff;padding:6px;touch-action:manipulation}
          #${id} .${id}-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
          #${id} .${id}-title{font-weight:bold;flex:1 1 120px;min-width:0;overflow:hidden;text-overflow:ellipsis}
          #${id} .${id}-body{flex:1;min-height:0;overflow:auto;white-space:pre-wrap;
            overflow-wrap:anywhere;user-select:text}
          #${id} .${id}-actions{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:5px}
          #${id} .${id}-status{font-size:11px;color:#ace3fc}
          #${id} button:focus-visible{outline:2px solid #91dfff;outline-offset:2px}
          @media(max-width:480px){#${id}{right:8px;bottom:8px;width:calc(100vw - 16px);
            height:290px;font-size:11px}}
          @media(prefers-reduced-motion:reduce){.${id}-flash{animation:none}}
        `;
        (document.head || document.body).appendChild(style);
        state.style = style;
    }
    function ensureUI() {
        if (state.destroyed) return false;
        if (state.root && state.root.isConnected) { ensureStyles(); return true; }
        if (!document.body) return false;
        ensureStyles();
        const root = document.createElement("section");
        root.id = id;
        root.hidden = true;
        root.setAttribute("aria-label", `Debug console: ${String(scriptNamespace)}`);
        const toolbar = document.createElement("div");
        toolbar.className = `${id}-toolbar`;
        const title = document.createElement("span");
        title.className = `${id}-title`;
        title.textContent = `🪲 ${String(scriptNamespace)}`;
        toolbar.append(title,
            createButton("Copy", "Copy logs", function () { void copy(this); }),
            createButton("Clear", "Clear logs", clear),
            createButton("🔍", "Inspect Torn DOM element", inspect),
            createButton("Hide", "Hide debugger", () => toggleView()));
        const logArea = document.createElement("pre");
        logArea.className = `${id}-body`;
        logArea.style.margin = "0";
        const inspector = document.createElement("div");
        inspector.className = `${id}-body`;
        inspector.hidden = true;
        const actions = document.createElement("div");
        actions.className = `${id}-actions`;
        actions.append(
            createButton("Pick", "Pick element by tapping it", startPicker),
            createButton("↑ Parent", "Inspect parent element", () => moveSelection("parent")),
            createButton("↓ Child", "Inspect first child element", () => moveSelection("child")),
            createButton("Watch", "Watch selected element for DOM mutations", () => { watchElement(); }),
            createButton("Stop watch", "Disconnect mutation observers", stopWatch),
            createButton("Copy DOM", "Copy sanitized DOM report", function () { void copyInspection(this); }),
            createButton("Exit", "Close inspector", stopInspection));
        const status = document.createElement("div");
        status.className = `${id}-status`;
        const details = document.createElement("pre");
        details.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;margin:5px 0;font:inherit";
        inspector.append(actions, status, details);
        root.append(toolbar, logArea, inspector);
        document.body.appendChild(root);
        Object.assign(state, { root, logArea, inspector, inspectorText: details, statusBar: status });
        attachUIObserver();
        return true;
    }
    function attachUIObserver() {
        if (typeof MutationObserver === "undefined" || !document.body) return;
        if (state.uiObserver) state.uiObserver.disconnect();
        // Only direct children of body, not the constantly changing React subtree.
        state.uiObserver = new MutationObserver(() => {
            if (state.root && (!state.root.isConnected || state.observedBody !== document.body)) {
                stopPicker();
                stopWatch();
                removeHighlight();
                setViewportListeners(false);
                if (state.root) state.root.remove();
                if (state.resizeObserver) state.resizeObserver.disconnect();
                state.resizeObserver = null;
                state.selected = null;
                state.root = state.logArea = state.inspector = state.inspectorText = state.statusBar = null;
                state.uiObserver.disconnect();
            }
        });
        state.uiObserver.observe(document.body, { childList: true });
        if (document.documentElement) state.uiObserver.observe(document.documentElement, { childList: true });
        state.observedBody = document.body;
    }
    function showPanel(panel) {
        if (!ensureUI()) return false;
        state.root.hidden = false;
        state.panelMode = panel;
        setViewportListeners(panel === "inspect");
        state.logArea.hidden = panel !== "logs";
        state.inspector.hidden = panel !== "inspect";
        if (panel === "logs") renderLogs();
        else updateInspector();
        return true;
    }
    function toggleView() {
        if (!ensureUI()) return false;
        if (!state.root.hidden) {
            // A hidden debugger must not keep an active DOM picker or watch.
            stopInspection();
            state.root.hidden = true;
            return false;
        }
        showPanel("logs");
        return true;
    }

    function destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        stopInspection();
        if (state.uiObserver) state.uiObserver.disconnect();
        if (state.resizeObserver) state.resizeObserver.disconnect();
        for (const handle of state.frames) {
            if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
        }
        state.frames.clear();
        for (const [button, saved] of state.statuses) {
            clearTimeout(saved.timer);
            button.replaceChildren(...saved.nodes);
        }
        state.statuses.clear();
        if (state.root) state.root.remove();
        if (state.style) state.style.remove();
        removeHighlight();
        state.root = state.logArea = state.inspector = state.inspectorText = state.statusBar = state.style = null;
        clear();
    }

    return Object.freeze({
        log, info, warn, error, copy, clear, toggleView,
        inspect, inspectElement, watchElement, stopInspection,
        getInspectionReport, copyInspection, destroy
    });
}

    /* ---------- Debugger + constants ---------- */
    const SCRIPT_VERSION = '1.01.00';
    const SCRIPT_NAME = (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.name)
        || 'Torn Bookie Odds & Win Probability Calculator';
    const MyDebug = initializeModularDebugger(SCRIPT_NAME);

    const SETTINGS_KEY = 'tbc_settings_v1';
    const BADGE_CLASS = 'tbc-badge';
    const UI_CLASS = 'tbc-ui';
    const DEFAULTS = Object.freeze({ enabled: true, normalize: true, showDraw: false, maxName: 18 });
    const NAME_LENGTHS = [0, 10, 14, 18, 24];

    /* ---------- Persistent storage: GM_* first, localStorage mirror (TornPDA / restarts) ---------- */
    const Store = {
        get(key, fallback) {
            try {
                if (typeof GM_getValue === 'function') {
                    const v = GM_getValue(key, undefined);
                    if (v !== undefined && v !== null && typeof v.then !== 'function') return v;
                }
            } catch (_) { /* fall through to localStorage */ }
            try {
                const raw = localStorage.getItem(key);
                if (raw !== null) return raw;
            } catch (_) { /* ignore */ }
            return fallback;
        },
        set(key, value) {
            try { if (typeof GM_setValue === 'function') GM_setValue(key, value); } catch (_) { /* ignore */ }
            try { localStorage.setItem(key, value); } catch (_) { /* ignore */ }
        }
    };

    function loadSettings() {
        const out = Object.assign({}, DEFAULTS);
        try {
            const raw = Store.get(SETTINGS_KEY, null);
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (parsed && typeof parsed === 'object') {
                if (typeof parsed.enabled === 'boolean') out.enabled = parsed.enabled;
                if (typeof parsed.normalize === 'boolean') out.normalize = parsed.normalize;
                if (typeof parsed.showDraw === 'boolean') out.showDraw = parsed.showDraw;
                if (NAME_LENGTHS.indexOf(parsed.maxName) !== -1) out.maxName = parsed.maxName;
            }
        } catch (_) { /* corrupt value: use defaults */ }
        return out;
    }
    let settings = loadSettings();
    function saveSettings() { Store.set(SETTINGS_KEY, JSON.stringify(settings)); }

    /* ---------- Name / odds helpers ---------- */
    function norm(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    }
    const SPLIT_RE = /\s+(?:v|vs\.?|@)\s+/i;
    function splitMatchName(name) {
        const t = String(name || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 120) return null;
        const parts = t.split(SPLIT_RE);
        if (parts.length !== 2) return null;
        const a = parts[0].trim();
        const b = parts[1].trim();
        return (a && b) ? [a, b] : null;
    }
    function matchKeyOf(a, b) { return [norm(a), norm(b)].sort().join('|'); }
    function matchKeyFromName(name) {
        const p = splitMatchName(name);
        return p ? matchKeyOf(p[0], p[1]) : null;
    }

    function parseDecimalText(s) {
        const m = String(s == null ? '' : s).match(/^\s*x?\s*(\d{1,4}(?:\.\d{1,4})?)\s*$/i);
        if (!m) return null;
        const n = parseFloat(m[1]);
        return n > 1 ? n : null;
    }
    function parseFractionText(s) {
        const m = String(s == null ? '' : s).match(/^\s*(\d{1,5})\s*\/\s*(\d{1,5})\s*$/);
        if (!m) return null;
        const den = parseFloat(m[2]);
        if (!den) return null;
        const n = parseFloat(m[1]) / den + 1;
        return n > 1 ? n : null;
    }
    function parseOddsAny(v) {
        if (typeof v === 'number') return (isFinite(v) && v > 1) ? v : null;
        if (typeof v === 'string') return parseDecimalText(v) || parseFractionText(v);
        return null;
    }

    function shortName(name, max) {
        const s = String(name || '').replace(/\s+/g, ' ').trim();
        if (!max || s.length <= max) return s;
        return s.slice(0, Math.max(1, max - 1)).trimEnd() + '\u2026';
    }
    function fmtPct(p) { return (p * 100).toFixed(1) + '%'; }
    function fmtOdds(o) { return 'x' + o.toFixed(2); }

    /* ---------- Probability engine ----------
     * Implied probability = 1 / decimal odds. The bookmaker's margin (overround) makes the
     * implied probabilities of all outcomes add up to more than 100%, so by default each
     * outcome is divided by that total ("fair" probability).
     * Roma x1.30 / Draw x5.6 / Sassuolo x8.00 -> total 107.28% -> Roma 71.7% (raw 76.9%). */
    const DRAW_RE = /^(?:draw|tie|x)$/i;
    function computePrediction(outcomes, normalize) {
        const valid = (outcomes || []).filter(o => o && o.odds > 1);
        if (valid.length < 2) return null;
        const inv = valid.map(o => 1 / o.odds);
        const sum = inv.reduce((a, b) => a + b, 0);
        const list = valid.map((o, i) => ({
            name: o.name,
            odds: o.odds,
            p: normalize ? inv[i] / sum : inv[i],
            isDraw: DRAW_RE.test(String(o.name).trim())
        }));
        const teams = list.filter(o => !o.isDraw).sort((a, b) => b.p - a.p);
        if (!teams.length) return null;
        return {
            best: teams[0],
            second: teams[1] || null,
            tie: teams.length > 1 && Math.abs(teams[0].p - teams[1].p) < 0.0005,
            draw: list.find(o => o.isDraw) || null,
            overround: sum,
            list: list
        };
    }

    /* ---------- Market classification (only match-winner markets are used) ---------- */
    const WAY_RE = /\b([23])\s*-?\s*way\b/i;
    const PERIOD_RE = /\b(?:half|halves|quarter|period|set|sets|inning|innings|map|maps|round|frame|leg|1st|2nd|3rd|4th|first|second|third|fourth)\b/i;
    const OTHER_RE = /\b(?:over|under|odd|even|handicap|total|totals|spread|both teams|correct score|double chance|draw no bet|to qualify|goals?|points?|corners|cards)\b/i;
    const OTHER_NAME_RE = /^(?:over|under|odd|even|yes|no)\b|[+-]\s?\d/i;

    function classifyMarket(ctx, outcomes) {
        const n = outcomes.length;
        const way = WAY_RE.exec(ctx || '');
        if (way) {
            const expected = parseInt(way[1], 10);
            if (n !== expected) return { ok: false, reason: 'way-count-mismatch' };
            if (PERIOD_RE.test(ctx)) return { ok: false, reason: 'period-market' };
            return { ok: true, score: /ordinary\s*time/i.test(ctx) ? 3 : 2, label: way[0] };
        }
        if (OTHER_RE.test(ctx || '')) return { ok: false, reason: 'other-market' };
        if (n < 2 || n > 3) return { ok: false, reason: 'unlabeled-size' };
        if (outcomes.some(o => OTHER_NAME_RE.test(o.name))) return { ok: false, reason: 'unlabeled-other-names' };
        return { ok: true, score: 1, label: 'unlabeled' };
    }
    function pickContext(own, near) {
        const all = [own].concat(near || []);
        for (const s of all) if (s && WAY_RE.test(s)) return s;
        for (const s of all) if (s && OTHER_RE.test(s)) return s;
        return own || '';
    }

    /* ---------- Odds store (in-memory, survives collapse / re-render) ---------- */
    const oddsStore = new Map();
    const STORE_MAX = 3000;
    function storeSet(key, entry) {
        oddsStore.delete(key);
        oddsStore.set(key, entry);
        while (oddsStore.size > STORE_MAX) oddsStore.delete(oddsStore.keys().next().value);
    }

    /* ---------- DOM helpers ---------- */
    function isOurNode(n) {
        const el = n && n.nodeType === 1 ? n : (n && n.parentElement);
        return !!(el && el.closest && el.closest('.' + BADGE_CLASS + ', .' + UI_CLASS + ', [id^="tw-debug-"]'));
    }

    // textContent glues adjacent cells together ("3/10x1.30Roma"), so join text nodes with spaces.
    // Returns null when the text is longer than `limit` (cheap early exit on big containers).
    function spacedText(el, limit) {
        const parts = [];
        let len = 0;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        let n;
        while ((n = walker.nextNode())) {
            const t = n.nodeValue.replace(/\s+/g, ' ').trim();
            if (!t || isOurNode(n)) continue;
            len += t.length + 1;
            if (limit && len > limit) return null;
            parts.push(t);
        }
        return parts.join(' ');
    }

    // One odds row = exactly one "xN.NN" token, at most one "a/b" fraction, and a team name.
    // Layout-agnostic: Torn uses hashed CSS-module class names, so text patterns are used.
    function parseRowText(raw) {
        const t = String(raw || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 120) return null;
        const dec = t.match(/(?:^|\s)x\s?(\d{1,4}(?:\.\d{1,4})?)(?=\s|$)/gi);
        if (!dec || dec.length !== 1) return null;
        const fr = t.match(/(?:^|\s)(\d{1,5})\/(\d{1,5})(?=\s|$)/g) || [];
        if (fr.length > 1) return null;
        let name = t.replace(dec[0], ' ');
        if (fr[0]) name = name.replace(fr[0], ' ');
        name = name.replace(/\s+/g, ' ').trim();
        if (!name || name.length > 60 || /^[\d\s.,/x%+-]+$/i.test(name)) return null;
        const d = parseFloat(dec[0].replace(/[^\d.]/g, ''));
        const f = fr[0] ? parseFractionText(fr[0]) : null;
        const odds = d > 1 ? d : f;
        return (odds && odds > 1) ? { name: name, odds: odds } : null;
    }

    const DEC_NODE_RE = /^\s*x\s?\d{1,4}(?:\.\d{1,4})?\s*$/i;
    // textContent (not innerText) so rows hidden by a collapsed accordion are still read.
    function findRows() {
        const rows = new Map();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let n;
        while ((n = walker.nextNode())) {
            const v = n.nodeValue;
            if (!v || v.length > 16 || !DEC_NODE_RE.test(v)) continue;
            if (isOurNode(n)) continue;
            let el = n.parentElement;
            for (let depth = 0; el && depth < 5 && el !== document.body; depth++, el = el.parentElement) {
                const text = spacedText(el, 120);
                if (text === null) break;
                const parsed = parseRowText(text);
                if (parsed) { if (!rows.has(el)) rows.set(el, parsed); break; }
            }
        }
        return rows;
    }

    // Rows that share a container (within 4 levels) form one market.
    function groupMarkets(rows) {
        const rowEls = Array.from(rows.keys());
        const counts = new Map();
        for (const r of rowEls) {
            let a = r.parentElement;
            for (let d = 0; a && d < 4; d++, a = a.parentElement) {
                let l = counts.get(a);
                if (!l) { l = []; counts.set(a, l); }
                l.push(r);
            }
        }
        const assigned = new Set();
        const markets = new Map();
        for (const r of rowEls) {
            if (assigned.has(r)) continue;
            let a = r.parentElement;
            for (let d = 0; a && d < 4; d++, a = a.parentElement) {
                const list = counts.get(a);
                if (list && list.length >= 2) {
                    markets.set(a, list.slice());
                    list.forEach(x => assigned.add(x));
                    break;
                }
            }
        }
        return markets;
    }

    function marketContext(container, rowEls) {
        const rowSet = new Set(rowEls);
        const hasRow = el => {
            if (rowSet.has(el)) return true;
            for (const r of rowEls) if (el.contains(r)) return true;
            return false;
        };
        let own = '';
        for (const c of container.childNodes) {
            if (c.nodeType === 3) own += ' ' + c.nodeValue;
            else if (c.nodeType === 1 && !isOurNode(c) && !hasRow(c)) own += ' ' + (spacedText(c, 300) || '');
        }
        own = own.replace(/\s+/g, ' ').trim().slice(0, 300);
        const near = [];
        let a = container;
        for (let lvl = 0; lvl < 3 && a && a !== document.body; lvl++, a = a.parentElement) {
            let sib = a.previousElementSibling;
            for (let k = 0; k < 2 && sib; k++, sib = sib.previousElementSibling) {
                if (isOurNode(sib)) continue;
                const t = spacedText(sib, 200);
                if (!t) continue;
                if (/\bx\s?\d+(?:\.\d+)?\b/i.test(t) && /\d+\/\d+/.test(t)) break; // another market's rows
                near.push(t);
            }
        }
        return pickContext(own, near);
    }

    /* ---------- Match header discovery ---------- */
    const MATCH_NAME_NODE_RE = /^\S.{0,58}\s(?:v|vs\.?|@)\s.{1,58}\S$/i;
    function nameTextOf(el) {
        if (!el) return '';
        const own = el.getAttribute && el.getAttribute('title');
        if (own && splitMatchName(own)) return own;
        const p = el.querySelector ? el.querySelector('p') : null;
        if (p) {
            const pt = p.getAttribute('title');
            if (pt && splitMatchName(pt)) return pt;
            if (splitMatchName(p.textContent)) return p.textContent;
        }
        return spacedText(el, 200) || '';
    }
    function listMatchRoots() {
        const roots = [];
        const seen = new Set();
        const add = (nameEl, nameOverride) => {
            if (!nameEl || seen.has(nameEl) || isOurNode(nameEl)) return;
            const name = String(nameOverride != null ? nameOverride : nameTextOf(nameEl)).replace(/\s+/g, ' ').trim();
            const key = matchKeyFromName(name);
            if (!key) return;
            seen.add(nameEl);
            roots.push({ nameEl: nameEl, name: name, key: key });
        };
        const cands = Array.from(document.querySelectorAll('[class*="matchName"]'));
        cands.filter(el => !el.querySelector('[class*="matchName"]')).forEach(el => add(el));
        if (!roots.length) { // class names changed: fall back to "Team A v Team B" text nodes
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
            let n;
            while ((n = walker.nextNode())) {
                const v = n.nodeValue;
                if (!v || v.length > 125) continue;
                const t = v.replace(/\s+/g, ' ').trim();
                if (t.length < 5 || !MATCH_NAME_NODE_RE.test(t) || isOurNode(n)) continue;
                add(n.parentElement, t);
            }
        }
        return roots;
    }
    function buildAncestorMap(roots) {
        const map = new Map();
        for (const r of roots) {
            let a = r.nameEl;
            for (let i = 0; a && a !== document.documentElement && i < 40; i++, a = a.parentElement) {
                let l = map.get(a);
                if (!l) { l = []; map.set(a, l); }
                l.push(r);
            }
        }
        return map;
    }
    function resolveRootFor(container, ancMap) {
        let a = container;
        for (let i = 0; a && a !== document.documentElement && i < 40; i++, a = a.parentElement) {
            const list = ancMap.get(a);
            if (list && list.length) {
                const keys = new Set(list.map(r => r.key));
                return keys.size === 1 ? list[0] : null;
            }
        }
        return null;
    }

    // Winner-market outcome names ARE the team names, so they identify the match even when the
    // DOM layout does not let us walk from the odds rows up to the match header.
    function nameKeyFromOutcomes(outcomes) {
        const teams = (outcomes || []).filter(o => !DRAW_RE.test(String(o.name).trim()));
        return teams.length === 2 ? matchKeyOf(teams[0].name, teams[1].name) : null;
    }

    /* ---------- Badge rendering ---------- */
    const INLINE_TAGS = new Set(['P', 'SPAN', 'A', 'B', 'I', 'EM', 'STRONG', 'SMALL', 'LABEL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    function mkSpan(cls, text) {
        const s = document.createElement('span');
        s.className = cls;
        s.textContent = text;
        return s;
    }
    function badgeTitle(entry, pred) {
        const lines = [entry.label && entry.label !== 'unlabeled' ? entry.label : 'Match winner market'];
        pred.list.forEach(o => lines.push(o.name + '  ' + fmtOdds(o.odds) + '  ' + fmtPct(o.p)));
        lines.push('Bookmaker margin: ' + ((pred.overround - 1) * 100).toFixed(1) + '%');
        lines.push(settings.normalize ? 'Margin removed (fair %)' : 'Raw implied % (1 / odds)');
        lines.push('Source: ' + entry.source + ' | seen ' + new Date(entry.seen).toLocaleTimeString());
        return lines.join('\n');
    }
    function placeBadge(root, entry) {
        const pred = computePrediction(entry.outcomes, settings.normalize);
        if (!pred) return false;
        const el = root.nameEl;
        const inline = INLINE_TAGS.has(el.tagName);
        const host = inline ? el.parentElement : el;
        if (!host) return false;
        const sig = [pred.best.name, pred.best.odds, pred.best.p.toFixed(4), pred.tie ? pred.second.name : '',
            pred.draw ? pred.draw.p.toFixed(4) : '', settings.normalize, settings.showDraw, settings.maxName, entry.label].join('|');
        let badge = null;
        if (inline) {
            const s = el.nextElementSibling;
            if (s && s.classList.contains(BADGE_CLASS)) badge = s;
        } else {
            for (const c of host.children) { if (c.classList.contains(BADGE_CLASS)) { badge = c; break; } }
        }
        if (badge && badge.getAttribute('data-tbc-sig') === sig) return true;
        if (!badge) {
            badge = document.createElement('span');
            badge.className = BADGE_CLASS;
            if (inline) el.after(badge); else el.appendChild(badge);
        }
        badge.textContent = '';
        const max = settings.maxName;
        const winner = (pred.tie && pred.second)
            ? shortName(pred.best.name, max) + ' / ' + shortName(pred.second.name, max)
            : shortName(pred.best.name, max);
        badge.appendChild(mkSpan('tbc-ico', pred.tie ? '\u2696' : '\uD83C\uDFC6'));
        badge.appendChild(mkSpan('tbc-team', winner));
        badge.appendChild(mkSpan('tbc-odds', fmtOdds(pred.best.odds)));
        badge.appendChild(mkSpan('tbc-pct', fmtPct(pred.best.p)));
        if (settings.showDraw && pred.draw) badge.appendChild(mkSpan('tbc-draw', 'Draw ' + fmtPct(pred.draw.p)));
        badge.setAttribute('title', badgeTitle(entry, pred));
        badge.setAttribute('data-tbc-sig', sig);
        return true;
    }
    function removeAllBadges() {
        document.querySelectorAll('.' + BADGE_CLASS).forEach(b => b.remove());
    }

    /* ---------- Scan (DOM -> store -> badges) ---------- */
    let lastSummary = '';
    function logSummary(summary) {
        const text = JSON.stringify(summary);
        if (text === lastSummary) return;
        lastSummary = text;
        MyDebug.log(Object.assign({ event: 'scan' }, summary));
    }
    function scan() {
        if (!document.body) return;
        if (!settings.enabled) { removeAllBadges(); return; }
        const roots = listMatchRoots();
        const rows = findRows();
        const markets = groupMarkets(rows);
        const ancMap = buildAncestorMap(roots);
        const best = new Map();
        const rejected = {};
        const reject = r => { rejected[r] = (rejected[r] || 0) + 1; };
        markets.forEach((rowEls, container) => {
            const outcomes = rowEls.map(r => rows.get(r)).filter(Boolean);
            const cls = classifyMarket(marketContext(container, rowEls), outcomes);
            if (!cls.ok) { reject(cls.reason); return; }
            const root = resolveRootFor(container, ancMap);
            const key = root ? root.key : nameKeyFromOutcomes(outcomes);
            if (!key) { reject('no-match-header'); return; }
            const cur = best.get(key);
            if (!cur || cls.score > cur.score) best.set(key, { score: cls.score, label: cls.label, outcomes: outcomes });
        });
        best.forEach((v, key) => storeSet(key, { outcomes: v.outcomes, label: v.label, source: 'page', seen: Date.now() }));
        let badges = 0;
        for (const r of roots) {
            const entry = oddsStore.get(r.key);
            if (entry && placeBadge(r, entry)) badges++;
        }
        logSummary({ roots: roots.length, rows: rows.size, markets: markets.size, accepted: best.size,
            stored: oddsStore.size, badges: badges, rejected: rejected });
    }
    function safeScan() {
        try { scan(); } catch (e) { MyDebug.error({ event: 'scan-failed', message: String(e && e.message), stack: String(e && e.stack).slice(0, 400) }); }
    }
    let scanQueued = false;
    function scheduleScan() {
        if (scanQueued) return;
        scanQueued = true;
        const run = () => { scanQueued = false; safeScan(); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else Promise.resolve().then(run);
    }

    /* ---------- Network capture (for matches whose odds are not in the DOM while collapsed) ----------
     * Reads Torn's own bookie responses (URLs containing sid=bookie...). Read-only: the original
     * response promise is returned to the page untouched. Schema-tolerant because the JSON layout
     * is not documented; every capture is logged so it can be tuned from a debug report. */
    const NAME_KEYS = ['name', 'title', 'label', 'team', 'teamName', 'selection', 'outcome', 'participant', 'runner'];
    const ODDS_KEYS = ['odds', 'odd', 'price', 'multiplier', 'mult', 'decimal', 'decimalOdds', 'coefficient', 'coef'];
    const FRAC_KEYS = ['fraction', 'fractional', 'frac', 'fractionalOdds'];
    const MONEY_KEYS = ['amount', 'stake', 'winnings', 'payout', 'betId', 'paid', 'collected'];
    function asOutcome(o) {
        if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
        for (const k of MONEY_KEYS) if (k in o) return null; // a placed bet, not a market outcome
        let name = '';
        for (const k of NAME_KEYS) { const v = o[k]; if (typeof v === 'string' && v.trim()) { name = v.trim(); break; } }
        if (!name || name.length > 80) return null;
        let odds = null;
        for (const k of ODDS_KEYS) { if (k in o) { odds = parseOddsAny(o[k]); if (odds) break; } }
        if (!odds) for (const k of FRAC_KEYS) { if (k in o) { odds = parseFractionText(o[k]); if (odds) break; } }
        return odds ? { name: name, odds: odds } : null;
    }
    function matchFromObject(o) {
        if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
        const pairs = [['team1', 'team2'], ['homeTeam', 'awayTeam'], ['home', 'away'], ['team_1', 'team_2'], ['participant1', 'participant2']];
        for (const pr of pairs) {
            const a = o[pr[0]];
            const b = o[pr[1]];
            if (typeof a === 'string' && typeof b === 'string' && a.trim() && b.trim()) return { key: matchKeyOf(a, b) };
        }
        for (const k of ['name', 'title', 'matchName', 'eventName']) {
            if (typeof o[k] === 'string') { const key = matchKeyFromName(o[k]); if (key) return { key: key }; }
        }
        return null;
    }
    function titleFromObject(o) {
        for (const k of ['name', 'title', 'label', 'type', 'market', 'marketName', 'description']) {
            const v = o[k];
            if (typeof v === 'string' && v.length < 160 && (WAY_RE.test(v) || OTHER_RE.test(v) || /ordinary\s*time/i.test(v))) return v;
        }
        return '';
    }
    function extractMarketsFromJson(root) {
        const markets = [];
        const info = { matchKeys: null, outcomeKeys: null };
        let budget = 150000;
        const stack = [{ v: root, match: null, title: '', depth: 0 }];
        while (stack.length && budget-- > 0) {
            const cur = stack.pop();
            const v = cur.v;
            if (!v || typeof v !== 'object' || cur.depth > 14) continue;
            if (Array.isArray(v)) {
                if (v.length >= 2 && v.length <= 12) {
                    const outs = v.map(asOutcome);
                    if (outs.every(Boolean)) {
                        if (!info.outcomeKeys) info.outcomeKeys = Object.keys(v[0]).slice(0, 14);
                        markets.push({ match: cur.match, title: cur.title, outcomes: outs });
                        continue;
                    }
                }
                for (let i = v.length - 1; i >= 0; i--) stack.push({ v: v[i], match: cur.match, title: cur.title, depth: cur.depth + 1 });
                continue;
            }
            const m = matchFromObject(v);
            if (m && !info.matchKeys) info.matchKeys = Object.keys(v).slice(0, 20);
            const match = m || cur.match;
            const title = titleFromObject(v) || cur.title;
            for (const k of Object.keys(v)) {
                const c = v[k];
                if (c && typeof c === 'object') stack.push({ v: c, match: match, title: title, depth: cur.depth + 1 });
            }
        }
        return { markets: markets, info: info };
    }
    function describeUrl(url) {
        try {
            const u = new URL(String(url), location.href);
            return { sid: u.searchParams.get('sid') || '', step: u.searchParams.get('step') || '' };
        } catch (_) { return { sid: '', step: '' }; }
    }
    function ingestJsonText(text, url) {
        if (typeof text !== 'string' || !text || text.length > 4000000) return;
        const first = text.trimStart().charAt(0);
        if (first !== '{' && first !== '[') return;
        let data;
        try { data = JSON.parse(text); } catch (_) { return; }
        const found = extractMarketsFromJson(data);
        const best = new Map();
        let orphans = 0;
        let rejects = 0;
        found.markets.forEach(m => {
            const key = m.match ? m.match.key : nameKeyFromOutcomes(m.outcomes);
            if (!key) { orphans++; return; }
            const cls = classifyMarket(m.title, m.outcomes);
            if (!cls.ok) { rejects++; return; }
            const cur = best.get(key);
            if (!cur || cls.score > cur.score) best.set(key, { score: cls.score, label: cls.label, outcomes: m.outcomes });
        });
        best.forEach((v, key) => storeSet(key, { outcomes: v.outcomes, label: v.label, source: 'data', seen: Date.now() }));
        const d = describeUrl(url);
        MyDebug.log({
            event: 'data-capture', sid: d.sid, step: d.step, bytes: text.length,
            topKeys: (data && typeof data === 'object') ? Object.keys(data).slice(0, 12) : [],
            markets: found.markets.length, accepted: best.size, orphans: orphans, rejected: rejects,
            matchFields: found.info.matchKeys, outcomeFields: found.info.outcomeKeys
        });
        if (best.size) scheduleScan();
    }
    function isBookieApiUrl(url) { return /[?&]sid=bookie/i.test(String(url || '')); }
    function installNetworkCapture() {
        const win = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
        const hooked = [];
        try {
            const origFetch = win.fetch;
            if (typeof origFetch === 'function' && !origFetch.__tbcWrapped) {
                const wrapped = function () {
                    const p = origFetch.apply(this, arguments);
                    try {
                        const a0 = arguments[0];
                        const url = (a0 && typeof a0 === 'object' && a0.url) ? a0.url : String(a0 || '');
                        if (isBookieApiUrl(url)) {
                            p.then(resp => { try { return resp.clone().text(); } catch (_) { return ''; } })
                                .then(t => ingestJsonText(t, url))
                                .catch(() => { /* capture is best-effort */ });
                        }
                    } catch (_) { /* never break the page */ }
                    return p;
                };
                wrapped.__tbcWrapped = true;
                win.fetch = wrapped;
                hooked.push('fetch');
            }
        } catch (e) { MyDebug.warn('fetch hook failed: ' + (e && e.message)); }
        try {
            const proto = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
            if (proto && !proto.__tbcWrapped) {
                const origOpen = proto.open;
                const origSend = proto.send;
                proto.open = function (method, url) {
                    try { this.__tbcUrl = String(url || ''); } catch (_) { /* ignore */ }
                    return origOpen.apply(this, arguments);
                };
                proto.send = function () {
                    try {
                        if (this.__tbcUrl && isBookieApiUrl(this.__tbcUrl)) {
                            const xhr = this;
                            const u = this.__tbcUrl;
                            xhr.addEventListener('load', function () {
                                try {
                                    const t = (xhr.responseType === '' || xhr.responseType === 'text') ? xhr.responseText
                                        : (xhr.responseType === 'json' ? JSON.stringify(xhr.response) : '');
                                    ingestJsonText(t, u);
                                } catch (_) { /* ignore */ }
                            });
                        }
                    } catch (_) { /* never break the page */ }
                    return origSend.apply(this, arguments);
                };
                proto.__tbcWrapped = true;
                hooked.push('xhr');
            }
        } catch (e) { MyDebug.warn('xhr hook failed: ' + (e && e.message)); }
        return hooked;
    }

    /* ---------- Styles ---------- */
    function injectStyles() {
        if (document.getElementById('tbc-styles')) return;
        const style = document.createElement('style');
        style.id = 'tbc-styles';
        style.textContent = `
        .tbc-badge{display:flex!important;flex-wrap:wrap;align-items:center;gap:4px 8px;width:fit-content;max-width:100%;
            margin:3px 0 1px;padding:2px 8px;background:#1b2838;color:#8fe3a8;border:1px solid #2a475e;border-radius:4px;
            font:bold 12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.4);
            pointer-events:none;box-sizing:border-box;text-align:left}
        .tbc-badge .tbc-team{color:#fff}
        .tbc-badge .tbc-odds{color:#ffda6a}
        .tbc-badge .tbc-pct{color:#62d490}
        .tbc-badge .tbc-draw{color:#9fb3c8;font-weight:normal}
        #tbc-gear{position:fixed;right:12px;bottom:72px;z-index:99998;width:42px;height:42px;border-radius:21px;
            background:#14181c;color:#8fe3a8;border:1px solid #2c343b;font-size:20px;display:flex;align-items:center;
            justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.5);cursor:pointer;touch-action:manipulation;user-select:none}
        #tbc-gear:active{transform:scale(.94)}
        #tbc-panel{position:fixed;top:70px;right:12px;width:340px;max-width:calc(100vw - 24px);max-height:calc(100vh - 90px);
            overflow:auto;padding:16px;background:#14181c;color:#dfe4e8;border:1px solid #2c343b;border-radius:10px;
            z-index:99999;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.8);box-sizing:border-box}
        #tbc-panel[hidden]{display:none!important}
        #tbc-panel h3{margin:0 0 8px;color:#8fe3a8;border-bottom:1px solid #2c343b;padding-bottom:8px;font-size:15px}
        #tbc-panel .tbc-ver{font-size:11px;color:#8b969f;font-weight:normal}
        #tbc-panel .tbc-note{margin:0 0 10px;color:#8b969f;font-size:12px}
        #tbc-panel .tbc-row{display:flex;align-items:center;gap:8px;margin:8px 0;min-height:28px}
        #tbc-panel .tbc-row input[type=checkbox]{width:18px;height:18px;flex:none}
        #tbc-panel select{background:#1f262c;color:#dfe4e8;border:1px solid #2c343b;border-radius:4px;padding:4px;margin-left:auto}
        #tbc-panel hr{border:0;border-top:1px solid #2c343b;margin:12px 0}
        #tbc-panel .tbc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
        #tbc-panel button{background:#1f3d2b;color:#8fe3a8;border:1px solid #8fe3a8;border-radius:4px;padding:8px 12px;
            cursor:pointer;font-weight:bold;font-size:12px;min-height:34px;touch-action:manipulation}
        #tbc-panel button:hover{background:#2a523a}
        #tbc-panel .tbc-hint{margin:6px 0 0;font-size:11px;color:#8b969f}
        #tbc-panel .tbc-credit{margin-top:12px;font-size:11px;color:#8b969f;text-align:center;font-style:italic}
        .tw-support-btn{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:6px;
            font-size:12px;font-weight:bold;color:#fff!important;text-decoration:none!important;border:1px solid #555;
            transition:transform .2s ease;cursor:pointer;width:100%;box-sizing:border-box}
        .tw-support-btn:active{transform:scale(.95)}
        .tw-bmc{background-color:#FFDD00;color:#000!important;border-color:#FFDD00}
        .tw-torn-tip{background-color:#8ab63d;border-color:#6a8c2f}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    /* ---------- Settings UI (includes Donation UI + Debug console buttons) ---------- */
    function buildUI() {
        if (document.getElementById('tbc-gear')) return;
        const gear = document.createElement('div');
        gear.id = 'tbc-gear';
        gear.className = UI_CLASS;
        gear.setAttribute('role', 'button');
        gear.setAttribute('aria-label', 'Bookie Calculator settings');
        gear.title = 'Bookie Calculator settings';
        gear.textContent = '\u2699\uFE0F';

        const panel = document.createElement('div');
        panel.id = 'tbc-panel';
        panel.className = UI_CLASS;
        panel.hidden = true;
        panel.innerHTML = `
            <h3>Bookie Calculator <span class="tbc-ver">v${SCRIPT_VERSION}</span></h3>
            <p class="tbc-note">Shows the likeliest winner, its odds and win chance under every match. No API key needed; settings are saved automatically.</p>
            <label class="tbc-row"><input type="checkbox" id="tbc-enabled"> Show predictions</label>
            <label class="tbc-row"><input type="checkbox" id="tbc-normalize"> Remove bookmaker margin (fair %)</label>
            <label class="tbc-row"><input type="checkbox" id="tbc-draw"> Show draw chance (3-way)</label>
            <label class="tbc-row">Team name length
                <select id="tbc-maxname">
                    <option value="0">Full</option><option value="10">10 chars</option><option value="14">14 chars</option>
                    <option value="18">18 chars</option><option value="24">24 chars</option>
                </select></label>
            <div class="tbc-actions">
                <button type="button" id="tbc-rescan">Rescan page</button>
                <button type="button" id="tbc-reset">Reset settings</button>
                <button type="button" id="tbc-close">Close</button>
            </div>
            <hr>
            <div class="tbc-actions">
                <button type="button" id="tbc-debug-open">\uD83E\uDEB2 Open Debug Console</button>
                <button type="button" id="tbc-debug-copy">\uD83D\uDCCB Copy Logs to Clipboard</button>
            </div>
            <p class="tbc-hint">Odds missing on a match? Open the console, tap \uD83D\uDD0D, tap the match row, tap Copy DOM, and send both reports.</p>
            <hr>
            <div class="tbc-actions">
                <a href="https://www.buymeacoffee.com/bittick1c" target="_blank" rel="noopener noreferrer" class="tw-support-btn tw-bmc">\u2615 Buy Me a Coffee</a>
                <a href="https://www.torn.com/item.php" target="_blank" rel="noopener noreferrer" class="tw-support-btn tw-torn-tip" title="Opens Items: search 'Xanax', tap Send, enter ThaWookie [2954173]">\uD83D\uDC8A Send a Xanax Tip</a>
            </div>
            <div class="tbc-credit">Created by ShavedW00kie (Torn: ThaWookie [2954173]) \u00B7 BSD-3-Clause</div>`;

        document.body.appendChild(gear);
        document.body.appendChild(panel);

        const $ = id => panel.querySelector(id);
        const syncControls = () => {
            $('#tbc-enabled').checked = settings.enabled;
            $('#tbc-normalize').checked = settings.normalize;
            $('#tbc-draw').checked = settings.showDraw;
            $('#tbc-maxname').value = String(settings.maxName);
        };
        const changed = what => { saveSettings(); MyDebug.log({ event: 'setting', what: what, settings: settings }); scheduleScan(); };
        syncControls();

        gear.addEventListener('click', () => { panel.hidden = !panel.hidden; });
        $('#tbc-close').addEventListener('click', () => { panel.hidden = true; });
        $('#tbc-enabled').addEventListener('change', function () { settings.enabled = this.checked; changed('enabled'); });
        $('#tbc-normalize').addEventListener('change', function () { settings.normalize = this.checked; changed('normalize'); });
        $('#tbc-draw').addEventListener('change', function () { settings.showDraw = this.checked; changed('showDraw'); });
        $('#tbc-maxname').addEventListener('change', function () {
            const n = parseInt(this.value, 10);
            settings.maxName = NAME_LENGTHS.indexOf(n) !== -1 ? n : DEFAULTS.maxName;
            changed('maxName');
        });
        $('#tbc-rescan').addEventListener('click', () => { MyDebug.log('Manual rescan'); lastSummary = ''; scheduleScan(); });
        $('#tbc-reset').addEventListener('click', () => { settings = Object.assign({}, DEFAULTS); syncControls(); changed('reset'); });
        $('#tbc-debug-open').addEventListener('click', () => { MyDebug.toggleView(); });
        $('#tbc-debug-copy').addEventListener('click', function () { void MyDebug.copy(this); });
    }

    /* ---------- Observers + init ---------- */
    const ODDS_TEXT_RE = /^\s*(?:x\s?\d{1,4}(?:\.\d{1,4})?|\d{1,5}\/\d{1,5})\s*$/i;
    function onMutations(records) {
        for (let i = 0; i < records.length; i++) {
            const r = records[i];
            if (r.type === 'characterData') {
                const v = r.target.nodeValue;
                if (v && v.length < 18 && ODDS_TEXT_RE.test(v) && !isOurNode(r.target)) { scheduleScan(); return; }
                continue;
            }
            if (isOurNode(r.target)) continue;
            let foreign = false;
            for (const n of r.addedNodes) { if (!isOurNode(n)) { foreign = true; break; } }
            if (!foreign) for (const n of r.removedNodes) { if (!isOurNode(n)) { foreign = true; break; } }
            if (foreign) { scheduleScan(); return; }
        }
    }

    const hooked = installNetworkCapture();
    let started = false;
    function init() {
        if (started) return;
        started = true;
        try {
            injectStyles();
            buildUI();
            const observer = new MutationObserver(onMutations);
            observer.observe(document.body, { childList: true, subtree: true, characterData: true });
            window.addEventListener('hashchange', scheduleScan);
            MyDebug.log({ event: 'init', version: SCRIPT_VERSION, hooks: hooked.join('+') || 'none', pageScope: typeof unsafeWindow !== 'undefined' ? 'userscript-manager' : 'page',
                route: String(location.hash || '').slice(0, 60), settings: settings });
            scheduleScan();
        } catch (e) {
            MyDebug.error({ event: 'init-failed', message: String(e && e.message) });
        }
    }
    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
