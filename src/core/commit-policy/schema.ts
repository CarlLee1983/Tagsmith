import { z } from "zod";

const releaseLevelSchema = z.enum(["major", "minor", "patch"]);

const ruleSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  breaking: z.boolean().optional(),
  release: releaseLevelSchema.optional(),
  ignore: z.literal(true).optional(),
}).strict().superRefine((rule, ctx) => {
  const outcomes = Number(rule.release !== undefined) + Number(rule.ignore === true);
  if (outcomes !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "set exactly one of release or ignore: true",
    });
  }
});

/** Shared config contract for ordered Conventional Commit release rules. */
export const commitPolicySchema = z.object({
  rules: z.array(ruleSchema).min(1),
}).strict();
