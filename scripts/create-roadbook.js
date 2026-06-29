"use strict";

/**
 * create-roadbook.js
 *
 * Créé automatiquement toute l'arborescence nécessaire pour un nouveau roadbook.
 *
 * Usage :
 *   npm run create-roadbook
 *   npm run create-roadbook -- --id=mon-voyage --title="Mon Voyage" --sheet-id=SHEET_ID
 *
 * Options :
 *   --id=<id>           Identifiant du roadbook (lettres minuscules, chiffres, tirets)
 *   --title=<titre>     Titre affiché du roadbook
 *   --description=<d>   Description courte du roadbook
 *   --sheet-id=<id>     ID du Google Sheet associé
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline");

const ROOT_DIR = path.resolve(__dirname, "..");

async function main() {
    const args = parseCliArgs(process.argv.slice(2));

    const id = args.id || (await prompt("Identifiant du roadbook (ex: mon-voyage) : ")).trim();
    if (!id) {
        die("L'identifiant est requis.");
    }
    if (!/^[a-z0-9-]+$/.test(id)) {
        die("L'identifiant ne doit contenir que des lettres minuscules, des chiffres et des tirets.");
    }

    const title = args.title || (await prompt(`Titre du roadbook (défaut : "${id}") : `)).trim() || id;
    const description =
        args.description ||
        (await prompt("Description courte (défaut : Roadbook d'itinérance.) : ")).trim() ||
        "Roadbook d'itinérance.";
    const googleSheetId =
        args["sheet-id"] || (await prompt("ID du Google Sheet (laisser vide si inconnu) : ")).trim() || "";

    closeReadline();

    const roadbookDir = path.join(ROOT_DIR, "roadbooks", id);

    console.log(`\nCréation du roadbook "${id}"…`);

    try {
        await fs.mkdir(roadbookDir);
    } catch (error) {
        if (error.code === "EEXIST") die(`Le dossier roadbooks/${id} existe déjà.`);
        throw error;
    }
    await fs.mkdir(path.join(roadbookDir, "data"));
    await fs.mkdir(path.join(roadbookDir, "gpx"));
    await fs.mkdir(path.join(roadbookDir, "assets"));

    await fs.writeFile(path.join(roadbookDir, "config.js"), buildConfigJs(id, title, description, googleSheetId), "utf8");
    await fs.writeFile(path.join(roadbookDir, "roadbook.json"), buildRoadbookJson(title, description), "utf8");
    await fs.writeFile(
        path.join(roadbookDir, "data", "accommodation-enrichment.json"),
        buildEmptyEnrichmentJson(),
        "utf8"
    );
    await fs.writeFile(
        path.join(roadbookDir, "data", "poi-enrichment.json"),
        buildEmptyEnrichmentJson(),
        "utf8"
    );
    await fs.writeFile(path.join(roadbookDir, "gpx", ".gitkeep"), "", "utf8");
    await fs.writeFile(path.join(roadbookDir, "assets", ".gitkeep"), "", "utf8");

    console.log("\n✅ Roadbook créé avec succès !\n");
    console.log("Fichiers générés :");
    console.log(`  roadbooks/${id}/config.js`);
    console.log(`  roadbooks/${id}/roadbook.json`);
    console.log(`  roadbooks/${id}/data/accommodation-enrichment.json`);
    console.log(`  roadbooks/${id}/data/poi-enrichment.json`);
    console.log(`  roadbooks/${id}/gpx/  (vide)`);
    console.log(`  roadbooks/${id}/assets/  (vide)`);

    if (googleSheetId) {
        console.log(`\n📊 Google Sheet : https://docs.google.com/spreadsheets/d/${googleSheetId}`);
    } else {
        console.log(`\n⚠️  Pensez à renseigner googleSheetId dans roadbooks/${id}/config.js`);
    }

    console.log(`\n🔗 URL d'accès : index.html?roadbook=${id}`);
}

// ---------------------------------------------------------------------------
// File content generators
// ---------------------------------------------------------------------------

function buildConfigJs(id, title, description, googleSheetId) {
    const fnName = toPascalCase(id);
    const sheetIdLine = googleSheetId
        ? `        googleSheetId: "${googleSheetId}",`
        : `        // googleSheetId: "REMPLACER_PAR_L_ID_DU_GOOGLE_SHEET",`;

    return `"use strict";

(function register${fnName}RoadbookConfig(global) {
    global.ROADBOOK_CONFIGS = global.ROADBOOK_CONFIGS || {};

    global.ROADBOOK_CONFIGS["${id}"] = Object.freeze({
        id: "${id}",
        shortId: "${id}",
        title: "${escapeJs(title)}",
        description: "${escapeJs(description)}",
${sheetIdLine}
        sheets: Object.freeze({
            stages: Object.freeze({ name: "etapes principales" }),
            substeps: Object.freeze({ name: "Variante et option", gid: "" }),
            travelerNotes: Object.freeze({ name: "Notes voyageurs" }),
            addedAccommodation: Object.freeze({ name: "ajout hebergement" }),
            configuration: Object.freeze({ name: "Configuration" })
        }),
        enrichment: Object.freeze({
            accommodationPath: "roadbooks/${id}/data/accommodation-enrichment.json",
            poiPath: "roadbooks/${id}/data/poi-enrichment.json"
        }),
        fallbackJsonPaths: Object.freeze(["roadbooks/${id}/roadbook.json"]),
        options: Object.freeze({})
    });
})(typeof window !== "undefined" ? window : globalThis);
`;
}

function buildRoadbookJson(title, description) {
    const template = {
        title,
        description,
        days: [
            {
                title: "Jour 1 - Départ",
                distance: 0,
                elevation: 0,
                duration: "",
                description: "Description de la première étape.",
                accommodation: "",
                pois: []
            }
        ]
    };
    return JSON.stringify(template, null, 2) + "\n";
}

function buildEmptyEnrichmentJson() {
    return JSON.stringify({ generatedAt: new Date().toISOString(), items: [] }, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPascalCase(id) {
    return id
        .split("-")
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}

function escapeJs(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

function parseCliArgs(argv) {
    const result = {};
    for (const arg of argv) {
        const match = arg.match(/^--([a-z][a-z0-9-]*)(?:=(.*))?$/i);
        if (match) {
            result[match[1].toLowerCase()] = match[2] !== undefined ? match[2] : true;
        }
    }
    return result;
}

let rl = null;

function getReadline() {
    if (!rl) {
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    }
    return rl;
}

function closeReadline() {
    if (rl) {
        rl.close();
        rl = null;
    }
}

function prompt(question) {
    if (!process.stdin.isTTY) return Promise.resolve("");
    return new Promise(resolve => getReadline().question(question, resolve));
}

function die(message) {
    console.error(`\n❌ Erreur : ${message}`);
    process.exit(1);
}

main().catch(error => {
    closeReadline();
    console.error("\n❌ Erreur inattendue :", error.message);
    process.exit(1);
});
