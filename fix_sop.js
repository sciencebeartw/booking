const fs = require('fs');

// 1. Read sop.html and extract content
const html = fs.readFileSync('sop.html', 'utf-8');
const containerStart = html.indexOf('<div class="container">');
const pStart = html.indexOf('<p>', containerStart);
const containerEnd = html.indexOf('</div>\n\n    <footer>', containerStart);
const content = html.substring(pStart, containerEnd).trim();

// Escape backticks and ${} to be safe within a template literal
const safeContent = content.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

// 2. Read sop_editor_test.html
let testHtml = fs.readFileSync('sop_editor_test.html', 'utf-8');

// Match from `const SOP_CONTENT` until `document.getElementById('sop-editor').value = SOP_CONTENT;`
const regex = /const SOP_CONTENT = [\s\S]*?document\.getElementById\('sop-editor'\)\.value = SOP_CONTENT;/;

const newString = `const SOP_CONTENT = \`\n${safeContent}\n\`;\n\n        document.getElementById('sop-editor').value = SOP_CONTENT;`;

if (regex.test(testHtml)) {
    testHtml = testHtml.replace(regex, newString);
    fs.writeFileSync('sop_editor_test.html', testHtml);
    console.log("Success");
} else {
    console.log("Regex did not match");
}
