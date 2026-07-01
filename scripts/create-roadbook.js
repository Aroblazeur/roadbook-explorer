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
const ROADBOOKS_DIR = path.join(ROOT_DIR, "roadbooks");
const TEMPLATE_DIR = path.join(ROADBOOKS_DIR, "_template");

const TEMPLATE_PLACEHOLDERS = Object.freeze({
    id: "my-roadbook",
    title: "Mon Roadbook",
    description: "Description de l'itinéraire."
});
const GOOGLE_SHEET_ID_LINE_PATTERN = /^(\s*)googleSheetId:\s*"",\s*$/m;

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

    const roadbookDir = path.join(ROADBOOKS_DIR, id);

    console.log(`\nCréation du roadbook "${id}"…`);

    try {
        await ensureTemplateIsComplete();
        await fs.cp(TEMPLATE_DIR, roadbookDir, { recursive: true, errorOnExist: true, force: false });
    } catch (error) {
        if (error.code === "EEXIST") die(`Le dossier roadbooks/${id} existe déjà.`);
        throw error;
    }
    await personalizeTemplate(roadbookDir, { id, title, description, googleSheetId });

    console.log("\n✅ Roadbook créé avec succès !\n");
    console.log("Fichiers générés :");
    console.log(`  roadbooks/${id}/README.md`);
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

async function ensureTemplateIsComplete() {
    const requiredPaths = [
        "README.md",
        "config.js",
        "roadbook.json",
        path.join("data", "accommodation-enrichment.json"),
        path.join("data", "poi-enrichment.json"),
        path.join("assets", ".gitkeep"),
        path.join("gpx", ".gitkeep")
    ];

    await Promise.all(requiredPaths.map(async relativePath => {
        const absolutePath = path.join(TEMPLATE_DIR, relativePath);
        try {
            await fs.access(absolutePath);
        } catch (error) {
            throw new Error(`Template incomplet : fichier manquant ${path.relative(ROOT_DIR, absolutePath)}`);
        }
    }));
}

async function personalizeTemplate(roadbookDir, { id, title, description, googleSheetId }) {
    const configPath = path.join(roadbookDir, "config.js");
    const roadbookJsonPath = path.join(roadbookDir, "roadbook.json");

    const [configTemplate, roadbookTemplate] = await Promise.all([
        fs.readFile(configPath, "utf8"),
        fs.readFile(roadbookJsonPath, "utf8")
    ]);

    const configContent = replaceGoogleSheetIdLine(
        replaceRequired(
            replaceRequired(
                replaceAllRequired(configTemplate, TEMPLATE_PLACEHOLDERS.id, id, "identifiant du roadbook"),
                `title: ${JSON.stringify(TEMPLATE_PLACEHOLDERS.title)},`,
                `title: ${JSON.stringify(title)},`,
                "title du roadbook"
            ),
            `description: ${JSON.stringify(TEMPLATE_PLACEHOLDERS.description)},`,
            `description: ${JSON.stringify(description)},`,
            "description du roadbook"
        ),
        googleSheetId
    );

    const roadbookContent = replaceRequired(
        replaceRequired(
            roadbookTemplate,
            `"title": ${JSON.stringify(TEMPLATE_PLACEHOLDERS.title)}`,
            `"title": ${JSON.stringify(title)}`,
            "title du roadbook"
        ),
        `"description": ${JSON.stringify(TEMPLATE_PLACEHOLDERS.description)}`,
        `"description": ${JSON.stringify(description)}`,
        "description du roadbook"
    );

    await Promise.all([
        fs.writeFile(configPath, configContent, "utf8"),
        fs.writeFile(roadbookJsonPath, roadbookContent, "utf8")
    ]);
}

function ensurePlaceholderExists(content, placeholder, label) {
    if (!content.includes(placeholder)) {
        throw new Error(`Template incohérent : impossible de trouver le placeholder ${label}.`);
    }
}

function replaceRequired(content, search, replacement, label) {
    ensurePlaceholderExists(content, search, label);
    return content.replace(search, replacement);
}

function replaceAllRequired(content, search, replacement, label) {
    ensurePlaceholderExists(content, search, label);
    return content.replaceAll(search, replacement);
}

function replaceGoogleSheetIdLine(content, googleSheetId) {
    if (!GOOGLE_SHEET_ID_LINE_PATTERN.test(content)) {
        throw new Error("Template incohérent : impossible de trouver la ligne googleSheetId.");
    }
    return content.replace(
        GOOGLE_SHEET_ID_LINE_PATTERN,
        (_, indentation) => `${indentation}googleSheetId: ${JSON.stringify(googleSheetId)},`
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
