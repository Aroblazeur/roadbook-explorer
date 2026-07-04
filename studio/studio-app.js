"use strict";

(function initializeRoadbookStudio() {
    const CATALOG_PATH = "roadbooks/catalog.json";
    const ROADBOOK_PATH = id => `roadbooks/${encodeURIComponent(id)}/roadbook.json`;
    const PRIMARY_METADATA_KEYS = ["activity", "destination", "projectStatus", "coverImage", "project"];
    const METADATA_LABELS = {
        activity: "Activité",
        destination: "Destination",
        projectStatus: "Statut du projet",
        coverImage: "Image de couverture",
        project: "Projet",
        generatedAt: "Généré le",
        source: "Source",
        googleSheetId: "Google Sheet ID"
    };

    const state = {
        catalogIds: [],
        selectedRoadbookId: "",
        selectedRoadbook: null
    };

    const elements = {
        status: document.getElementById("studio-status"),
        list: document.getElementById("studio-roadbook-list"),
        detailTitle: document.getElementById("studio-detail-title"),
        detail: document.getElementById("studio-detail"),
        refresh: document.getElementById("studio-refresh"),
        addStage: document.getElementById("studio-add-stage"),
        downloadJson: document.getElementById("studio-download-json"),
        stageTemplate: document.getElementById("studio-stage-template"),
        variantTemplate: document.getElementById("studio-variant-template")
    };

    elements.refresh?.addEventListener("click", () => loadCatalog({ forceReload: true }));
    elements.addStage?.addEventListener("click", handleAddStage);
    elements.downloadJson?.addEventListener("click", downloadCurrentRoadbookJson);

    loadCatalog();

    async function loadCatalog(options = {}) {
        const { forceReload = false } = options;
        setStatus("Chargement du catalogue…");
        elements.list.replaceChildren();

        try {
            const catalog = await fetchJson(CATALOG_PATH, { forceReload });
            state.catalogIds = sanitizeCatalogIds(catalog?.roadbooks);
            renderCatalog();
            setStatus(state.catalogIds.length
                ? `${state.catalogIds.length} roadbook(s) disponible(s).`
                : "Aucun roadbook trouvé dans le catalogue.");
        } catch (error) {
            console.error("[Studio] Catalogue indisponible", error);
            setStatus("Impossible de charger le catalogue roadbooks/catalog.json.");
        }
    }

    function sanitizeCatalogIds(values) {
        if (!Array.isArray(values)) return [];
        return [...new Set(values
            .map(value => String(value || "").trim().toLowerCase())
            .filter(value => /^[a-z0-9-]+$/.test(value))
        )];
    }

    function renderCatalog() {
        elements.list.replaceChildren();
        state.catalogIds.forEach(id => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "studio-roadbook-card";
            button.addEventListener("click", () => openRoadbook(id));

            const title = document.createElement("p");
            title.className = "studio-roadbook-card__title";
            title.textContent = id;

            const meta = document.createElement("p");
            meta.className = "studio-roadbook-card__meta";
            meta.textContent = `roadbooks/${id}/roadbook.json`;

            button.append(title, meta);
            elements.list.appendChild(button);
        });
    }

    async function openRoadbook(id) {
        setStatus(`Chargement de ${id}…`);
        try {
            const roadbook = await fetchJson(ROADBOOK_PATH(id), { forceReload: true });
            state.selectedRoadbookId = id;
            state.selectedRoadbook = normalizeRoadbookForEditing(roadbook, id);
            renderRoadbookEditor();
            setStatus(`${safeText(state.selectedRoadbook.title, id)} chargé.`);
        } catch (error) {
            console.error(`[Studio] Roadbook indisponible : ${id}`, error);
            renderErrorDetail(id);
            setStatus(`Impossible de charger ${ROADBOOK_PATH(id)}.`);
        }
    }

    async function fetchJson(path, options = {}) {
        const url = new URL(path, window.location.href);
        if (options.forceReload) url.searchParams.set("t", String(Date.now()));
        const response = await fetch(url.href, { cache: options.forceReload ? "reload" : "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    function normalizeRoadbookForEditing(roadbook, id) {
        const clone = structuredClone(roadbook || {});
        clone.id = safeText(clone.id, id);
        clone.title = safeText(clone.title, id);
        clone.description = safeText(clone.description, "");
        clone.metadata = normalizeMetadataForEditing(clone.metadata);
        clone.stages = extractEditableStages(clone);
        delete clone.days;
        return clone;
    }

    function normalizeMetadataForEditing(metadata) {
        const normalized = metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? structuredClone(metadata)
            : {};

        PRIMARY_METADATA_KEYS.forEach(key => {
            normalized[key] = safeText(normalized[key], "");
        });

        return normalized;
    }

    function extractEditableStages(roadbook) {
        const source = Array.isArray(roadbook.stages)
            ? roadbook.stages
            : Array.isArray(roadbook.days)
                ? roadbook.days.filter(day => !day.isSubstep)
                : [];

        return source.map((stage, index) => normalizeStage(stage, index));
    }

    function normalizeStage(stage, index) {
        const normalized = structuredClone(stage || {});
        normalized.stage = toFiniteNumber(normalized.stage) ?? index + 1;
        normalized.title = safeText(normalized.title, `Étape ${normalized.stage}`);
        normalized.departure = safeText(normalized.departure, "");
        normalized.arrival = safeText(normalized.arrival, "");
        normalized.distance = toFiniteNumber(normalized.distance);
        normalized.elevationGain = toFiniteNumber(normalized.elevationGain);
        normalized.elevationLoss = toFiniteNumber(normalized.elevationLoss);
        normalized.description = safeText(normalized.description, "");
        normalized.variants = normalizeVariants(
            Array.isArray(normalized.variants) && normalized.variants.length
                ? normalized.variants
                : normalized.substeps
        );
        normalized.substeps = normalized.variants;
        return normalized;
    }

    function normalizeVariants(variants) {
        if (!Array.isArray(variants)) return [];
        return variants.map((variant, index) => ({
            name: safeText(variant?.name || variant?.title, `Variante ${index + 1}`),
            distance: toFiniteNumber(variant?.distance),
            description: safeText(variant?.description, "")
        }));
    }

    function renderRoadbookEditor() {
        const roadbook = state.selectedRoadbook;
        if (!roadbook) return;

        elements.detailTitle.textContent = safeText(roadbook.title, state.selectedRoadbookId);
        elements.detail.className = "studio-detail";
        elements.detail.replaceChildren();

        elements.detail.appendChild(createGeneralInfoEditor(roadbook));
        elements.detail.appendChild(createSummaryGrid(roadbook));
        elements.detail.appendChild(createStageEditorList(roadbook.stages));

        elements.addStage.disabled = false;
        elements.downloadJson.disabled = false;
    }

    function createSummaryGrid(roadbook) {
        const summary = computeSummary(roadbook.stages);
        const grid = document.createElement("div");
        grid.className = "studio-detail__summary";

        grid.appendChild(createMetric("Distance", formatMetric(summary.distance, "km")));
        grid.appendChild(createMetric("D+", formatMetric(summary.elevationGain, "m")));
        grid.appendChild(createMetric("D−", formatMetric(summary.elevationLoss, "m")));

        return grid;
    }

    function createGeneralInfoEditor(roadbook) {
        const section = document.createElement("section");
        section.className = "studio-general-info";

        const title = document.createElement("h3");
        title.textContent = "Informations générales";
        section.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--general";

        grid.appendChild(createGeneralField({
            label: "ID",
            value: roadbook.id,
            readOnly: true
        }));
        grid.appendChild(createGeneralField({
            label: "Titre",
            value: roadbook.title,
            onChange: value => updateRoadbookField("title", value.trim())
        }));
        grid.appendChild(createGeneralField({
            label: "Description",
            value: roadbook.description,
            isTextarea: true,
            fullWidth: true,
            onChange: value => updateRoadbookField("description", value.trim())
        }));

        getEditableMetadataKeys(roadbook.metadata).forEach(key => {
            grid.appendChild(createGeneralField({
                label: METADATA_LABELS[key] || `metadata.${key}`,
                value: roadbook.metadata?.[key] ?? "",
                fullWidth: key === "coverImage",
                onChange: value => updateMetadataField(key, value.trim())
            }));
        });

        section.appendChild(grid);
        return section;
    }

    function getEditableMetadataKeys(metadata) {
        const keys = [];
        const seen = new Set();

        PRIMARY_METADATA_KEYS.forEach(key => {
            keys.push(key);
            seen.add(key);
        });

        Object.keys(metadata || {}).forEach(key => {
            if (seen.has(key)) return;
            if (!isEditableMetadataValue(metadata[key])) return;
            keys.push(key);
            seen.add(key);
        });

        return keys;
    }

    function isEditableMetadataValue(value) {
        return value == null || ["string", "number", "boolean"].includes(typeof value);
    }

    function createGeneralField(options) {
        const { label, value, readOnly = false, isTextarea = false, fullWidth = false, onChange } = options;
        const wrapper = document.createElement("label");
        if (fullWidth) wrapper.className = "studio-form-grid__full";
        wrapper.appendChild(document.createTextNode(label));

        const input = isTextarea ? document.createElement("textarea") : document.createElement("input");
        if (isTextarea) {
            input.rows = 3;
        } else {
            input.type = "text";
        }

        input.value = value ?? "";
        input.readOnly = readOnly;
        if (readOnly) input.classList.add("studio-input--readonly");
        if (typeof onChange === "function") {
            input.addEventListener("input", event => onChange(event.target.value));
        }

        wrapper.appendChild(input);
        return wrapper;
    }

    function computeSummary(stages) {
        return stages.reduce((accumulator, stage) => {
            accumulator.distance += toFiniteNumber(stage.distance) || 0;
            accumulator.elevationGain += toFiniteNumber(stage.elevationGain) || 0;
            accumulator.elevationLoss += toFiniteNumber(stage.elevationLoss) || 0;
            return accumulator;
        }, { distance: 0, elevationGain: 0, elevationLoss: 0 });
    }

    function createMetric(label, value) {
        const item = document.createElement("div");
        item.className = "studio-detail__metric";
        const labelNode = document.createElement("span");
        labelNode.textContent = label;
        const valueNode = document.createElement("strong");
        valueNode.textContent = value;
        item.append(labelNode, valueNode);
        return item;
    }

    function createStageEditorList(stages) {
        const section = document.createElement("section");
        const title = document.createElement("h3");
        title.textContent = `Étapes (${stages.length})`;
        const list = document.createElement("div");
        list.className = "studio-stage-list";
        stages.forEach((stage, stageIndex) => list.appendChild(createStageEditor(stage, stageIndex)));
        section.append(title, list);
        return section;
    }

    function createStageEditor(stage, stageIndex) {
        const fragment = elements.stageTemplate.content.cloneNode(true);
        const card = fragment.querySelector(".studio-stage-card");
        const title = fragment.querySelector(".studio-stage-card__title");
        title.textContent = stage.title;

        bindStageField(fragment, "stage", stage.stage, value => updateStage(stageIndex, "stage", integerOrNull(value)));
        bindStageField(fragment, "title", stage.title, value => updateStage(stageIndex, "title", value.trim()));
        bindStageField(fragment, "departure", stage.departure, value => updateStage(stageIndex, "departure", value.trim()));
        bindStageField(fragment, "arrival", stage.arrival, value => updateStage(stageIndex, "arrival", value.trim()));
        bindStageField(fragment, "distance", stage.distance, value => updateStage(stageIndex, "distance", decimalOrNull(value)));
        bindStageField(fragment, "elevationGain", stage.elevationGain, value => updateStage(stageIndex, "elevationGain", decimalOrNull(value)));
        bindStageField(fragment, "elevationLoss", stage.elevationLoss, value => updateStage(stageIndex, "elevationLoss", decimalOrNull(value)));
        bindStageField(fragment, "description", stage.description, value => updateStage(stageIndex, "description", value.trim()));

        fragment.querySelector('[data-action="delete-stage"]').addEventListener("click", () => deleteStage(stageIndex));
        fragment.querySelector('[data-action="add-variant"]').addEventListener("click", () => addVariant(stageIndex));

        const variantList = fragment.querySelector(".studio-variant-list");
        stage.variants.forEach((variant, variantIndex) => variantList.appendChild(createVariantEditor(stageIndex, variant, variantIndex)));

        card.dataset.stageIndex = String(stageIndex);
        return fragment;
    }

    function createVariantEditor(stageIndex, variant, variantIndex) {
        const fragment = elements.variantTemplate.content.cloneNode(true);
        fragment.querySelector(".studio-variant-card__title").textContent = variant.name;
        bindVariantField(fragment, "name", variant.name, value => updateVariant(stageIndex, variantIndex, "name", value.trim() || `Variante ${variantIndex + 1}`));
        bindVariantField(fragment, "distance", variant.distance, value => updateVariant(stageIndex, variantIndex, "distance", decimalOrNull(value)));
        bindVariantField(fragment, "description", variant.description, value => updateVariant(stageIndex, variantIndex, "description", value.trim()));
        fragment.querySelector('[data-action="delete-variant"]').addEventListener("click", () => deleteVariant(stageIndex, variantIndex));
        return fragment;
    }

    function bindStageField(root, field, value, onChange) {
        const input = root.querySelector(`[data-field="${field}"]`);
        if (!input) return;
        input.value = value ?? "";
        input.addEventListener("input", event => onChange(event.target.value));
    }

    function bindVariantField(root, field, value, onChange) {
        const input = root.querySelector(`[data-field="${field}"]`);
        if (!input) return;
        input.value = value ?? "";
        input.addEventListener("input", event => onChange(event.target.value));
    }

    function updateStage(stageIndex, field, value) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        if (!stage) return;
        stage[field] = value;
        if (field === "stage") stage.title = safeText(stage.title, `Étape ${stage.stage ?? stageIndex + 1}`);
        rerenderEditorPreservingScroll();
    }

    function updateRoadbookField(field, value) {
        const roadbook = state.selectedRoadbook;
        if (!roadbook) return;
        roadbook[field] = value;
        if (field === "title") {
            elements.detailTitle.textContent = safeText(roadbook.title, state.selectedRoadbookId);
        }
    }

    function updateMetadataField(key, value) {
        const roadbook = state.selectedRoadbook;
        if (!roadbook) return;
        if (!roadbook.metadata || typeof roadbook.metadata !== "object") {
            roadbook.metadata = {};
        }
        roadbook.metadata[key] = value;
    }

    function updateVariant(stageIndex, variantIndex, field, value) {
        const variant = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex];
        if (!variant) return;
        variant[field] = value;
        rerenderEditorPreservingScroll();
    }

    function handleAddStage() {
        if (!state.selectedRoadbook) return;
        const nextStageNumber = state.selectedRoadbook.stages.length + 1;
        state.selectedRoadbook.stages.push({
            stage: nextStageNumber,
            title: `Étape ${nextStageNumber}`,
            departure: "",
            arrival: "",
            distance: null,
            elevationGain: null,
            elevationLoss: null,
            description: "",
            variants: []
        });
        rerenderEditorPreservingScroll();
    }

    function deleteStage(stageIndex) {
        if (!state.selectedRoadbook) return;
        state.selectedRoadbook.stages.splice(stageIndex, 1);
        state.selectedRoadbook.stages.forEach((stage, index) => {
            if (!Number.isFinite(stage.stage)) stage.stage = index + 1;
        });
        rerenderEditorPreservingScroll();
    }

    function addVariant(stageIndex) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        if (!stage) return;
        stage.variants.push({
            name: `Variante ${stage.variants.length + 1}`,
            distance: null,
            description: ""
        });
        rerenderEditorPreservingScroll();
    }

    function deleteVariant(stageIndex, variantIndex) {
        const variants = state.selectedRoadbook?.stages?.[stageIndex]?.variants;
        if (!Array.isArray(variants)) return;
        variants.splice(variantIndex, 1);
        rerenderEditorPreservingScroll();
    }

    function rerenderEditorPreservingScroll() {
        const scrollTop = window.scrollY;
        renderRoadbookEditor();
        window.scrollTo({ top: scrollTop });
    }

    function downloadCurrentRoadbookJson() {
        if (!state.selectedRoadbook) return;
        const exportPayload = buildExportRoadbook(state.selectedRoadbook);
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${state.selectedRoadbookId || exportPayload.id || "roadbook"}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function buildExportRoadbook(roadbook) {
        const clone = structuredClone(roadbook);
        clone.stages = clone.stages.map(stage => ({
            ...stage,
            substeps: normalizeVariants(stage.variants),
            variants: normalizeVariants(stage.variants)
        }));
        clone.variants = clone.stages.flatMap(stage =>
            normalizeVariants(stage.variants).map(variant => ({
                ...variant,
                parentStage: stage.stage,
                parentStageReference: stage.stage
            }))
        );
        clone.summary = {
            ...(clone.summary || {}),
            ...computeSummary(clone.stages)
        };
        return clone;
    }

    function renderErrorDetail(id) {
        state.selectedRoadbook = null;
        state.selectedRoadbookId = "";
        elements.detailTitle.textContent = id;
        elements.detail.className = "studio-detail studio-detail--empty";
        elements.detail.replaceChildren();
        const message = document.createElement("p");
        message.textContent = `Le fichier ${ROADBOOK_PATH(id)} est introuvable ou invalide.`;
        elements.detail.appendChild(message);
        elements.addStage.disabled = true;
        elements.downloadJson.disabled = true;
    }

    function setStatus(message) {
        if (elements.status) elements.status.textContent = message;
    }

    function safeText(value, fallback = "") {
        const text = String(value ?? "").trim();
        return text || fallback;
    }

    function formatMetric(value, unit) {
        return Number.isFinite(value) ? `${value} ${unit}` : "—";
    }

    function toFiniteNumber(value) {
        return Number.isFinite(value) ? value : null;
    }

    function decimalOrNull(value) {
        const parsed = Number(String(value).replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function integerOrNull(value) {
        const parsed = Number.parseInt(String(value), 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
})();
