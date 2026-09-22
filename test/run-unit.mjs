import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const outputFile = "test-results/abap-unit-junit.xml";

const child = spawn(
  process.execPath,
  ["output/index.mjs"],
  {
    cwd: process.cwd(),
    shell: false,
    stdio: ["ignore", "pipe", "inherit"]
  }
);

let stdout = "";

child.stdout.setEncoding("utf8");

child.stdout.on("data", (chunk) => {
  stdout += chunk;
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 2;
});

child.on("close", (exitCode) => {
  try {
    const json = extractJson(stdout);
    const results = JSON.parse(json);

    const xml = createJUnitXml(results);

    mkdirSync("test-results", {
      recursive: true
    });

    writeFileSync(
      outputFile,
      xml,
      "utf8"
    );

    const failed = results.filter(
      (item) => item.status === "FAILED"
    ).length;

    const skipped = results.filter(
      (item) => item.status === "SKIPPED"
    ).length;

    console.log("");
    console.log("ABAP Unit Tests");
    console.log("================");
    console.log(`Tests:   ${results.length}`);
    console.log(`Errors:  ${failed}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`AUnit:   ${outputFile}`);

    process.exitCode =
      exitCode !== 0 || failed > 0
        ? 1
        : 0;
  } catch (error) {
    console.error("Could not create JUnit file.");
    console.error(error.message);
    process.exitCode = 2;
  }
});


function extractJson(output) {
  const startMarker = "ABAP_UNIT_JSON_BEGIN";
  const endMarker = "ABAP_UNIT_JSON_END";

  const start = output.indexOf(startMarker);
  const end = output.indexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      "ABAP Unit JSON was not found."
    );
  }

  return output
    .slice(start + startMarker.length, end)
    .trim();
}


function createJUnitXml(results) {
  const failures = results.filter(
    (item) => item.status === "FAILED"
  ).length;

  const skipped = results.filter(
    (item) => item.status === "SKIPPED"
  ).length;

  const totalTime = results.reduce(
    (sum, item) => sum + Number(item.runtime || 0) / 1_000_000,
    0
  );

  const testCases = results
    .map(createTestCase)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${results.length}"
            failures="${failures}"
            errors="0"
            skipped="${skipped}"
            time="${formatTime(totalTime)}">
  <testsuite name="ABAP Unit"
             tests="${results.length}"
             failures="${failures}"
             errors="0"
             skipped="${skipped}"
             time="${formatTime(totalTime)}">
${testCases}
  </testsuite>
</testsuites>
`;
}


function createTestCase(item) {
  const className = [
    item.class_name,
    item.testclass_name
  ]
    .filter(Boolean)
    .join(".");

  const time = formatTime(
    Number(item.runtime || 0) / 1_000_000
  );

  let xml =
    `    <testcase classname="${escapeXml(className)}" `
    + `name="${escapeXml(item.method_name)}" `
    + `time="${time}">`;

  if (item.status === "FAILED") {
    const details = [
      item.message
        ? `Message: ${item.message}`
        : "",
      item.expected
        ? `Expected: ${item.expected}`
        : "",
      item.actual
        ? `Actual: ${item.actual}`
        : "",
      item.js_location
        ? `Location: ${item.js_location}`
        : ""
    ]
      .filter(Boolean)
      .join("\n");

    xml += `
      <failure type="ABAPUnitFailure"
               message="${escapeXml(item.message || "Test failed")}">${escapeXml(details)}</failure>`;
  }

  if (item.status === "SKIPPED") {
    xml += `
      <skipped message="${escapeXml(item.message || "Test skipped")}" />`;
  }

  if (item.console) {
    xml += `
      <system-out>${escapeXml(item.console)}</system-out>`;
  }

  xml += `
    </testcase>`;

  return xml;
}


function formatTime(value) {
  return Number(value || 0).toFixed(6);
}


function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
