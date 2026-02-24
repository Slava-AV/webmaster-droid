import { supabaseHandler } from "@webmaster-droid/server";

Deno.serve((request) => supabaseHandler(request));
