#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { listFlag, parseArgs } from "./args.js";
import { scaffoldCollection } from "./codegen/scaffold-collection.js";
import { scaffoldFromTable } from "./codegen/scaffold-from-table.js";
import { toKebabCase, toPascalCase } from "./naming.js";
import type { Table } from "@comp/core";

const HELP = `comp — Comp admin framework CLI

Usage:
  comp scaffold <Name> --table <table> [options]   Generate a collection module
  comp scaffold --from <module>#<table> [options]  Generate from a live schema
  comp version                                     Print the version
  comp help                                        Show this help

scaffold options:
  --from <mod>#<id>  Introspect a Drizzle table export and derive defaults
  --table <id>       Drizzle table identifier (manual mode, required)
  --module <path>    Import path for the table (default: ./schema.js)
  --fields <a,b,c>   listDisplay columns (manual mode, required)
  --filters <a,b>    Filterable columns
  --search <a,b>     Searchable columns
  --out <path>       Write to a file (default: stdout)
`;

function emit(source: string, flags: Record<string, string | boolean>, fallbackName: string): void {
  const out =
    typeof flags.out === "string"
      ? flags.out
      : flags.out === true
        ? `${toKebabCase(fallbackName)}.collection.ts`
        : undefined;
  if (out) {
    writeFileSync(out, source);
    console.log(`Wrote ${out}`);
  } else {
    process.stdout.write(source);
  }
}

async function scaffoldFrom(
  spec: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const [modulePath, exportName] = spec.split("#");
  if (!modulePath || !exportName) {
    console.error("--from expects <module>#<tableExport>");
    process.exit(1);
  }
  const url = pathToFileURL(resolve(process.cwd(), modulePath)).href;
  const imported = (await import(url)) as Record<string, unknown>;
  const table = imported[exportName] as Table | undefined;
  if (!table) {
    console.error(`Export "${exportName}" not found in ${modulePath}`);
    process.exit(1);
  }
  const name = positionals[0] ?? toPascalCase(exportName);
  const source = scaffoldFromTable(table, { name, table: exportName, module: modulePath });
  emit(source, flags, name);
}

function scaffoldManual(
  positionals: string[],
  flags: Record<string, string | boolean>,
): void {
  const name = positionals[0];
  const table = flags.table;
  const fields = listFlag(flags, "fields");
  if (!name || typeof table !== "string" || fields.length === 0) {
    console.error("scaffold requires <Name>, --table, and --fields (or use --from)");
    process.exit(1);
  }
  const source = scaffoldCollection({
    name,
    table,
    module: typeof flags.module === "string" ? flags.module : "./schema.js",
    listDisplay: fields,
    filters: listFlag(flags, "filters"),
    search: listFlag(flags, "search"),
  });
  emit(source, flags, name);
}

async function main(): Promise<void> {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const command = _[0];

  switch (command) {
    case "scaffold":
      if (typeof flags.from === "string") {
        await scaffoldFrom(flags.from, _.slice(1), flags);
      } else {
        scaffoldManual(_.slice(1), flags);
      }
      break;
    case "version":
      console.log("comp 0.0.0");
      break;
    case undefined:
    case "help":
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

void main();
