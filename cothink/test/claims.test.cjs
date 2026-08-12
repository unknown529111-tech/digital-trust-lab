const test = require("node:test");
const assert = require("node:assert/strict");
const { extractClaims, splitSentences, extractFacts, verifiableSignalCount } = require("../lib/claims.cjs");
const { DEMO_SUGGESTION_TEXT } = require("../lib/openrouter.cjs");

test("splitSentences splits on terminal punctuation and newlines", () => {
  assert.deepEqual(splitSentences("First sentence. Second one! Third?"), [
    "First sentence.", "Second one!", "Third?",
  ]);
  assert.deepEqual(splitSentences("Line one\nLine two."), ["Line one", "Line two."]);
});

test("extractFacts finds percentages and years, ignores prose numbers", () => {
  const facts = extractFacts("The program launched in 2024 and raised adoption by 30%.");
  assert.deepEqual(facts.map((f) => f.value), ["30%", "2024"]);
  assert.deepEqual(extractFacts("No hard numbers here, just opinion."), []);
});

test("demo text decomposes into exactly 3 claims with the expected fact split", () => {
  const claims = extractClaims(DEMO_SUGGESTION_TEXT);
  assert.equal(claims.length, 3);
  assert.match(claims[0].text, /launched in 2024/);
  assert.deepEqual(claims[0].facts.map((f) => f.value), ["2024"]);
  assert.match(claims[1].text, /praised by the Ministry of Education/);
  assert.match(claims[2].text, /30%/);
  assert.deepEqual(claims[2].facts.map((f) => f.value), ["30%"]);
});

test("a bundled sentence with two quantitative halves splits into two claims", () => {
  const claims = extractClaims("X happened in 2024 and affected Y by 30%.");
  assert.equal(claims.length, 2);
  assert.deepEqual(claims[0].facts.map((f) => f.value), ["2024"]);
  assert.deepEqual(claims[1].facts.map((f) => f.value), ["30%"]);
});

test("hedging and absolutist phrasing are flagged on every chunk", () => {
  const hedged = extractClaims("The market probably grew last year.");
  assert.equal(hedged[0].hedged, true);
  const absolute = extractClaims("Consumers always prefer this design.");
  assert.equal(absolute[0].absolutist, true);
});

test("attribution is extracted and attached to the claim", () => {
  const claims = extractClaims("According to the Ministry of Education, enrollment rose in 2025.");
  assert.equal(claims[0].attribution, "the Ministry of Education");
  assert.deepEqual(claims[0].facts.map((f) => f.value), ["2025"]);
});

test("verifiableSignalCount counts claims with numbers, years, or attribution", () => {
  const claims = extractClaims("The launch happened in 2024. It was well received.");
  assert.equal(claims.length, 2);
  assert.equal(verifiableSignalCount(claims), 1);
});

test("empty or non-string input yields no claims", () => {
  assert.deepEqual(extractClaims(""), []);
  assert.deepEqual(extractClaims("  "), []);
  assert.deepEqual(extractClaims(null), []);
});