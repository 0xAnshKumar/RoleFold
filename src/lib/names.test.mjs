import assert from "node:assert/strict";
import test from "node:test";
import { naturalName } from "./names.ts";

test("all-caps names become title case; mixed case is left alone", () => {
  assert.equal(naturalName("ROHAN IYER"), "Rohan Iyer");
  assert.equal(naturalName("MARY-ANNE O'BRIEN"), "Mary-Anne O'Brien");
  assert.equal(naturalName("ÉMILE ZOLA"), "Émile Zola");
  assert.equal(naturalName("Rohan McIyer"), "Rohan McIyer");
  assert.equal(naturalName("रोहन"), "रोहन");
});
