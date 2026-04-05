import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "collapse-messages";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    collapsedLines: 3,
    collapsed: {},
};

function getSettings() {
    return extension_settings[extensionName];
}

function getChatId() {
    return getContext().chatId || null;
}

function isCollapsed(mesId) {
    const chatId = getChatId();
    if (!chatId) return false;
    return (getSettings().collapsed[chatId] || []).includes(mesId);
}

function setCollapsed(mesId, collapsed) {
    const chatId = getChatId();
    if (!chatId) return;
    const settings = getSettings();
    if (!settings.collapsed[chatId]) {
        settings.collapsed[chatId] = [];
    }
    const arr = settings.collapsed[chatId];
    const idx = arr.indexOf(mesId);
    if (collapsed && idx === -1) {
        arr.push(mesId);
    } else if (!collapsed && idx !== -1) {
        arr.splice(idx, 1);
    }
    saveSettingsDebounced();
}

function applyCollapseVisual(mesElement, collapsed) {
    const mesText = mesElement.find(".mes_text");
    const btn = mesElement.find(".mes_collapse_btn");
    if (collapsed) {
        mesText.addClass("mes_text_collapsed");
        btn.attr("title", "Expand message")
            .removeClass("fa-compress")
            .addClass("fa-expand");
    } else {
        mesText.removeClass("mes_text_collapsed");
        btn.attr("title", "Collapse message")
            .removeClass("fa-expand")
            .addClass("fa-compress");
    }
}

function toggleCollapse(mesElement) {
    const mesId = parseInt(mesElement.attr("mesid"));
    const nowCollapsed = !isCollapsed(mesId);
    setCollapsed(mesId, nowCollapsed);
    applyCollapseVisual(mesElement, nowCollapsed);
}

function addCollapseButton(mesElement) {
    if (mesElement.find(".mes_collapse_btn").length > 0) return;
    const btn = $(
        `<div class="mes_button mes_collapse_btn fa-solid fa-compress" title="Collapse message"></div>`
    );
    btn.on("click", function (e) {
        e.stopPropagation();
        toggleCollapse(mesElement);
    });
    const eyeBtn = mesElement.find(".mes_hide");
    if (eyeBtn.length) {
        btn.insertBefore(eyeBtn);
    } else {
        mesElement.find(".mes_buttons").prepend(btn);
    }
}

function isEmptyBlock(el) {
    if (el.matches('hr')) return true;
    if (el.matches('br')) return true;
    if (el.matches('p') && el.children.length === 0 && el.textContent.trim() === '') return true;
    if (el.matches('p') && el.children.length === 1 && el.children[0].tagName === 'BR' && el.textContent.trim() === '') return true;
    return false;
}

function computeCollapseHeight(mesTextEl, lines) {
    const blocks = Array.from(mesTextEl.children).filter(el => !isEmptyBlock(el));
    if (blocks.length === 0) return null;

    const lineHeight = parseFloat(getComputedStyle(mesTextEl).lineHeight);
    const containerRect = mesTextEl.getBoundingClientRect();

    let linesUsed = 0;
    let clipBottom = containerRect.top;

    for (const block of blocks) {
        const rect = block.getBoundingClientRect();

        if (block.matches('h1, h2, h3, h4, h5, h6')) {
            // Headings count as 1 logical line but render at full size
            linesUsed += 1;
            clipBottom = rect.bottom;
        } else {
            const blockLines = rect.height / lineHeight;
            const available = lines - linesUsed;
            if (blockLines <= available) {
                linesUsed += blockLines;
                clipBottom = rect.bottom;
            } else {
                // Clip partway through this block
                clipBottom = rect.top + available * lineHeight;
                linesUsed = lines;
            }
        }

        if (linesUsed >= lines) break;
    }

    const height = clipBottom - containerRect.top;
    return height > 0 ? height : null;
}

function applyCollapseHeight(mesElement) {
    const mesText = mesElement.find(".mes_text")[0];
    if (!mesText) return;
    const lines = getSettings().collapsedLines || 3;
    const height = computeCollapseHeight(mesText, lines);
    if (height !== null) {
        mesText.style.setProperty('--computed-collapse-height', `${height}px`);
    }
}

function initMessage(mesElement) {
    if (!mesElement.length) return;
    addCollapseButton(mesElement);
    applyCollapseHeight(mesElement);
    const mesId = parseInt(mesElement.attr("mesid"));
    if (isCollapsed(mesId)) {
        applyCollapseVisual(mesElement, true);
    }
}

function initAllMessages() {
    $("#chat .mes").each(function () {
        initMessage($(this));
    });
}

function updateLineClampVar() {
    const lines = getSettings().collapsedLines || 3;
    document.documentElement.style.setProperty("--collapse-lines", lines);
    // Recompute heights for all messages since line count changed
    $("#chat .mes").each(function () {
        const mesElement = $(this);
        const mesText = mesElement.find(".mes_text");
        const wasCollapsed = mesText.hasClass("mes_text_collapsed");
        if (wasCollapsed) mesText.removeClass("mes_text_collapsed");
        applyCollapseHeight(mesElement);
        if (wasCollapsed) mesText.addClass("mes_text_collapsed");
    });
}

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    if (!extension_settings[extensionName].collapsed) {
        extension_settings[extensionName].collapsed = {};
    }
    updateLineClampVar();
    $("#collapse_lines_input").val(getSettings().collapsedLines);
}

jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings2").append(settingsHtml);

    loadSettings();
    initAllMessages();

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (message_id) => {
        initMessage($(`#chat .mes[mesid="${message_id}"]`));
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, (message_id) => {
        initMessage($(`#chat .mes[mesid="${message_id}"]`));
    });

    $(document).on("mousedown", ".mes_edit_up, .mes_edit_down", function () {
        const mesElement = $(this).closest(".mes");
        const isUp = $(this).hasClass("mes_edit_up");
        const fromId = parseInt(mesElement.attr("mesid"));
        const toId = isUp ? fromId - 1 : fromId + 1;

        if (!$(`#chat .mes[mesid="${toId}"]`).length) return;

        const chatId = getChatId();
        if (!chatId) return;
        const arr = getSettings().collapsed[chatId];
        if (!arr || arr.length === 0) return;

        const fromIdx = arr.indexOf(fromId);
        const toIdx = arr.indexOf(toId);

        if (fromIdx === -1 && toIdx === -1) return;
        if (fromIdx !== -1 && toIdx !== -1) return;

        if (fromIdx !== -1) arr[fromIdx] = toId;
        else arr[toIdx] = fromId;

        saveSettingsDebounced();
    });

    eventSource.on(event_types.MESSAGE_DELETED, (message_id) => {
        const chatId = getChatId();
        if (!chatId) return;
        const arr = getSettings().collapsed[chatId];
        if (!arr) return;
        const id = parseInt(message_id);
        const idx = arr.indexOf(id);
        if (idx !== -1) arr.splice(idx, 1);
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] > id) arr[i]--;
        }
        saveSettingsDebounced();
    });

    // Re-apply collapse after a message is edited (mes_text content is replaced)
    eventSource.on(event_types.MESSAGE_EDITED, (message_id) => {
        const mesElement = $(`#chat .mes[mesid="${message_id}"]`);
        if (!mesElement.length) return;
        // Temporarily uncollapse to get accurate measurements
        const mesText = mesElement.find(".mes_text");
        mesText.removeClass("mes_text_collapsed");
        applyCollapseHeight(mesElement);
        if (isCollapsed(parseInt(message_id))) {
            applyCollapseVisual(mesElement, true);
        }
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        // Give ST time to render the new chat's messages
        setTimeout(initAllMessages, 300);
    });

    $("#collapse_lines_input").on("input", function () {
        const val = parseInt($(this).val());
        if (val >= 1) {
            getSettings().collapsedLines = val;
            saveSettingsDebounced();
            updateLineClampVar();
        }
    });
});
