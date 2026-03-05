import sys

def check_brackets(text):
    stack = []
    i = 0
    line_num = 1
    while i < len(text):
        char = text[i]
        if char == '\n':
            line_num += 1
            i += 1
            continue
            
        # skip comments
        if char == '/' and i + 1 < len(text) and text[i+1] == '/':
            while i < len(text) and text[i] != '\n':
                i += 1
            continue
        if char == '/' and i + 1 < len(text) and text[i+1] == '*':
            i += 2
            while i + 1 < len(text) and not (text[i] == '*' and text[i+1] == '/'):
                if text[i] == '\n': line_num += 1
                i += 1
            i += 2
            continue
            
        # skip strings
        if char in ["'", '"', '`']:
            quote = char
            i += 1
            while i < len(text) and text[i] != quote:
                if text[i] == '\\':
                    i += 2
                    continue
                if text[i] == '\n': line_num += 1
                i += 1
            i += 1
            continue
            
        # check brackets
        if char in "({[":
            stack.append((char, line_num))
        elif char in ")}][:":
            if char == ')':
                if not stack or stack[-1][0] != '(': print(f"Mismatch at line {line_num}: expected (, got )"); return
                stack.pop()
            elif char == '}':
                if not stack or stack[-1][0] != '{': print(f"Mismatch at line {line_num}: expected {{, got }}"); return
                stack.pop()
            elif char == ']':
                if not stack or stack[-1][0] != '[': print(f"Mismatch at line {line_num}: expected [, got ]"); return
                stack.pop()
        i += 1

    if stack:
        print(f"Unclosed brackets left: {stack}")
    else:
        print("All matched!")

text = open('admin.js').read()
check_brackets(text)
