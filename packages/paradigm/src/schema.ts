/**
 * What a head's role actually requires of a model, as opposed to which model it
 * happens to be bound to. Declaring it is what lets a resolver pick a
 * substitute on purpose rather than by list order, and it documents why a
 * fallback chain is ordered the way it is.
 *
 * `minOutput` is the one that decides most cases: five of the seven runnable
 * free models cap output at 32k, which truncates real work for any head that
 * writes files.
 */
export type Needs = {
  minOutput?: number
  tools?: boolean
  attachment?: boolean
}

export type Head = {
  model: string
  role: string
  permission?: Record<string, unknown>
  prompt?: string
  needs?: Needs
  /** Ordered substitutes, tried in order when this head's model hits a wall. */
  fallback?: string[]
}

export type Paradigm = {
  name: string
  description?: string
  king: string
  heads: Record<string, Head>
  routing: string[]
  discipline: Record<string, string>
  shift?: { auto: boolean }
}

/**
 * Whether this paradigm degrades a head automatically or stops and asks.
 * Default on, and kept here rather than at each call site so a second consumer
 * cannot quietly disagree about what "unset" means.
 */
export function shiftAuto(paradigm: Paradigm): boolean {
  return paradigm.shift?.auto ?? true
}

export type ParseResult = { ok: true; value: Paradigm } | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** An absent chain and an empty one differ: empty means "never swap this head". */
function parseFallback(id: string, value: unknown, errors: string[]): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    errors.push(`head "${id}" fallback must be an array of model ids`)
    return undefined
  }
  if (value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    errors.push(`head "${id}" fallback must contain only non-empty model ids`)
    return undefined
  }
  return [...(value as string[])]
}

function parseNeeds(id: string, value: unknown, errors: string[]): Needs | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    errors.push(`head "${id}" needs must be an object`)
    return undefined
  }
  const needs: Needs = {}
  const minOutput = value["minOutput"]
  if (minOutput !== undefined) {
    // Zero or negative is a typo rather than a preference - a head that needs
    // no output at all is not a head.
    if (typeof minOutput !== "number" || !Number.isFinite(minOutput) || minOutput <= 0) {
      errors.push(`head "${id}" needs.minOutput must be a positive number`)
    } else {
      needs.minOutput = minOutput
    }
  }
  for (const key of ["tools", "attachment"] as const) {
    const flag = value[key]
    if (flag === undefined) continue
    if (typeof flag !== "boolean") errors.push(`head "${id}" needs.${key} must be a boolean`)
    else needs[key] = flag
  }
  return needs
}

function parseShift(value: unknown, errors: string[]): { auto: boolean } | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    errors.push("shift must be an object")
    return undefined
  }
  const auto = value["auto"]
  if (auto !== undefined && typeof auto !== "boolean") {
    errors.push("shift.auto must be a boolean")
    return undefined
  }
  return { auto: (auto as boolean | undefined) ?? true }
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
      // Both of these are rejected rather than filtered when malformed. A
      // silently dropped fallback entry makes a chain look longer than it is
      // and only shows up at the moment it was supposed to help.
      const fallback = parseFallback(id, value["fallback"], errors)
      const needs = parseNeeds(id, value["needs"], errors)

      heads[id] = {
        model,
        role,
        permission: isRecord(value["permission"]) ? value["permission"] : undefined,
        prompt: typeof value["prompt"] === "string" ? value["prompt"] : undefined,
        ...(needs ? { needs } : {}),
        ...(fallback ? { fallback } : {}),
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

  const shift = parseShift(input["shift"], errors)

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
      ...(shift ? { shift } : {}),
    },
  }
}
