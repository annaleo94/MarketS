import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 430, height: 950 } });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
await p.route(/\.(jpg|jpeg|png|webp)(\?|$)/i, async (route) => {
  try {
    const { stdout } = await run("curl", ["-s", "-m", "30", route.request().url()], { encoding: "buffer", maxBuffer: 3e7 });
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: stdout });
  } catch { await route.abort(); }
});
let pass = 0, fail = 0;
const ok = (c, n, e = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${e ? " :: " + e : ""}`); };

await p.goto("http://localhost:5180/", { waitUntil: "networkidle" });
await p.fill('input[aria-label="חיפוש מוצר"]', "מכנס קצר ורוד");
await p.click('button[type="submit"]');
await p.waitForSelector(".product", { timeout: 90000 });
const text = await p.textContent("main");
ok(!text.includes("סוננו לפי"), "'סוננו לפי' gone in production");
ok(!text.includes("השוואה לפי מחיר"), "price-sort toggle gone in production");
ok((await p.$$(".chip, .results__toggle")).length === 0, "neither element in the DOM");
const perStore = await p.$$eval(".store-group", (secs) =>
  secs.map((s) => [...s.querySelectorAll(".product__price")].map((n) => parseFloat(n.textContent.replace(/[^\d.]/g, ""))))
);
ok(perStore.every((pr) => pr.every((v, i, a) => i === 0 || a[i - 1] <= v)), "each store still cheapest-first", JSON.stringify(perStore));
await p.screenshot({ path: "prod-results-clean.png" });
console.log(`\n${pass} passed, ${fail} failed`);
console.log("pageerrors:", errs);
await b.close();
