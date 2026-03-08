import re

with open('sop_editor_test.html', 'r', encoding='utf-8') as f:
    tester = f.read()

m = re.search(r"const SOP_CONTENT = `\n(.*)\n`;", tester, re.DOTALL)
if m:
    print("MATCH SOP_CONTENT")
else:
    print("NO MATCH SOP_CONTENT")
