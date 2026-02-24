type DenoEnvApi = {
  get: (name: string) => string | undefined;
};

type DenoLike = {
  env?: DenoEnvApi;
};

function readFromDeno(name: string): string | undefined {
  const maybeDeno = (globalThis as { Deno?: DenoLike }).Deno;
  const getter = maybeDeno?.env?.get;
  if (typeof getter !== "function") {
    return undefined;
  }

  try {
    return getter(name);
  } catch {
    return undefined;
  }
}

function readFromProcess(name: string): string | undefined {
  if (typeof process === "undefined" || !process?.env) {
    return undefined;
  }

  return process.env[name];
}

export function readEnv(name: string): string | undefined {
  return readFromDeno(name) ?? readFromProcess(name);
}

export function readTrimmedEnv(name: string): string | undefined {
  const value = readEnv(name);
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function readFirstTrimmedEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = readTrimmedEnv(name);
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function requireTrimmedEnv(name: string): string {
  const value = readTrimmedEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
