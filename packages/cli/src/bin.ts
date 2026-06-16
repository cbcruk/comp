#!/usr/bin/env node

const command = process.argv[2];

switch (command) {
  case "version":
  case undefined:
    console.log("comp 0.0.0");
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
