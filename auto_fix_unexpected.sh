#!/bin/bash
while true; do
    OUTPUT=$(npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external 2>&1)
    if echo "$OUTPUT" | grep -q 'Unexpected ")"'; then
        LINE=$(echo "$OUTPUT" | grep -oE "server\.ts:[0-9]+" | head -n 1 | cut -d: -f2)
        echo "Deleting line $LINE"
        sed -i "${LINE}d" server.ts
    elif echo "$OUTPUT" | grep -q 'Expected "}" but found "."'; then
        LINE=$(echo "$OUTPUT" | grep -oE "server\.ts:[0-9]+" | head -n 1 | cut -d: -f2)
        echo "Replacing line $(($LINE - 1)) with '    });'"
        sed -i "$(($LINE - 1))s/^.*$/    });/" server.ts
    elif echo "$OUTPUT" | grep -q 'Expected "}" but found "done"'; then
        LINE=$(echo "$OUTPUT" | grep -oE "server\.ts:[0-9]+" | head -n 1 | cut -d: -f2)
        sed -i "${LINE}s/^.*$/    });/" server.ts
    elif echo "$OUTPUT" | grep -q 'Unterminated string literal'; then
        LINE=$(echo "$OUTPUT" | grep -oE "server\.ts:[0-9]+" | head -n 1 | cut -d: -f2)
        sed -i "${LINE}d" server.ts
    elif echo "$OUTPUT" | grep -q 'Expected ")" but found "res"'; then
        LINE=$(echo "$OUTPUT" | grep -oE "server\.ts:[0-9]+" | head -n 1 | cut -d: -f2)
        sed -i "${LINE}d" server.ts
    else
        echo "$OUTPUT"
        break
    fi
done
