// The forced update gate for sessions that only read (RPCs and tables never reach an Edge
// Function): the app calls this on launch and whenever it comes to the foreground. No user, no
// data; handle() answers update_required before this runs when the build is too old.
import { handle } from '../_shared/http.ts';

Deno.serve(handle(() => Promise.resolve({ ok: true })));
