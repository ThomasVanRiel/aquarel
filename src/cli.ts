/**
 * aquarel build pipeline CLI.
 *
 *   npm run pipeline -- <input.svg> [more.svg …] [options]
 *
 * Options:
 *   -o, --out <path>      output file (single input) or directory
 *   -c, --config <path>   JSON config file ({ defaults, figures })
 *   --cheap               force cheap filter mode
 *   --no-paper            omit paper ground + vignette
 *
 * Outputs default to out/<name>.svg. Deterministic per figure name+config.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { normalize, paint, resolveConfig, type PipelineConfigFile } from "./pipeline";

function fail(message: string): never {
  console.error(`aquarel: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const inputs: string[] = [];
let outArg: string | undefined;
let configPath: string | undefined;
let cheap = false;
let noPaper = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-o" || a === "--out") outArg = args[++i];
  else if (a === "-c" || a === "--config") configPath = args[++i];
  else if (a === "--cheap") cheap = true;
  else if (a === "--no-paper") noPaper = true;
  else if (a.startsWith("-")) fail(`unknown option ${a}`);
  else inputs.push(a);
}

if (inputs.length === 0) fail("no input SVGs given (usage: aquarel <input.svg> [-o out] [-c config.json])");
if (outArg && inputs.length > 1 && extname(outArg) === ".svg") {
  fail("-o must be a directory when processing multiple inputs");
}

const configFile: PipelineConfigFile | undefined = configPath
  ? (JSON.parse(readFileSync(configPath, "utf8")) as PipelineConfigFile)
  : undefined;

for (const input of inputs) {
  const name = basename(input, extname(input));
  const source = readFileSync(input, "utf8");
  const cfg = resolveConfig(configFile, name);
  if (cheap) cfg.mode = "cheap";
  if (noPaper) cfg.paper.enabled = false;

  const figure = await normalize(source, name);
  for (const warning of figure.warnings) console.warn(`aquarel: ${name}: ${warning}`);

  const output = paint(figure, name, cfg);
  const outPath =
    outArg && extname(outArg) === ".svg" ? outArg : join(outArg ?? "out", `${name}.svg`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, output);
  const parts = figure.parts.length;
  console.log(
    `aquarel: ${input} → ${outPath} (${parts} part${parts === 1 ? "" : "s"}, ${(output.length / 1024).toFixed(1)} KB${cfg.mode === "cheap" ? ", cheap mode" : ""})`,
  );
}
