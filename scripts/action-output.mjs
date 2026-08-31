import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

export function appendActionOutput(file, name, value) {
  const text = String(value);
  let delimiter;
  do {
    delimiter = `TAGSMITH_${randomUUID()}`;
  } while (text.split(/\r?\n/u).includes(delimiter));
  appendFileSync(file, `${name}<<${delimiter}\n${text}\n${delimiter}\n`, "utf8");
}
