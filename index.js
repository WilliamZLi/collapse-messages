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
    mesElement.find(".mes_buttons").prepend(btn);
}

function initMessage(mesElement) {
    if (!mesElement.length) return;
    addCollapseButton(mesElement);
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

    // Re-apply collapse after a message is edited (mes_text content is replaced)
    eventSource.on(event_types.MESSAGE_EDITED, (message_id) => {
        const mesElement = $(`#chat .mes[mesid="${message_id}"]`);
        if (mesElement.length && isCollapsed(parseInt(message_id))) {
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
