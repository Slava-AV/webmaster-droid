import assert from "node:assert/strict";
import test from "node:test";

import { streamHandler, supabaseHandler } from "./index";

test("root export provides supabase handler in non-lambda runtime", () => {
  assert.equal(typeof supabaseHandler, "function");
});

test("stream handler fails only when invoked without AWS runtime global", async () => {
  await assert.rejects(
    streamHandler({}, {}, {}),
    /awslambda runtime global/i
  );
});
