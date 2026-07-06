/**
 * RoadBook Explorer — Central Contribution API
 *
 * Apps Script classique, autonome, prêt à copier dans Google Apps Script.
 * Fonctions globales obligatoires :
 * - doGet(e)
 * - doPost(e)
 *
 * Le Google Sheet central peut être configuré de deux façons :
 * 1. Recommandé : propriété de script ROADBOOK_CONTRIBUTIONS_SHEET_ID.
 * 2. Fallback : renseigner CENTRAL_SPREADSHEET_ID ci-dessous.
 */

var APP_NAME = "RoadBook Explorer Central Contribution API";
var APP_VERSION = "2.0.0";
var CENTRAL_SPREADSHEET_ID = "";
var CENTRAL_SPREADSHEET_PROPERTY = "ROADBOOK_CONTRIBUTIONS_SHEET_ID";
var CONTRIBUTIONS_SHEET_NAME = "Contributions";

var SECURITY = Object.freeze({
  apiKeyEnabled: false,
  expectedApiKey: "",
  roadbookWhitelistEnabled: false,
  allowedRoadbookIds: [],
  antiSpamEnabled: false
});

var CONTRIBUTION_TYPES = Object.freeze({
  travelerNote: Object.freeze({
    publicType: "note",
    requiredAnyPayloadFields: [["note", "text"]],
    buildValues: function(request) {
      return {
        roadbookId: request.roadbookId,
        stage: request.stage,
        type: "note",
        text: safeString(request.payload.note || request.payload.text),
        name: "",
        url: "",
        website: "",
        photo: safeString(request.payload.photo),
        createdAt: safeString(request.payload.createdAt) || new Date(),
        source: safeString(request.payload.source) || "public-roadbook"
      };
    }
  }),

  addedAccommodation: Object.freeze({
    publicType: "accommodation",
    requiredAnyPayloadFields: [["name", "url", "website"]],
    buildValues: function(request) {
      var url = safeString(request.payload.url || request.payload.website);
      return {
        roadbookId: request.roadbookId,
        stage: request.stage,
        type: "accommodation",
        text: "",
        name: safeString(request.payload.name),
        url: url,
        website: url,
        photo: safeString(request.payload.photo),
        createdAt: safeString(request.payload.createdAt) || new Date(),
        source: safeString(request.payload.source) || "public-roadbook"
      };
    }
  })
});

var RESERVED_CONTRIBUTION_TYPES = Object.freeze([
  "addedPhoto",
  "correction",
  "poiSuggestion",
  "restaurantSuggestion",
  "shopSuggestion",
  "waterSuggestion"
]);

var HEADER_ALIASES = Object.freeze({
  roadbookId: ["roadbookId", "Roadbook ID", "Roadbook", "RoadbookId"],
  stage: ["stage", "Étape", "Etape", "Numero etape", "Numéro étape"],
  type: ["type", "Type", "Contribution Type"],
  text: ["text", "Texte", "Note", "Commentaire"],
  name: ["name", "Nom", "Nom hébergement", "Nom hebergement"],
  url: ["url", "URL", "URL hébergement", "URL hebergement", "Lien"],
  website: ["website", "Site web", "Site", "Lien site"],
  photo: ["photo", "Photo", "Image", "URL photo", "Lien photo"],
  createdAt: ["createdAt", "Horodatage", "Timestamp", "Created At", "Date"],
  source: ["source", "Source"]
});

function doGet(e) {
  try {
    var action = safeString(e && e.parameter && e.parameter.action);
    if (action === "list") {
      return listContributions(e);
    }

    return jsonResponse({
      ok: true,
      service: APP_NAME,
      version: APP_VERSION,
      centralSheet: CONTRIBUTIONS_SHEET_NAME,
      supportedContributionTypes: Object.keys(CONTRIBUTION_TYPES),
      reservedContributionTypes: RESERVED_CONTRIBUTION_TYPES
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

function doPost(e) {
  try {
    var request = parseJsonRequest(e);

    validateSecurity(request);
    validateBaseRequest(request);

    var handler = CONTRIBUTION_TYPES[request.contributionType];
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

    var sheet = getCentralContributionsSheet();
    ensureContributionHeaders(sheet);
    var rowNumber = appendContribution(sheet, handler, request);

    return jsonResponse({
      ok: true,
      service: APP_NAME,
      roadbookId: request.roadbookId,
      contributionType: request.contributionType,
      type: handler.publicType,
      sheetName: CONTRIBUTIONS_SHEET_NAME,
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

function listContributions(e) {
  var roadbookId = safeString(e && e.parameter && e.parameter.roadbookId);
  var sheet = getCentralContributionsSheet();
  ensureContributionHeaders(sheet);

  var headers = readHeaders(sheet);
  var values = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    : [];

  var items = values
    .map(function(row) {
      return rowToContribution(headers, row);
    })
    .filter(function(item) {
      return !roadbookId || normalizeText(item.roadbookId) === normalizeText(roadbookId);
    });

  return jsonResponse({
    ok: true,
    service: APP_NAME,
    sheetName: CONTRIBUTIONS_SHEET_NAME,
    roadbookId: roadbookId,
    items: items
  });
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
  requireString(request.contributionType, "contributionType");

  if (request.stage === null || request.stage === undefined || safeString(request.stage) === "") {
    throw createError("MISSING_STAGE", "Le champ stage est obligatoire.", 400);
  }

  if (!request.payload || typeof request.payload !== "object" || Array.isArray(request.payload)) {
    throw createError("INVALID_PAYLOAD", "Le champ payload doit être un objet JSON.", 400);
  }
}

function validatePayload(request, handler) {
  var missingGroups = handler.requiredAnyPayloadFields.filter(function(group) {
    return !group.some(function(field) {
      return safeString(request.payload[field]) !== "";
    });
  });

  if (missingGroups.length > 0) {
    throw createError(
      "MISSING_PAYLOAD_FIELDS",
      "Données obligatoires manquantes dans payload.",
      400,
      { missingAnyOf: missingGroups }
    );
  }
}

function validateSecurity(request) {
  if (SECURITY.apiKeyEnabled) {
    var providedKey = safeString(request.apiKey);
    if (!providedKey || providedKey !== SECURITY.expectedApiKey) {
      throw createError("INVALID_API_KEY", "Clé API absente ou invalide.", 403);
    }
  }

  if (SECURITY.roadbookWhitelistEnabled) {
    var allowed = SECURITY.allowedRoadbookIds.indexOf(request.roadbookId) !== -1;
    if (!allowed) {
      throw createError("ROADBOOK_NOT_ALLOWED", "Roadbook non autorisé.", 403);
    }
  }

  if (SECURITY.antiSpamEnabled) {
    // Point d'extension volontaire :
    // - limiter par roadbookId
    // - utiliser CacheService / PropertiesService
  }
}

function getCentralContributionsSheet() {
  var spreadsheetId = getCentralSpreadsheetId();
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = spreadsheet.getSheetByName(CONTRIBUTIONS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONTRIBUTIONS_SHEET_NAME);
  }
  return sheet;
}

function getCentralSpreadsheetId() {
  var propertyValue = "";
  try {
    propertyValue = PropertiesService.getScriptProperties().getProperty(CENTRAL_SPREADSHEET_PROPERTY);
  } catch (error) {
    propertyValue = "";
  }

  var spreadsheetId = safeString(propertyValue || CENTRAL_SPREADSHEET_ID);
  if (!spreadsheetId) {
    throw createError(
      "CENTRAL_SHEET_NOT_CONFIGURED",
      "Google Sheet central non configuré. Renseigner ROADBOOK_CONTRIBUTIONS_SHEET_ID dans les propriétés du script.",
      500
    );
  }
  return spreadsheetId;
}

function ensureContributionHeaders(sheet) {
  var headers = readHeaders(sheet);
  if (headers.length > 0) return;
  sheet.appendRow(["roadbookId", "stage", "type", "text", "name", "url", "website", "photo", "createdAt", "source"]);
}

function appendContribution(sheet, handler, request) {
  var headers = readHeaders(sheet);
  var valuesByField = handler.buildValues(request);
  var row = headers.map(function(header) {
    var field = resolveFieldForHeader(header, HEADER_ALIASES);
    return field ? valuesByField[field] || "" : "";
  });

  var requiredHeaderFields = ["roadbookId", "stage", "type"];
  var missingRequiredHeaders = requiredHeaderFields.filter(function(field) {
    return !hasHeaderForField(headers, HEADER_ALIASES[field] || []);
  });

  if (missingRequiredHeaders.length > 0) {
    throw createError(
      "MISSING_REQUIRED_HEADERS",
      "La feuille centrale ne contient pas les en-têtes obligatoires.",
      400,
      { sheetName: CONTRIBUTIONS_SHEET_NAME, missingFields: missingRequiredHeaders }
    );
  }

  sheet.appendRow(row);
  return sheet.getLastRow();
}

function rowToContribution(headers, row) {
  var item = {};
  headers.forEach(function(header, index) {
    var field = resolveFieldForHeader(header, HEADER_ALIASES);
    if (field) item[field] = serializeCellValue(row[index]);
  });
  return {
    roadbookId: safeString(item.roadbookId),
    stage: safeString(item.stage),
    type: safeString(item.type),
    text: safeString(item.text),
    note: safeString(item.text),
    name: safeString(item.name),
    url: safeString(item.url || item.website),
    website: safeString(item.website || item.url),
    photo: safeString(item.photo),
    createdAt: safeString(item.createdAt),
    source: safeString(item.source)
  };
}

function serializeCellValue(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.toISOString();
  }
  return safeString(value);
}

function readHeaders(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return [];

  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(value) {
      return safeString(value);
    });
}

function resolveFieldForHeader(header, aliasesByField) {
  var normalizedHeader = normalizeText(header);
  var fields = Object.keys(aliasesByField);

  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var aliases = aliasesByField[field] || [];
    var matched = aliases.some(function(alias) {
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
  var error = new Error(message);
  error.code = code;
  error.status = status || 500;
  error.details = details || {};
  return error;
}

function jsonResponse(data, status) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: status || 200,
      timestamp: new Date().toISOString(),
      data: data
    }))
    .setMimeType(ContentService.MimeType.JSON);
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
