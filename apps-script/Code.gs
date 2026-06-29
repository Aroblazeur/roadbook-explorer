"use strict";

/**
 * RoadBook Explorer — Contribution API
 *
 * Web App Google Apps Script générique.
 * Le moteur RoadBook Explorer envoie uniquement :
 * - roadbookId
 * - googleSheetId
 * - contributionType
 * - stage
 * - payload
 *
 * Le script ouvre le Google Sheet cible, choisit la feuille correspondant au
 * type de contribution, écrit la ligne, puis retourne une réponse JSON.
 */

const APP_NAME = "RoadBook Explorer Contribution API";
const APP_VERSION = "1.0.0";

const SECURITY = Object.freeze({
  apiKeyEnabled: false,
  expectedApiKey: "",
  roadbookWhitelistEnabled: false,
  allowedRoadbookIds: [],
  antiSpamEnabled: false
});

const CONTRIBUTION_TYPES = Object.freeze({
  travelerNote: Object.freeze({
    sheetName: "Notes voyageurs",
    requiredPayloadFields: ["note"],
    fieldAliases: Object.freeze({
      stage: ["Étape", "Etape", "Stage", "Numero etape", "Numéro étape"],
      note: ["Note", "Commentaire", "Texte"],
      photo: ["Photo", "Image", "URL photo", "Lien photo"],
      roadbookId: ["Roadbook ID", "roadbookId", "Roadbook"],
      createdAt: ["Horodatage", "Timestamp", "Created At", "Date"],
      contributionType: ["Type", "Contribution Type"]
    }),
    buildValues: function(request) {
      return {
        stage: request.stage,
        note: safeString(request.payload.note),
        photo: safeString(request.payload.photo),
        roadbookId: request.roadbookId,
        createdAt: new Date(),
        contributionType: request.contributionType
      };
    }
  }),

  addedAccommodation: Object.freeze({
    sheetName: "ajout hebergement",
    requiredPayloadFields: ["url"],
    fieldAliases: Object.freeze({
      stage: ["Étape", "Etape", "Stage", "Numero etape", "Numéro étape"],
      url: ["URL hébergement", "URL hebergement", "URL", "Lien", "Lien hébergement", "Lien hebergement"],
      name: ["Nom", "Nom hébergement", "Nom hebergement"],
      photo: ["Photo", "Photo hébergement", "Photo hebergement"],
      roadbookId: ["Roadbook ID", "roadbookId", "Roadbook"],
      createdAt: ["Horodatage", "Timestamp", "Created At", "Date"],
      contributionType: ["Type", "Contribution Type"]
    }),
    buildValues: function(request) {
      return {
        stage: request.stage,
        url: safeString(request.payload.url),
        name: safeString(request.payload.name),
        photo: safeString(request.payload.photo),
        roadbookId: request.roadbookId,
        createdAt: new Date(),
        contributionType: request.contributionType
      };
    }
  })
});

const RESERVED_CONTRIBUTION_TYPES = Object.freeze([
  "addedPhoto",
  "correction",
  "poiSuggestion",
  "restaurantSuggestion",
  "shopSuggestion",
  "waterSuggestion"
]);

function doGet() {
  return jsonResponse({
    ok: true,
    service: APP_NAME,
    version: APP_VERSION,
    supportedContributionTypes: Object.keys(CONTRIBUTION_TYPES),
    reservedContributionTypes: RESERVED_CONTRIBUTION_TYPES
  });
}

function doPost(e) {
  try {
    const request = parseJsonRequest(e);

    validateSecurity(request);
    validateBaseRequest(request);

    const handler = CONTRIBUTION_TYPES[request.contributionType];
    if (!handler) {
      return errorResponse(
        "UNSUPPORTED_CONTRIBUTION_TYPE",
        "Type de contribution non pris en charge.",
        {
          contributionType: request.contributionType,
          supportedContributionTypes: Object.keys(CONTRIBUTION_TYPES),
          reservedContributionTypes: RESERVED_CONTRIBUTION_TYPES
        },
        400
      );
    }

    validatePayload(request, handler);

    const spreadsheet = SpreadsheetApp.openById(request.googleSheetId);
    const sheet = spreadsheet.getSheetByName(handler.sheetName);
    if (!sheet) {
      return errorResponse(
        "SHEET_NOT_FOUND",
        "Feuille cible introuvable dans le Google Sheet.",
        {
          sheetName: handler.sheetName,
          contributionType: request.contributionType
        },
        404
      );
    }

    const rowNumber = appendContribution(sheet, handler, request);

    return jsonResponse({
      ok: true,
      service: APP_NAME,
      roadbookId: request.roadbookId,
      contributionType: request.contributionType,
      sheetName: handler.sheetName,
      rowNumber: rowNumber
    });
  } catch (error) {
    return errorResponse(
      error.code || "INTERNAL_ERROR",
      error.message || "Erreur interne.",
      error.details || {},
      error.status || 500
    );
  }
}

function parseJsonRequest(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw createError("EMPTY_BODY", "Le corps de la requête est vide.", 400);
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw createError("INVALID_JSON", "Le corps de la requête doit être un JSON valide.", 400);
  }
}

function validateBaseRequest(request) {
  requireString(request.roadbookId, "roadbookId");
  requireString(request.googleSheetId, "googleSheetId");
  requireString(request.contributionType, "contributionType");

  if (request.stage === null || request.stage === undefined || safeString(request.stage) === "") {
    throw createError("MISSING_STAGE", "Le champ stage est obligatoire.", 400);
  }

  if (!request.payload || typeof request.payload !== "object" || Array.isArray(request.payload)) {
    throw createError("INVALID_PAYLOAD", "Le champ payload doit être un objet JSON.", 400);
  }
}

function validatePayload(request, handler) {
  const missingFields = handler.requiredPayloadFields.filter(function(field) {
    return safeString(request.payload[field]) === "";
  });

  if (missingFields.length > 0) {
    throw createError(
      "MISSING_PAYLOAD_FIELDS",
      "Données obligatoires manquantes dans payload.",
      400,
      { missingFields: missingFields }
    );
  }
}

function validateSecurity(request) {
  if (SECURITY.apiKeyEnabled) {
    const providedKey = safeString(request.apiKey);
    if (!providedKey || providedKey !== SECURITY.expectedApiKey) {
      throw createError("INVALID_API_KEY", "Clé API absente ou invalide.", 403);
    }
  }

  if (SECURITY.roadbookWhitelistEnabled) {
    const allowed = SECURITY.allowedRoadbookIds.indexOf(request.roadbookId) !== -1;
    if (!allowed) {
      throw createError("ROADBOOK_NOT_ALLOWED", "Roadbook non autorisé.", 403);
    }
  }

  if (SECURITY.antiSpamEnabled) {
    // Point d'extension volontaire :
    // - limiter par roadbookId
    // - limiter par adresse IP si disponible via proxy
    // - utiliser CacheService / PropertiesService
  }
}

function appendContribution(sheet, handler, request) {
  const headers = readHeaders(sheet);
  if (headers.length === 0) {
    throw createError(
      "EMPTY_HEADER_ROW",
      "La première ligne de la feuille cible doit contenir les en-têtes.",
      400,
      { sheetName: handler.sheetName }
    );
  }

  const valuesByField = handler.buildValues(request);
  const row = headers.map(function(header) {
    const field = resolveFieldForHeader(header, handler.fieldAliases);
    return field ? valuesByField[field] || "" : "";
  });

  const requiredHeaderFields = ["stage"].concat(handler.requiredPayloadFields);
  const missingRequiredHeaders = requiredHeaderFields.filter(function(field) {
    return !hasHeaderForField(headers, handler.fieldAliases[field] || []);
  });

  if (missingRequiredHeaders.length > 0) {
    throw createError(
      "MISSING_REQUIRED_HEADERS",
      "La feuille cible ne contient pas les en-têtes obligatoires.",
      400,
      {
        sheetName: handler.sheetName,
        missingFields: missingRequiredHeaders
      }
    );
  }

  sheet.appendRow(row);
  return sheet.getLastRow();
}

function readHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return [];

  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(value) {
      return safeString(value);
    });
}

function resolveFieldForHeader(header, aliasesByField) {
  const normalizedHeader = normalizeText(header);
  const fields = Object.keys(aliasesByField);

  for (var i = 0; i < fields.length; i++) {
    const field = fields[i];
    const aliases = aliasesByField[field] || [];
    const matched = aliases.some(function(alias) {
      return normalizeText(alias) === normalizedHeader;
    });
    if (matched) return field;
  }

  return "";
}

function hasHeaderForField(headers, aliases) {
  return headers.some(function(header) {
    return aliases.some(function(alias) {
      return normalizeText(header) === normalizeText(alias);
    });
  });
}

function requireString(value, fieldName) {
  if (safeString(value) === "") {
    throw createError(
      "MISSING_FIELD",
      "Champ obligatoire manquant.",
      400,
      { field: fieldName }
    );
  }
}

function safeString(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeText(value) {
  return safeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function createError(code, message, status, details) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 500;
  error.details = details || {};
  return error;
}

function jsonResponse(data, status) {
  const output = ContentService
    .createTextOutput(JSON.stringify({
      status: status || 200,
      timestamp: new Date().toISOString(),
      data: data
    }))
    .setMimeType(ContentService.MimeType.JSON);

  return output;
}

function errorResponse(code, message, details, status) {
  return jsonResponse({
    ok: false,
    error: {
      code: code,
      message: message,
      details: details || {}
    }
  }, status || 500);
}
