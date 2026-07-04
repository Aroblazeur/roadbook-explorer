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
    const STAGE_ACCOMMODATION_FIELDS = ["name", "website", "url", "photo"];
    const STAGE_NOTE_FIELDS = ["text", "photo", "createdAt", "source"];
    const ROADBOOK_ACCOMMODATION_FIELDS = ["role", "name", "website", "url", "photo", "type", "comment", "createdAt", "source"];
    const ROADBOOK_NOTE_FIELDS = ["stage", "text", "photo", "createdAt", "source", "author", "timestamp"];
    const CONTRIBUTION_FIELDS = ["id", "type", "stage", "createdAt", "status", "source", "author", "timestamp"];
    const CONTRIBUTION_PAYLOAD_FIELDS = ["text", "name", "url", "photo", "comment"];

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
        clone.accommodation = normalizeRoadbookAccommodations(clone.accommodation);
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
        return variants.map((variant, index) => ({
            name: safeText(variant?.name || variant?.title, `Variante ${index + 1}`),
            distance: toFiniteNumber(variant?.distance),
            description: safeText(variant?.description, "")
        }));
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
            photo: safeText(alternative?.photo, "")
        }));
    }

    function normalizeRoadbookAccommodations(accommodations) {
        if (!Array.isArray(accommodations)) return [];
        return accommodations.map(accommodation => normalizeRoadbookAccommodationEntry(accommodation));
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

        card.appendChild(createStageAccommodationEditor(stageIndex, stage));
        card.appendChild(createStageNotesEditor(stageIndex, stage.noteItems || []));
        card.appendChild(createRoadbookAccommodationEditor(stageIndex, stage.stage));

        card.dataset.stageIndex = String(stageIndex);
        card.dataset.stageNumber = String(stage.stage ?? "");
        return fragment;
    }

    function createVariantEditor(stageIndex, variant, variantIndex) {
        const fragment = elements.variantTemplate.content.cloneNode(true);
        const variantCard = fragment.querySelector(".studio-variant-card");
        variantCard.dataset.variantIndex = String(variantIndex);
        fragment.querySelector(".studio-variant-card__title").textContent = variant.name;
        bindVariantField(fragment, "name", variant.name, value => updateVariant(stageIndex, variantIndex, "name", value.trim() || `Variante ${variantIndex + 1}`));
        bindVariantField(fragment, "distance", variant.distance, value => updateVariant(stageIndex, variantIndex, "distance", decimalOrNull(value)));
        bindVariantField(fragment, "description", variant.description, value => updateVariant(stageIndex, variantIndex, "description", value.trim()));
        fragment.querySelector('[data-action="delete-variant"]').addEventListener("click", () => deleteVariant(stageIndex, variantIndex));
        return fragment;
    }

    function createStageAccommodationEditor(stageIndex, stage) {
        const section = document.createElement("section");
        section.className = "studio-stage-extra";
        section.setAttribute("aria-label", "Hébergement principal de l’étape");

        const header = document.createElement("div");
        header.className = "studio-stage-extra__header";
        const title = document.createElement("h4");
        title.textContent = "Hébergement";
        header.appendChild(title);
        section.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "studio-form-grid studio-form-grid--compact";
        STAGE_ACCOMMODATION_FIELDS.forEach(field => {
            grid.appendChild(createBoundField({
                label: getAccommodationFieldLabel(field),
                value: stage.accommodation?.[field] ?? "",
                onChange: value => updateStageAccommodationField(stageIndex, field, value.trim())
            }));
        });
        grid.appendChild(createBoundField({
            label: "Type hébergement",
            value: stage.accommodationType ?? "",
            onChange: value => updateStage(stageIndex, "accommodationType", value.trim())
        }));
        section.appendChild(grid);

        const alternativesSection = document.createElement("div");
        alternativesSection.className = "studio-sublist";
        const alternativesHeader = document.createElement("div");
        alternativesHeader.className = "studio-stage-extra__header";
        const alternativesTitle = document.createElement("h5");
        alternativesTitle.textContent = "Hébergements alternatifs";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "terrain-button terrain-button--secondary";
        addButton.textContent = "Ajouter un hébergement";
        addButton.addEventListener("click", () => addStageAccommodationAlternative(stageIndex));
        alternativesHeader.append(alternativesTitle, addButton);
        alternativesSection.appendChild(alternativesHeader);

        const alternativesList = document.createElement("div");
        alternativesList.className = "studio-sublist__list";
        (stage.accommodation?.alternatives || []).forEach((alternative, alternativeIndex) => {
            alternativesList.appendChild(createStageAccommodationAlternativeEditor(stageIndex, alternative, alternativeIndex));
        });
        alternativesSection.appendChild(alternativesList);
        section.appendChild(alternativesSection);
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
            { field: "photo", label: "Photo" }
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
        ["photo", "createdAt", "source"].forEach(field => {
            grid.appendChild(createBoundField({
                label: getNoteFieldLabel(field),
                value: note[field] ?? "",
                onChange: value => updateStageNote(stageIndex, noteIndex, field, value.trim())
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
        ROADBOOK_ACCOMMODATION_FIELDS.forEach(field => {
            grid.appendChild(createBoundField({
                label: getAccommodationFieldLabel(field),
                value: item[field] ?? "",
                onChange: value => updateRoadbookAccommodation(accommodationIndex, field, value.trim())
            }));
        });
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

    function updateVariant(stageIndex, variantIndex, field, value) {
        const variant = state.selectedRoadbook?.stages?.[stageIndex]?.variants?.[variantIndex];
        if (!variant) return;
        variant[field] = value;
        if (field === "name" && Number.isInteger(stageIndex) && Number.isInteger(variantIndex)) {
            const stageCard = elements.detail.querySelector(`.studio-stage-card[data-stage-index="${stageIndex}"]`);
            const variantHeading = stageCard?.querySelector(`.studio-variant-card[data-variant-index="${variantIndex}"] .studio-variant-card__title`);
            if (variantHeading) variantHeading.textContent = safeText(value, `Variante ${variantIndex + 1}`);
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
            photo: ""
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
            accommodation: normalizeStageAccommodation(stage.accommodation),
            noteItems: normalizeStageNoteItems(stage.noteItems),
            substeps: normalizeVariants(stage.variants),
            variants: normalizeVariants(stage.variants)
        }));
        clone.accommodation = normalizeRoadbookAccommodations(clone.accommodation);
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
