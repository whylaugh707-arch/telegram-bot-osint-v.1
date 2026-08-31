export const templates: Record<string, { name: string, render: (id: string) => string }> = {
    'passive_info': {
        name: 'Passive OSINT Terminal Info',
        render: (id) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Passive OSINT Terminal</title>
    <style>
        body { font-family: monospace; background-color: #0d1117; color: #58a6ff; text-align: center; padding: 50px; }
        .card { border: 1px solid #30363d; padding: 20px; border-radius: 8px; display: inline-block; background: #161b22; }
        h1 { color: #3fb950; }
    </style>
</head>
<body>
    <div class="card">
        <h1>🔍 Passive OSINT Mode Active</h1>
        <p>This system operates strictly in <strong>Passive Open Source Intelligence (OSINT)</strong> mode.</p>
        <p>Active traps, stealth loggers, and credential harvesting templates have been removed.</p>
        <p>Target ID: <code>${id}</code></p>
    </div>
</body>
</html>`
    }
};
