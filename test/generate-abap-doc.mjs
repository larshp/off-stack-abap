import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const inputDir = process.argv[2] || "src";
const outputDir = process.argv[3] || "docs";

await mkdir(outputDir, { recursive: true });

const files = await findFiles(inputDir);
const classes = [];

for (const file of files) {
  if (!file.endsWith(".clas.abap")) {
    continue;
  }

  const source = await readFile(file, "utf8");
  const parsed = parseAbapFile(source, file);

  if (parsed) {
    classes.push(parsed);
  }
}

for (const item of classes) {
  const html = createClassHtml(item);
  const filename = `${item.name.toLowerCase()}.html`;

  await writeFile(
    path.join(outputDir, filename),
    html,
    "utf8"
  );
}

await writeFile(
  path.join(outputDir, "index.html"),
  createIndexHtml(classes),
  "utf8"
);

console.log(
  `Wrote ${classes.length} ABAP documentation file(s) to ${outputDir}.`
);


async function findFiles(directory) {
  const result = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...await findFiles(fullPath));
    } else {
      result.push(fullPath);
    }
  }

  return result;
}


function parseAbapFile(source, filename) {
  const lines = source.split(/\r?\n/);

  const classMatch = source.match(
    /^\s*CLASS\s+([A-Za-z0-9_/]+)\s+DEFINITION/im
  );

  if (!classMatch) {
    return null;
  }

  const result = {
    name: classMatch[1].toUpperCase(),
    filename,
    description: "",
    methods: []
  };

  let index = 0;

  while (index < lines.length) {
    if (!isAbapDocLine(lines[index])) {
      index++;
      continue;
    }

    const docLines = [];

    while (
      index < lines.length
      && isAbapDocLine(lines[index])
    ) {
      docLines.push(removeDocPrefix(lines[index]));
      index++;
    }

    let declaration = "";

    while (
      index < lines.length
      && declaration.indexOf(".") === -1
    ) {
      declaration += ` ${lines[index]}`;
      index++;
    }

    const methodMatch = declaration.match(
      /^\s*(?:CLASS-)?METHODS\s*:?\s*([A-Za-z0-9\_]+)/i
    );

    if (methodMatch) {
      result.methods.push({
        name: methodMatch[1],
        doc: parseDoc(docLines)
      });

      continue;
    }

    const classDeclaration = declaration.match(
      /^\s*CLASS\s+[A-Za-z0-9_/]+\s+DEFINITION/i
    );

    if (classDeclaration) {
      result.description = parseDoc(docLines);
    }
  }

  return result;
}


function isAbapDocLine(line) {
  return /^\s*"!/.test(line);
}


function removeDocPrefix(line) {
  return line
    .replace(/^\s*"!\s?/, "")
    .trimEnd();
}


function parseDoc(lines) {
  const description = [];
  const parameters = [];
  const raisings = [];

  for (const line of lines) {
    const parameter = line.match(
      /^@parameter\s+(\S+)\s*\|\s*(.*)\$/i
    );

    if (parameter) {
      parameters.push({
        name: parameter[1],
        description: parameter[2]
      });

      continue;
    }

    const raising = line.match(
      /^@(raising|exception)\s+(\S+)\s*\|\s*(.*)\$/i
    );

    if (raising) {
      raisings.push({
        name: raising[2],
        description: raising[3]
      });

      continue;
    }

    if (line.trim() !== "") {
      description.push(line);
    }
  }

  return {
    description: description.join("\n"),
    parameters,
    raisings
  };
}


function createIndexHtml(classes) {
  const links = classes
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => {
      const file = `${item.name.toLowerCase()}.html`;

      return `
        <li>
          <a href="${escapeAttribute(file)}">
            ${escapeHtml(item.name)}
          </a>
        </li>`;
    })
    .join("\n");

  return page(
    "ABAP API Documentation",
    `
      <h1>ABAP API Documentation</h1>
      <ul>${links}</ul>
    `
  );
}


function createClassHtml(item) {
  const methods = item.methods
    .map((method) => {
      const parameters = method.doc.parameters.length > 0
        ? `
          <h4>Parameters</h4>
          <dl>
            ${method.doc.parameters.map((parameter) => `
              <dt><code>\${escapeHtml(parameter.name)}</code></dt>
              <dd>\${renderDoc(parameter.description)}</dd>
            `).join("\n")}
          </dl>
        `
        : "";

      const raisings = method.doc.raisings.length > 0
        ? `
          <h4>Exceptions</h4>
          <dl>
            ${method.doc.raisings.map((raising) => `
              <dt><code>\${escapeHtml(raising.name)}</code></dt>
              <dd>\${renderDoc(raising.description)}</dd>
            `).join("\n")}
          </dl>
        `
        : "";

      return `
        <section class="method">
          <h2>${escapeHtml(method.name)}</h2>
          ${renderDoc(method.doc.description)}
          ${parameters}
          ${raisings}
        </section>
      `;
    })
    .join("\n");

  return page(
    item.name,
    `
      <p><a href="index.html">← Overview</a></p>
      <h1>${escapeHtml(item.name)}</h1>
      ${renderDoc(item.description.description)}
      ${methods}
    `
  );
}


function renderDoc(text) {
  if (!text) {
    return "";
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return `<p>${lines
    .map((line) => renderInline(line))
    .join("<br>")}</p>`;
}


function renderInline(text) {
  let value = escapeHtml(text);

  // Allowed basic ABAP Doc formatting
  value = value
    .replaceAll("&lt;strong&gt;", "<strong>")
    .replaceAll("&lt;/strong&gt;", "</strong>")
    .replaceAll("&lt;em&gt;", "<em>")
    .replaceAll("&lt;/em&gt;", "</em>")
    .replaceAll("&lt;code&gt;", "<code>")
    .replaceAll("&lt;/code&gt;", "</code>")
    .replaceAll("&lt;br&gt;", "<br>");

  return value;
}


function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      max-width: 1000px;
      margin: 40px auto;
      padding: 0 24px;
      font-family: Arial, sans-serif;
      color: #202124;
      line-height: 1.5;
    }

    h1 {
      border-bottom: 1px solid #ddd;
      padding-bottom: 12px;
    }

    h2 {
      margin-top: 36px;
      color: #174a7e;
    }

    .method {
      border-top: 1px solid #ddd;
      margin-top: 30px;
      padding-top: 10px;
    }

    dt {
      font-weight: bold;
      margin-top: 10px;
    }

    dd {
      margin-left: 20px;
    }

    code {
      background: #f1f3f4;
      padding: 2px 5px;
      border-radius: 3px;
    }

    a {
      color: #1769aa;
    }
  </style>
</head>
<body>
${body}
</body>
</html>
`;
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "'");
}


function escapeAttribute(value) {
  return escapeHtml(value);
}
