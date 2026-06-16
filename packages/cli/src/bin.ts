#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { listFlag, parseArgs } from "./args.js";
import { scaffoldCollection } from "./codegen/scaffold-collection.js";
import { toKebabCase } from "./naming.js";

const HELP = `comp — Comp admin framework CLI

Usage:
  comp scaffold <Name> --table <table> [options]   Generate a collection module
  comp version                                     Print the version
  comp help                                        Show this help

scaffold options:
  --table <id>       Drizzle table identifier (required)
  --module <path>    Import path for the table (default: ./schema.js)
  --fields <a,b,c>   listDisplay columns (required)
  --filters <a,b>    Filterable columns
  --search <a,b>     Searchable columns
  --out <path>       Write to a file (default: stdout)
`;

function scaffold(positionals: string[], flags: Record<string, string | boolean>): void {
  const name = positionals[0];
  const table = flags.table;
  const fields = listFlag(flags, "fields");
  if (!name || typeof table !== "string" || fields.length === 0) {
    console.error("scaffold requires <Name>, --table, and --fields");
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

  const out =
    typeof flags.out === "string"
      ? flags.out
      : flags.out === true
        ? `${toKebabCase(name)}.collection.ts`
        : undefined;

  if (out) {
    writeFileSync(out, source);
    console.log(`Wrote ${out}`);
  } else {
    process.stdout.write(source);
  }
}

const { _, flags } = parseArgs(process.argv.slice(2));
const command = _[0];

switch (command) {
  case "scaffold":
    scaffold(_.slice(1), flags);
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
