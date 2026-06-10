import { describe, it, expect, vi } from "vitest";
import {
  printFirstRunHint,
  printNextStepsAfterInit,
  printNextStepsAfterNext,
  printNextStepsAfterCreate,
} from "../src/cli/guidance.js";

function captureOut(fn: () => void): string {
  let out = "";
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      out += chunk.toString();
      return true;
    });
  try {
    fn();
    return out;
  } finally {
    spy.mockRestore();
  }
}

describe("guidance", () => {
  it("first-run hint names the init command", () => {
    const out = captureOut(() => printFirstRunHint());
    expect(out).toMatch(/tagsmith init/);
  });

  it("first-run hint is silent in JSON mode", () => {
    expect(captureOut(() => printFirstRunHint({ json: true }))).toBe("");
  });

  it("after init suggests list and next", () => {
    const out = captureOut(() => printNextStepsAfterInit({}));
    expect(out).toMatch(/tagsmith list/);
    expect(out).toMatch(/tagsmith next/);
  });

  it("after next suggests create with the same level", () => {
    const out = captureOut(() =>
      printNextStepsAfterNext({ level: "minor" }),
    );
    expect(out).toMatch(/tagsmith create -l minor/);
  });

  it("after create without push suggests pushing the tag", () => {
    const out = captureOut(() =>
      printNextStepsAfterCreate({ pushed: false, tag: "v1.2.0" }),
    );
    expect(out).toMatch(/git push origin v1\.2\.0/);
  });

  it("after create without push and no tag suggests git push --tags", () => {
    const out = captureOut(() =>
      printNextStepsAfterCreate({ pushed: false }),
    );
    expect(out).toMatch(/git push --tags/);
  });

  it("after create with push suggests list", () => {
    const out = captureOut(() =>
      printNextStepsAfterCreate({ pushed: true }),
    );
    expect(out).toMatch(/tagsmith list/);
  });

  it("is silent in JSON mode", () => {
    expect(captureOut(() => printNextStepsAfterInit({ json: true }))).toBe("");
    expect(
      captureOut(() => printNextStepsAfterNext({ level: "patch", json: true })),
    ).toBe("");
    expect(
      captureOut(() => printNextStepsAfterCreate({ pushed: false, json: true })),
    ).toBe("");
  });
});
