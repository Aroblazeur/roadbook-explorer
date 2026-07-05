"use strict";

(function initializeRoadbookStudio() {
    const CATALOG_PATH = "roadbooks/catalog.json";
    const ROADBOOK_PATH = id => `roadbooks/${encodeURIComponent(id)}/roadbook.json`;
    const PRIMARY_METADATA_KEYS = ["project"];
    const METADATA_LABELS = {
        project: "Projet"
    };
    const STAGE_ACCOMMODATION_FIELDS = ["name", "website", "url", "photo", "price"];
    const STAGE_NOTE_FIELDS = ["text", "photo", "createdAt", "source"];
    const STAGE_REFERENCE_FIELDS = ["gpx", "mapEmbedUrl", "stagePhoto"];
    const POI_FIELDS = ["name", "region", "url", "image"];
    const ROADBOOK_ACCOMMODATION_FIELDS = ["role", "name", "website", "url", "photo", "type", "comment", "createdAt", "source"];
    const ROADBOOK_NOTE_FIELDS = ["stage", "text", "photo", "createdAt", "source", "author", "timestamp"];
    const CONTRIBUTION_FIELDS = ["id", "type", "stage", "createdAt", "status", "source", "author", "timestamp"];
    const CONTRIBUTION_PAYLOAD_FIELDS = ["text", "name", "url", "photo", "comment"];

    const state = {
        catalogIds: [],
        selectedRoadbookId: "",
        selectedRoadbook: null,
        expandedStages: new Set(),
        expandedVariants: new Set(),
        generalInfoExpanded: true
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
            state.expandedStages = new Set();
            state.expandedVariants = new Set();
            state.generalInfoExpanded = true;
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
        clone.accommodation = normalizeRoadbookAccommodations(clone.accommodation);
        clone.pois = normalizeRoadbookPois(clone.pois);
        clone.notes = normalizeRoadbookNotes(clone.notes);
        clone.contributions = normalizeContributions(clone.contributions);
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
        STAGE_REFERENCE_FIELDS.forEach(field => {
            normalized[field] = safeText(normalized[field], "");
        });
        normalized.warning = normalizeStringList(normalized.warning);
        normalized.pois = normalizePois(normalized.pois || normalized.pointsOfInterest || normalized.interest);
        normalized.pointsOfInterest = normalized.pois;
        normalized.interest = normalized.pois;
        normalized.accommodation = normalizeStageAccommodation(normalized.accommodation);
        normalized.accommodationType = safeText(normalized.accommodationType, "");
        normalized.noteItems = normalizeStageNoteItems(normalized.noteItems);
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
        return variants.map((variant, index) => normalizeVariant(variant, index));
    }

    function normalizeVariant(variant, index) {
        const normalized = variant && typeof variant === "object" && !Array.isArray(variant)
            ? structuredClone(variant)
            : {};
        normalized.type = safeText(normalized.type, "");
        normalized.name = safeText(normalized.name || normalized.title, `Variante ${index + 1}`);
        normalized.title = safeText(normalized.title, normalized.name);
        normalized.departure = safeText(normalized.departure, "");
        normalized.arrival = safeText(normalized.arrival, "");
        normalized.distance = toFiniteNumber(normalized.distance);
        normalized.elevationGain = toFiniteNumber(normalized.elevationGain);
        normalized.elevationLoss = toFiniteNumber(normalized.elevationLoss);
        normalized.description = safeText(normalized.description, "");
        STAGE_REFERENCE_FIELDS.forEach(field => {
            normalized[field] = safeText(normalized[field], "");
        });
        normalized.warning = normalizeStringList(normalized.warning);
        normalized.pois = normalizePois(normalized.pois || normalized.pointsOfInterest || normalized.interest);
        normalized.pointsOfInterest = normalized.pois;
        normalized.interest = normalized.pois;
        normalized.accommodation = normalizeStageAccommodation(normalized.accommodation);
        normalized.accommodationType = safeText(normalized.accommodationType, "");
        normalized.noteItems = normalizeStageNoteItems(normalized.noteItems);
        return normalized;
    }

    function normalizePois(pois) {
        if (!Array.isArray(pois)) return [];
        return pois.map(poi => normalizePoi(poi));
    }

    function normalizePoi(poi) {
        const normalized = poi && typeof poi === "object" && !Array.isArray(poi)
            ? structuredClone(poi)
            : { name: safeText(poi, "") };
        POI_FIELDS.forEach(field => {
            normalized[field] = safeText(normalized[field], "");
        });
        return normalized;
    }

    function normalizeStringList(values) {
        if (Array.isArray(values)) return values.map(value => safeText(value, "")).filter(Boolean);
        const value = safeText(values, "");
        return value ? [value] : [];
    }

    function normalizeStageAccommodation(accommodation) {
        const normalized = accommodation && typeof accommodation === "object" && !Array.isArray(accommodation)
            ? structuredClone(accommodation)
            : {};
        STAGE_ACCOMMODATION_FIELDS.forEach(field => {
            normalized[field] = safeText(normalized[field], "");
        });
        normalized.alternatives = normalizeStageAccommodationAlternatives(normalized.alternatives);
        return normalized;
    }

    function normalizeStageAccommodationAlternatives(alternatives) {
        if (!Array.isArray(alternatives)) return [];
        return alternatives.map(alternative => ({
            url: safeText(alternative?.url, ""),
            name: safeText(alternative?.name, ""),
            photo: safeText(alternative?.photo, ""),
            price: safeText(alternative?.price, "")
        }));
    }

    function normalizeRoadbookAccommodations(accommodations) {
        if (!Array.isArray(accommodations)) return [];
        return accommodations.map(accommodation => normalizeRoadbookAccommodationEntry(accommodation));
    }

    function normalizeRoadbookPois(pois) {
        if (!Array.isArray(pois)) return [];
        return pois.map(poi => {
            const normalized = normalizePoi(poi);
            normalized.stage = integerOrNull(poi?.stage);
            return normalized;
        });
    }

    function normalizeRoadbookAccommodationEntry(accommodation) {
        const normalized = accommodation && typeof accommodation === "object" && !Array.isArray(accommodation)
            ? structuredClone(accommodation)
            : {};
        normalized.stage = integerOrNull(normalized.stage);
        ROADBOOK_ACCOMMODATION_FIELDS.forEach(field => {
            normalized[field] = safeText(normalized[field], "");
        });
        return normalized;
    }

    function normalizeRoadbookNotes(notes) {
        if (!Array.isArray(notes)) return [];
        return notes.map(note => normalizeRoadbookNoteItem(note));
    }

    function normalizeRoadbookNoteItem(note) {
        const normalized = note && typeof note === "object" && !Array.isArray(note)
            ? structuredClone(note)
            : {};
        normalized.stage = integerOrNull(normalized.stage);
        ROADBOOK_NOTE_FIELDS.forEach(field => {
            if (field === "stage") return;
            normalized[field] = safeText(normalized[field], "");
        });
        return normalized;
    }

    function normalizeStageNoteItems(noteItems) {
        if (!Array.isArray(noteItems)) return [];
        return noteItems.map(item => normalizeStageNoteItem(item));
    }

    function normalizeStageNoteItem(note) {
        const normalized = note && typeof note === "object" && !Array.isArray(note)
            ? structuredClone(note)
            : {};
        STAGE_NOTE_FIELDS.forEach(field => {
            normalized[field] = safeText(normalized[field], "");
        });
        return normalized;
    }

    function normalizeContributions(contributions) {
        if (!Array.isArray(contributions)) return [];
        const usedIds = new Set();
        return contributions.map((contribution, index) => normalizeContribution(contribution, index, usedIds));
    }

    function normalizeContribution(contribution, index, usedIds = new Set()) {
        const normalized = contribution && typeof contribution === "object" && !Array.isArray(contribution)
            ? structuredClone(contribution)
            : {};
        normalized.id = reserveUniqueContributionId(
            usedIds,
            safeText(normalized.id, ""),
            `contribution-${Date.now()}-${index + 1}`
        );
        normalized.type = safeText(normalized.type, "travelerNote");
        normalized.stage = integerOrNull(normalized.stage);
        normalized.createdAt = safeText(normalized.createdAt, "");
        normalized.status = safeText(normalized.status, "");
        normalized.source = safeText(normalized.source, "");
        normalized.author = safeText(normalized.author, "");
        normalized.timestamp = safeText(normalized.timestamp, "");
        normalized.payload = normalizeContributionPayload(normalized.payload);
        return normalized;
    }

    function reserveUniqueContributionId(usedIds, preferredId, fallbackPrefix = "contribution") {
        const baseId = safeText(preferredId, "") || safeText(fallbackPrefix, "contribution");
        if (!usedIds.has(baseId)) {
            usedIds.add(baseId);
            return baseId;
        }
        let suffix = 1;
        let candidate = `${baseId}-${suffix}`;
        while (usedIds.has(candidate)) {
            suffix += 1;
            candidate = `${baseId}-${suffix}`;
        }
        usedIds.add(candidate);
        return candidate;
    }

    function normalizeContributionPayload(payload) {
        const normalized = payload && typeof payload === "object" && !Array.isArray(payload)
            ? structuredClone(payload)
            : {};
        CONTRIBUTION_PAYLOAD_FIELDS.forEach(field => {
            normalized[field] = safeText(normalized[field], "");
        });
        return normalized;
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
        elements.detail.appendChild(createRoadbookNotesEditor(roadbook.notes));
        elements.detail.appendChild(createContributionsEditor(roadbook.contributions));

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

    function createSummaryReferencesEditor(roadbook) {
        const section = document.createElement("section");
        section.className = "studio-general-info";
        const title = document.createElement("h3");
        title.textContent = "Synthèses et tracés globaux";
        section.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        [
            { sectionKey: "official", field: "gpx", label: "Itinéraire officiel · GPX" },
            { sectionKey: "official", field: "mapEmbedUrl", label: "Itinéraire officiel · carte intégrée" },
            { sectionKey: "stagesTotal", field: "gpx", label: "Roadbook actuel · GPX" },
            { sectionKey: "stagesTotal", field: "mapEmbedUrl", label: "Roadbook actuel · carte intégrée" }
        ].forEach(({ sectionKey, field, label }) => {
            grid.appendChild(createBoundField({
                label,
                value: roadbook.summary?.[sectionKey]?.[field] ?? "",
                fullWidth: true,
                onChange: value => updateSummaryReference(sectionKey, field, value.trim())
            }));
        });
        section.appendChild(grid);
        return section;
    }

    function createGeneralInfoEditor(roadbook) {
        const section = document.createElement("section");
        section.className = "studio-general-info";

        const header = document.createElement("div");
        header.className = "studio-general-info__header";
        header.setAttribute("role", "button");
        header.setAttribute("tabindex", "0");

        const title = document.createElement("h3");
        title.textContent = "Informations générales";
        header.appendChild(title);
        section.appendChild(header);

        const body = document.createElement("div");
        body.className = "studio-general-info__body";

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--general";

        grid.appendChild(createGeneralField({
            label: "Titre",
            value: roadbook.title,
            onChange: value => updateRoadbookField("title", value.trim())
        }));
        grid.appendChild(createGeneralField({
            label: "Projet",
            value: roadbook.metadata?.project ?? "",
            onChange: value => updateMetadataField("project", value.trim())
        }));
        grid.appendChild(createGeneralField({
            label: "Description",
            value: roadbook.description,
            isTextarea: true,
            fullWidth: true,
            onChange: value => updateRoadbookField("description", value.trim())
        }));

        body.appendChild(grid);

        const officialSection = document.createElement("section");
        officialSection.className = "studio-stage-extra";
        const officialHeader = document.createElement("div");
        officialHeader.className = "studio-stage-extra__header";
        const officialTitle = document.createElement("h4");
        officialTitle.textContent = "Itinéraire officiel";
        officialHeader.appendChild(officialTitle);
        officialSection.appendChild(officialHeader);

        const officialGrid = document.createElement("div");
        officialGrid.className = "studio-form-grid studio-form-grid--compact";
        [
            { field: "gpx", label: "GPS" },
            { field: "mapEmbedUrl", label: "Carte intégrée" }
        ].forEach(({ field, label }) => {
            officialGrid.appendChild(createBoundField({
                label,
                value: roadbook.summary?.official?.[field] ?? "",
                onChange: value => updateSummaryReference("official", field, value.trim())
            }));
        });
        officialSection.appendChild(officialGrid);
        body.appendChild(officialSection);

        const tracedSection = document.createElement("section");
        tracedSection.className = "studio-stage-extra";
        const tracedHeader = document.createElement("div");
        tracedHeader.className = "studio-stage-extra__header";
        const tracedTitle = document.createElement("h4");
        tracedTitle.textContent = "Tracé actuel";
        tracedHeader.appendChild(tracedTitle);
        tracedSection.appendChild(tracedHeader);

        const tracedGrid = document.createElement("div");
        tracedGrid.className = "studio-form-grid studio-form-grid--compact";
        [
            { field: "gpx", label: "GPS" },
            { field: "mapEmbedUrl", label: "Carte intégrée" }
        ].forEach(({ field, label }) => {
            tracedGrid.appendChild(createBoundField({
                label,
                value: roadbook.summary?.stagesTotal?.[field] ?? "",
                onChange: value => updateSummaryReference("stagesTotal", field, value.trim())
            }));
        });
        tracedSection.appendChild(tracedGrid);
        body.appendChild(tracedSection);

        section.appendChild(body);

        const applyToggleState = () => {
            const expanded = state.generalInfoExpanded;
            section.dataset.expanded = expanded ? "true" : "false";
            body.hidden = !expanded;
            header.setAttribute("aria-expanded", String(expanded));
        };

        const toggleGeneralInfo = () => {
            state.generalInfoExpanded = !state.generalInfoExpanded;
            applyToggleState();
        };

        header.addEventListener("click", toggleGeneralInfo);
        header.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleGeneralInfo();
            }
        });

        applyToggleState();

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
        stages.forEach((stage, stageIndex) => {
            list.appendChild(createStageEditor(stage, stageIndex));
            stage.variants.forEach((variant, variantIndex) => {
                list.appendChild(createVariantEditor(stageIndex, variant, variantIndex));
            });
        });
        section.append(title, list);
        return section;
    }

    function createStageEditor(stage, stageIndex) {
        const fragment = elements.stageTemplate.content.cloneNode(true);
        const card = fragment.querySelector(".studio-stage-card");
        const title = fragment.querySelector(".studio-stage-card__title");
        title.textContent = stage.title;

        const summaryEl = fragment.querySelector(".studio-stage-card__summary");
        if (summaryEl) summaryEl.textContent = buildStageSummaryText(stage);

        const body = fragment.querySelector(".studio-stage-card__body");
        const isExpanded = state.expandedStages.has(stageIndex);
        card.dataset.expanded = isExpanded ? "true" : "false";
        if (body) body.hidden = !isExpanded;

        const header = fragment.querySelector(".studio-stage-card__header");
        const toggleZone = fragment.querySelector(".studio-stage-card__header-info");
        if (header && toggleZone) {
            toggleZone.setAttribute("role", "button");
            toggleZone.setAttribute("tabindex", "0");
            const toggleStage = () => {
                const expanded = card.dataset.expanded === "true";
                card.dataset.expanded = expanded ? "false" : "true";
                if (body) body.hidden = expanded;
                if (expanded) {
                    state.expandedStages.delete(stageIndex);
                } else {
                    state.expandedStages.add(stageIndex);
                }
                toggleZone.setAttribute("aria-expanded", String(!expanded));
            };
            toggleZone.setAttribute("aria-expanded", isExpanded ? "true" : "false");
            toggleZone.addEventListener("click", toggleStage);
            toggleZone.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleStage();
                }
            });
        }

        bindStageField(fragment, "stage", stage.stage, value => updateStage(stageIndex, "stage", integerOrNull(value)));
        bindStageField(fragment, "title", stage.title, value => updateStage(stageIndex, "title", value.trim()));
        bindStageField(fragment, "departure", stage.departure, value => updateStage(stageIndex, "departure", value.trim()));
        bindStageField(fragment, "arrival", stage.arrival, value => updateStage(stageIndex, "arrival", value.trim()));
        bindStageField(fragment, "distance", stage.distance, value => updateStage(stageIndex, "distance", decimalOrNull(value)));
        bindStageField(fragment, "elevationGain", stage.elevationGain, value => updateStage(stageIndex, "elevationGain", decimalOrNull(value)));
        bindStageField(fragment, "elevationLoss", stage.elevationLoss, value => updateStage(stageIndex, "elevationLoss", decimalOrNull(value)));
        bindStageField(fragment, "stagePhoto", stage.stagePhoto, value => updateStage(stageIndex, "stagePhoto", value.trim()));
        bindStageField(fragment, "description", stage.description, value => updateStage(stageIndex, "description", value.trim()));
        bindStageField(fragment, "accommodationType", stage.accommodationType, value => updateStage(stageIndex, "accommodationType", value.trim()));

        fragment.querySelector('[data-action="delete-stage"]').addEventListener("click", () => deleteStage(stageIndex));
        fragment.querySelector('[data-action="add-variant"]').addEventListener("click", () => addVariant(stageIndex));

        const appendTarget = body || card;
        appendTarget.appendChild(createEditorZone("trace", "Tracé · Carte · Points d'intérêt", [
            createStageReferencesEditor(stageIndex, stage),
            createStagePoisEditor(stageIndex, stage.pois || [])
        ]));
        appendTarget.appendChild(createStageMainAccommodationEditor(stageIndex, stage));
        appendTarget.appendChild(createStageAlternativeAccommodationsEditor(stageIndex, stage));
        appendTarget.appendChild(createEditorZone("notes", "Notes", [
            createStageNotesEditor(stageIndex, stage.noteItems || [])
        ]));

        card.dataset.stageIndex = String(stageIndex);
        card.dataset.stageNumber = String(stage.stage ?? "");
        return fragment;
    }

    function buildStageSummaryText(stage) {
        const parts = [];
        if (stage.departure || stage.arrival) {
            parts.push(`${stage.departure || "?"} → ${stage.arrival || "?"}`);
        }
        if (stage.distance != null) {
            parts.push(`${stage.distance} km`);
        }
        return parts.join(" · ");
    }

    function createVariantEditor(stageIndex, variant, variantIndex) {
        const fragment = elements.variantTemplate.content.cloneNode(true);
        const variantCard = fragment.querySelector(".studio-variant-card");
        const variantKey = variantPanelKey(stageIndex, variantIndex);
        const isExpanded = state.expandedVariants.has(variantKey);
        variantCard.dataset.variantIndex = String(variantIndex);
        variantCard.dataset.parentStageIndex = String(stageIndex);
        variantCard.dataset.expanded = isExpanded ? "true" : "false";

        fragment.querySelector(".studio-variant-card__title").textContent = buildVariantTitle(stageIndex, variant, variantIndex);
        const summaryEl = fragment.querySelector(".studio-stage-card__summary");
        if (summaryEl) summaryEl.textContent = buildVariantSummaryText(variant);

        const body = fragment.querySelector(".studio-variant-card__body");
        if (body) body.hidden = !isExpanded;

        const toggleZone = fragment.querySelector(".studio-variant-card__header-info");
        if (toggleZone) {
            toggleZone.setAttribute("role", "button");
            toggleZone.setAttribute("tabindex", "0");
            toggleZone.setAttribute("aria-expanded", isExpanded ? "true" : "false");
            const toggleVariant = () => {
                const expanded = variantCard.dataset.expanded === "true";
                variantCard.dataset.expanded = expanded ? "false" : "true";
                if (body) body.hidden = expanded;
                if (expanded) {
                    state.expandedVariants.delete(variantKey);
                } else {
                    state.expandedVariants.add(variantKey);
                }
                toggleZone.setAttribute("aria-expanded", String(!expanded));
            };
            toggleZone.addEventListener("click", toggleVariant);
            toggleZone.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleVariant();
                }
            });
        }

        bindVariantField(fragment, "name", variant.name, value => updateVariant(stageIndex, variantIndex, "name", value.trim() || `Variante ${variantIndex + 1}`));
        bindVariantField(fragment, "type", variant.type, value => updateVariant(stageIndex, variantIndex, "type", value.trim()));
        bindVariantField(fragment, "departure", variant.departure, value => updateVariant(stageIndex, variantIndex, "departure", value.trim()));
        bindVariantField(fragment, "arrival", variant.arrival, value => updateVariant(stageIndex, variantIndex, "arrival", value.trim()));
        bindVariantField(fragment, "distance", variant.distance, value => updateVariant(stageIndex, variantIndex, "distance", decimalOrNull(value)));
        bindVariantField(fragment, "elevationGain", variant.elevationGain, value => updateVariant(stageIndex, variantIndex, "elevationGain", decimalOrNull(value)));
        bindVariantField(fragment, "elevationLoss", variant.elevationLoss, value => updateVariant(stageIndex, variantIndex, "elevationLoss", decimalOrNull(value)));
        bindVariantField(fragment, "stagePhoto", variant.stagePhoto, value => updateVariant(stageIndex, variantIndex, "stagePhoto", value.trim()));
        bindVariantField(fragment, "accommodationType", variant.accommodationType, value => updateVariant(stageIndex, variantIndex, "accommodationType", value.trim()));
        bindVariantField(fragment, "description", variant.description, value => updateVariant(stageIndex, variantIndex, "description", value.trim()));
        const appendTarget = body || variantCard;
        appendTarget.appendChild(createEditorZone("trace", "Tracé · Carte · Points d'intérêt", [
            createVariantReferencesEditor(stageIndex, variantIndex, variant),
            createVariantPoisEditor(stageIndex, variantIndex, variant.pois || [])
        ]));
        appendTarget.appendChild(createVariantMainAccommodationEditor(stageIndex, variantIndex, variant));
        appendTarget.appendChild(createVariantAlternativeAccommodationsEditor(stageIndex, variantIndex, variant));
        appendTarget.appendChild(createEditorZone("notes", "Notes", [
            createVariantNotesEditor(stageIndex, variantIndex, variant.noteItems || [])
        ]));
        fragment.querySelector('[data-action="delete-variant"]').addEventListener("click", () => deleteVariant(stageIndex, variantIndex));
        return fragment;
    }

    function variantPanelKey(stageIndex, variantIndex) {
        return `${stageIndex}:${variantIndex}`;
    }

    function buildVariantTitle(stageIndex, variant, variantIndex) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        const stageNumber = stage?.stage ?? stageIndex + 1;
        const name = safeText(variant?.name || variant?.title, `Variante ${variantIndex + 1}`);
        return `Variante de l’étape ${stageNumber} — ${name}`;
    }

    function buildVariantSummaryText(variant) {
        const parts = [];
        if (variant.type) parts.push(variant.type);
        if (variant.departure || variant.arrival) {
            parts.push(`${variant.departure || "?"} → ${variant.arrival || "?"}`);
        }
        if (variant.distance != null) {
            parts.push(`${variant.distance} km`);
        }
        return parts.join(" · ");
    }

    function createEditorZone(colorKey, title, children) {
        const zone = document.createElement("div");
        zone.className = `studio-zone studio-zone--${colorKey}`;
        const heading = document.createElement("h4");
        heading.className = "studio-zone__title";
        heading.textContent = title;
        zone.appendChild(heading);
        (Array.isArray(children) ? children : [children]).forEach(child => zone.appendChild(child));
        return zone;
    }

    function createStageReferencesEditor(stageIndex, stage) {
        return createReferencesEditor({
            title: "GPX et carte",
            values: stage,
            skipFields: ["stagePhoto"],
            onChange: (field, value) => updateStage(stageIndex, field, value.trim())
        });
    }

    function createVariantReferencesEditor(stageIndex, variantIndex, variant) {
        return createReferencesEditor({
            title: "GPX et carte",
            values: variant,
            skipFields: ["stagePhoto"],
            onChange: (field, value) => updateVariant(stageIndex, variantIndex, field, value.trim())
        });
    }

    function createReferencesEditor({ title, values, onChange, extraFields = [], skipFields = [] }) {
        const section = document.createElement("section");
        section.className = "studio-stage-extra";
        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const heading = document.createElement("h4");
        heading.textContent = title;
        header.appendChild(heading);
        section.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        [
            ...extraFields,
            { field: "gpx", label: "GPS" },
            { field: "mapEmbedUrl", label: "Carte intégrée" },
            { field: "stagePhoto", label: "Photo de l’étape" }
        ].filter(({ field }) => !skipFields.includes(field))
            .forEach(({ field, label, inputType = "text", parser = null }) => {
            grid.appendChild(createBoundField({
                label,
                value: values?.[field] ?? "",
                inputType,
                fullWidth: field === "stagePhoto",
                onChange: value => onChange(field, value, parser)
            }));
        });
        section.appendChild(grid);
        return section;
    }

    function createLienField(currentWebsite, currentUrl, onLienChange) {
        return createBoundField({
            label: "Lien",
            value: currentWebsite || currentUrl || "",
            fullWidth: true,
            onChange: value => onLienChange(value.trim())
        });
    }

    function createStageMainAccommodationEditor(stageIndex, stage) {
        const zone = document.createElement("div");
        zone.className = "studio-zone studio-zone--accommodation";
        zone.setAttribute("aria-label", "Hébergement principal de l'étape");

        const heading = document.createElement("h4");
        heading.className = "studio-zone__title";
        heading.textContent = "Hébergement principal";
        zone.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        // website and url are merged into a single "Lien" field below via createLienField
        ["name", "photo", "price"].forEach(field => {
            grid.appendChild(createBoundField({
                label: getAccommodationFieldLabel(field),
                value: stage.accommodation?.[field] ?? "",
                onChange: value => updateStageAccommodationField(stageIndex, field, value.trim())
            }));
        });
        grid.appendChild(createLienField(
            stage.accommodation?.website,
            stage.accommodation?.url,
            v => {
                const accommodation = state.selectedRoadbook?.stages?.[stageIndex]?.accommodation;
                if (accommodation) {
                    accommodation.website = v;
                    accommodation.url = v;
                    markModified();
                }
            }
        ));
        zone.appendChild(grid);
        return zone;
    }

    function createStageAlternativeAccommodationsEditor(stageIndex, stage) {
        const zone = document.createElement("div");
        zone.className = "studio-zone studio-zone--alternatives";
        zone.setAttribute("aria-label", "Hébergements alternatifs de l'étape");

        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const heading = document.createElement("h4");
        heading.className = "studio-zone__title";
        heading.textContent = "Hébergements alternatifs";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter un hébergement";
        addButton.addEventListener("click", () => addStageAccommodationAlternative(stageIndex));
        header.append(heading, addButton);
        zone.appendChild(header);

        const alternativesList = document.createElement("div");
        alternativesList.className = "studio-sublist__list";
        (stage.accommodation?.alternatives || []).forEach((alternative, alternativeIndex) => {
            alternativesList.appendChild(createStageAccommodationAlternativeEditor(stageIndex, alternative, alternativeIndex));
        });
        zone.appendChild(alternativesList);
        return zone;
    }

    function createVariantMainAccommodationEditor(stageIndex, variantIndex, variant) {
        const zone = document.createElement("div");
        zone.className = "studio-zone studio-zone--accommodation";
        zone.setAttribute("aria-label", "Hébergement principal de la variante");

        const heading = document.createElement("h4");
        heading.className = "studio-zone__title";
        heading.textContent = "Hébergement principal";
        zone.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        ["name", "photo", "price"].forEach(field => {
            grid.appendChild(createBoundField({
                label: getAccommodationFieldLabel(field),
                value: variant.accommodation?.[field] ?? "",
                onChange: value => updateVariantAccommodationField(stageIndex, variantIndex, field, value.trim())
            }));
        });
        grid.appendChild(createLienField(
            variant.accommodation?.website,
            variant.accommodation?.url,
            value => {
                updateVariantAccommodationField(stageIndex, variantIndex, "website", value);
                updateVariantAccommodationField(stageIndex, variantIndex, "url", value);
            }
        ));
        zone.appendChild(grid);
        return zone;
    }

    function createVariantAlternativeAccommodationsEditor(stageIndex, variantIndex, variant) {
        const zone = document.createElement("div");
        zone.className = "studio-zone studio-zone--alternatives";
        zone.setAttribute("aria-label", "Hébergements alternatifs de la variante");

        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const heading = document.createElement("h4");
        heading.className = "studio-zone__title";
        heading.textContent = "Hébergements alternatifs";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter un hébergement";
        addButton.addEventListener("click", () => addVariantAccommodationAlternative(stageIndex, variantIndex));
        header.append(heading, addButton);
        zone.appendChild(header);

        const alternativesList = document.createElement("div");
        alternativesList.className = "studio-sublist__list";
        (variant.accommodation?.alternatives || []).forEach((alternative, alternativeIndex) => {
            alternativesList.appendChild(createVariantAccommodationAlternativeEditor(stageIndex, variantIndex, alternative, alternativeIndex));
        });
        zone.appendChild(alternativesList);
        return zone;
    }

    function createStagePoisEditor(stageIndex, pois) {
        return createPoiListEditor({
            title: "Points d’intérêt",
            pois,
            onAdd: () => addStagePoi(stageIndex),
            onDelete: poiIndex => deleteStagePoi(stageIndex, poiIndex),
            onUpdate: (poiIndex, field, value) => updateStagePoi(stageIndex, poiIndex, field, value)
        });
    }

    function createVariantPoisEditor(stageIndex, variantIndex, pois) {
        return createPoiListEditor({
            title: "Points d’intérêt de la sous-étape",
            pois,
            onAdd: () => addVariantPoi(stageIndex, variantIndex),
            onDelete: poiIndex => deleteVariantPoi(stageIndex, variantIndex, poiIndex),
            onUpdate: (poiIndex, field, value) => updateVariantPoi(stageIndex, variantIndex, poiIndex, field, value)
        });
    }

    function createRoadbookPoisEditor(pois) {
        const section = document.createElement("section");
        section.className = "studio-global-section";
        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const title = document.createElement("h3");
        title.textContent = `POI globaux (${pois.length})`;
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter un POI";
        addButton.addEventListener("click", addRoadbookPoi);
        header.append(title, addButton);
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "studio-sublist__list";
        pois.forEach((poi, poiIndex) => {
            list.appendChild(createPoiEditor({
                poi,
                poiIndex,
                datasetName: "roadbookPoiIndex",
                includeStage: true,
                onDelete: () => deleteRoadbookPoi(poiIndex),
                onUpdate: (field, value) => updateRoadbookPoi(poiIndex, field, value)
            }));
        });
        section.appendChild(list);
        return section;
    }

    function createPoiListEditor({ title, pois, onAdd, onDelete, onUpdate }) {
        const section = document.createElement("section");
        section.className = "studio-stage-extra";
        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const heading = document.createElement("h4");
        heading.textContent = `${title} (${pois.length})`;
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter un POI";
        addButton.addEventListener("click", onAdd);
        header.append(heading, addButton);
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "studio-sublist__list";
        pois.forEach((poi, poiIndex) => {
            list.appendChild(createPoiEditor({
                poi,
                poiIndex,
                onDelete: () => onDelete(poiIndex),
                onUpdate: (field, value) => onUpdate(poiIndex, field, value)
            }));
        });
        section.appendChild(list);
        return section;
    }

    function createPoiEditor({ poi, poiIndex, onDelete, onUpdate, includeStage = false, datasetName = "poiIndex" }) {
        const card = document.createElement("article");
        card.className = "studio-subitem-card";
        card.dataset[datasetName] = String(poiIndex);
        const header = document.createElement("div");
        header.className = "studio-subitem-card__header";
        const title = document.createElement("strong");
        title.textContent = safeText(poi.name, `POI ${poiIndex + 1}`);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "terrain-button terrain-button--danger";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", onDelete);
        header.append(title, remove);
        card.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        if (includeStage) {
            grid.appendChild(createBoundField({
                label: "Étape",
                value: poi.stage ?? "",
                inputType: "number",
                onChange: value => onUpdate("stage", integerOrNull(value))
            }));
        }
        POI_FIELDS.forEach(field => {
            grid.appendChild(createBoundField({
                label: getPoiFieldLabel(field),
                value: poi[field] ?? "",
                onChange: value => onUpdate(field, value.trim())
            }));
        });
        card.appendChild(grid);
        return card;
    }

    function createStageWarningsEditor(stageIndex, warnings) {
        return createWarningsEditor({
            title: "Avertissements",
            warnings,
            onAdd: () => addStageWarning(stageIndex),
            onDelete: warningIndex => deleteStageWarning(stageIndex, warningIndex),
            onUpdate: (warningIndex, value) => updateStageWarning(stageIndex, warningIndex, value)
        });
    }

    function createVariantWarningsEditor(stageIndex, variantIndex, warnings) {
        return createWarningsEditor({
            title: "Avertissements de la sous-étape",
            warnings,
            onAdd: () => addVariantWarning(stageIndex, variantIndex),
            onDelete: warningIndex => deleteVariantWarning(stageIndex, variantIndex, warningIndex),
            onUpdate: (warningIndex, value) => updateVariantWarning(stageIndex, variantIndex, warningIndex, value)
        });
    }

    function createWarningsEditor({ title, warnings, onAdd, onDelete, onUpdate }) {
        const section = document.createElement("section");
        section.className = "studio-stage-extra";
        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const heading = document.createElement("h4");
        heading.textContent = `${title} (${warnings.length})`;
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter";
        addButton.addEventListener("click", onAdd);
        header.append(heading, addButton);
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "studio-sublist__list";
        warnings.forEach((warning, warningIndex) => {
            const card = document.createElement("article");
            card.className = "studio-subitem-card";
            const cardHeader = document.createElement("div");
            cardHeader.className = "studio-subitem-card__header";
            const label = document.createElement("strong");
            label.textContent = `Avertissement ${warningIndex + 1}`;
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "terrain-button terrain-button--danger";
            remove.textContent = "Supprimer";
            remove.addEventListener("click", () => onDelete(warningIndex));
            cardHeader.append(label, remove);
            card.appendChild(cardHeader);
            card.appendChild(createBoundField({
                label: "Texte",
                value: warning,
                isTextarea: true,
                fullWidth: true,
                onChange: value => onUpdate(warningIndex, value.trim())
            }));
            list.appendChild(card);
        });
        section.appendChild(list);
        return section;
    }

    function createStageAccommodationAlternativeEditor(stageIndex, alternative, alternativeIndex) {
        const card = document.createElement("article");
        card.className = "studio-subitem-card";
        card.dataset.alternativeIndex = String(alternativeIndex);

        const header = document.createElement("div");
        header.className = "studio-subitem-card__header";
        const title = document.createElement("strong");
        title.textContent = safeText(alternative.name, `Hébergement alternatif ${alternativeIndex + 1}`);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "terrain-button terrain-button--danger";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", () => deleteStageAccommodationAlternative(stageIndex, alternativeIndex));
        header.append(title, remove);
        card.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        [
            { field: "name", label: "Nom" },
            { field: "url", label: "URL" },
            { field: "photo", label: "Photo" },
            { field: "price", label: "Prix" }
        ].forEach(({ field, label }) => {
            grid.appendChild(createBoundField({
                label,
                value: alternative[field] ?? "",
                onChange: value => updateStageAccommodationAlternative(stageIndex, alternativeIndex, field, value.trim())
            }));
        });
        card.appendChild(grid);
        return card;
    }

    function createVariantAccommodationAlternativeEditor(stageIndex, variantIndex, alternative, alternativeIndex) {
        const card = document.createElement("article");
        card.className = "studio-subitem-card";
        card.dataset.alternativeIndex = String(alternativeIndex);

        const header = document.createElement("div");
        header.className = "studio-subitem-card__header";
        const title = document.createElement("strong");
        title.textContent = safeText(alternative.name, `Hébergement alternatif ${alternativeIndex + 1}`);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "terrain-button terrain-button--danger";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", () => deleteVariantAccommodationAlternative(stageIndex, variantIndex, alternativeIndex));
        header.append(title, remove);
        card.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        [
            { field: "name", label: "Nom" },
            { field: "url", label: "URL" },
            { field: "photo", label: "Photo" },
            { field: "price", label: "Prix" }
        ].forEach(({ field, label }) => {
            grid.appendChild(createBoundField({
                label,
                value: alternative[field] ?? "",
                onChange: value => updateVariantAccommodationAlternative(stageIndex, variantIndex, alternativeIndex, field, value.trim())
            }));
        });
        card.appendChild(grid);
        return card;
    }

    function createStageNotesEditor(stageIndex, notes) {
        const section = document.createElement("section");
        section.className = "studio-stage-extra";
        section.setAttribute("aria-label", "Notes de l’étape");

        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const title = document.createElement("h4");
        title.textContent = "Notes";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter une note";
        addButton.addEventListener("click", () => addStageNote(stageIndex));
        header.append(title, addButton);
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "studio-sublist__list";
        notes.forEach((note, noteIndex) => {
            list.appendChild(createStageNoteEditor(stageIndex, note, noteIndex));
        });
        section.appendChild(list);
        return section;
    }

    function createVariantNotesEditor(stageIndex, variantIndex, notes) {
        const section = document.createElement("section");
        section.className = "studio-stage-extra";
        section.setAttribute("aria-label", "Notes de la variante");

        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const title = document.createElement("h4");
        title.textContent = "Notes";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter une note";
        addButton.addEventListener("click", () => addVariantNote(stageIndex, variantIndex));
        header.append(title, addButton);
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "studio-sublist__list";
        notes.forEach((note, noteIndex) => {
            list.appendChild(createVariantNoteEditor(stageIndex, variantIndex, note, noteIndex));
        });
        section.appendChild(list);
        return section;
    }

    function createStageNoteEditor(stageIndex, note, noteIndex) {
        const card = document.createElement("article");
        card.className = "studio-subitem-card";
        card.dataset.noteIndex = String(noteIndex);
        const header = document.createElement("div");
        header.className = "studio-subitem-card__header";
        const title = document.createElement("strong");
        title.textContent = safeText(note.text, `Note ${noteIndex + 1}`);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "terrain-button terrain-button--danger";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", () => deleteStageNote(stageIndex, noteIndex));
        header.append(title, remove);
        card.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        grid.appendChild(createBoundField({
            label: "Texte",
            value: note.text ?? "",
            isTextarea: true,
            fullWidth: true,
            onChange: value => updateStageNote(stageIndex, noteIndex, "text", value.trim())
        }));
        ["photo"].forEach(field => {
            grid.appendChild(createBoundField({
                label: getNoteFieldLabel(field),
                value: note[field] ?? "",
                onChange: value => updateStageNote(stageIndex, noteIndex, field, value.trim())
            }));
        });
        card.appendChild(grid);
        return card;
    }

    function createVariantNoteEditor(stageIndex, variantIndex, note, noteIndex) {
        const card = document.createElement("article");
        card.className = "studio-subitem-card";
        card.dataset.noteIndex = String(noteIndex);
        const header = document.createElement("div");
        header.className = "studio-subitem-card__header";
        const title = document.createElement("strong");
        title.textContent = safeText(note.text, `Note ${noteIndex + 1}`);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "terrain-button terrain-button--danger";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", () => deleteVariantNote(stageIndex, variantIndex, noteIndex));
        header.append(title, remove);
        card.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        grid.appendChild(createBoundField({
            label: "Texte",
            value: note.text ?? "",
            isTextarea: true,
            fullWidth: true,
            onChange: value => updateVariantNote(stageIndex, variantIndex, noteIndex, "text", value.trim())
        }));
        ["photo"].forEach(field => {
            grid.appendChild(createBoundField({
                label: getNoteFieldLabel(field),
                value: note[field] ?? "",
                onChange: value => updateVariantNote(stageIndex, variantIndex, noteIndex, field, value.trim())
            }));
        });
        card.appendChild(grid);
        return card;
    }

    function createRoadbookAccommodationEditor(stageIndex, stageNumber) {
        const section = document.createElement("section");
        section.className = "studio-stage-extra";
        section.setAttribute("aria-label", "Hébergements synchronisés");

        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const title = document.createElement("h4");
        title.textContent = "Hébergements (roadbook.accommodation)";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter un hébergement";
        addButton.addEventListener("click", () => addRoadbookAccommodation(stageNumber));
        header.append(title, addButton);
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "studio-sublist__list";
        getRoadbookAccommodationsByStage(stageNumber).forEach(({ item, index }) => {
            list.appendChild(createRoadbookAccommodationItemEditor(stageIndex, stageNumber, item, index));
        });
        section.appendChild(list);
        return section;
    }

    function createRoadbookAccommodationItemEditor(stageIndex, stageNumber, item, accommodationIndex) {
        const card = document.createElement("article");
        card.className = "studio-subitem-card";
        card.dataset.roadbookAccommodationIndex = String(accommodationIndex);
        const header = document.createElement("div");
        header.className = "studio-subitem-card__header";
        const title = document.createElement("strong");
        title.textContent = safeText(item.name, `Hébergement ${accommodationIndex + 1}`);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "terrain-button terrain-button--danger";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", () => deleteRoadbookAccommodation(accommodationIndex));
        header.append(title, remove);
        card.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        grid.appendChild(createBoundField({
            label: "Étape",
            value: stageNumber ?? "",
            inputType: "number",
            onChange: value => updateRoadbookAccommodation(accommodationIndex, "stage", integerOrNull(value))
        }));
        // website and url are merged into a single "Lien" field below via createLienField
        ["role", "name", "photo", "type", "comment", "createdAt", "source"].forEach(field => {
            grid.appendChild(createBoundField({
                label: getAccommodationFieldLabel(field),
                value: item[field] ?? "",
                onChange: value => updateRoadbookAccommodation(accommodationIndex, field, value.trim())
            }));
        });
        grid.appendChild(createLienField(
            item.website,
            item.url,
            v => {
                const accommodation = state.selectedRoadbook?.accommodation?.[accommodationIndex];
                if (accommodation) {
                    accommodation.website = v;
                    accommodation.url = v;
                    markModified();
                }
            }
        ));
        card.appendChild(grid);
        return card;
    }

    function createRoadbookNotesEditor(notes) {
        const section = document.createElement("section");
        section.className = "studio-global-section";
        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const title = document.createElement("h3");
        title.textContent = `Notes (${notes.length})`;
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter une note";
        addButton.addEventListener("click", addRoadbookNote);
        header.append(title, addButton);
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "studio-sublist__list";
        notes.forEach((note, noteIndex) => {
            list.appendChild(createRoadbookNoteEditor(note, noteIndex));
        });
        section.appendChild(list);
        return section;
    }

    function createRoadbookNoteEditor(note, noteIndex) {
        const card = document.createElement("article");
        card.className = "studio-subitem-card";
        card.dataset.roadbookNoteIndex = String(noteIndex);

        const header = document.createElement("div");
        header.className = "studio-subitem-card__header";
        const title = document.createElement("strong");
        title.textContent = safeText(note.text, `Note ${noteIndex + 1}`);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "terrain-button terrain-button--danger";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", () => deleteRoadbookNote(noteIndex));
        header.append(title, remove);
        card.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        grid.appendChild(createBoundField({
            label: "Étape",
            value: note.stage ?? "",
            inputType: "number",
            onChange: value => updateRoadbookNote(noteIndex, "stage", integerOrNull(value))
        }));
        grid.appendChild(createBoundField({
            label: "Texte",
            value: note.text ?? "",
            isTextarea: true,
            fullWidth: true,
            onChange: value => updateRoadbookNote(noteIndex, "text", value.trim())
        }));
        ROADBOOK_NOTE_FIELDS.filter(field => !["stage", "text"].includes(field)).forEach(field => {
            grid.appendChild(createBoundField({
                label: getNoteFieldLabel(field),
                value: note[field] ?? "",
                onChange: value => updateRoadbookNote(noteIndex, field, value.trim())
            }));
        });
        card.appendChild(grid);
        return card;
    }

    function createContributionsEditor(contributions) {
        const section = document.createElement("section");
        section.className = "studio-global-section";
        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const title = document.createElement("h3");
        title.textContent = `Contributions (${contributions.length})`;
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter une contribution";
        addButton.addEventListener("click", addContribution);
        header.append(title, addButton);
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "studio-sublist__list";
        contributions.forEach((contribution, contributionIndex) => {
            list.appendChild(createContributionEditor(contribution, contributionIndex));
        });
        section.appendChild(list);
        return section;
    }

    function createContributionEditor(contribution, contributionIndex) {
        const card = document.createElement("article");
        card.className = "studio-subitem-card";
        card.dataset.contributionIndex = String(contributionIndex);
        const header = document.createElement("div");
        header.className = "studio-subitem-card__header";
        const title = document.createElement("strong");
        title.textContent = safeText(contribution.id, `Contribution ${contributionIndex + 1}`);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "terrain-button terrain-button--danger";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", () => deleteContribution(contributionIndex));
        header.append(title, remove);
        card.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        CONTRIBUTION_FIELDS.forEach(field => {
            const isStageField = field === "stage";
            const isIdField = field === "id";
            grid.appendChild(createBoundField({
                label: getContributionFieldLabel(field),
                value: contribution[field] ?? "",
                inputType: isStageField ? "number" : "text",
                onChange: value => updateContributionField(
                    contributionIndex,
                    field,
                    isStageField ? integerOrNull(value) : value.trim()
                )
            }));
            if (isIdField) {
                grid.lastChild.classList.add("studio-form-grid__full");
            }
        });
        grid.appendChild(createBoundField({
            label: "Payload JSON",
            value: JSON.stringify(contribution.payload || {}, null, 2),
            isTextarea: true,
            fullWidth: true,
            onChange: value => updateContributionPayloadJson(contributionIndex, value)
        }));
        card.appendChild(grid);
        return card;
    }

    function createBoundField(options) {
        const {
            label,
            value,
            inputType = "text",
            isTextarea = false,
            fullWidth = false,
            onChange
        } = options;
        const wrapper = document.createElement("label");
        if (fullWidth) wrapper.className = "studio-form-grid__full";
        wrapper.appendChild(document.createTextNode(label));

        const input = isTextarea ? document.createElement("textarea") : document.createElement("input");
        if (isTextarea) {
            input.rows = 3;
        } else {
            input.type = inputType;
        }
        input.value = value ?? "";
        input.addEventListener("input", event => onChange(event.target.value));
        wrapper.appendChild(input);
        return wrapper;
    }

    function getRoadbookAccommodationsByStage(stageNumber) {
        const accommodations = state.selectedRoadbook?.accommodation;
        if (!Array.isArray(accommodations)) return [];
        return accommodations
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => integerOrNull(item.stage) === integerOrNull(stageNumber));
    }

    function getAccommodationFieldLabel(field) {
        const labels = {
            role: "Rôle",
            name: "Nom",
            website: "Site web",
            url: "URL",
            photo: "Photo",
            price: "Prix",
            type: "Type",
            comment: "Commentaire",
            createdAt: "Créé le",
            source: "Source"
        };
        return labels[field] || field;
    }

    function getNoteFieldLabel(field) {
        const labels = {
            text: "Texte",
            photo: "Photo",
            createdAt: "Créé le",
            source: "Source",
            author: "Auteur",
            timestamp: "Horodatage"
        };
        return labels[field] || field;
    }

    function getPoiFieldLabel(field) {
        const labels = {
            name: "Nom",
            region: "Région",
            url: "Lien",
            image: "Image"
        };
        return labels[field] || field;
    }

    function getContributionFieldLabel(field) {
        const labels = {
            id: "ID",
            type: "Type",
            stage: "Étape",
            createdAt: "Créé le",
            status: "Statut",
            source: "Source",
            author: "Auteur",
            timestamp: "Horodatage"
        };
        return labels[field] || field;
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
        if (field === "stage") {
            stage.title = safeText(stage.title, `Étape ${stage.stage ?? stageIndex + 1}`);
        }
        if (field === "title" && Number.isInteger(stageIndex)) {
            const heading = elements.detail.querySelector(`.studio-stage-card[data-stage-index="${stageIndex}"] .studio-stage-card__title`);
            if (heading) heading.textContent = safeText(value, `Étape ${stage.stage ?? stageIndex + 1}`);
        }
        if (["departure", "arrival", "distance"].includes(field)) {
            const summaryEl = elements.detail.querySelector(`.studio-stage-card[data-stage-index="${stageIndex}"] .studio-stage-card__summary`);
            if (summaryEl) summaryEl.textContent = buildStageSummaryText(stage);
        }
        markModified();
    }

    function updateRoadbookField(field, value) {
        const roadbook = state.selectedRoadbook;
        if (!roadbook) return;
        roadbook[field] = value;
        if (field === "title") {
            elements.detailTitle.textContent = safeText(roadbook.title, state.selectedRoadbookId);
        }
        markModified();
    }

    function updateMetadataField(key, value) {
        const roadbook = state.selectedRoadbook;
        if (!roadbook) return;
        if (!roadbook.metadata || typeof roadbook.metadata !== "object") {
            roadbook.metadata = {};
        }
        roadbook.metadata[key] = value;
        markModified();
    }

    function updateSummaryReference(sectionKey, field, value) {
        const roadbook = state.selectedRoadbook;
        if (!roadbook) return;
        if (!roadbook.summary || typeof roadbook.summary !== "object" || Array.isArray(roadbook.summary)) {
            roadbook.summary = {};
        }
        if (!roadbook.summary[sectionKey] || typeof roadbook.summary[sectionKey] !== "object" || Array.isArray(roadbook.summary[sectionKey])) {
            roadbook.summary[sectionKey] = {};
        }
        roadbook.summary[sectionKey][field] = value;
        markModified();
    }

    function updateVariant(stageIndex, variantIndex, field, value) {
        const variant = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex];
        if (!variant) return;
        variant[field] = value;
        if (field === "name" && Number.isInteger(stageIndex) && Number.isInteger(variantIndex)) {
            const variantHeading = elements.detail.querySelector(`.studio-variant-card[data-parent-stage-index="${stageIndex}"][data-variant-index="${variantIndex}"] .studio-variant-card__title`);
            if (variantHeading) variantHeading.textContent = buildVariantTitle(stageIndex, variant, variantIndex);
        }
        if (["type", "departure", "arrival", "distance"].includes(field)) {
            const summaryEl = elements.detail.querySelector(`.studio-variant-card[data-parent-stage-index="${stageIndex}"][data-variant-index="${variantIndex}"] .studio-stage-card__summary`);
            if (summaryEl) summaryEl.textContent = buildVariantSummaryText(variant);
        }
        markModified();
    }

    function updateStageAccommodationField(stageIndex, field, value) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        if (!stage) return;
        stage.accommodation = normalizeStageAccommodation(stage.accommodation);
        stage.accommodation[field] = value;
        markModified();
    }

    function addStageAccommodationAlternative(stageIndex) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        if (!stage) return;
        stage.accommodation = normalizeStageAccommodation(stage.accommodation);
        stage.accommodation.alternatives.push({
            url: "",
            name: "",
            photo: "",
            price: ""
        });
        rerenderEditorPreservingScroll();
    }

    function updateStageAccommodationAlternative(stageIndex, alternativeIndex, field, value) {
        const alternative = state.selectedRoadbook?.stages?.[stageIndex]?.accommodation?.alternatives?.[alternativeIndex];
        if (!alternative) return;
        alternative[field] = value;
        if (field === "name") {
            const card = elements.detail.querySelector(`.studio-stage-card[data-stage-index="${stageIndex}"] .studio-subitem-card[data-alternative-index="${alternativeIndex}"] strong`);
            if (card) card.textContent = safeText(value, `Hébergement alternatif ${alternativeIndex + 1}`);
        }
        markModified();
    }

    function deleteStageAccommodationAlternative(stageIndex, alternativeIndex) {
        const alternatives = state.selectedRoadbook?.stages?.[stageIndex]?.accommodation?.alternatives;
        if (!Array.isArray(alternatives)) return;
        alternatives.splice(alternativeIndex, 1);
        rerenderEditorPreservingScroll();
    }

    function updateVariantAccommodationField(stageIndex, variantIndex, field, value) {
        const variant = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex];
        if (!variant) return;
        variant.accommodation = normalizeStageAccommodation(variant.accommodation);
        variant.accommodation[field] = value;
        markModified();
    }

    function addVariantAccommodationAlternative(stageIndex, variantIndex) {
        const variant = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex];
        if (!variant) return;
        variant.accommodation = normalizeStageAccommodation(variant.accommodation);
        variant.accommodation.alternatives.push({
            url: "",
            name: "",
            photo: "",
            price: ""
        });
        rerenderEditorPreservingScroll();
    }

    function updateVariantAccommodationAlternative(stageIndex, variantIndex, alternativeIndex, field, value) {
        const alternative = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex]?.accommodation?.alternatives?.[alternativeIndex];
        if (!alternative) return;
        alternative[field] = value;
        if (field === "name") {
            const heading = elements.detail.querySelector(`.studio-variant-card[data-parent-stage-index="${stageIndex}"][data-variant-index="${variantIndex}"] .studio-subitem-card[data-alternative-index="${alternativeIndex}"] strong`);
            if (heading) heading.textContent = safeText(value, `Hébergement alternatif ${alternativeIndex + 1}`);
        }
        markModified();
    }

    function deleteVariantAccommodationAlternative(stageIndex, variantIndex, alternativeIndex) {
        const alternatives = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex]?.accommodation?.alternatives;
        if (!Array.isArray(alternatives)) return;
        alternatives.splice(alternativeIndex, 1);
        rerenderEditorPreservingScroll();
    }

    function addStagePoi(stageIndex) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        if (!stage) return;
        if (!Array.isArray(stage.pois)) stage.pois = [];
        stage.pois.push(normalizePoi({}));
        syncStagePoiAliases(stage);
        rerenderEditorPreservingScroll();
    }

    function updateStagePoi(stageIndex, poiIndex, field, value) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        const poi = stage?.pois?.[poiIndex];
        if (!poi) return;
        poi[field] = value;
        syncStagePoiAliases(stage);
        if (field === "name") {
            const heading = elements.detail.querySelector(`.studio-stage-card[data-stage-index="${stageIndex}"] .studio-subitem-card[data-poi-index="${poiIndex}"] strong`);
            if (heading) heading.textContent = safeText(value, `POI ${poiIndex + 1}`);
        }
        markModified();
    }

    function deleteStagePoi(stageIndex, poiIndex) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        if (!Array.isArray(stage?.pois)) return;
        stage.pois.splice(poiIndex, 1);
        syncStagePoiAliases(stage);
        rerenderEditorPreservingScroll();
    }

    function syncStagePoiAliases(stage) {
        if (!stage) return;
        stage.pois = normalizePois(stage.pois);
        stage.pointsOfInterest = stage.pois;
        stage.interest = stage.pois;
    }

    function addStageWarning(stageIndex) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        if (!stage) return;
        if (!Array.isArray(stage.warning)) stage.warning = [];
        stage.warning.push("");
        rerenderEditorPreservingScroll();
    }

    function updateStageWarning(stageIndex, warningIndex, value) {
        const warnings = state.selectedRoadbook?.stages?.[stageIndex]?.warning;
        if (!Array.isArray(warnings)) return;
        warnings[warningIndex] = value;
        markModified();
    }

    function deleteStageWarning(stageIndex, warningIndex) {
        const warnings = state.selectedRoadbook?.stages?.[stageIndex]?.warning;
        if (!Array.isArray(warnings)) return;
        warnings.splice(warningIndex, 1);
        rerenderEditorPreservingScroll();
    }

    function addStageNote(stageIndex) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        if (!stage) return;
        if (!Array.isArray(stage.noteItems)) stage.noteItems = [];
        stage.noteItems.push({
            text: "",
            photo: "",
            createdAt: "",
            source: ""
        });
        rerenderEditorPreservingScroll();
    }

    function updateStageNote(stageIndex, noteIndex, field, value) {
        const note = state.selectedRoadbook?.stages?.[stageIndex]?.noteItems?.[noteIndex];
        if (!note) return;
        note[field] = value;
        if (field === "text") {
            const heading = elements.detail.querySelector(`.studio-stage-card[data-stage-index="${stageIndex}"] .studio-subitem-card[data-note-index="${noteIndex}"] strong`);
            if (heading) heading.textContent = safeText(value, `Note ${noteIndex + 1}`);
        }
        markModified();
    }

    function deleteStageNote(stageIndex, noteIndex) {
        const notes = state.selectedRoadbook?.stages?.[stageIndex]?.noteItems;
        if (!Array.isArray(notes)) return;
        notes.splice(noteIndex, 1);
        rerenderEditorPreservingScroll();
    }

    function addVariantNote(stageIndex, variantIndex) {
        const variant = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex];
        if (!variant) return;
        if (!Array.isArray(variant.noteItems)) variant.noteItems = [];
        variant.noteItems.push({
            text: "",
            photo: "",
            createdAt: "",
            source: ""
        });
        rerenderEditorPreservingScroll();
    }

    function updateVariantNote(stageIndex, variantIndex, noteIndex, field, value) {
        const note = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex]?.noteItems?.[noteIndex];
        if (!note) return;
        note[field] = value;
        if (field === "text") {
            const heading = elements.detail.querySelector(`.studio-variant-card[data-parent-stage-index="${stageIndex}"][data-variant-index="${variantIndex}"] .studio-subitem-card[data-note-index="${noteIndex}"] strong`);
            if (heading) heading.textContent = safeText(value, `Note ${noteIndex + 1}`);
        }
        markModified();
    }

    function deleteVariantNote(stageIndex, variantIndex, noteIndex) {
        const notes = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex]?.noteItems;
        if (!Array.isArray(notes)) return;
        notes.splice(noteIndex, 1);
        rerenderEditorPreservingScroll();
    }

    function addRoadbookAccommodation(stageNumber) {
        const roadbook = state.selectedRoadbook;
        if (!roadbook) return;
        if (!Array.isArray(roadbook.accommodation)) roadbook.accommodation = [];
        roadbook.accommodation.push({
            stage: integerOrNull(stageNumber),
            role: "alternative",
            name: "",
            website: "",
            url: "",
            photo: "",
            type: "",
            comment: "",
            createdAt: "",
            source: "local"
        });
        rerenderEditorPreservingScroll();
    }

    function updateRoadbookAccommodation(index, field, value) {
        const item = state.selectedRoadbook?.accommodation?.[index];
        if (!item) return;
        item[field] = field === "stage" ? integerOrNull(value) : value;
        markModified();
    }

    function deleteRoadbookAccommodation(index) {
        const items = state.selectedRoadbook?.accommodation;
        if (!Array.isArray(items)) return;
        items.splice(index, 1);
        rerenderEditorPreservingScroll();
    }

    function addRoadbookNote() {
        const notes = state.selectedRoadbook?.notes;
        if (!Array.isArray(notes)) return;
        notes.push({
            stage: null,
            text: "",
            photo: "",
            createdAt: "",
            source: "",
            author: "",
            timestamp: ""
        });
        rerenderEditorPreservingScroll();
    }

    function updateRoadbookNote(noteIndex, field, value) {
        const note = state.selectedRoadbook?.notes?.[noteIndex];
        if (!note) return;
        note[field] = field === "stage" ? integerOrNull(value) : value;
        if (field === "text") {
            const heading = elements.detail.querySelector(`.studio-subitem-card[data-roadbook-note-index="${noteIndex}"] strong`);
            if (heading) heading.textContent = safeText(value, `Note ${noteIndex + 1}`);
        }
        markModified();
    }

    function deleteRoadbookNote(noteIndex) {
        const notes = state.selectedRoadbook?.notes;
        if (!Array.isArray(notes)) return;
        notes.splice(noteIndex, 1);
        rerenderEditorPreservingScroll();
    }

    function addRoadbookPoi() {
        const pois = state.selectedRoadbook?.pois;
        if (!Array.isArray(pois)) return;
        pois.push({
            stage: null,
            ...normalizePoi({})
        });
        rerenderEditorPreservingScroll();
    }

    function updateRoadbookPoi(poiIndex, field, value) {
        const poi = state.selectedRoadbook?.pois?.[poiIndex];
        if (!poi) return;
        poi[field] = field === "stage" ? integerOrNull(value) : value;
        if (field === "name") {
            const heading = elements.detail.querySelector(`.studio-subitem-card[data-roadbook-poi-index="${poiIndex}"] strong`);
            if (heading) heading.textContent = safeText(value, `POI ${poiIndex + 1}`);
        }
        markModified();
    }

    function deleteRoadbookPoi(poiIndex) {
        const pois = state.selectedRoadbook?.pois;
        if (!Array.isArray(pois)) return;
        pois.splice(poiIndex, 1);
        rerenderEditorPreservingScroll();
    }

    function addContribution() {
        const contributions = state.selectedRoadbook?.contributions;
        if (!Array.isArray(contributions)) return;
        const usedIds = new Set(contributions.map(item => safeText(item?.id, "")).filter(Boolean));
        const id = reserveUniqueContributionId(usedIds, "", `contribution-${Date.now()}`);
        contributions.push({
            id,
            type: "travelerNote",
            stage: null,
            createdAt: "",
            status: "draft",
            source: "",
            author: "",
            timestamp: "",
            payload: {
                text: "",
                name: "",
                url: "",
                photo: "",
                comment: ""
            }
        });
        rerenderEditorPreservingScroll();
    }

    function updateContributionField(contributionIndex, field, value) {
        const contribution = state.selectedRoadbook?.contributions?.[contributionIndex];
        if (!contribution) return;
        contribution[field] = field === "stage" ? integerOrNull(value) : value;
        if (field === "id") {
            const heading = elements.detail.querySelector(`.studio-subitem-card[data-contribution-index="${contributionIndex}"] strong`);
            if (heading) heading.textContent = safeText(value, `Contribution ${contributionIndex + 1}`);
        }
        markModified();
    }

    function updateContributionPayloadJson(contributionIndex, value) {
        const contribution = state.selectedRoadbook?.contributions?.[contributionIndex];
        if (!contribution) return;
        try {
            const parsed = JSON.parse(value || "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                contribution.payload = parsed;
                markModified();
            }
        } catch (error) {
            // Keep local text while invalid JSON is being edited.
        }
    }

    function deleteContribution(contributionIndex) {
        const contributions = state.selectedRoadbook?.contributions;
        if (!Array.isArray(contributions)) return;
        contributions.splice(contributionIndex, 1);
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
            gpx: "",
            mapEmbedUrl: "",
            stagePhoto: "",
            pois: [],
            pointsOfInterest: [],
            interest: [],
            warning: [],
            accommodation: normalizeStageAccommodation({}),
            accommodationType: "",
            noteItems: [],
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
        const newExpanded = new Set();
        state.expandedStages.forEach(idx => {
            if (idx < stageIndex) newExpanded.add(idx);
            else if (idx > stageIndex) newExpanded.add(idx - 1);
        });
        state.expandedStages = newExpanded;
        const newExpandedVariants = new Set();
        state.expandedVariants.forEach(key => {
            const [rawStageIndex, rawVariantIndex] = String(key).split(":");
            const currentStageIndex = integerOrNull(rawStageIndex);
            const currentVariantIndex = integerOrNull(rawVariantIndex);
            if (currentStageIndex == null || currentVariantIndex == null) return;
            if (currentStageIndex < stageIndex) newExpandedVariants.add(variantPanelKey(currentStageIndex, currentVariantIndex));
            else if (currentStageIndex > stageIndex) newExpandedVariants.add(variantPanelKey(currentStageIndex - 1, currentVariantIndex));
        });
        state.expandedVariants = newExpandedVariants;
        rerenderEditorPreservingScroll();
    }

    function addVariant(stageIndex) {
        const stage = state.selectedRoadbook?.stages?.[stageIndex];
        if (!stage) return;
        const variantIndex = stage.variants.length;
        stage.variants.push(normalizeVariant({
            name: `Variante ${stage.variants.length + 1}`,
            distance: null,
            description: ""
        }, variantIndex));
        state.expandedVariants.add(variantPanelKey(stageIndex, variantIndex));
        rerenderEditorPreservingScroll();
    }

    function deleteVariant(stageIndex, variantIndex) {
        const variants = state.selectedRoadbook?.stages?.[stageIndex]?.variants;
        if (!Array.isArray(variants)) return;
        variants.splice(variantIndex, 1);
        const newExpandedVariants = new Set();
        state.expandedVariants.forEach(key => {
            const [rawStageIndex, rawVariantIndex] = String(key).split(":");
            const currentStageIndex = integerOrNull(rawStageIndex);
            const currentVariantIndex = integerOrNull(rawVariantIndex);
            if (currentStageIndex == null || currentVariantIndex == null) return;
            if (currentStageIndex !== stageIndex) {
                newExpandedVariants.add(variantPanelKey(currentStageIndex, currentVariantIndex));
            } else if (currentVariantIndex < variantIndex) {
                newExpandedVariants.add(variantPanelKey(currentStageIndex, currentVariantIndex));
            } else if (currentVariantIndex > variantIndex) {
                newExpandedVariants.add(variantPanelKey(currentStageIndex, currentVariantIndex - 1));
            }
        });
        state.expandedVariants = newExpandedVariants;
        rerenderEditorPreservingScroll();
    }

    function addVariantPoi(stageIndex, variantIndex) {
        const variant = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex];
        if (!variant) return;
        if (!Array.isArray(variant.pois)) variant.pois = [];
        variant.pois.push(normalizePoi({}));
        syncStagePoiAliases(variant);
        rerenderEditorPreservingScroll();
    }

    function updateVariantPoi(stageIndex, variantIndex, poiIndex, field, value) {
        const variant = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex];
        const poi = variant?.pois?.[poiIndex];
        if (!poi) return;
        poi[field] = value;
        syncStagePoiAliases(variant);
        if (field === "name") {
            const heading = elements.detail.querySelector(`.studio-variant-card[data-parent-stage-index="${stageIndex}"][data-variant-index="${variantIndex}"] .studio-subitem-card[data-poi-index="${poiIndex}"] strong`);
            if (heading) heading.textContent = safeText(value, `POI ${poiIndex + 1}`);
        }
        markModified();
    }

    function deleteVariantPoi(stageIndex, variantIndex, poiIndex) {
        const variant = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex];
        if (!Array.isArray(variant?.pois)) return;
        variant.pois.splice(poiIndex, 1);
        syncStagePoiAliases(variant);
        rerenderEditorPreservingScroll();
    }

    function addVariantWarning(stageIndex, variantIndex) {
        const variant = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex];
        if (!variant) return;
        if (!Array.isArray(variant.warning)) variant.warning = [];
        variant.warning.push("");
        rerenderEditorPreservingScroll();
    }

    function updateVariantWarning(stageIndex, variantIndex, warningIndex, value) {
        const warnings = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex]?.warning;
        if (!Array.isArray(warnings)) return;
        warnings[warningIndex] = value;
        markModified();
    }

    function deleteVariantWarning(stageIndex, variantIndex, warningIndex) {
        const warnings = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex]?.warning;
        if (!Array.isArray(warnings)) return;
        warnings.splice(warningIndex, 1);
        rerenderEditorPreservingScroll();
    }

    function rerenderEditorPreservingScroll() {
        const scrollTop = window.scrollY;
        renderRoadbookEditor();
        window.scrollTo({ top: scrollTop });
        markModified();
    }

    function markModified() {
        setStatus("Modifications locales non publiées · JSON prêt à exporter.");
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
            pois: normalizePois(stage.pois),
            pointsOfInterest: normalizePois(stage.pois),
            interest: normalizePois(stage.pois),
            warning: normalizeStringList(stage.warning),
            accommodation: normalizeStageAccommodation(stage.accommodation),
            noteItems: normalizeStageNoteItems(stage.noteItems),
            substeps: normalizeVariants(stage.variants),
            variants: normalizeVariants(stage.variants)
        }));
        clone.accommodation = normalizeRoadbookAccommodations(clone.accommodation);
        clone.pois = normalizeRoadbookPois(clone.pois);
        clone.notes = normalizeRoadbookNotes(clone.notes);
        clone.contributions = normalizeContributions(clone.contributions);
        clone.variants = clone.stages.flatMap(stage =>
            normalizeVariants(stage.variants).map(variant => ({
                ...variant,
                parentStage: stage.stage,
                parentStageReference: stage.stage
            }))
        );
        hydrateStageAccommodationFromRoadbookCollection(clone);
        hydrateStageNotesFromRoadbookNotes(clone);
        clone.summary = {
            ...(clone.summary || {}),
            ...computeSummary(clone.stages)
        };
        return clone;
    }

    function hydrateStageAccommodationFromRoadbookCollection(roadbook) {
        if (!Array.isArray(roadbook.stages) || !Array.isArray(roadbook.accommodation)) return;
        roadbook.stages.forEach(stage => {
            const stageNumber = integerOrNull(stage.stage);
            const linked = roadbook.accommodation.filter(item => integerOrNull(item.stage) === stageNumber);
            if (!linked.length) return;

            const primary = linked.find(item => safeText(item.role, "").toLowerCase() === "primary") || linked[0];
            const primaryWebsite = safeText(primary.website, "");
            const primaryUrl = safeText(primary.url, "");
            stage.accommodation = normalizeStageAccommodation({
                ...(stage.accommodation || {}),
                name: safeText(primary.name, ""),
                website: primaryWebsite || primaryUrl,
                url: primaryUrl,
                photo: safeText(primary.photo, ""),
                alternatives: linked
                    .filter(item => item !== primary)
                    .map(item => ({
                        name: safeText(item.name, ""),
                        url: safeText(item.url || item.website, ""),
                        photo: safeText(item.photo, "")
                    }))
            });
        });
    }

    function hydrateStageNotesFromRoadbookNotes(roadbook) {
        if (!Array.isArray(roadbook.stages) || !Array.isArray(roadbook.notes)) return;
        roadbook.stages.forEach(stage => {
            const stageNumber = integerOrNull(stage.stage);
            const linkedNotes = roadbook.notes
                .filter(note => integerOrNull(note.stage) === stageNumber)
                .map(note => ({
                    text: safeText(note.text, ""),
                    photo: safeText(note.photo, ""),
                    createdAt: safeText(note.createdAt, ""),
                    source: safeText(note.source, "")
                }));
            if (!linkedNotes.length) return;
            stage.noteItems = linkedNotes;
        });
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
