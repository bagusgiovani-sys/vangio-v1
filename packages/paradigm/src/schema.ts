export type Head = {
  model: string
  role: string
  permission?: Record<string, unknown>
  prompt?: string
}

export type Paradigm = {
  name: string
  description?: string
  king: string
  heads: Record<string, Head>
  routing: string[]
  discipline: Record<string, string>
}

export type ParseResult = { ok: true; value: Paradigm } | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseParadigm(input: unknown): ParseResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ["paradigm must be an object"] }

  const name = input["name"]
  if (typeof name !== "string" || name.length === 0) errors.push("name must be a non-empty string")

  const king = input["king"]
  if (typeof king !== "string" || king.length === 0) errors.push("king must be a non-empty string")

  const rawHeads = input["heads"]
  const heads: Record<string, Head> = {}
  if (!isRecord(rawHeads) || Object.keys(rawHeads).length === 0) {
    errors.push("heads must be a non-empty object")
  } else {
    for (const [id, value] of Object.entries(rawHeads)) {
      if (!isRecord(value)) {
        errors.push(`head "${id}" must be an object`)
        continue
      }
      const model = value["model"]
      const role = value["role"]
      if (typeof model !== "string" || model.length === 0) {
        errors.push(`head "${id}" must have a model`)
        continue
      }
      if (typeof role !== "string") {
        errors.push(`head "${id}" must have a role`)
        continue
      }
      heads[id] = {
        model,
        role,
        permission: isRecord(value["permission"]) ? value["permission"] : undefined,
        prompt: typeof value["prompt"] === "string" ? value["prompt"] : undefined,
      }
    }
  }

  if (typeof king === "string" && Object.keys(heads).length > 0 && !heads[king]) {
    errors.push(`king "${king}" is not one of the defined heads`)
  }

  const routing = Array.isArray(input["routing"])
    ? input["routing"].filter((r): r is string => typeof r === "string")
    : []
  const discipline = isRecord(input["discipline"])
    ? (Object.fromEntries(
        Object.entries(input["discipline"]).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>)
    : {}

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      name: name as string,
      description: typeof input["description"] === "string" ? input["description"] : undefined,
      king: king as string,
      heads,
      routing,
      discipline,
    },
  }
}
