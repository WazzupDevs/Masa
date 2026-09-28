// Calls the bot table (scripts/e2e/bot-table.ts serve) from a flow. Env: ACTION, optional BODY
// (JSON), optional EXPECT_DM (the newest DM the bot must see), optional BOT_PORT.
var port = typeof BOT_PORT !== 'undefined' ? BOT_PORT : '8787';
var body = typeof BODY !== 'undefined' ? BODY : '{}';
var res = http.post('http://127.0.0.1:' + port + '/' + ACTION, {
  headers: { 'Content-Type': 'application/json' },
  body: body,
});
if (res.status !== 200) {
  throw new Error('bot ' + ACTION + ' failed: ' + res.status + ' ' + res.body);
}
var result = json(res.body);
if (typeof EXPECT_DM !== 'undefined' && result.body !== EXPECT_DM) {
  throw new Error('bot sees "' + result.body + '", expected "' + EXPECT_DM + '"');
}
output.bot = result;
