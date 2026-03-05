import sys

def check_parens(text):
    stack = []
    i = 0
    line_num = 1
    in_single_quote = False
    in_double_quote = False
    in_backtick = False
    in_line_comment = False
    in_block_comment = False
    
    while i < len(text):
        char = text[i]
        if char == '\n':
            line_num += 1
            if in_line_comment:
                in_line_comment = False
            i += 1
            continue
            
        if in_line_comment:
            i += 1
            continue
            
        if in_block_comment:
            if char == '*' and i + 1 < len(text) and text[i+1] == '/':
                in_block_comment = False
                i += 2
            else:
                i += 1
            continue
            
        if in_single_quote:
            if char == '\\': i += 2
            elif char == "'": in_single_quote = False; i += 1
            else: i += 1
            continue
            
        if in_double_quote:
            if char == '\\': i += 2
            elif char == '"': in_double_quote = False; i += 1
            else: i += 1
            continue
            
        if in_backtick:
            if char == '\\': i += 2
            elif char == '`': in_backtick = False; i += 1
            # Note: template literal expressions ${...} should technically be parsed, 
            # but simple string stripping usually works if we don't have nested backticks inside ${}
            elif char == '$' and i + 1 < len(text) and text[i+1] == '{':
                stack.append(('${', line_num))
                i += 2
            else: i += 1
            continue
            
        # Not in any comment or string
        if char == '/' and i + 1 < len(text):
            if text[i+1] == '/':
                in_line_comment = True
                i += 2
                continue
            elif text[i+1] == '*':
                in_block_comment = True
                i += 2
                continue
                
        if char == "'": in_single_quote = True; i += 1; continue
        if char == '"': in_double_quote = True; i += 1; continue
        if char == '`': in_backtick = True; i += 1; continue
        
        # Check parens and braces
        if char in "({[":
            stack.append((char, line_num))
        elif char in ")}]":
            if not stack:
                print(f"Extra closing {char} at line {line_num}")
                return
            top_char, top_line = stack.pop()
            matches = {'(': ')', '{': '}', '[': ']', '${': '}'}
            if matches[top_char] != char:
                print(f"Mismatch at line {line_num}: expected {matches[top_char]}, got {char}. Opened at {top_line}")
                return
        i += 1

    if stack:
        print(f"Unclosed items left in stack:")
        for k, v in stack:
            print(f"  {k} opened at line {v}")
    else:
        print("All matched perfectly!")

text = open('admin.js').read()
check_parens(text)
