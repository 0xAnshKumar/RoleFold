import assert from "node:assert/strict";
import test from "node:test";
import { recommendTemplate } from "./recommend.ts";

test("recommends a template from the target role", () => {
  assert.equal(recommendTemplate("Senior frontend roles, product companies", true), "tech");
  assert.equal(recommendTemplate("Product Manager", true), "modern");
  assert.equal(recommendTemplate("PhD candidate in biology", true), "academic");
  assert.equal(recommendTemplate("Switching to UX after a career break", true), "combination");
  assert.equal(recommendTemplate("Operations lead", true), "classic");
});

test("no work history means a fresher's resume", () => {
  assert.equal(recommendTemplate("Software Engineer", false), "campus");
  assert.equal(recommendTemplate("", false), "campus");
});
