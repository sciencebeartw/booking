import re

with open('sop.html', 'r', encoding='utf-8') as f:
    sop = f.read()

pattern = r'(<div class="container">\s*)<p><a class="back-btn".*?(    </div>\s*<footer>)'
m = re.search(pattern, sop, flags=re.DOTALL)
if m:
    print("MATCHED!")
else:
    print("NO MATCH!")
    
    # Try finding footer
    if '<footer>' in sop:
        print("Found footer")
    if '<a class="back-btn"' in sop:
        print("Found back-btn")
    
