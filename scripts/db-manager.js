const http = require('http');
const { spawn } = require('child_process');

const PORT = 3001;
const PRISMA_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prisma DB Manager</title>
<style>
body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #f4f4f5; color: #18181b; }
h1 { margin-bottom: 2rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
button {
    padding: 1rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.5rem;
    background: white;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
    text-align: left;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
button:hover { background: #fafafa; border-color: #d4d4d8; }
button.danger { color: #dc2626; border-color: #fecaca; background: #fef2f2; }
button.danger:hover { background: #fee2e2; }
#output {
    background: #18181b;
    color: #d4d4d8;
    padding: 1rem;
    border-radius: 0.5rem;
    font-family: monospace;
    white-space: pre-wrap;
    height: 400px;
    overflow-y: auto;
    font-size: 0.875rem;
}
.status { margin-bottom: 0.5rem; font-size: 0.875rem; color: #71717a; }
</style>
</head>
<body>

<h1>Prisma DB Manager</h1>

<div class="grid">
    <button onclick="runCommand('generate')">
        ⚡ Generate Client
        <div class="status">npx prisma generate</div>
    </button>
    <button onclick="runCommand('push')">
        ⬆️ DB Push
        <div class="status">npx prisma db push</div>
    </button>
    <button onclick="runCommand('studio')">
        🖥️ Open Studio
        <div class="status">npx prisma studio</div>
    </button>
    <button class="danger" onclick="runCommand('migrate')">
        🚧 Migrate Dev
        <div class="status">npx prisma migrate dev</div>
    </button>
</div>

<h3>Output</h3>
<div id="output">Ready...</div>

<script>
const output = document.getElementById('output');

async function runCommand(cmd) {
    output.innerText = 'Running ' + cmd + '...\\n';

    try {
        const response = await fetch('/run/' + cmd);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            output.innerText += text;
            output.scrollTop = output.scrollHeight;
        }
    } catch (err) {
        output.innerText += '\\nError: ' + err.message;
    }
}
</script>

</body>
</html>
`;

const server = http.createServer((req, res) => {

    // 🔐 Localhost only protection
    const ip = req.socket.remoteAddress;
    if (ip !== '::1' && ip !== '127.0.0.1' && ip !== '::ffff:127.0.0.1') {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlContent);
        return;
    }

    if (req.url.startsWith('/run/')) {
        const cmd = req.url.split('/').pop();

        let args = [];
        if (cmd === 'generate') args = ['prisma', 'generate'];
        else if (cmd === 'push') args = ['prisma', 'db', 'push'];
        else if (cmd === 'migrate') args = ['prisma', 'migrate', 'dev'];
        else if (cmd === 'studio') {
            // Start Prisma Studio detached
            spawn(PRISMA_CMD, ['prisma', 'studio'], {
                cwd: process.cwd(),
                detached: true,
                stdio: 'ignore'
            }).unref();

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Prisma Studio started on http://localhost:5555');
            return;
        } else {
            res.writeHead(400);
            res.end('Unknown command');
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'text/plain',
            'Transfer-Encoding': 'chunked'
        });

        const child = spawn(PRISMA_CMD, args, {
            cwd: process.cwd()
        });

        child.stdout.on('data', (data) => {
            res.write(data.toString());
        });

        child.stderr.on('data', (data) => {
            res.write(data.toString());
        });

        child.on('error', (err) => {
            res.write(`Error starting process: ${err.message}\n`);
            res.end();
        });

        child.on('close', (code) => {
            res.write(`\nProcess exited with code ${code}`);
            res.end();
        });

        req.on('close', () => {
            child.kill();
        });

        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        const { execSync } = require('child_process');
        console.log(`⚠️  Port ${PORT} in use. Killing old process and restarting...`);
        try {
            execSync(`fuser -k ${PORT}/tcp`);
            setTimeout(() => server.listen(PORT), 1000);
        } catch (e) {
            console.error(`❌ Could not free port ${PORT}. Kill it manually: fuser -k ${PORT}/tcp`);
            process.exit(1);
        }
    } else {
        throw err;
    }
});

server.listen(PORT, () => {
    console.log(`✅ DB Manager running at http://localhost:${PORT}`);
});