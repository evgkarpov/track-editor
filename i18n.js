(() => {
  "use strict";

  const STORAGE_KEY = "gnss-track-editor:language";
  const DEFAULT_LANGUAGE = "en";
  let language = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE;
  if (!["en", "ru"].includes(language)) language = DEFAULT_LANGUAGE;

  const translations = {
    en: {
      "app.eyebrow": "TRACK LOGGER TOOL",
      "app.title": "GNSS Track Editor",
      "app.language": "Language",

      "sections.data": "1 · DATA",
      "sections.timing": "2 · TIMING",
      "sections.corners": "3 · CORNERS",
      "sections.project": "4 · PROJECT",

      "data.referenceTitle": "GNSS reference",
      "data.newCsvWorkflow": "For a new CSV, first place a temporary detection line on a clean straight, then detect laps and build the median reference path.",

      "badges.pirSample": "PIR sample",
      "badges.csvLoaded": "CSV loaded",
      "badges.lapsDetected": "Laps detected",
      "badges.referenceReady": "Reference ready",
      "badges.project": "Project",

      "actions.fitTrack": "Fit track",
      "actions.exportTrackDefinition": "Export TrackDefinition",
      "actions.reloadPirSample": "Reload PIR sample",
      "actions.loadCsv": "Load CSV",
      "actions.setDetectionSf": "Set detection S/F",
      "actions.detectLaps": "Detect laps",
      "actions.buildMedianReference": "Build median reference",
      "actions.setOnMap": "Set on map",
      "actions.clear": "Clear",
      "actions.clearTiming": "Clear timing markup",
      "actions.apply": "Apply",
      "actions.addCorner": "Add corner",
      "actions.rename": "Rename",
      "actions.delete": "Delete",
      "actions.previous": "Previous",
      "actions.next": "Next",
      "actions.setStart": "Set Start",
      "actions.setApex": "Set Apex",
      "actions.setEnd": "Set End",
      "actions.clearSelectedCorner": "Clear selected corner",
      "actions.saveProject": "Save project",
      "actions.importProject": "Import project",
      "actions.resetCorners": "Reset all corner markup",

      "common.optional": "(optional)",
      "common.notSet": "not set",
      "common.custom": "Custom",
      "common.selected": "SELECTED",
      "common.set": "Set",
      "common.lines": "{set} / {required} lines",

      "map.settings": "Satellite map settings",
      "map.arcgisToken": "ArcGIS access token",
      "map.tokenPlaceholder": "Use official token endpoint",
      "map.tokenNote": "Without a token, the editor uses the public fallback. The token is stored only in this browser's localStorage.",
      "map.satellite": "Satellite",
      "map.rawLaps": "Raw laps",
      "map.gatesZones": "Gates / zones",
      "map.map": "Map",
      "map.satelliteOpacity": "Satellite opacity",
      "map.help": "Wheel = zoom · drag empty space = pan · drag timing/corner markers = move along reference",

      "timing.title": "Start / Finish & sectors",
      "timing.description": "Place the final <b>Start/Finish line</b> and sector split lines directly on the GNSS reference path. For <b>3 sectors</b>, place two split lines: S1 end and S2 end; S3 ends automatically at Start/Finish.",
      "timing.startFinish": "START / FINISH",
      "timing.numberOfSectors": "Number of sectors",
      "timing.sectorsUnit": "sectors",
      "timing.lineWidth": "Timing line width",
      "timing.defaultHint": "Click Set on map, then click the reference line. Timing markers can be dragged afterward.",
      "timing.setSfHint": "Click the reference path to place the final Start/Finish line.",
      "timing.setSplitHint": "Click the reference path to place the end of Sector {sector}.",
      "timing.snapHint": "Timing lines snap to the reference path and are generated perpendicular to the direction of travel.",
      "timing.ready": "Timing ready: {count} sector(s), Start/Finish + {splits} split line(s).",
      "timing.sectorEnd": "S{sector} end",
      "timing.lastSectorEnd": "S{sector} end",
      "timing.lastSectorValue": "Start / Finish",
      "timing.confirmReduce": "Reducing to {count} sectors will remove {removed} placed split line(s). Continue?",
      "timing.confirmClear": "Clear Start/Finish and all sector split lines?",
      "timing.validation.sfMissing": "Start/Finish line is not set.",
      "timing.validation.splitMissing": "S{sector} end split is not set.",
      "timing.validation.splitTooCloseSf": "S{sector} end is too close to Start/Finish.",
      "timing.validation.splitOrder": "Sector split order/spacing is invalid around S{sector}.",
      "timing.validation.lastTooCloseSf": "Last sector split is too close to Start/Finish.",

      "corners.title": "Manual corners",
      "corners.description": "For each corner, place only <b>Start → Apex → End</b>. Points always snap to the GNSS reference path. Gates and the analysis polygon are generated automatically.",
      "corners.newIdPlaceholder": "e.g. T3A",
      "corners.defaultHint": "Choose Start/Apex/End, then click the line.",
      "corners.gateWidth": "Gate width",
      "corners.analysisBuffer": "Analysis buffer",
      "corners.apexOrderWarning": "Apex is not between Start and End in reference-path order. Drag the points to correct it.",
      "corners.longZoneWarning": "This corner analysis zone is unusually long. Check Start/End.",
      "corners.setPointHint": "{corner}: click the reference line to place {field}.",
      "corners.detectionSfHint": "Click the real GNSS line on a clean detection Start/Finish straight.",
      "corners.dragHint": "Choose Start/Apex/End, then click the line. Markers can be dragged afterward.",
      "corners.newIdPrompt": "New corner ID",
      "corners.idExists": "{id} already exists.",
      "corners.minOne": "At least one corner is required.",
      "corners.deleteConfirm": "Delete {id}?",
      "corners.clearAllConfirm": "Clear all corner markup?",
      "corners.presetConfirm": "Replace the current corner list? Existing markup for matching IDs will be preserved.",

      "reference.referenceOnly": "REFERENCE ONLY",
      "reference.pirNumbering": "PIR turn numbering",
      "reference.pirGuideAlt": "PIR numbered turn guide",
      "reference.guideNote": "This image is only a visual guide for corner numbering. It is <b>not</b> used for coordinates or map alignment.",

      "project.title": "Save / load",

      "empty.title": "Load a GNSS CSV",
      "empty.description": "Then place Start/Finish, detect laps, and build the reference path.",

      "status.ready": "Ready.",
      "status.referenceEmpty": "Reference: —",
      "status.reference": "Reference: {length} m · {points} pts",
      "status.csvLoaded": "Loaded {count} GNSS samples. Click “Set detection S/F”.",
      "status.sfSet": "Detection Start/Finish set. Detect laps next.",
      "status.crossingsFailed": "Could not find enough crossings. Move the detection S/F to a cleaner straight.",
      "status.lapsDetected": "Detected {count} laps. Review the selection, then build the median reference.",
      "status.referenceBuilt": "Built a {points}-point median reference from {laps} laps.",
      "status.projectImported": "Project imported.",
      "status.pirReady": "PIR ready: median GNSS reference from {laps} fast laps. Mark the timing lines and corners.",
      "status.needReference": "Build or load a reference first.",
      "status.detectionMode": "Detection S/F mode: click a clean point on the start/finish straight.",
      "status.nothingToSave": "Nothing to save yet.",

      "stats.reference": "Reference",
      "stats.points": "Points",
      "stats.lapsUsed": "Laps used",
      "stats.best": "Best",
      "stats.samples": "Samples",
      "stats.sf": "Detection S/F",
      "stats.set": "set",
      "stats.notSet": "not set",
      "laps.lap": "Lap",

      "errors.csvNoRows": "CSV has no data rows.",
      "errors.csvMissingLatLon": "CSV must contain lat and lon columns.",
      "errors.csvTooFewRows": "Not enough valid GNSS rows.",
      "errors.invalidProject": "This is not a GNSS Track Editor project.",

      "export.timingIncomplete": "Timing incomplete: {issues}",
      "export.cornersIncomplete": "Corners incomplete: {corners}.",
      "export.confirmAnyway": "{warnings}\n\nExport anyway?",

      "project.appName": "GNSS Track Editor"
    },

    ru: {
      "app.eyebrow": "ИНСТРУМЕНТ ДЛЯ ТРЕК-ЛОГГЕРА",
      "app.title": "GNSS Track Editor",
      "app.language": "Язык",

      "sections.data": "1 · ДАННЫЕ",
      "sections.timing": "2 · ТАЙМИНГ",
      "sections.corners": "3 · ПОВОРОТЫ",
      "sections.project": "4 · ПРОЕКТ",

      "data.referenceTitle": "GNSS reference",
      "data.newCsvWorkflow": "Для нового CSV сначала поставь временную detection line на чистой прямой, затем найди круги и построй median reference path.",

      "badges.pirSample": "PIR sample",
      "badges.csvLoaded": "CSV загружен",
      "badges.lapsDetected": "Круги найдены",
      "badges.referenceReady": "Reference готов",
      "badges.project": "Проект",

      "actions.fitTrack": "Показать всю трассу",
      "actions.exportTrackDefinition": "Экспорт TrackDefinition",
      "actions.reloadPirSample": "Загрузить PIR sample",
      "actions.loadCsv": "Загрузить CSV",
      "actions.setDetectionSf": "Поставить detection S/F",
      "actions.detectLaps": "Найти круги",
      "actions.buildMedianReference": "Построить median reference",
      "actions.setOnMap": "Поставить на карте",
      "actions.clear": "Очистить",
      "actions.clearTiming": "Очистить тайминг",
      "actions.apply": "Применить",
      "actions.addCorner": "Добавить поворот",
      "actions.rename": "Переименовать",
      "actions.delete": "Удалить",
      "actions.previous": "Предыдущий",
      "actions.next": "Следующий",
      "actions.setStart": "Поставить Start",
      "actions.setApex": "Поставить Apex",
      "actions.setEnd": "Поставить End",
      "actions.clearSelectedCorner": "Очистить выбранный поворот",
      "actions.saveProject": "Сохранить проект",
      "actions.importProject": "Импорт проекта",
      "actions.resetCorners": "Сбросить всю разметку поворотов",

      "common.optional": "(необязательно)",
      "common.notSet": "не задано",
      "common.custom": "Свои",
      "common.selected": "ВЫБРАН",
      "common.set": "Поставить",
      "common.lines": "{set} / {required} линий",

      "map.settings": "Настройки спутниковой карты",
      "map.arcgisToken": "ArcGIS access token",
      "map.tokenPlaceholder": "Официальный token endpoint",
      "map.tokenNote": "Без token используется публичный fallback. Token сохраняется только в localStorage этого браузера.",
      "map.satellite": "Спутник",
      "map.rawLaps": "Сырые круги",
      "map.gatesZones": "Gates / зоны",
      "map.map": "Карта",
      "map.satelliteOpacity": "Прозрачность спутниковой карты",
      "map.help": "Колесо = zoom · drag по пустому месту = pan · drag маркеров тайминга/поворотов = перемещение вдоль reference",

      "timing.title": "Старт / финиш и сектора",
      "timing.description": "Поставь финальную <b>Start/Finish line</b> и sector split lines прямо на GNSS reference path. Для <b>3 секторов</b> нужны две split-line: конец S1 и конец S2; S3 автоматически заканчивается на Start/Finish.",
      "timing.startFinish": "СТАРТ / ФИНИШ",
      "timing.numberOfSectors": "Количество секторов",
      "timing.sectorsUnit": "секторов",
      "timing.lineWidth": "Ширина timing line",
      "timing.defaultHint": "Нажми «Поставить на карте», затем кликни по reference line. Маркеры тайминга потом можно перетаскивать.",
      "timing.setSfHint": "Кликни по reference path, чтобы поставить финальную Start/Finish line.",
      "timing.setSplitHint": "Кликни по reference path, чтобы поставить конец Sector {sector}.",
      "timing.snapHint": "Timing lines привязываются к reference path и автоматически строятся перпендикулярно направлению движения.",
      "timing.ready": "Тайминг готов: {count} сектор(а/ов), Start/Finish + {splits} split line(s).",
      "timing.sectorEnd": "Конец S{sector}",
      "timing.lastSectorEnd": "Конец S{sector}",
      "timing.lastSectorValue": "Start / Finish",
      "timing.confirmReduce": "Уменьшение до {count} секторов удалит {removed} уже поставленных split line(s). Продолжить?",
      "timing.confirmClear": "Очистить Start/Finish и все sector split lines?",
      "timing.validation.sfMissing": "Start/Finish line не задана.",
      "timing.validation.splitMissing": "Split конца S{sector} не задан.",
      "timing.validation.splitTooCloseSf": "Конец S{sector} слишком близко к Start/Finish.",
      "timing.validation.splitOrder": "Неверный порядок или расстояние между split lines около S{sector}.",
      "timing.validation.lastTooCloseSf": "Последний sector split слишком близко к Start/Finish.",

      "corners.title": "Разметка поворотов",
      "corners.description": "Для каждого поворота ставим только <b>Start → Apex → End</b>. Точки всегда привязываются к GNSS reference path. Gates и analysis polygon строятся автоматически.",
      "corners.newIdPlaceholder": "например T3A",
      "corners.defaultHint": "Выбери Start/Apex/End, затем кликни по линии.",
      "corners.gateWidth": "Ширина gate",
      "corners.analysisBuffer": "Analysis buffer",
      "corners.apexOrderWarning": "Apex не находится между Start и End по направлению reference path. Перетащи точки.",
      "corners.longZoneWarning": "Зона анализа этого поворота слишком длинная. Проверь Start/End.",
      "corners.setPointHint": "{corner}: кликни по reference line, чтобы поставить {field}.",
      "corners.detectionSfHint": "Кликни по реальной GNSS-линии на чистой detection Start/Finish straight.",
      "corners.dragHint": "Выбери Start/Apex/End, затем кликни по линии. Маркеры потом можно перетаскивать.",
      "corners.newIdPrompt": "Новое имя поворота",
      "corners.idExists": "{id} уже существует.",
      "corners.minOne": "Нужен хотя бы один поворот.",
      "corners.deleteConfirm": "Удалить {id}?",
      "corners.clearAllConfirm": "Очистить всю разметку поворотов?",
      "corners.presetConfirm": "Заменить текущий список поворотов? Разметка совпадающих ID будет сохранена.",

      "reference.referenceOnly": "ТОЛЬКО ДЛЯ ОРИЕНТИРА",
      "reference.pirNumbering": "Нумерация поворотов PIR",
      "reference.pirGuideAlt": "Схема нумерации поворотов PIR",
      "reference.guideNote": "Картинка используется только как визуальная подсказка нумерации. Она <b>не</b> участвует в координатах или привязке карты.",

      "project.title": "Сохранение / загрузка",

      "empty.title": "Загрузи GNSS CSV",
      "empty.description": "Затем поставь Start/Finish, найди круги и построй reference path.",

      "status.ready": "Готово.",
      "status.referenceEmpty": "Reference: —",
      "status.reference": "Reference: {length} м · {points} точек",
      "status.csvLoaded": "Загружено GNSS samples: {count}. Нажми «Поставить detection S/F».",
      "status.sfSet": "Detection Start/Finish задан. Теперь найди круги.",
      "status.crossingsFailed": "Не удалось найти достаточно пересечений. Перемести detection S/F на более чистую прямую.",
      "status.lapsDetected": "Найдено кругов: {count}. Проверь выбор и построй median reference.",
      "status.referenceBuilt": "Построен median reference из {points} точек по {laps} кругам.",
      "status.projectImported": "Проект импортирован.",
      "status.pirReady": "PIR готов: median GNSS reference построен по {laps} быстрым кругам. Разметь timing lines и повороты.",
      "status.needReference": "Сначала построй или загрузи reference.",
      "status.detectionMode": "Режим detection S/F: кликни по чистой точке на старт/финишной прямой.",
      "status.nothingToSave": "Пока нечего сохранять.",

      "stats.reference": "Reference",
      "stats.points": "Точек",
      "stats.lapsUsed": "Кругов",
      "stats.best": "Лучший",
      "stats.samples": "Samples",
      "stats.sf": "Detection S/F",
      "stats.set": "задан",
      "stats.notSet": "не задан",
      "laps.lap": "Круг",

      "errors.csvNoRows": "В CSV нет строк с данными.",
      "errors.csvMissingLatLon": "CSV должен содержать колонки lat и lon.",
      "errors.csvTooFewRows": "Недостаточно валидных GNSS строк.",
      "errors.invalidProject": "Это не проект GNSS Track Editor.",

      "export.timingIncomplete": "Тайминг не закончен: {issues}",
      "export.cornersIncomplete": "Не закончены повороты: {corners}.",
      "export.confirmAnyway": "{warnings}\n\nЭкспортировать всё равно?",

      "project.appName": "GNSS Track Editor"
    }
  };

  function interpolate(template, vars = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
    );
  }

  function t(key, vars = {}) {
    const table = translations[language] || translations[DEFAULT_LANGUAGE];
    const fallback = translations[DEFAULT_LANGUAGE];
    return interpolate(table[key] ?? fallback[key] ?? key, vars);
  }

  function applyStaticTranslations() {
    document.documentElement.lang = language;
    document.title = t("app.title");

    document.querySelectorAll("[data-i18n]").forEach(node => {
      node.textContent = t(node.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-html]").forEach(node => {
      node.innerHTML = t(node.dataset.i18nHtml);
    });
    document.querySelectorAll("[data-i18n-title]").forEach(node => {
      node.title = t(node.dataset.i18nTitle);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(node => {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(node => {
      node.alt = t(node.dataset.i18nAlt);
    });

    const select = document.getElementById("languageSelect");
    if (select) select.value = language;
  }

  function setLanguage(next) {
    if (!["en", "ru"].includes(next)) return;
    language = next;
    localStorage.setItem(STORAGE_KEY, language);
    applyStaticTranslations();
    window.dispatchEvent(new CustomEvent("track-editor-language-change", {
      detail: {language}
    }));
  }

  function getLanguage() {
    return language;
  }

  function locale() {
    return language === "ru" ? "ru-RU" : "en-US";
  }

  window.TrackEditorI18n = {
    t,
    setLanguage,
    getLanguage,
    locale,
    applyStaticTranslations,
    translations
  };

  applyStaticTranslations();

  const select = document.getElementById("languageSelect");
  if (select) {
    select.addEventListener("change", event => setLanguage(event.target.value));
  }
})();
