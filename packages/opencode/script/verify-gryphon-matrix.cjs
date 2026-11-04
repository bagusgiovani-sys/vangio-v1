const fs = require("node:fs")
const path = require("node:path")
const { verify } = require("./verify-gryphon-model.cjs")

function matrix(plan, reportPath, run = verify) {
  const roles = ["king", "warrior", "scout"]
  if (!plan || Object.keys(plan).length !== 3 || !roles.every((role) => plan[role] &&
    Object.keys(plan[role]).length === 2 && ["primary", "backup"].every((slot) =>
      typeof plan[role][slot] === "string" && /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:/-]+$/.test(plan[role][slot])))) {
    throw new Error("Plan requires king, warrior and scout, each with primary and backup model references")
  }
  const slots = roles.flatMap((role) => ["primary", "backup"].map((slot) => ({ role, slot, model: plan[role][slot], status: "not_run" })))
  if (new Set(slots.map((slot) => slot.model)).size !== 6) throw new Error("Plan requires six distinct model references")
  const report = {
    startedAt: new Date().toISOString(),
    scope: "Candidate tool-use checks only. Does not establish free entitlement, quota independence, delegation, multi-file reliability or installed switching.",
    complete: false,
    slots,
  }
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n")
  save()
  for (const slot of slots) {
    slot.status = "running"
    save()
    try {
      slot.receipt = run({ role: slot.role, model: slot.model, attempts: 3,
        onResult: (result) => {
          slot.lastAttempt = result
          save()
          console.error(slot.role + "/" + slot.slot + " attempt " + result.attempt + ": " + (result.passed ? "pass" : result.error))
        } })
      slot.status = slot.receipt.passed === 3 ? "passed" : "failed"
    } catch {
      slot.status = "runner_error"
    }
    save()
  }
  report.complete = slots.every((slot) => slot.status === "passed")
  report.finishedAt = new Date().toISOString()
  save()
  return report
}

module.exports = { matrix }
if (require.main === module) {
  try {
    if (process.argv.length !== 4 || path.resolve(process.argv[2]) === path.resolve(process.argv[3])) {
      throw new Error("Expected separate plan and receipt paths")
    }
    const report = matrix(JSON.parse(fs.readFileSync(process.argv[2], "utf8")), process.argv[3])
    console.log(JSON.stringify({ complete: report.complete, slots: report.slots.map(({ role, slot, model, status }) => ({ role, slot, model, status })) }, null, 2))
    process.exitCode = report.complete ? 0 : 1
  } catch {
    console.error("Usage: node script/verify-gryphon-matrix.cjs <six-slot-plan.json> <receipt.json>. Requires six distinct candidates and a writable receipt path.")
    process.exitCode = 2
  }
}
