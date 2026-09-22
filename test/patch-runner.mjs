import {
  readFileSync,
  writeFileSync
} from "node:fs";

import path from "node:path";


const filename = path.resolve(
  process.argv[2] || "output/index.mjs"
);

let source = readFileSync(filename, "utf8");

if (source.includes("/* ABAP_UNIT_JUNIT_PATCH */")) {
  console.log("Runner is already patched:", filename);
  process.exit(0);
}


const runStart = source.indexOf("async function run()");

if (runStart === -1) {
  throw new Error(
    "The function 'async function run()' was not found."
  );
}

const runOpeningBrace = source.indexOf("{", runStart);

if (runOpeningBrace === -1) {
  throw new Error(
    "The opening brace of the run() function was not found."
  );
}

const runClosingBrace = findMatchingBrace(
  source,
  runOpeningBrace
);


const patchedRun = String.raw`
/* ABAP_UNIT_JUNIT_PATCH */

function errorText(error) {
  if (error === null || error === undefined) {
    return "Unknown error";
  }

  if (error.message) {
    return String(error.message);
  }

  if (error.msg) {
    return String(error.msg);
  }

  return String(error);
}


function errorProperty(error, propertyName) {
  if (!error) {
    return "";
  }

  if (
    error[propertyName] !== undefined
    && error[propertyName] !== null
  ) {
    return String(error[propertyName]);
  }

  return "";
}


function createResult(st, methodName) {
  return {
    class_name: st.objectName,
    testclass_name: st.localClass,
    method_name: methodName,
    status: "SUCCESS",
    runtime: 0,
    message: "",
    expected: "",
    actual: "",
    js_location: "",
    console: ""
  };
}


async function callLifecycle(test, methodName) {
  if (test && typeof test[methodName] === "function") {
    await test[methodName]();
  }

  const friend = test && test.FRIENDS_ACCESS_INSTANCE;

  if (
    friend
    && typeof friend[methodName] === "function"
  ) {
    await friend[methodName]();
  }

  if (
    friend
    && friend.SUPER
    && typeof friend.SUPER[methodName] === "function"
  ) {
    await friend.SUPER[methodName]();
  }
}


function resultFromError(result, error) {
  result.status = "FAILED";
  result.message = errorText(error);
  result.expected = errorProperty(error, "expected");
  result.actual = errorProperty(error, "actual");

  if (error && error.stack) {
    result.js_location = String(error.stack);
  }
}


async function run() {
  const skipCritical =
    process.argv.includes("--skip-critical");

  const onlyCritical =
    process.argv.includes("--only-critical");

  const results = [];
  let exitCode = 0;

  /*
   * getData() is fully retained from the generated runner.
   * This ensures all test classes found by the transpiler are used.
   */
  for (const st of getData()) {
    let imported;
    let localClass;

    try {
      imported = await import(st.filename);
      localClass = imported[st.localClass];

      if (!localClass) {
        throw new Error(
          "Local test class not found: "
          + st.localClass
        );
      }
    } catch (error) {
      exitCode = 1;

      for (const method of st.methods) {
        const result = createResult(st, method.name);

        resultFromError(result, error);

        result.message =
          "Test class could not be loaded: "
          + result.message;

        results.push(result);
      }

      continue;
    }

    let classSetupError = null;

    try {
      if (typeof localClass.class_setup === "function") {
        await localClass.class_setup();
      }
    } catch (error) {
      classSetupError = error;
      exitCode = 1;
    }

    for (const method of st.methods) {
      const prefix =
        st.objectName
        + ": "
        + st.localClass
        + "->"
        + method.name;

      const result = createResult(st, method.name);

      if (method.skip) {
        result.status = "SKIPPED";
        result.message =
          "Test skipped due to configuration";

        console.log(prefix + ", skipped due to configuration");
        results.push(result);
        continue;
      }

      if (
        skipCritical
        && st.riskLevel === "CRITICAL"
      ) {
        result.status = "SKIPPED";
        result.message =
          "Test skipped due to risk level";

        console.log(
          prefix
          + ", skipped due to risk level "
          + st.riskLevel
        );

        results.push(result);
        continue;
      }

      if (
        onlyCritical
        && st.riskLevel !== "CRITICAL"
      ) {
        result.status = "SKIPPED";
        result.message =
          "Test skipped due to risk level";

        console.log(
          prefix
          + ", skipped due to risk level "
          + st.riskLevel
        );

        results.push(result);
        continue;
      }

      const started = performance.now();
      const capturedConsole = [];
      const originalConsoleLog = console.log;

      let test = null;
      let testError = null;

      console.log = (...args) => {
        capturedConsole.push(
          args
            .map((value) => String(value))
            .join(" ")
        );
      };

      try {
        if (classSetupError) {
          throw classSetupError;
        }

        test = await (
          new localClass()
        ).constructor_();

        await callLifecycle(test, "setup");

        const friend =
          test.FRIENDS_ACCESS_INSTANCE;

        if (
          !friend
          || typeof friend[method.name] !== "function"
        ) {
          throw new Error(
            "Test method not found: "
            + method.name
          );
        }

        await friend[method.name]();
      } catch (error) {
        testError = error;
      } finally {
        if (test) {
          try {
            await callLifecycle(test, "teardown");
          } catch (error) {
            if (!testError) {
              testError = error;
            }
          }
        }

        console.log = originalConsoleLog;
      }

      result.runtime = Math.round(
        (performance.now() - started) * 1000
      );

      result.console = capturedConsole.join("\n");

      if (testError) {
        exitCode = 1;
        resultFromError(result, testError);
      } else {
        result.status = "SUCCESS";
      }

      results.push(result);

      console.log(
        prefix
        + " -> "
        + result.status
        + " ("
        + result.runtime
        + " microseconds)"
      );
    }

    try {
      if (typeof localClass.class_teardown === "function") {
        await localClass.class_teardown();
      }
    } catch (error) {
      exitCode = 1;

      const result = createResult(
        st,
        "__CLASS_TEARDOWN__"
      );

      resultFromError(result, error);
      results.push(result);
    }
  }

  /*
   * JSON is evaluated by test/run-junit.mjs.
   */
  process.stdout.write(
    "\nABAP_UNIT_JSON_BEGIN\n"
  );

  process.stdout.write(
    JSON.stringify(results)
  );

  process.stdout.write(
    "\nABAP_UNIT_JSON_END\n"
  );

  return exitCode;
}
`;


source =
  source.slice(0, runStart)
  + patchedRun
  + source.slice(runClosingBrace + 1);


/*
 * The original generated code always exits the process with 0:
 *
 * run().then(() => {
 *   process.exit(0);
 * })
 *
 * This would swallow failed tests.
 * Therefore, the completion is also replaced.
 */
const tailStart = source.indexOf("run().then(");

if (tailStart === -1) {
  throw new Error(
    "The concluding run().then() block was not found."
  );
}

const patchedTail = String.raw`
run()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
`;

source =
  source.slice(0, tailStart)
  + patchedTail;


writeFileSync(filename, source, "utf8");

console.log("Runner successfully patched:", filename);


/*
 * Determines the closing brace belonging to an opening brace.
 *
 * Strings and comments are ignored so that braces inside texts
 * are not misinterpreted.
 */
function findMatchingBrace(text, openingBrace) {
  let depth = 0;
  let state = "code";
  let quote = "";
  let escaped = false;

  for (
    let index = openingBrace;
    index < text.length;
    index++
  ) {
    const current = text[index];
    const next = text[index + 1];

    if (state === "line-comment") {
      if (current === "\n") {
        state = "code";
      }

      continue;
    }

    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        state = "code";
        index++;
      }

      continue;
    }

    if (state === "string") {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (current === "\\") {
        escaped = true;
        continue;
      }

      if (current === quote) {
        state = "code";
        quote = "";
      }

      continue;
    }

    if (
      current === "'"
      || current === '"'
      || current === "`"
    ) {
      state = "string";
      quote = current;
      continue;
    }

    if (current === "/" && next === "/") {
      state = "line-comment";
      index++;
      continue;
    }

    if (current === "/" && next === "*") {
      state = "block-comment";
      index++;
      continue;
    }

    if (current === "{") {
      depth++;
      continue;
    }

    if (current === "}") {
      depth--;

      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error(
    "No matching closing brace found."
  );
}
